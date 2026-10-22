"""Schemas for batch history, runs, and findings retrieval matching UI-1 & UI-2."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
from app.schemas.vision import FindingCardSchema


class HumanActionRecordSchema(BaseModel):
    """Record of a human resolution on a batch or finding."""

    id: str
    action: str
    reason: str
    actor_id: str
    actor_name: str | None = None
    finding_id: str | None = None
    created_at: datetime


class BatchRunSchema(BaseModel):
    """Run details associated with a batch."""

    id: str
    state: str
    outcome: str
    headline: str
    summary_label: str
    primary_action_label: str
    provider: str
    model: str
    photo_id: str | None = None
    photo_url: str | None = None
    uncertainty: list[str] = []
    error: dict | None = None
    created_at: datetime


class BatchDetailSchema(BaseModel):
    """Full detail of a batch matching UI-2."""

    batch_id: str
    table_name: str
    menu_name: str | None = None
    school_name: str | None = None
    status: Literal["in_review", "on_hold", "closed"]
    hold_reason: str | None = None
    photo_url: str | None = None
    created_at: datetime
    updated_at: datetime
    runs: list[BatchRunSchema] = []
    findings: list[FindingCardSchema] = []
    actions: list[HumanActionRecordSchema] = []


class PackingPhotoRowSchema(BaseModel):
    """Row representing an inspected table/rack in UI-1."""

    batch_id: str
    table_name: str  # e.g. "Table 1", "Table 2", "Rack A"
    summary_label: str  # e.g. "No spots", "2 safety spots • 1 fixed, 1 dismissed • retaken"
    timestamp_str: str  # e.g. "07:58", "08:11"
    status: Literal["clean", "review_required", "retake_required"]
    batch_status: Literal["in_review", "on_hold", "closed"] = "in_review"
    hold_reason: str | None = None
    photo_url: str | None = None
    has_check: bool = True
    school_name: str | None = None
    created_at: datetime | None = None


class BatchOverviewSchema(BaseModel):
    """Top-level data structure powering the entire UI-1 (Overview Screen)."""

    app_title: str = "Dapur Aman"
    kitchen_name: str = "SPPG Cibeureum Synthetic demo"
    batch_subtitle: str = "Batch 07 • Nasi ayam kecap • 410 trays"
    headline: str = "4 photos checked, packing goes on"
    today_menu_setter: str = "Siti"
    today_menu_items: list[str] = [
        "Nasi putih",
        "Ayam kecap",
        "Tumis buncis",
        "Tahu goreng",
        "Anggur",
    ]
    packing_photos: list[PackingPhotoRowSchema] = []
    primary_action_label: str = "Photo of the next table"
    helper_text: str = "One photo per table or rack, before the lids go on. Any angle is fine."
