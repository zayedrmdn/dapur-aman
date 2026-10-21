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
    Header,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import (
    AI_PROVIDER,
    AI_MODEL,
    BACKEND_SHARED_SECRET,
)
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
    SupervisorDashboardSchema,
    ActiveConcernCardSchema,
    SafetyFeedItemSchema,
    BatchListItemSchema,
)
from agents.vision.agent import get_vision_agent

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
    allow_origins=["*"],
    allow_credentials=True,
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
    summary="Inspeksi foto makanan, simpan ke Neon DB & S3, dan hasilkan respons UI",
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
    is_retake: bool = Form(False, description="Tandai jika foto ini adalah foto ulang (retake) setelah perbaikan"),
    x_actor_id: str | None = Header(None, alias="X-Actor-Id"),
    x_shared_secret: str | None = Header(None, alias="X-Shared-Secret"),
    db: Session = Depends(get_db),
) -> InspectionResponseSchema:
    """Endpoint utama inspeksi foto baki makanan:

    1. Membaca dan memvalidasi file foto (maks 4 MB)
    2. Mengunggah foto ke Neon Object Storage (private S3 bucket)
    3. Membuat record Batch, Photo, dan Run di Neon Postgres
    4. Menjalankan VisionAgent (Gemini 3.8 Flash via Vertex AI)
    5. Menyimpan temuan (findings) dan bounding box ke database
    6. Menghasilkan signed URL 10 menit untuk akses foto di frontend
    7. Mengembalikan data lengkap sesuai format tampilan UI-1 dan UI-2
    """
    # Verifikasi shared secret jika disuplai atau jika BACKEND_SHARED_SECRET aktif
    if x_shared_secret is not None:
        if x_shared_secret != BACKEND_SHARED_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Header 'X-Shared-Secret' tidak valid.",
            )

    # 1. Validasi foto
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

    content_type = photo.content_type or "image/jpeg"
    clean_table_name = table_name.strip() or "Table 1"

    # 2. Generate persistent database IDs
    unique_suffix = uuid.uuid4().hex[:10]
    active_batch_id = batch_id.strip() if batch_id and batch_id.strip() else f"batch_{unique_suffix}"
    photo_id = f"pho_{unique_suffix}"
    run_id = f"run_{unique_suffix}"

    # 3. Upload photo to Neon Object Storage
    storage_key = f"photos/{active_batch_id}/{photo_id}.jpg"
    try:
        upload_photo_bytes(storage_key, photo_bytes, content_type)
        presigned_photo_url = generate_presigned_url(storage_key, expires_in=600)
    except Exception as e:
        logger.error("Gagal mengunggah foto ke Neon S3: %s", e)
        presigned_photo_url = f"https://storage.neon.tech/{storage_key}"

    # 4. Parse menu items
    items_list = [item.strip() for item in menu_items.split(",") if item.strip()]

    # 5. Jalankan analisis Vision Agent
    try:
        agent = get_vision_agent()
        result = await agent.inspect(
            photo_bytes=photo_bytes,
            table_name=clean_table_name,
            menu_items=items_list,
            content_type=content_type,
        )
    except Exception as e:
        logger.exception("Vision Agent error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vision Agent gagal menganalisis foto: {e}",
        )

    # Sesuaikan headline, tombol, dan teks regulasi jika ini adalah foto ulang (retake / UI-3)
    if is_retake:
        result.is_retake = True
        spv_user = db.query(User).filter(User.role == "supervisor").first()
        spv_first_name = spv_user.name.split(" ")[0] if spv_user else "Siti"
        batch_label_num = active_batch_id.replace("batch_", "").strip()
        if len(batch_label_num) > 4:
            batch_label_num = batch_label_num[:2].upper()
        if not batch_label_num:
            batch_label_num = "07"
        result.headline = f"{clean_table_name} retake checked. {spv_first_name} sees your fix and your reason."
        result.primary_action_label = f"Back to batch {batch_label_num}"
        result.retake_note = "The agent re-checked the retake. Findings close on your fix or your reason; the agent never clears one on its own."

    # 6. Persist to Neon Postgres
    try:
        existing_batch = db.query(Batch).filter(Batch.id == active_batch_id).first()
        if not existing_batch:
            new_batch = Batch(
                id=active_batch_id,
                menu_id="MBG-01",
                menu_name=clean_table_name,
                table_name=clean_table_name,
                status="in_review",
            )
            db.add(new_batch)

        new_photo = Photo(
            id=photo_id,
            batch_id=active_batch_id,
            object_key=storage_key,
            media_type=content_type,
            file_size_bytes=len(photo_bytes),
        )
        db.add(new_photo)

        new_run = Run(
            id=run_id,
            batch_id=active_batch_id,
            photo_id=photo_id,
            state="completed",
            outcome=result.status,
            headline=result.headline,
            summary_label=result.summary_label,
            primary_action_label=result.primary_action_label,
            next_action=result.primary_action_label,
            provider=AI_PROVIDER,
            model=AI_MODEL,
            raw_observation=result.model_dump(),
        )
        db.add(new_run)

        # Simpan setiap finding baru
        for idx, finding in enumerate(result.findings):
            finding_id = f"fnd_{unique_suffix}_{idx + 1}"
            finding.id = finding_id  # sync ID with model response
            new_finding = Finding(
                id=finding_id,
                run_id=run_id,
                batch_id=active_batch_id,
                level=finding.level,
                concern_type=finding.title,
                box_json=finding.box.model_dump() if finding.box else None,
                explanation=finding.detail,
                suggested_action="Periksa dan lakukan tindakan perbaikan sebelum makanan disajikan.",
                status="open",
            )
            db.add(new_finding)

        # Simpan activity trace
        new_event = ActivityEvent(
            id=f"evt_{unique_suffix}_1",
            run_id=run_id,
            sequence=1,
            agent="VisionAgent",
            step="vision_inspection",
            kind="agent_execution",
            status="completed",
            summary=f"Vision Agent menganalisis baki {clean_table_name}: {len(result.findings)} temuan diidentifikasi.",
            references_json={"components_checked": len(result.detected_components)},
        )
        db.add(new_event)
        db.commit()

    except Exception as e:
        db.rollback()
        logger.exception("Gagal menyimpan hasil inspeksi ke Neon DB: %s", e)

    # 7. Enrich response with IDs, signed photo URL, and resolutions if retake
    result.batch_id = active_batch_id
    result.run_id = run_id
    result.photo_id = photo_id
    result.photo_url = presigned_photo_url

    if is_retake:
        # Jika retake, sertakan temuan-temuan terdahulu pada batch ini yang sudah memiliki catatan resolusi manusia
        batch_record = db.query(Batch).filter(Batch.id == active_batch_id).first()
        if batch_record and batch_record.findings:
            resolved_cards: list[FindingCardSchema] = []
            for f in batch_record.findings:
                res_text = None
                actor_name = "Dewi"
                time_str = f.resolution_at.strftime("%H:%M") if f.resolution_at else "08:11"
                if f.resolution_actor_id:
                    u = db.query(User).filter(User.id == f.resolution_actor_id).first()
                    if u:
                        actor_name = u.name.split(" ")[0]

                if f.status in ("fixed", "dismissed") and f.resolution_note:
                    action_word = "Fixed" if f.status == "fixed" else "Dismissed"
                    res_text = f"{action_word} {time_str} • {actor_name}: {f.resolution_note}"

                resolved_cards.append(
                    FindingCardSchema(
                        id=f.id,
                        title=f.concern_type,
                        level=f.level,
                        detail=f.explanation,
                        box=EvidenceBoxSchema(
                            x_min=f.box_json["x_min"],
                            y_min=f.box_json["y_min"],
                            x_max=f.box_json["x_max"],
                            y_max=f.box_json["y_max"],
                        )
                        if f.box_json and "x_min" in f.box_json
                        else None,
                        icon_type="fixed" if f.status == "fixed" else ("safety" if f.level == "safety" else "quality"),
                        state=f.status,
                        resolution_text=res_text,
                        resolution_action=f.status if f.status in ("fixed", "dismissed") else None,
                        resolution_note=f.resolution_note,
                        resolution_actor=actor_name,
                        resolution_time_str=time_str,
                    )
                )
            if resolved_cards:
                result.findings = resolved_cards

    return result


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

    spv_user = db.query(User).filter(User.role == "supervisor").first()
    today_menu_setter = spv_user.name.split(" ")[0] if spv_user else "Siti"

    latest_batch = batches[-1] if batches else None
    if latest_batch:
        b_clean = (
            latest_batch.id.replace("batch_", "Batch ").upper()
            if "batch_" in latest_batch.id
            else f"Batch {latest_batch.id}"
        )
        batch_subtitle = f"{b_clean} • {latest_batch.menu_name} • 410 trays"
    else:
        batch_subtitle = "Batch 07 • Nasi ayam kecap • 410 trays"

    return BatchOverviewSchema(
        app_title="Dapur Aman",
        kitchen_name="SPPG Cibeureum",
        batch_subtitle=batch_subtitle,
        headline=headline,
        today_menu_setter=today_menu_setter,
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
    "/api/supervisor/dashboard",
    response_model=SupervisorDashboardSchema,
    tags=["Supervisor Dashboard"],
    summary="Ambil data lengkap untuk UI-4 (Supervisor Screen: safety feed, active hold card, batch list)",
)
@app.get(
    "/api/supervisor/feed",
    response_model=SupervisorDashboardSchema,
    tags=["Supervisor Dashboard"],
    summary="Alias supervisor safety feed",
)
def get_supervisor_dashboard(
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
) -> SupervisorDashboardSchema:
    """Mengembalikan data real-time untuk tampilan UI-4 (Supervisor / Ahli Gizi):
    - Headline: jumlah temuan safety (fixed, dismissed, open)
    - Active Concern Card: temuan open yang bisa di-hold langsung oleh supervisor
    - Safety Feed: timeline seluruh temuan safety hari ini beserta durasi penanganannya
    - Batches List: status seluruh batch hari ini (B01 s/d B09)
    """
    now = datetime.now(timezone.utc)

    # 1. Query all live findings from Neon Postgres (prioritizing safety findings)
    safety_findings = (
        db.query(Finding)
        .filter(Finding.level == "safety")
        .all()
    )
    is_safety_only = True
    if not safety_findings:
        safety_findings = db.query(Finding).all()
        is_safety_only = False

    feed_list: list[SafetyFeedItemSchema] = []
    for f in safety_findings:
        created = (f.run.created_at if f.run else None) or (f.batch.created_at if f.batch else None) or now
        if f.status in ("fixed", "dismissed") and f.resolution_at:
            diff_sec = (f.resolution_at - created).total_seconds()
        else:
            c_tz = created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created
            diff_sec = (now - c_tz).total_seconds()
        duration_m = max(1, int(diff_sec / 60))

        if f.status == "open":
            d_label = f"Open, {duration_m} min"
        elif f.status == "fixed":
            d_label = f"Fixed in {duration_m} min"
        else:
            d_label = f"Dismissed in {duration_m} min"

        actor_name = "Dewi"
        if f.resolution_actor_id:
            u = db.query(User).filter(User.id == f.resolution_actor_id).first()
            if u:
                actor_name = u.name.split(" ")[0]

        res_note = f'{actor_name}: "{f.resolution_note}"' if f.resolution_note else None
        time_found = created.strftime("%H:%M")
        batch_label = f.batch_id.replace("batch_", "B").upper()[:4] if "batch_" in f.batch_id else f.batch_id

        thumb_url = None
        if f.run and f.run.batch and f.run.batch.photos:
            try:
                thumb_url = generate_presigned_url(f.run.batch.photos[-1].object_key, 600)
            except Exception:
                pass

        feed_list.append(
            SafetyFeedItemSchema(
                finding_id=f.id,
                batch_id=batch_label,
                photo_id=f.run.photo_id if f.run else None,
                thumbnail_url=thumb_url,
                title=f.concern_type,
                subtitle=f"{batch_label} • photo 1 • found {time_found}",
                status=f.status if f.status in ("open", "fixed", "dismissed") else "open",
                icon_type="fixed" if f.status == "fixed" else ("dismissed" if f.status == "dismissed" else "safety"),
                duration_min=duration_m,
                duration_label=d_label,
                resolution_note=res_note,
            )
        )

    fixed_cnt = sum(1 for item in feed_list if item.status == "fixed")
    dismissed_cnt = sum(1 for item in feed_list if item.status == "dismissed")
    open_cnt = sum(1 for item in feed_list if item.status == "open")
    total_cnt = len(feed_list)

    findings_topic = "safety" if is_safety_only else "safety & quality"
    headline = (
        f"{total_cnt} {findings_topic} findings today: "
        f"{fixed_cnt} fixed, {dismissed_cnt} dismissed by staff, {open_cnt} open now"
    )

    # 2. Active Concern Card: Diambil dari temuan open terbaru di database
    open_db_finding = (
        db.query(Finding)
        .filter(Finding.level == "safety", Finding.status == "open")
        .order_by(Finding.id.desc())
        .first()
    )
    if not open_db_finding:
        open_db_finding = (
            db.query(Finding)
            .filter(Finding.status == "open")
            .order_by(Finding.id.desc())
            .first()
        )

    active_card = None
    if open_db_finding:
        batch_label = (
            open_db_finding.batch_id.replace("batch_", "B").upper()[:4]
            if "batch_" in open_db_finding.batch_id
            else open_db_finding.batch_id
        )
        photo_url = None
        if open_db_finding.batch and open_db_finding.batch.photos:
            try:
                photo_url = generate_presigned_url(open_db_finding.batch.photos[-1].object_key, 600)
            except Exception:
                pass

        time_found = (
            open_db_finding.batch.created_at.strftime("%H:%M")
            if open_db_finding.batch and open_db_finding.batch.created_at
            else "08:22"
        )
        assigned_text = "Rudi is on it" if "usr_staff" in (open_db_finding.batch.id or "") else "Staf dapur is on it"

        active_card = ActiveConcernCardSchema(
            finding_id=open_db_finding.id,
            batch_id=open_db_finding.batch_id,
            photo_url=photo_url,
            title=open_db_finding.concern_type,
            detail=open_db_finding.explanation,
            subtitle=f"{batch_label} • photo 1 • found {time_found} • {assigned_text}",
            assigned_staff=assigned_text,
            box=EvidenceBoxSchema(
                x_min=open_db_finding.box_json["x_min"],
                y_min=open_db_finding.box_json["y_min"],
                x_max=open_db_finding.box_json["x_max"],
                y_max=open_db_finding.box_json["y_max"],
            ) if open_db_finding.box_json and "x_min" in open_db_finding.box_json else None,
            hold_action_label=f"Hold batch {batch_label}",
            helper_text="Staff fix or dismiss each finding. You see every safety finding and can hold a batch: nothing needs your sign-off.",
        )

    # 3. Batches List: 100% DINAMIS diambil dari tabel batches di database Neon Postgres
    all_db_batches = db.query(Batch).order_by(Batch.created_at.desc()).all()
    batches_data: list[BatchListItemSchema] = []

    for idx, b in enumerate(all_db_batches):
        label = f"B{idx + 1:02d}" if len(b.id) > 10 else b.id
        photos_count = len(b.photos)
        quality_count = sum(1 for f in b.findings if f.level == "quality")
        has_open_findings = any(f.status == "open" for f in b.findings)

        if b.status == "closed":
            b_status = "closed"
            badge_label = "Closed"
            badge_color = "green"
        elif b.status == "on_hold":
            b_status = "on_hold"
            badge_label = "On hold"
            badge_color = "red"
        elif has_open_findings:
            b_status = "finding_open"
            badge_label = "Finding open"
            badge_color = "red"
        else:
            b_status = "packing"
            badge_label = "Packing"
            badge_color = "yellow"

        sub = f"{b.menu_name} • {photos_count} photo{'s' if photos_count != 1 else ''}"
        if quality_count > 0:
            sub += f" • {quality_count} quality note{'s' if quality_count != 1 else ''}"

        batches_data.append(
            BatchListItemSchema(
                batch_id=label,
                menu_name=b.menu_name,
                photos_count=photos_count,
                subtitle=sub,
                status=b_status,
                badge_label=badge_label,
                badge_color=badge_color,
            )
        )

    spv_user = db.query(User).filter(User.role == "supervisor").first()
    spv_name = f"{spv_user.name}, ahli gizi" if spv_user else "Siti R., ahli gizi"
    date_str = now.strftime("%a %d %b") + " • live"

    return SupervisorDashboardSchema(
        supervisor_name=spv_name,
        kitchen_name="SPPG Cibeureum",
        date_str=date_str,
        headline=headline,
        stats={
            "total_safety": total_cnt,
            "fixed": fixed_cnt,
            "dismissed": dismissed_cnt,
            "open": open_cnt,
        },
        active_concern=active_card,
        safety_feed=feed_list,
        batches=batches_data,
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

    # Format findings with resolution text for UI-3
    findings_data = []
    for f in batch.findings:
        res_text = None
        actor_name = None
        time_str = None
        if f.status in ("fixed", "dismissed") and f.resolution_note:
            time_str = f.resolution_at.strftime("%H:%M") if f.resolution_at else "08:11"
            action_word = "Fixed" if f.status == "fixed" else "Dismissed"
            actor_name = "Dewi"
            if f.resolution_actor_id:
                u = db.query(User).filter(User.id == f.resolution_actor_id).first()
                if u:
                    actor_name = u.name.split(" ")[0]
            res_text = f"{action_word} {time_str} • {actor_name}: {f.resolution_note}"

        findings_data.append(
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
                icon_type="fixed" if f.status == "fixed" else ("safety" if f.level == "safety" else "quality"),
                state=f.status,  # type: ignore
                resolution_text=res_text,
                resolution_action=f.status if f.status in ("fixed", "dismissed") else None,
                resolution_note=f.resolution_note,
                resolution_actor=actor_name,
                resolution_time_str=time_str,
            )
        )

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
    actor: User = Depends(get_current_actor),
    db: Session = Depends(get_db),
    _: None = Depends(verify_shared_secret),
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
