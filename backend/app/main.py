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
from app.seed import seed_default_users
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
)
from agents.compliance.rules import RULE_TABLE_VERSION
from agents.contract import Finding as ContractFinding
from agents.contract import InspectionInput, Menu, RunState
from agents.contract import Photo as ContractPhoto
from agents.workflow import run_inspection
from app.inspection import InvalidPhotoError, build_response, to_jpeg

logger = logging.getLogger("dapur_aman.api")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager: initializes tables and seeds default accounts."""
    logger.info("Initializing database schema in Neon Postgres...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema initialized.")

    with SessionLocal() as db:
        seed_default_users(db)
    logger.info("Default user accounts verified.")
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
    _: None = Depends(verify_shared_secret),
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

    try:
        existing_batch = db.query(Batch).filter(Batch.id == active_batch_id).first()
        if not existing_batch:
            db.add(
                Batch(
                    id=active_batch_id,
                    menu_id="MBG-01",
                    menu_name=clean_table_name,
                    table_name=clean_table_name,
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
    except Exception as e:
        db.rollback()
        logger.error("Gagal menyimpan hasil inspeksi ke Neon DB: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hasil inspeksi gagal disimpan. Coba lagi.",
        )

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": outcome.error.code,
                "message": outcome.error.message,
                "retryable": outcome.error.retryable,
                "run_id": run_id,
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

        # Format label ringkasan (misal: "2 safety spots • 1 fixed, 1 dismissed • retaken")
        base_label = (
            latest_run.summary_label
            if latest_run and latest_run.summary_label
            else "No spots"
        )

        fixed_count = sum(1 for a in b.actions if a.action == "fixed")
        dismissed_count = sum(1 for a in b.actions if a.action == "dismissed")
        action_parts = []
        if fixed_count:
            action_parts.append(f"{fixed_count} fixed")
        if dismissed_count:
            action_parts.append(f"{dismissed_count} dismissed")

        if action_parts:
            summary_label = f"{base_label} • {', '.join(action_parts)} • retaken"
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

        row_status = (
            latest_run.outcome
            if latest_run
            and latest_run.outcome in ("clean", "review_required", "retake_required")
            else "clean"
        )

        packing_photos.append(
            PackingPhotoRowSchema(
                batch_id=b.id,
                table_name=b.table_name or b.menu_name,
                summary_label=summary_label,
                timestamp_str=time_str,
                status=row_status,
                photo_url=photo_url,
                has_check=True,
            )
        )

    # Headline dinamis sesuai jumlah foto yang diperiksa
    photos_count = len(packing_photos)
    headline = (
        f"{photos_count} photos checked, packing goes on"
        if photos_count > 0
        else "Ready for inspection, packing goes on"
    )

    return BatchOverviewSchema(
        app_title="Dapur Aman",
        kitchen_name="SPPG Cibeureum Synthetic demo",
        batch_subtitle="Batch 07 • Nasi ayam kecap • 410 trays",
        headline=headline,
        today_menu_setter="Siti",
        today_menu_items=[
            "Nasi putih",
            "Ayam kecap",
            "Tumis buncis",
            "Tahu goreng",
            "Anggur",
        ],
        packing_photos=packing_photos,
        primary_action_label="Photo of the next table",
        helper_text="One photo per table or rack, before the lids go on. Any angle is fine.",
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

    # Format runs
    runs_data = [
        BatchRunSchema(
            id=r.id,
            state=r.state,
            outcome=r.outcome or "completed",
            headline=r.headline or "",
            summary_label=r.summary_label or "",
            primary_action_label=r.primary_action_label or r.next_action or "",
            provider=r.provider,
            model=r.model,
            created_at=r.created_at,
        )
        for r in batch.runs
    ]

    # Format findings
    findings_data = [
        FindingCardSchema(
            id=f.id,
            title=f.concern_type,
            level=f.level,  # type: ignore
            detail=f.explanation,
            box=EvidenceBoxSchema(
                x_min=f.box_json["x_min"],
                y_min=f.box_json["y_min"],
                x_max=f.box_json["x_max"],
                y_max=f.box_json["y_max"],
            )
            if f.box_json and "x_min" in f.box_json
            else None,
            icon_type="safety" if f.level == "safety" else "quality",
            state=f.status,  # type: ignore
        )
        for f in batch.findings
    ]

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
        status=batch.status,  # type: ignore
        photo_url=photo_url,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        runs=runs_data,
        findings=findings_data,
        actions=actions_data,
    )


@app.post(
    "/api/actions",
    response_model=ActionResponse,
    tags=["Human Actions"],
    summary="Catat tindakan staf/supervisor (fix finding, dismiss, on_hold, lift_hold, close)",
)
def record_human_action(
    payload: ActionRequest,
    _: None = Depends(verify_shared_secret),
    actor: User = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> ActionResponse:
    """Mencatat tindakan manusia terhadap temuan atau status batch:

    - **Role Check**: Hanya role 'supervisor' yang berwenang melakukan 'on_hold' dan 'lift_hold'.
    - **Actions**:
      * `fixed`: Tandai temuan sudah diperbaiki (membutuhkan finding_id dan alasan).
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

    # 2. Handle finding-level actions
    if payload.finding_id:
        finding = db.query(Finding).filter(Finding.id == payload.finding_id).first()
        if not finding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Finding '{payload.finding_id}' tidak ditemukan.",
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
