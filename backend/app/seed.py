"""Database seeding for default kitchen staff and supervisor accounts.

Passwords come from SEED_STAFF_PASSWORD and SEED_SUPERVISOR_PASSWORD. Seeding is
skipped when either is missing, and existing accounts are never changed on startup.

One-time password reset for existing accounts (run manually, after approval):
    uv run python -m app.seed --reset-passwords
"""

import logging
import sys

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import SEED_STAFF_PASSWORD, SEED_SUPERVISOR_PASSWORD
from app.models import User

logger = logging.getLogger("dapur_aman.seed")


def default_users() -> list[dict]:
    return [
        {
            "id": "usr_staff1",
            "username": "staff1",
            "name": "Staff Dapur 1",
            "role": "kitchen_staff",
            "password": SEED_STAFF_PASSWORD,
        },
        {
            "id": "usr_supervisor1",
            "username": "supervisor1",
            "name": "Supervisor Dapur 1",
            "role": "supervisor",
            "password": SEED_SUPERVISOR_PASSWORD,
        },
    ]


def seed_passwords_configured() -> bool:
    return bool(SEED_STAFF_PASSWORD and SEED_SUPERVISOR_PASSWORD)


def seed_default_users(db: Session) -> None:
    """Create the default staff and supervisor accounts if they do not exist yet."""
    if not seed_passwords_configured():
        logger.warning("Seed passwords not set; skipping default account seeding.")
        return

    for u in default_users():
        existing = db.query(User).filter(User.username == u["username"]).first()
        if not existing:
            new_user = User(
                id=u["id"],
                username=u["username"],
                name=u["name"],
                role=u["role"],
                password_hash=hash_password(u["password"]),
            )
            db.add(new_user)
            logger.info("Seeded user: %s (%s)", u["username"], u["role"])
    db.commit()


def reset_default_passwords(db: Session) -> None:
    """Replace the passwords of the existing default accounts with the seed passwords."""
    if not seed_passwords_configured():
        raise SystemExit("Set SEED_STAFF_PASSWORD and SEED_SUPERVISOR_PASSWORD first.")

    for u in default_users():
        user = db.query(User).filter(User.username == u["username"]).first()
        if user:
            user.password_hash = hash_password(u["password"])
            logger.info("Password reset for: %s", u["username"])
    db.commit()


if __name__ == "__main__":
    if sys.argv[1:] != ["--reset-passwords"]:
        raise SystemExit("Usage: python -m app.seed --reset-passwords")

    from app.database import SessionLocal

    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        reset_default_passwords(session)
