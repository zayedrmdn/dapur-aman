"""Schemas for human actions (resolutions, holds, closing batch)."""

from typing import Literal
from pydantic import BaseModel, Field


class ActionRequest(BaseModel):
    """Payload to record a staff or supervisor human action."""

    batch_id: str = Field(..., description="ID of the batch")
    finding_id: str | None = Field(None, description="Optional ID of the specific finding being resolved")
    action: Literal["fixed", "dismissed", "on_hold", "lift_hold", "close"] = Field(
        ..., description="Resolution or status change action"
    )
    reason: str = Field(..., min_length=3, description="Explanation or justification for the action")


class ActionResponse(BaseModel):
    """Response returned after recording a human action."""

    success: bool
    action_id: str
    batch_id: str
    finding_id: str | None = None
    action: str
    actor_id: str
    actor_name: str
    message: str
