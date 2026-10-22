"""Dapur Aman - Backend API.

Integrates:
- Health check
- S2S shared secret check (X-Shared-Secret)
- Authentication (POST /api/auth/login)
- Food tray visual inspection (POST /api/vision/inspect & POST /api/inspections/upload-and-run)
- Neon Object Storage S3 upload & 10-minute presigned URL generation
- Neon Postgres persistence (Batches, Photos, Runs, Findings, ActivityEvents)
- Batch & finding history retrieval (GET /api/batches/{batch_id})
- Human actions & resolutions (POST /api/actions) with supervisor role enforcement
"""

import asyncio
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Depends,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import CORS_ALLOWED_ORIGINS
from app.database import engine, Base, SessionLocal, get_db
from app.models import (
    User,
    Batch,
    Photo,
    Run,
    Finding,
    ActivityEvent,
    HumanAction,
    SchoolRecipient,
)
from app.storage import (
    upload_photo_bytes,
    generate_presigned_url,
)
from app.auth import (
    verify_password,
    verify_shared_secret,
    get_current_actor,
)
from app.seed import seed_default_users, seed_default_schools
from app.schemas import (
    LoginRequest,
    LoginResponse,
    InspectionResponseSchema,
    ActionRequest,
    ActionResponse,
    BatchDetailSchema,
    BatchRunSchema,
    FindingCardSchema,
    EvidenceBoxSchema,
    HumanActionRecordSchema,
    BatchOverviewSchema,
    PackingPhotoRowSchema,
    SupervisorDashboardSchema,
    ActiveConcernCardSchema,
    SafetyFeedItemSchema,
    BatchListItemSchema,
)
from agents.compliance.rules import RULE_TABLE_VERSION
from agents.contract import Finding as ContractFinding
from agents.contract import InspectionInput, Menu, Outcome, RunState
from agents.contract import Photo as ContractPhoto
from agents.workflow import run_inspection
from app.inspection import InvalidPhotoError, build_response, to_jpeg
from app.notifications import (
    send_supervisor_safety_alert,
    send_supervisor_retake_notification,
    send_school_clearance_report,
)

logger = logging.getLogger("dapur_aman.api")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager: initializes tables and seeds default accounts."""
    logger.info("Initializing database schema in Neon Postgres...")
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);"))
            conn.execute(text("ALTER TABLE batches ADD COLUMN IF NOT EXISTS target_school_id VARCHAR(50);"))
            conn.execute(text("ALTER TABLE batches ADD COLUMN IF NOT EXISTS target_school_name VARCHAR(150);"))
    except Exception as e:
        logger.warning("Auto-migration check notice: %s", e)
    logger.info("Database schema initialized.")

    with SessionLocal() as db:
        seed_default_users(db)
        seed_default_schools(db)
    logger.info("Default user accounts and school recipients verified.")
    yield


app = FastAPI(
    title="Dapur Aman - Backend API",
    description="API Sistem Inspeksi Keamanan dan Kualitas Pangan Makan Bergizi Gratis (MBG) berbasis AI.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
def health() -> dict[str, str]:
    """Health check endpoint for Cloud Run and uptime monitors."""
    return {"status": "ok", "service": "dapur-aman-backend"}


@app.post(
    "/api/auth/login",
    response_model=LoginResponse,
    tags=["Authentication"],
    summary="Login user (staff atau supervisor) dan kembalikan profil terverifikasi",
)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
) -> LoginResponse:
    """Verifikasi username dan password terhadap database Neon.

    - Memeriksa header X-Shared-Secret
    - Memverifikasi hash bcrypt dari password
    - Mengembalikan actor_id dan role (kitchen_staff atau supervisor)
    """
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah.",
        )

    return LoginResponse(
        actor_id=user.id,
        username=user.username,
        name=user.name,
        role=user.role,
    )


@app.post(
    "/api/vision/inspect",
    response_model=InspectionResponseSchema,
    tags=["Vision Inspection"],
    summary="Inspeksi foto makanan lewat tiga agen (Orchestrator, Vision, Compliance), simpan ke Neon DB & S3",
)
@app.post(
    "/api/inspections/upload-and-run",
    response_model=InspectionResponseSchema,
    tags=["Vision Inspection"],
    summary="Alias inspeksi lengkap untuk integrasi frontend",
)
async def inspect_food_photo(
    photo: UploadFile = File(..., description="Foto baki makanan (JPEG / PNG, maks 4 MB)"),
    table_name: str = Form("Table 1", description="Nama meja / lokasi baki"),
    menu_items: str = Form(
        "Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur",
        description="Daftar komponen menu hari ini, dipisahkan koma",
    ),
    batch_id: str | None = Form(None, description="Opsional: ID batch untuk mengelompokkan beberapa meja/baki"),
    is_retake: bool = Form(False),
    school_id: str | None = Form(None, description="Opsional: ID sekolah penerima"),
    _: None = Depends(verify_shared_secret),
    __: User = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> InspectionResponseSchema:
    """Endpoint utama inspeksi foto baki makanan:

    1. Membaca dan memvalidasi file foto (maks 4 MB), dikonversi ke JPEG
    2. Mengunggah foto ke Neon Object Storage (private S3 bucket)
    3. Menjalankan run_inspection: Orchestrator memanggil Vision lalu Compliance (Google ADK)
    4. Menyimpan Run, temuan, dan activity event asli ke Neon Postgres
    5. Mengembalikan data sesuai format tampilan UI-1 dan UI-2
    """
    photo_bytes = await photo.read()
    if not photo_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File foto tidak boleh kosong.",
        )

    if len(photo_bytes) > 4 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ukuran foto melebihi batas maksimal 4 MB.",
        )

    try:
        jpeg_bytes = to_jpeg(photo_bytes)
    except InvalidPhotoError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File bukan gambar yang dapat dibaca.",
        )

    clean_table_name = table_name.strip() or "Table 1"
    unique_suffix = uuid.uuid4().hex[:10]
    active_batch_id = batch_id.strip() if batch_id and batch_id.strip() else f"batch_{unique_suffix}"
    photo_id = f"pho_{unique_suffix}"
    run_id = f"run_{unique_suffix}"
    storage_key = f"photos/{active_batch_id}/{photo_id}.jpg"
    if is_retake and (not batch_id or not db.get(Batch, active_batch_id)):
        raise HTTPException(status_code=400, detail="A retake requires an existing batch_id.")

    try:
        upload_photo_bytes(storage_key, jpeg_bytes, "image/jpeg")
        presigned_photo_url = generate_presigned_url(storage_key, expires_in=600)
    except Exception as e:
        logger.error("Gagal mengunggah foto ke Neon S3: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Foto gagal disimpan, inspeksi tidak dijalankan. Coba lagi.",
        )

    items_list = [item.strip() for item in menu_items.split(",") if item.strip()]
    inspection_input = InspectionInput(
        photo=ContractPhoto(content=jpeg_bytes),
        menu=Menu(menu_id="MBG-01", name=", ".join(items_list) or "MBG menu", items=items_list),
        batch_history=batch_history(db, active_batch_id),
        rule_table_version=RULE_TABLE_VERSION,
    )
    outcome = await run_inspection(inspection_input)
    finding_ids = [f"fnd_{unique_suffix}_{index + 1}" for index in range(len(outcome.findings))]
    response = None
    if outcome.state == RunState.COMPLETED:
        response = build_response(
            outcome,
            clean_table_name,
            datetime.now(timezone.utc).strftime("%H:%M"),
            finding_ids,
        )
        response.is_retake = is_retake
        if is_retake:
            response.retake_note = (
                "Retake processed. Earlier findings keep their recorded human resolutions; "
                "the agent never clears them on its own."
            )
        for card in response.findings:
            card.run_id = run_id
            card.photo_id = photo_id
            card.photo_url = presigned_photo_url

    try:
        existing_batch = db.query(Batch).filter(Batch.id == active_batch_id).first()
        if not existing_batch:
            target_school = (
                db.query(SchoolRecipient).filter(SchoolRecipient.id == school_id).first()
                if school_id
                else db.query(SchoolRecipient).first()
            )
            batch_title = f"{target_school.name} • {clean_table_name} ({target_school.portion_count} Porsi)" if target_school else clean_table_name

            db.add(
                Batch(
                    id=active_batch_id,
                    menu_id="MBG-01",
                    menu_name=", ".join(items_list) or "Menu MBG Standar",
                    table_name=batch_title,
                    target_school_id=target_school.id if target_school else None,
                    target_school_name=target_school.name if target_school else None,
                    status="in_review",
                )
            )

        db.add(
            Photo(
                id=photo_id,
                batch_id=active_batch_id,
                object_key=storage_key,
                media_type="image/jpeg",
                file_size_bytes=len(jpeg_bytes),
            )
        )
        db.add(
            Run(
                id=run_id,
                batch_id=active_batch_id,
                photo_id=photo_id,
                state=outcome.state.value,
                outcome=response.status if response else None,
                headline=response.headline if response else None,
                summary_label=response.summary_label if response else None,
                primary_action_label=response.primary_action_label if response else None,
                next_action=outcome.next_action,
                uncertainty_json=outcome.uncertainty,
                error_json=outcome.error.model_dump(mode="json") if outcome.error else None,
                provider=outcome.provider,
                model=outcome.model,
                raw_observation=outcome.model_dump(mode="json"),
            )
        )
        for finding, finding_id in zip(outcome.findings, finding_ids, strict=True):
            db.add(
                Finding(
                    id=finding_id,
                    run_id=run_id,
                    batch_id=active_batch_id,
                    level=finding.level,
                    concern_type=finding.concern_type,
                    box_json=finding.box.model_dump() if finding.box else None,
                    explanation=finding.explanation,
                    rule_reference=finding.rule_reference,
                    evidence_gap=finding.evidence_gap,
                    suggested_action=finding.suggested_action,
                    status="open",
                )
            )
        for event in outcome.events:
            db.add(
                ActivityEvent(
                    id=f"evt_{unique_suffix}_{event.sequence}",
                    run_id=run_id,
                    sequence=event.sequence,
                    agent=event.agent,
                    step=event.step,
                    parent_step=event.parent_step,
                    kind=event.kind,
                    status=event.status,
                    summary=event.summary,
                    references_json=event.references,
                    uncertainty=event.uncertainty,
                    error=event.error,
                    timestamp=event.timestamp,
                )
            )
        db.commit()

        supervisor = (
            db.query(User)
            .filter(User.role == "supervisor")
            .first()
        )
        sup_chat = supervisor.telegram_chat_id if (supervisor and supervisor.telegram_chat_id) else None
        sup_name = supervisor.name if supervisor else "Supervisor Dapur MBG"
        sup_phone = supervisor.phone_number if supervisor else None
        run_completed = outcome.state == RunState.COMPLETED
        visibly_clean = run_completed and outcome.outcome == Outcome.NO_VISIBLE_CONCERN

        try:
            if is_retake and (outcome.findings or visibly_clean):
                asyncio.create_task(
                    send_supervisor_retake_notification(
                        table_name=clean_table_name,
                        batch_id=active_batch_id,
                        findings=outcome.findings,
                        photo_url=presigned_photo_url,
                        chat_id=sup_chat,
                        supervisor_name=sup_name,
                        supervisor_phone=sup_phone,
                    )
                )
            elif not is_retake and outcome.findings:
                asyncio.create_task(
                    send_supervisor_safety_alert(
                        table_name=clean_table_name,
                        batch_id=active_batch_id,
                        findings=outcome.findings,
                        photo_url=presigned_photo_url,
                        chat_id=sup_chat,
                        supervisor_name=sup_name,
                        supervisor_phone=sup_phone,
                    )
                )
        except Exception as notify_err:
            logger.warning("Gagal mendaftarkan task notifikasi: %s", notify_err)
    except Exception as e:
        db.rollback()
        logger.error("Gagal menyimpan hasil inspeksi ke Neon DB: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hasil inspeksi gagal disimpan. Coba lagi.",
        )

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail={
                "code": outcome.error.code,
                "message": outcome.error.message,
                "retryable": outcome.error.retryable,
                "run_id": run_id,
                "batch_id": active_batch_id,
            },
        )

    response.batch_id = active_batch_id
    response.run_id = run_id
    response.photo_id = photo_id
    response.photo_url = presigned_photo_url
    return response


def batch_history(db: Session, batch_id: str) -> list[ContractFinding]:
    """Earlier open findings of this batch, for the Compliance agent's batch check."""
    rows = (
        db.query(Finding)
        .filter(Finding.batch_id == batch_id, Finding.status == "open")
        .all()
    )
    return [
        ContractFinding(
            level=row.level if row.level in ("safety", "quality") else "safety",
            concern_type=row.concern_type,
            box=None,
            explanation=row.explanation,
            rule_reference=row.rule_reference,
            evidence_gap=row.evidence_gap,
            suggested_action=row.suggested_action,
        )
        for row in rows
    ]


def run_display_status(run: Run | None) -> str:
    if not run or run.state != "completed" or run.outcome not in ("clean", "review_required", "retake_required"):
        return "retake_required"
    if run.outcome == "clean" and (run.uncertainty_json or any(f.status == "open" for f in run.batch.findings)):
        return "review_required"
    return run.outcome


@app.get(
    "/api/overview",
    response_model=BatchOverviewSchema,
    tags=["Batch & History"],
    summary="Ambil data lengkap untuk UI-1 (Overview Screen: headline, today's menu, list meja)",
)
@app.get(
    "/api/batches/overview",
    response_model=BatchOverviewSchema,
    tags=["Batch & History"],
    summary="Alias overview batch",
)
def get_batch_overview(
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    __: User = Depends(get_current_actor),
) -> BatchOverviewSchema:
    """Mengembalikan data lengkap yang siap pakai untuk tampilan UI-1:
    - Judul Header & Dapur ('Dapur Aman', 'SPPG Cibeureum Synthetic demo')
    - Subtitle ('Batch 07 • Nasi ayam kecap • 410 trays')
    - Headline ('4 photos checked, packing goes on')
    - Today's menu chips ('Nasi putih', 'Ayam kecap', 'Tumis buncis', 'Tahu goreng', 'Anggur')
    - Daftar baki/meja ('Table 1', 'Table 2', 'Table 3', 'Rack A') beserta status temuan & waktu
    """
    batches = db.query(Batch).order_by(Batch.created_at.asc()).all()

    packing_photos: list[PackingPhotoRowSchema] = []
    for b in batches:
        latest_run = (
            sorted(b.runs, key=lambda r: r.created_at, reverse=True)[0]
            if b.runs
            else None
        )

        row_status = run_display_status(latest_run)
        completed = bool(latest_run and latest_run.state == "completed" and latest_run.outcome in ("clean", "review_required", "retake_required"))
        base_label = {
            "clean": "No visible concerns; human review still required",
            "review_required": "Findings or uncertainty need human review",
            "retake_required": "Inspection incomplete or photo needs retake",
        }[row_status]

        fixed_count = sum(1 for a in b.actions if a.action == "fixed")
        dismissed_count = sum(1 for a in b.actions if a.action == "dismissed")
        action_parts = []
        if fixed_count:
            action_parts.append(f"{fixed_count} fixed")
        if dismissed_count:
            action_parts.append(f"{dismissed_count} dismissed")

        if action_parts:
            summary_label = f"{base_label}; {', '.join(action_parts)}"
        else:
            summary_label = base_label

        time_str = b.created_at.strftime("%H:%M") if b.created_at else "08:00"

        photo_url = None
        if b.photos:
            latest_photo = sorted(b.photos, key=lambda p: p.created_at, reverse=True)[0]
            try:
                photo_url = generate_presigned_url(latest_photo.object_key, expires_in=600)
            except Exception:
                photo_url = None

        packing_photos.append(
            PackingPhotoRowSchema(
                batch_id=b.id,
                table_name=b.table_name or b.menu_name,
                summary_label=summary_label,
                timestamp_str=time_str,
                status=row_status,
                photo_url=photo_url,
                has_check=completed,
            )
        )

    headline = f"{len(packing_photos)} batch inspections recorded; review each status before serving"

    supervisor = db.query(User).filter(User.role == "supervisor").first()
    latest_batch = batches[-1] if batches else None
    return BatchOverviewSchema(
        app_title="Dapur Aman",
        kitchen_name="SPPG Cibeureum",
        batch_subtitle=f"{latest_batch.id}: {latest_batch.menu_name}" if latest_batch else "No batches yet",
        headline=headline,
        today_menu_setter=supervisor.name if supervisor else "Not recorded",
        today_menu_items=[],
        packing_photos=packing_photos,
        primary_action_label="Photo of the next table",
        helper_text="One photo per table or rack, before the lids go on. Any angle is fine.",
    )


def finding_photo(finding: Finding) -> Photo | None:
    if not finding.run or not finding.batch:
        return None
    return next((photo for photo in finding.batch.photos if photo.id == finding.run.photo_id), None)


def signed_photo_url(photo: Photo | None) -> str | None:
    if photo is None:
        return None
    try:
        return generate_presigned_url(photo.object_key, expires_in=600)
    except Exception:
        return None


def saved_finding_card(finding: Finding, db: Session) -> FindingCardSchema:
    resolved = finding.status in ("fixed", "dismissed")
    actor = db.get(User, finding.resolution_actor_id) if finding.resolution_actor_id else None
    time_str = finding.resolution_at.strftime("%H:%M") if finding.resolution_at else None
    resolution_text = None
    if resolved and finding.resolution_note:
        resolution_text = "Fixed" if finding.status == "fixed" else "Dismissed"
        if time_str:
            resolution_text += f" {time_str}"
        if actor:
            resolution_text += f" - {actor.name}"
        resolution_text += f": {finding.resolution_note}"
    return FindingCardSchema(
        id=finding.id,
        title=finding.concern_type,
        level=finding.level,
        detail=finding.explanation,
        box=EvidenceBoxSchema(**finding.box_json) if finding.box_json else None,
        icon_type="fixed" if finding.status == "fixed" else finding.level,
        state=finding.status,
        rule_reference=finding.rule_reference,
        evidence_gap=finding.evidence_gap,
        suggested_action=finding.suggested_action,
        run_id=finding.run_id,
        photo_id=finding.run.photo_id if finding.run else None,
        photo_url=signed_photo_url(finding_photo(finding)),
        resolution_text=resolution_text,
        resolution_action=finding.status if resolved else None,
        resolution_note=finding.resolution_note,
        resolution_actor=actor.name if actor else None,
        resolution_time_str=time_str,
    )


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@app.get(
    "/api/supervisor/dashboard",
    response_model=SupervisorDashboardSchema,
    tags=["Supervisor Dashboard"],
)
@app.get(
    "/api/supervisor/feed",
    response_model=SupervisorDashboardSchema,
    tags=["Supervisor Dashboard"],
)
def get_supervisor_dashboard(
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    actor: User = Depends(get_current_actor),
) -> SupervisorDashboardSchema:
    if actor.role != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisor access required.")
    now = datetime.now(timezone.utc)
    safety_findings = db.query(Finding).filter(Finding.level == "safety").all()
    safety_findings.sort(
        key=lambda finding: utc_datetime(finding.run.created_at), reverse=True
    )
    feed = []
    active_card = None
    for finding in safety_findings:
        created = utc_datetime(finding.run.created_at)
        end = utc_datetime(finding.resolution_at) if finding.resolution_at else now
        minutes = max(0, int((end - created).total_seconds() / 60))
        resolved = finding.status in ("fixed", "dismissed")
        verb = "Fixed" if finding.status == "fixed" else "Dismissed"
        duration = f"{verb} in {minutes} min" if resolved and finding.resolution_at else (
            "Resolution time unavailable" if resolved else f"Open, {minutes} min"
        )
        card = saved_finding_card(finding, db)
        subtitle = f"{finding.batch_id} - found {created.strftime('%d %b %H:%M')} UTC"
        feed.append(SafetyFeedItemSchema(
            finding_id=finding.id,
            batch_id=finding.batch_id,
            run_id=finding.run_id,
            photo_id=card.photo_id,
            thumbnail_url=card.photo_url,
            title=finding.concern_type,
            subtitle=subtitle,
            status=finding.status,
            icon_type=finding.status if resolved else "safety",
            duration_min=minutes,
            duration_label=duration,
            resolution_note=card.resolution_text,
        ))
        if active_card is None and finding.status == "open":
            active_card = ActiveConcernCardSchema(
                finding_id=finding.id,
                batch_id=finding.batch_id,
                run_id=finding.run_id,
                photo_id=card.photo_id,
                photo_url=card.photo_url,
                title=finding.concern_type,
                detail=finding.explanation,
                level=finding.level,
                subtitle=subtitle,
                assigned_staff="",
                box=card.box,
                hold_action_label=f"Hold batch {finding.batch_id}",
            )
    batches = []
    for batch in db.query(Batch).order_by(Batch.created_at.desc()).all():
        has_open = any(finding.status == "open" for finding in batch.findings)
        latest = max(batch.runs, key=lambda run: run.created_at) if batch.runs else None
        completed = latest is not None and latest.state == "completed" and latest.outcome in ("clean", "review_required", "retake_required")
        if batch.status == "closed":
            state, label, color = "closed", "Closed", "green"
        elif batch.status == "on_hold":
            state, label, color = "on_hold", "On hold", "red"
        elif has_open:
            state, label, color = "finding_open", "Finding open", "red"
        else:
            state, label, color = "packing", "Packing" if completed else "Inspection incomplete", "yellow"
        quality_count = sum(finding.level == "quality" for finding in batch.findings)
        subtitle = f"{batch.menu_name} • {len(batch.photos)} foto • {quality_count} catatan kualitas"
        batches.append(BatchListItemSchema(
            batch_id=batch.id, menu_name=batch.menu_name, photos_count=len(batch.photos),
            subtitle=subtitle, status=state, badge_label=label, badge_color=color,
        ))

    # Data alokasi sekolah & porsi
    schools_list = []
    total_portions_cleared = 0
    all_schools = db.query(SchoolRecipient).order_by(SchoolRecipient.name.asc()).all()
    for s in all_schools:
        s_batches = db.query(Batch).filter(Batch.target_school_id == s.id).all()
        s_closed = [b for b in s_batches if b.status == "closed"]
        s_open = [b for b in s_batches if b.status != "closed"]
        cleared_portions = len(s_closed) * s.portion_count
        total_portions_cleared += cleared_portions
        schools_list.append({
            "id": s.id,
            "name": s.name,
            "principal_name": s.principal_name,
            "phone_number": s.phone_number,
            "address": s.address,
            "target_portions": s.portion_count,
            "cleared_batches": len(s_closed),
            "in_progress_batches": len(s_open),
            "status": "ready" if len(s_closed) > 0 and len(s_open) == 0 else ("in_progress" if (s_closed or s_open) else "standby")
        })

    all_batches_count = len(batches)
    closed_batches_count = sum(1 for b in batches if b.status == "closed")
    pass_rate = int((closed_batches_count / all_batches_count * 100)) if all_batches_count > 0 else 100

    fixed = sum(item.status == "fixed" for item in feed)
    dismissed = sum(item.status == "dismissed" for item in feed)
    open_count = sum(item.status == "open" for item in feed)
    return SupervisorDashboardSchema(
        supervisor_name=actor.name,
        kitchen_name="SPPG Cibeureum (Dapur Sentral MBG)",
        date_str=now.strftime("%a %d %b %H:%M UTC"),
        headline=f"{len(feed)} temuan keamanan tercatat: {fixed} selesai diperbaiki staf, {dismissed} diabaikan beralasan, {open_count} aktif butuh tindakan",
        is_supervisor=True,
        stats={"total_safety": len(feed), "fixed": fixed, "dismissed": dismissed, "open": open_count},
        total_portions_cleared=total_portions_cleared,
        clean_pass_rate=pass_rate,
        active_concern=active_card,
        safety_feed=feed,
        batches=batches,
        schools=schools_list,
    )


@app.get(
    "/api/batches/{batch_id}",
    response_model=BatchDetailSchema,
    tags=["Batch & History"],
    summary="Ambil detail batch, riwayat run, temuan, dan URL foto bertanda tangan segar",
)
def get_batch_detail(
    batch_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    __: User = Depends(get_current_actor),
) -> BatchDetailSchema:
    """Ambil riwayat lengkap dari sebuah batch:

    - Status meja dan baki
    - Fresh 10-minute presigned URL untuk foto
    - Daftar runs dan temuan (findings)
    - Riwayat tindakan manusia (human actions)
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch dengan ID '{batch_id}' tidak ditemukan.",
        )

    # Ambil foto terbaru untuk menghasilkan presigned URL segar
    photo_url = None
    if batch.photos:
        latest_photo = sorted(batch.photos, key=lambda p: p.created_at, reverse=True)[0]
        try:
            photo_url = generate_presigned_url(latest_photo.object_key, expires_in=600)
        except Exception:
            photo_url = None

    runs_data = []
    for run in batch.runs:
        display_status = run_display_status(run)
        if run.state != "completed" or not run.outcome:
            headline = "Inspection incomplete; retry or retake"
        elif display_status == "review_required" and run.outcome == "clean":
            headline = "Uncertainty or open findings need human review"
        else:
            headline = run.headline or "Human review required"
        runs_data.append(BatchRunSchema(
            id=run.id,
            state=run.state,
            outcome=display_status,
            photo_id=run.photo_id,
            photo_url=signed_photo_url(next((photo for photo in batch.photos if photo.id == run.photo_id), None)),
            uncertainty=run.uncertainty_json or [],
            error=run.error_json,
            headline=headline,
            summary_label=(run.summary_label or headline) if display_status == run.outcome else headline,
            primary_action_label=run.primary_action_label or run.next_action or "",
            provider=run.provider,
            model=run.model,
            created_at=run.created_at,
        ))

    findings_data = [saved_finding_card(finding, db) for finding in batch.findings]

    # Format actions
    actions_data = [
        HumanActionRecordSchema(
            id=a.id,
            action=a.action,
            reason=a.reason,
            actor_id=a.actor_id,
            actor_name=a.actor.name if a.actor else a.actor_id,
            finding_id=a.finding_id,
            created_at=a.created_at,
        )
        for a in batch.actions
    ]

    return BatchDetailSchema(
        batch_id=batch.id,
        table_name=batch.table_name or batch.menu_name,
        menu_name=batch.menu_name,
        status=batch.status,  # type: ignore
        photo_url=photo_url,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        runs=runs_data,
        findings=findings_data,
        actions=actions_data,
    )


def has_newer_completed_run(db: Session, finding: Finding) -> bool:
    finding_run = db.get(Run, finding.run_id)
    if not finding_run:
        return False
    return (
        db.query(Run)
        .filter(
            Run.batch_id == finding.batch_id,
            Run.state == RunState.COMPLETED.value,
            Run.created_at > finding_run.created_at,
        )
        .first()
        is not None
    )


@app.post(
    "/api/actions",
    response_model=ActionResponse,
    tags=["Human Actions"],
    summary="Catat tindakan staf/supervisor (fix finding, dismiss, on_hold, lift_hold, close)",
)
async def record_human_action(
    payload: ActionRequest,
    _: None = Depends(verify_shared_secret),
    actor: User = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> ActionResponse:
    """Mencatat tindakan manusia terhadap temuan atau status batch:

    - **Role Check**: Hanya role 'supervisor' yang berwenang melakukan 'on_hold' dan 'lift_hold'.
    - **Actions**:
      * `fixed`: Tandai temuan sudah diperbaiki (membutuhkan finding_id, alasan, dan foto ulang yang selesai diperiksa).
      * `dismissed`: Abaikan temuan dengan catatan alasan.
      * `on_hold`: Tahan baki untuk investigasi lebih lanjut (supervisor only).
      * `lift_hold`: Lepas penahanan baki (supervisor only).
      * `close`: Tutup batch jika tidak ada lagi temuan terbuka ('open').
    """
    batch = db.query(Batch).filter(Batch.id == payload.batch_id).first()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Batch '{payload.batch_id}' tidak ditemukan.",
        )

    # 1. Enforce supervisor permission for hold states
    if payload.action in ("on_hold", "lift_hold"):
        if actor.role != "supervisor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hanya supervisor yang berwenang menempatkan atau mencabut status on_hold.",
            )

    if payload.action in ("fixed", "dismissed") and not payload.finding_id:
        raise HTTPException(status_code=400, detail="A finding_id is required for this action.")

    # 2. Handle finding-level actions
    if payload.finding_id:
        finding = db.query(Finding).filter(Finding.id == payload.finding_id).first()
        if not finding or finding.batch_id != batch.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Finding '{payload.finding_id}' tidak ditemukan.",
            )
        if payload.action == "fixed" and not has_newer_completed_run(db, finding):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ambil foto ulang dulu. Temuan hanya dapat ditandai diperbaiki setelah foto ulang selesai diperiksa.",
            )
        if payload.action == "fixed":
            finding.status = "fixed"
            finding.resolution_note = payload.reason
            finding.resolution_actor_id = actor.id
            finding.resolution_at = datetime.now(timezone.utc)
        elif payload.action == "dismissed":
            finding.status = "dismissed"
            finding.resolution_note = payload.reason
            finding.resolution_actor_id = actor.id
            finding.resolution_at = datetime.now(timezone.utc)

    # 3. Handle batch-level actions
    if payload.action == "on_hold":
        batch.status = "on_hold"
        batch.hold_reason = payload.reason
        batch.hold_by = actor.id
    elif payload.action == "lift_hold":
        batch.status = "in_review"
        batch.hold_reason = None
        batch.hold_by = None
    elif payload.action == "close":
        open_count = (
            db.query(Finding)
            .filter(Finding.batch_id == batch.id, Finding.status == "open")
            .count()
        )
        if open_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tidak dapat menutup batch: masih ada {open_count} temuan terbuka yang harus diperbaiki atau diabaikan.",
            )
        if batch.status == "on_hold":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tidak dapat menutup batch yang sedang dalam status 'on_hold'.",
            )
        batch.status = "closed"

    # 4. Catat record HumanAction
    action_id = f"act_{uuid.uuid4().hex[:10]}"
    action_record = HumanAction(
        id=action_id,
        batch_id=batch.id,
        finding_id=payload.finding_id,
        actor_id=actor.id,
        action=payload.action,
        reason=payload.reason,
    )
    db.add(action_record)
    db.commit()

    if payload.action == "close" and actor.role == "supervisor":
        target_id = batch.target_school_id or "sch_01"
        school = db.query(SchoolRecipient).filter(SchoolRecipient.id == target_id).first()
        if not school:
            school = db.query(SchoolRecipient).first()

        school_name = (school.name if school else None) or batch.target_school_name or "SDN 01 Merdeka Bandung"
        principal_name = school.principal_name if school else "Bpk. Drs. H. Bambang Sutrisno, M.Pd"
        phone_number = school.phone_number if school else "+62 812-3456-7890"
        address = school.address if school else "Jl. Merdeka No. 45, Bandung"
        total_trays = school.portion_count if school else 450
        school_chat = school.telegram_chat_id if (school and school.telegram_chat_id) else None

        clearance_photo_url = None
        if batch.photos:
            latest_p = sorted(batch.photos, key=lambda p: p.created_at, reverse=True)[0]
            try:
                clearance_photo_url = generate_presigned_url(latest_p.object_key, expires_in=3600)
            except Exception:
                pass
        try:
            await send_school_clearance_report(
                batch_id=batch.id,
                menu_name=batch.menu_name or batch.table_name or "Menu MBG Standar",
                supervisor_name=actor.name,
                school_name=school_name,
                principal_name=principal_name,
                phone_number=phone_number,
                address=address,
                total_trays=total_trays,
                photo_url=clearance_photo_url,
                chat_id=school_chat,
                first_photo_at=batch.created_at,
            )
        except Exception as notify_err:
            logger.warning("Gagal mengirim laporan pemeriksaan batch ke sekolah: %s", notify_err)

    return ActionResponse(
        success=True,
        action_id=action_id,
        batch_id=batch.id,
        finding_id=payload.finding_id,
        action=payload.action,
        actor_id=actor.id,
        actor_name=actor.name,
        message=f"Tindakan '{payload.action}' berhasil dicatat oleh {actor.name}.",
    )


@app.get("/api/runs/{run_id}/events", tags=["Batch & History"])
def get_run_events(
    run_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    __: User = Depends(get_current_actor),
) -> dict:
    if not db.get(Run, run_id):
        raise HTTPException(status_code=404, detail="Run not found.")
    events = db.query(ActivityEvent).filter(ActivityEvent.run_id == run_id).order_by(ActivityEvent.sequence).all()
    return {"run_id": run_id, "events": [
        {"sequence": event.sequence, "timestamp": event.timestamp, "agent": event.agent,
         "step": event.step, "parent_step": event.parent_step, "kind": event.kind,
         "status": event.status, "summary": event.summary, "references": event.references_json or [],
         "uncertainty": event.uncertainty, "error": event.error}
        for event in events
    ]}


@app.post("/api/notifications/test-alert", tags=["Telegram Notifications"])
async def trigger_test_alert(
    table_name: str = "Table 1 (Meja Uji Demo)",
    batch_id: str = "batch_demo_01",
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    actor: User = Depends(get_current_actor),
) -> dict:
    """Kirim notifikasi uji coba ke Telegram Supervisor untuk simulasi / verifikasi koneksi bot."""
    if actor.role != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisor access required.")
    sample_findings = [
        {
            "concern_type": "hair",
            "level": "safety",
            "explanation": "Ditemukan sehelai rambut pada kuadran nasi bagian kanan.",
            "rule_reference": "rule-table-v1:foreign-01",
            "suggested_action": "Angkat dan ganti porsi nasi yang terdampak, lalu lakukan foto ulang.",
        },
        {
            "concern_type": "empty_compartment",
            "level": "quality",
            "explanation": "Kompartemen sayur masih kosong, belum diisi tumis buncis.",
            "rule_reference": "rule-table-v1:menu-01",
            "suggested_action": "Isi kompartemen sayur sesuai menu MBG hari ini.",
        },
    ]
    supervisor = (
        db.query(User)
        .filter(User.role == "supervisor")
        .first()
    )
    sup_chat = supervisor.telegram_chat_id if (supervisor and supervisor.telegram_chat_id) else None
    sup_name = supervisor.name if supervisor else "Supervisor Dapur 1"
    sup_phone = supervisor.phone_number if supervisor else "+62 811-2233-4455"

    result = await send_supervisor_safety_alert(
        table_name=table_name,
        batch_id=batch_id,
        findings=sample_findings,
        chat_id=sup_chat,
        supervisor_name=sup_name,
        supervisor_phone=sup_phone,
    )
    return {"status": "ok", "telegram_result": result}


@app.get("/api/schools", tags=["School Recipients"])
def get_school_recipients(
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    __: User = Depends(get_current_actor),
) -> list[dict]:
    """Ambil daftar sekolah penerima program MBG beserta kontak kepala sekolah."""
    schools = db.query(SchoolRecipient).order_by(SchoolRecipient.name.asc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "principal_name": s.principal_name,
            "phone_number": s.phone_number,
            "portion_count": s.portion_count,
            "address": s.address,
        }
        for s in schools
    ]


@app.post("/api/notifications/dispatch-report/{batch_id}", tags=["Telegram Notifications"])
async def trigger_dispatch_report(
    batch_id: str,
    school_id: str | None = None,
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
    actor: User = Depends(get_current_actor),
) -> dict:
    """Kirim Laporan Pemeriksaan Batch ke Telegram kontak sekolah."""
    if actor.role != "supervisor":
        raise HTTPException(status_code=403, detail="Hanya supervisor yang dapat mengirim laporan pemeriksaan batch.")
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{batch_id}' tidak ditemukan.")
    if batch.status != "closed":
        raise HTTPException(status_code=409, detail="Laporan pemeriksaan hanya untuk batch yang sudah ditutup supervisor.")

    target_id = school_id or batch.target_school_id or "sch_01"
    school = db.query(SchoolRecipient).filter(SchoolRecipient.id == target_id).first()
    if not school:
        school = db.query(SchoolRecipient).first()

    photo_url = None
    if batch.photos:
        latest_photo = sorted(batch.photos, key=lambda p: p.created_at, reverse=True)[0]
        try:
            photo_url = generate_presigned_url(latest_photo.object_key, expires_in=3600)
        except Exception:
            photo_url = None

    school_name = (school.name if school else None) or batch.target_school_name or "SDN 01 Merdeka Bandung"
    principal_name = school.principal_name if school else "Bpk. Drs. H. Bambang Sutrisno, M.Pd"
    phone_number = school.phone_number if school else "+62 812-3456-7890"
    address = school.address if school else "Jl. Merdeka No. 45, Bandung"
    total_trays = school.portion_count if school else 450
    school_chat = school.telegram_chat_id if (school and school.telegram_chat_id) else None

    result = await send_school_clearance_report(
        batch_id=batch.id,
        menu_name=batch.menu_name or batch.table_name or "Menu MBG Standar",
        supervisor_name=actor.name,
        school_name=school_name,
        principal_name=principal_name,
        phone_number=phone_number,
        address=address,
        total_trays=total_trays,
        photo_url=photo_url,
        chat_id=school_chat,
        first_photo_at=batch.created_at,
    )
    return {
        "status": "ok",
        "batch_id": batch.id,
        "school": {
            "name": school_name,
            "principal": principal_name,
            "phone": phone_number,
            "portions": total_trays,
        },
        "telegram_result": result,
    }
