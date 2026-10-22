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
    rule_reference: str | None = None
    evidence_gap: str | None = None
    suggested_action: str | None = None
    resolution_text: str | None = None  # e.g. "Fixed 08:11 • Dewi: Swapped the tray; that piece went back in the wok for 6 minutes."
    resolution_action: str | None = None  # "fixed" or "dismissed"
    resolution_note: str | None = None
    resolution_actor: str | None = None  # e.g. "Dewi"
    resolution_time_str: str | None = None  # e.g. "08:11"
    run_id: str | None = None
    photo_id: str | None = None
    photo_url: str | None = None
    uncertainty: str | None = None

    @property
    def concern_type(self) -> str:
        return self.title

    @property
    def explanation(self) -> str:
        return self.detail


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
    is_retake: bool = False
    retake_note: str | None = None
    detected_components: list[FoodComponentSchema] = []  # for "Today's menu" chips
    findings: list[FindingCardSchema] = []  # for detail cards in UI-2
    image_quality_issues: list[str] = []
    missing_evidence: list[str] = []
    uncertainty: list[str] = []
    next_action: str | None = None

    @property
    def observations(self) -> list[FindingCardSchema]:
        return self.findings

