"""Schemas for Supervisor Dashboard (UI-4) - Safety Feed & Batch Control."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field
from app.schemas.vision import EvidenceBoxSchema


class ActiveConcernCardSchema(BaseModel):
    """The prominent top card on UI-4 allowing supervisor to hold a batch."""

    finding_id: str
    batch_id: str
    photo_id: str | None = None
    photo_url: str | None = None
    title: str = "Possible hair on the rice"
    detail: str = "Thin dark strand on top of the rice"
    level: str = "safety"
    subtitle: str = "B09 • photo 1 • found 08:22 • Rudi is on it"
    assigned_staff: str = "Rudi is on it"
    box: EvidenceBoxSchema | None = None
    hold_action_label: str = "Hold batch B09"
    helper_text: str = (
        "Staff fix or dismiss each finding. You see every safety finding and "
        "can hold a batch: nothing needs your sign-off."
    )


class SafetyFeedItemSchema(BaseModel):
    """An item in the 'Safety feed' timeline section of UI-4."""

    finding_id: str
    batch_id: str
    photo_id: str | None = None
    thumbnail_url: str | None = None
    title: str  # e.g. "Possible hair on the rice", "Chicken may be undercooked"
    subtitle: str  # e.g. "B09 • photo 1 • found 08:22"
    status: Literal["open", "fixed", "dismissed"]
    icon_type: str = "safety"  # "safety_open", "fixed", "dismissed"
    duration_min: int = 5  # e.g. 2, 5, 3, 14, 7
    duration_label: str = "Fixed in 5 min"  # e.g. "Open, 2 min", "Fixed in 5 min", "Dismissed in 3 min"
    resolution_note: str | None = None  # e.g. 'Dewi: "Swapped the tray; that piece went back in the wok for 6 minutes."'


class BatchListItemSchema(BaseModel):
    """An item in the 'Batches' list at the bottom of UI-4."""

    batch_id: str  # e.g. "B01", "B02", "B07", "B09"
    menu_name: str = "Nasi ayam kecap"
    photos_count: int = 4
    subtitle: str = "Nasi ayam kecap • 4 photos • 1 quality note"
    status: Literal["closed", "packing", "finding_open", "on_hold"]
    badge_label: str = "Closed"  # "Closed", "Packing", "Finding open", "On hold"
    badge_color: str = "green"  # "green", "yellow", "red"


class SupervisorDashboardSchema(BaseModel):
    """Complete data structure powering UI-4 (Supervisor Screen)."""

    supervisor_name: str = "Siti R., ahli gizi"
    kitchen_name: str = "SPPG Cibeureum"
    date_str: str = "Thu 22 Oct • synthetic"
    headline: str = "5 safety findings today: 3 fixed, 1 dismissed by staff, 1 open now"
    stats: dict[str, int] = Field(
        default_factory=lambda: {
            "total_safety": 5,
            "fixed": 3,
            "dismissed": 1,
            "open": 1,
        }
    )
    active_concern: ActiveConcernCardSchema | None = None
    safety_feed: list[SafetyFeedItemSchema] = []
    batches: list[BatchListItemSchema] = []
