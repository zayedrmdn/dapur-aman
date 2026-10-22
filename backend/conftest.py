import os
from unittest.mock import AsyncMock

import pytest


TEST_DATABASE_URL = "sqlite://"

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DATABASE_URL_UNPOOLED"] = ""

for name in (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_SUPERVISOR_CHAT_ID",
    "TELEGRAM_SCHOOL_CHAT_ID",
):
    os.environ[name] = ""


def require_test_database():
    import app.config
    import app.database

    if app.config.DATABASE_URL != TEST_DATABASE_URL or app.database.engine.url.get_backend_name() != "sqlite":
        raise RuntimeError("Tests must run on in-memory SQLite; refusing to use the configured database.")


require_test_database()


@pytest.fixture(autouse=True)
def disable_telegram_delivery(monkeypatch):
    import app.notifications

    monkeypatch.setattr(
        app.notifications,
        "send_telegram_raw",
        AsyncMock(return_value={"status": "simulated"}),
    )
