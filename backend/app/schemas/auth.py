"""Schemas for authentication and user accounts."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Payload for user login."""

    username: str = Field(..., example="staff1")
    password: str = Field(..., example="password123")


class LoginResponse(BaseModel):
    """Response returned upon successful authentication."""

    actor_id: str
    username: str
    name: str
    role: str  # "kitchen_staff" or "supervisor"
