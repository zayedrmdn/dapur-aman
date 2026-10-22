import os
from unittest.mock import AsyncMock

import pytest


for name in (
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_SUPERVISOR_CHAT_ID",
    "TELEGRAM_SCHOOL_CHAT_ID",
):
    os.environ[name] = ""


@pytest.fixture(autouse=True)
def disable_telegram_delivery(monkeypatch):
    import app.notifications

    monkeypatch.setattr(
        app.notifications,
        "send_telegram_raw",
        AsyncMock(return_value={"status": "simulated"}),
    )
