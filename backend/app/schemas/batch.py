"""Schemas for batch history, runs, and findings retrieval."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel
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
    created_at: datetime


class BatchDetailSchema(BaseModel):
    """Full detail of a batch including photo URL, runs, findings, and human actions."""

    batch_id: str
    table_name: str
    status: Literal["in_review", "on_hold", "closed"]
    photo_url: str | None = None
    created_at: datetime
    updated_at: datetime
    runs: list[BatchRunSchema] = []
    findings: list[FindingCardSchema] = []
    actions: list[HumanActionRecordSchema] = []
