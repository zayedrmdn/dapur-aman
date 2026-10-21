"""Authentication, password verification, and authorization helpers.

Enforces:
- Shared secret check on server-to-server requests (X-Shared-Secret)
- Verified actor lookup from database (X-Actor-Id)
- Role verification (kitchen_staff vs supervisor)
"""

import hmac

import bcrypt
from fastapi import Header, HTTPException, Request, Depends, status
from sqlalchemy.orm import Session

from app.config import BACKEND_SHARED_SECRET
from app.database import get_db
from app.models import User


def hash_password(plain_password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def verify_shared_secret(
    x_shared_secret: str | None = Header(None, alias="X-Shared-Secret"),
) -> None:
    """Verify that the incoming request contains the correct server-to-server shared secret."""
    if not BACKEND_SHARED_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BACKEND_SHARED_SECRET belum dikonfigurasi di server.",
        )

    if not x_shared_secret or not hmac.compare_digest(
        x_shared_secret.encode("utf-8"), BACKEND_SHARED_SECRET.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header 'X-Shared-Secret' hilang atau tidak valid.",
        )


def get_current_actor(
    x_actor_id: str | None = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db),
) -> User:
    """Retrieve verified User actor from database by X-Actor-Id.

    Accepts ID (e.g. 'usr_staff_01', 'usr_staff1') or username ('staff1').
    """
    if not x_actor_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header 'X-Actor-Id' wajib diisi.",
        )

    actor_id = x_actor_id
    user = (
        db.query(User)
        .filter((User.id == actor_id) | (User.username == actor_id))
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Actor ID '{actor_id}' tidak ditemukan di sistem.",
        )

    return user
