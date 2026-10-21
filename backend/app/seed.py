"""Database seeding for default kitchen staff and supervisor accounts."""

import logging
from sqlalchemy.orm import Session
from app.models import User
from app.auth import hash_password

logger = logging.getLogger("dapur_aman.seed")

DEFAULT_USERS = [
    {
        "id": "usr_staff1",
        "username": "staff1",
        "name": "Staff Dapur 1",
        "role": "kitchen_staff",
        "password": "password123",
    },
    {
        "id": "usr_supervisor1",
        "username": "supervisor1",
        "name": "Supervisor Dapur 1",
        "role": "supervisor",
        "password": "password123",
    },
]


def seed_default_users(db: Session) -> None:
    """Ensure default staff and supervisor accounts exist in Neon DB."""
    for u in DEFAULT_USERS:
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
