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
from app.models import User, SchoolRecipient

logger = logging.getLogger("dapur_aman.seed")


def default_schools() -> list[dict]:
    return [
        {
            "id": "sch_01",
            "name": "SDN 01 Merdeka Bandung",
            "principal_name": "Bpk. Drs. H. Bambang Sutrisno, M.Pd",
            "phone_number": "+62 812-3456-7890",
            "portion_count": 450,
            "address": "Jl. Merdeka No. 45, Sumur Bandung",
        },
        {
            "id": "sch_02",
            "name": "SMPN 3 Cibeureum",
            "principal_name": "Ibu Hj. Sri Wahyuni, S.Pd",
            "phone_number": "+62 813-8877-6655",
            "portion_count": 520,
            "address": "Jl. Raya Cibeureum No. 12, Cimahi Selatan",
        },
        {
            "id": "sch_03",
            "name": "SDN 05 Sukajadi",
            "principal_name": "Bpk. Ahmad Dahlan, S.Pd",
            "phone_number": "+62 857-1122-3344",
            "portion_count": 380,
            "address": "Jl. Sukajadi No. 102, Sukajadi, Bandung",
        },
    ]


def default_users() -> list[dict]:
    import os
    supervisor_chat_id = os.getenv("TELEGRAM_SUPERVISOR_CHAT_ID", os.getenv("TELEGRAM_CHAT_ID", ""))
    return [
        {
            "id": "usr_staff1",
            "username": "staff1",
            "name": "Staff Dapur 1",
            "role": "kitchen_staff",
            "password": SEED_STAFF_PASSWORD,
            "phone_number": "+62 812-9988-7766",
            "telegram_chat_id": None,
        },
        {
            "id": "usr_supervisor1",
            "username": "supervisor1",
            "name": "Supervisor Dapur 1",
            "role": "supervisor",
            "password": SEED_SUPERVISOR_PASSWORD,
            "phone_number": "+62 811-2233-4455",
            "telegram_chat_id": supervisor_chat_id,
        },
    ]


def seed_passwords_configured() -> bool:
    return bool(SEED_STAFF_PASSWORD and SEED_SUPERVISOR_PASSWORD)


def seed_default_schools(db: Session) -> None:
    """Create default school recipients if not existing."""
    for s in default_schools():
        existing = db.query(SchoolRecipient).filter(SchoolRecipient.id == s["id"]).first()
        if not existing:
            school = SchoolRecipient(
                id=s["id"],
                name=s["name"],
                principal_name=s["principal_name"],
                phone_number=s["phone_number"],
                portion_count=s["portion_count"],
                address=s["address"],
            )
            db.add(school)
            logger.info("Seeded school recipient: %s", s["name"])
    db.commit()


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
                phone_number=u.get("phone_number"),
                telegram_chat_id=u.get("telegram_chat_id"),
            )
            db.add(new_user)
            logger.info("Seeded user: %s (%s)", u["username"], u["role"])
        else:
            if u.get("phone_number"):
                existing.phone_number = u.get("phone_number")
            if u.get("telegram_chat_id"):
                existing.telegram_chat_id = u.get("telegram_chat_id")
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
