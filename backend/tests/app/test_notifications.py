import asyncio

import app.notifications


def test_school_report_is_an_inspection_report_not_a_safety_certificate(monkeypatch):
    sent = []

    async def capture(message, chat_id, photo_url=None):
        sent.append(message)
        return {"ok": True}

    monkeypatch.setattr(app.notifications, "send_telegram_raw", capture)
    asyncio.run(app.notifications.send_school_clearance_report(batch_id="batch_test", menu_name="Test menu"))
    message = sent[0]
    assert "Laporan Pemeriksaan Batch" in message
    assert "bukan jaminan keamanan pangan" in message
    assert "asumsi demo" in message
    for misleading in ["KELAYAKAN", "SURAT", "BATAS AMAN"]:
        assert misleading not in message.upper()
