"""Schemas for Vision Inspection matching UI-1 (List) and UI-2 (Detail)."""

from typing import Literal
from pydantic import BaseModel


class EvidenceBoxSchema(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float


class FindingCardSchema(BaseModel):
    id: str
    title: str  # e.g. "Chicken may be undercooked", "Something beside the tofu"
    level: Literal["safety", "quality"]  # "safety" (red badge), "quality" (yellow badge)
    detail: str  # e.g. "Pink near the bone • Salmonella risk"
    box: EvidenceBoxSchema | None = None
    icon_type: str = "safety"  # "safety", "quality", "warning"
    state: Literal["open", "fixed", "dismissed"] = "open"


class FoodComponentSchema(BaseModel):
    name: str  # e.g. "Nasi putih", "Ayam kecap", "Tumis buncis", "Tahu goreng", "Anggur"
    status: Literal["present", "missing", "substituted", "unclear"]
    box: EvidenceBoxSchema | None = None
    note: str | None = None


class InspectionResponseSchema(BaseModel):
    table_name: str  # e.g. "Table 2"
    timestamp_str: str  # e.g. "08:11"
    headline: str  # e.g. "2 safety spots to fix before packing on"
    summary_label: str  # e.g. "2 safety spots" or "No spots" (for UI-1 list)
    status: Literal["clean", "review_required", "retake_required"]
    primary_action_label: str  # e.g. "Fix these, then retake" or "Photo of the next table"
    batch_id: str | None = None
    run_id: str | None = None
    photo_id: str | None = None
    photo_url: str | None = None
    detected_components: list[FoodComponentSchema] = []  # for "Today's menu" chips
    findings: list[FindingCardSchema] = []  # for detail cards in UI-2
    image_quality_issues: list[str] = []
    missing_evidence: list[str] = []
