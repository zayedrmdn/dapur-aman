import asyncio
import os

import app.config
import app.notifications

real_send_telegram_raw = app.notifications.send_telegram_raw


def test_delivery_is_disabled_with_credentials(monkeypatch):
    def reject_http(*args, **kwargs):
        raise AssertionError("Telegram must not be contacted")

    monkeypatch.setattr(app.notifications.httpx, "AsyncClient", reject_http)
    monkeypatch.setattr(app.notifications, "TELEGRAM_BOT_TOKEN", "synthetic-token")
    result = asyncio.run(real_send_telegram_raw("test", "synthetic-chat"))
    assert result["status"] == "disabled"


def test_telegram_credentials_are_empty_before_tests_run():
    for name in (
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "TELEGRAM_SUPERVISOR_CHAT_ID",
        "TELEGRAM_SCHOOL_CHAT_ID",
    ):
        environment_is_empty = not os.environ.get(name)
        config_is_empty = not getattr(app.config, name, "")
        sender_is_empty = not getattr(app.notifications, name, "")
        assert environment_is_empty, "Telegram environment must be isolated"
        assert config_is_empty, "Telegram config must be isolated"
        assert sender_is_empty, "Telegram sender must be isolated"


def test_notifications_cannot_send_even_if_credentials_are_overridden(monkeypatch):
    def reject_http(*args, **kwargs):
        raise AssertionError("Tests must never contact Telegram")

    monkeypatch.setattr(app.notifications.httpx, "AsyncClient", reject_http)
    monkeypatch.setattr(app.notifications, "TELEGRAM_BOT_TOKEN", "synthetic-token")
    result = asyncio.run(
        app.notifications.send_supervisor_safety_alert(
            table_name="Synthetic table",
            batch_id="batch_test",
            findings=[],
            chat_id="synthetic-chat",
        )
    )
    assert result["status"] == "simulated"
