"""SQLAlchemy ORM models matching Neon Postgres schema."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


def utc_now() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


class User(Base):
    """User account model for kitchen staff and supervisors."""

    __tablename__ = "users"

    id = Column(String(50), primary_key=True)  # e.g. "usr_staff_01"
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(150), nullable=False)
    role = Column(String(50), nullable=False)  # "kitchen_staff" or "supervisor"
    phone_number = Column(String(50), nullable=True)  # e.g. "+62 811-2233-4455"
    telegram_chat_id = Column(String(100), nullable=True)  # Telegram Chat ID untuk notifikasi
    created_at = Column(DateTime, default=utc_now, server_default=func.now())


class Batch(Base):
    """Batch representing an inspection session for a specific food tray/table."""

    __tablename__ = "batches"

    id = Column(String(50), primary_key=True)  # e.g. "batch_527dfbf35d84"
    menu_id = Column(String(50), nullable=False, default="MBG-01")
    menu_name = Column(String(200), nullable=False, default="Menu Hari Ini")
    table_name = Column(String(100), nullable=True)
    target_school_id = Column(String(50), nullable=True)
    target_school_name = Column(String(150), nullable=True)
    status = Column(String(50), nullable=False, default="in_review")  # "in_review", "on_hold", "closed"
    hold_reason = Column(Text, nullable=True)
    hold_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utc_now, server_default=func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    photos = relationship("Photo", back_populates="batch", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="batch", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="batch", cascade="all, delete-orphan")
    actions = relationship("HumanAction", back_populates="batch", cascade="all, delete-orphan")


class Photo(Base):
    """Photo metadata pointing to Neon Object Storage key."""

    __tablename__ = "photos"

    id = Column(String(50), primary_key=True)  # e.g. "pho_abc123"
    batch_id = Column(String(50), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    object_key = Column(String(500), nullable=False)  # e.g. "photos/batch_123/pho_123.jpg"
    media_type = Column(String(50), nullable=False, default="image/jpeg")
    file_size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utc_now, server_default=func.now())

    batch = relationship("Batch", back_populates="photos")


class Run(Base):
    """Inspection execution run."""

    __tablename__ = "runs"

    id = Column(String(50), primary_key=True)  # e.g. "run_abc123"
    batch_id = Column(String(50), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    photo_id = Column(String(50), ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    state = Column(String(50), nullable=False, default="completed")  # "running", "completed", "failed"
    outcome = Column(String(50), nullable=True)  # "no_visible_concern", "review_required", "retake_required"
    headline = Column(String(255), nullable=True)
    summary_label = Column(String(128), nullable=True)
    primary_action_label = Column(String(128), nullable=True)
    next_action = Column(Text, nullable=True)
    uncertainty_json = Column(JSON, nullable=True)
    error_json = Column(JSON, nullable=True)
    raw_observation = Column(JSON, nullable=True)
    provider = Column(String(50), nullable=False, default="vertex")
    model = Column(String(100), nullable=False, default="gemini-3.8-flash")
    created_at = Column(DateTime, default=utc_now, server_default=func.now())

    batch = relationship("Batch", back_populates="runs")
    findings = relationship("Finding", back_populates="run", cascade="all, delete-orphan")
    events = relationship("ActivityEvent", back_populates="run", cascade="all, delete-orphan")


class Finding(Base):
    """Safety or quality finding with optional bounding box."""

    __tablename__ = "findings"

    id = Column(String(50), primary_key=True)  # e.g. "fnd_abc123"
    run_id = Column(String(50), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    batch_id = Column(String(50), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    level = Column(String(50), nullable=False)  # "safety", "quality"
    concern_type = Column(String(100), nullable=False)  # Finding title
    box_json = Column(JSON, nullable=True)  # {"x_min": ..., "y_min": ..., "x_max": ..., "y_max": ...}
    explanation = Column(Text, nullable=False)  # Detail
    rule_reference = Column(String(150), nullable=True)
    evidence_gap = Column(Text, nullable=True)
    suggested_action = Column(Text, nullable=False, default="Periksa dan lakukan tindakan perbaikan.")
    status = Column(String(50), nullable=False, default="open")  # "open", "fixed", "dismissed"
    resolution_note = Column(Text, nullable=True)
    resolution_actor_id = Column(String(50), nullable=True)
    resolution_at = Column(DateTime, nullable=True)

    run = relationship("Run", back_populates="findings")
    batch = relationship("Batch", back_populates="findings")
    actions = relationship("HumanAction", back_populates="finding")


class ActivityEvent(Base):
    """Activity event trace for 'Aktivitas AI' UI section."""

    __tablename__ = "activity_events"

    id = Column(String(50), primary_key=True)  # e.g. "evt_abc123"
    run_id = Column(String(50), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False, default=1)
    agent = Column(String(50), nullable=False, default="VisionAgent")
    step = Column(String(100), nullable=False, default="vision_inspection")
    parent_step = Column(String(100), nullable=True)
    kind = Column(String(50), nullable=False, default="agent_execution")
    status = Column(String(50), nullable=False, default="completed")
    summary = Column(Text, nullable=False)
    references_json = Column(JSON, nullable=True)
    uncertainty = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=utc_now, server_default=func.now())

    run = relationship("Run", back_populates="events")


class HumanAction(Base):
    """Human action recorded by kitchen staff or supervisor."""

    __tablename__ = "human_actions"

    id = Column(String(50), primary_key=True)  # e.g. "act_abc123"
    batch_id = Column(String(50), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    finding_id = Column(String(50), ForeignKey("findings.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(50), nullable=False)  # "fixed", "dismissed", "on_hold", "lift_hold", "close"
    actor_id = Column(String(50), ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now, server_default=func.now())

    batch = relationship("Batch", back_populates="actions")
    finding = relationship("Finding", back_populates="actions")
    actor = relationship("User")


class SchoolRecipient(Base):
    """Target school recipient for MBG food distribution."""

    __tablename__ = "school_recipients"

    id = Column(String(50), primary_key=True)  # e.g. "sch_01"
    name = Column(String(150), nullable=False)  # "SDN 01 Merdeka Bandung"
    principal_name = Column(String(150), nullable=False)  # "Bpk. Drs. H. Bambang Sutrisno, M.Pd"
    phone_number = Column(String(50), nullable=False)  # "+62 812-3456-7890"
    telegram_chat_id = Column(String(100), nullable=True)  # Optional specific Telegram chat ID
    portion_count = Column(Integer, nullable=False, default=400)
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utc_now, server_default=func.now())
