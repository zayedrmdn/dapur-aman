"""Agent-backend interface models (DEVELOPMENT.md §4).

Shared by Zayed and Rohmat: breaking changes need both. Models only, no logic.
Evidence boxes are provisional until implementation testing.
"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

CONTRACT_VERSION = "1"


class RunState(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Outcome(StrEnum):
    NO_VISIBLE_CONCERN = "no_visible_concern"
    REVIEW_REQUIRED = "review_required"
    RETAKE_REQUIRED = "retake_required"


class ErrorStage(StrEnum):
    INPUT = "input"
    PROVIDER = "provider"
    RULE = "rule"
    VALIDATION = "validation"
    TIMEOUT = "timeout"
    STORAGE = "storage"


class EvidenceBox(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    @model_validator(mode="after")
    def check_normalized_corners(self) -> "EvidenceBox":
        corners = (self.x_min, self.y_min, self.x_max, self.y_max)
        if not all(0 <= value <= 1 for value in corners):
            raise ValueError("box coordinates must be between 0 and 1")
        if self.x_min >= self.x_max or self.y_min >= self.y_max:
            raise ValueError("box minimum must be below its maximum")
        return self


class Photo(BaseModel):
    content: bytes
    media_type: Literal["image/jpeg"] = "image/jpeg"


class Menu(BaseModel):
    menu_id: str
    name: str
    items: list[str] = []
    reference_photo: Photo | None = None


class Finding(BaseModel):
    level: Literal["safety", "quality"]
    concern_type: str
    box: EvidenceBox | None
    explanation: str
    rule_reference: str | None = None
    evidence_gap: str | None = None
    suggested_action: str


class InspectionInput(BaseModel):
    photo: Photo
    menu: Menu
    batch_history: list[Finding] = []
    rule_table_version: str
    prior_concern: Finding | None = None


class Observation(BaseModel):
    concern_type: str
    box: EvidenceBox | None
    explanation: str
    uncertainty: str | None = None


class ComponentCheck(BaseModel):
    item_name: str
    status: Literal["present", "missing", "substituted", "unclear"] = "present"
    box: EvidenceBox | None = None
    note: str | None = None


class VisionObservation(BaseModel):
    observations: list[Observation]
    image_quality_issues: list[str] = []
    missing_evidence: list[str] = []
    detected_components: list[ComponentCheck] = []
    summary_label: str = "No spots"


class RunError(BaseModel):
    code: str
    message: str
    stage: ErrorStage
    retryable: bool


class ActivityEvent(BaseModel):
    sequence: int
    timestamp: datetime
    step: str
    parent_step: str | None = None
    agent: str
    kind: str
    status: str
    summary: str
    references: list[str] = []
    uncertainty: str | None = None
    error: str | None = None

    @field_validator("timestamp")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone (UTC)")
        return value


class InspectionOutcome(BaseModel):
    state: Literal[RunState.COMPLETED, RunState.FAILED]
    outcome: Outcome | None = None
    findings: list[Finding] = []
    uncertainty: list[str] = []
    next_action: str | None = None
    error: RunError | None = None
    events: list[ActivityEvent]
    provider: str
    model: str

    @model_validator(mode="after")
    def check_state_matches_result(self) -> "InspectionOutcome":
        if self.state == RunState.COMPLETED and (self.outcome is None or self.error):
            raise ValueError("a completed run needs an outcome and no error")
        if self.state == RunState.FAILED and (self.error is None or self.outcome):
            raise ValueError("a failed run needs an error and no outcome")
        return self
