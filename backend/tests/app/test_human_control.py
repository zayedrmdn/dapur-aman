import io
from datetime import UTC, datetime

import pytest
from PIL import Image

import app.main
from agents.contract import ActivityEvent, ErrorStage, InspectionOutcome, Outcome, RunError, RunState
from app.models import Batch, Finding
from tests.app.test_retake_supervisor import api

SECRET = {"X-Shared-Secret": "test-secret"}
BATCH = "batch_actual_identifier"


def outcome_for(state):
    event = ActivityEvent(sequence=1, timestamp=datetime.now(UTC), step="orchestrator", agent="orchestrator", kind="agent", status="completed", summary="Synthetic test event")
    if state == "failed":
        return InspectionOutcome(state=RunState.FAILED, outcome=None, findings=[], events=[event], provider="test", model="test",
                                 error=RunError(code="agent_error", message="Synthetic failure", stage=ErrorStage.PROVIDER, retryable=True))
    return InspectionOutcome(state=RunState.COMPLETED, outcome=Outcome.NO_VISIBLE_CONCERN, findings=[], events=[event], provider="test", model="test")


def upload(client, is_retake):
    photo = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(photo, "PNG")
    return client.post("/api/inspections/upload-and-run", headers=SECRET, data={"batch_id": BATCH, "is_retake": is_retake},
                       files={"photo": ("photo.png", photo.getvalue(), "image/png")})


@pytest.fixture
def letters(monkeypatch):
    sent = []

    async def record(**kwargs):
        sent.append(kwargs["batch_id"])
        return {"ok": True}

    monkeypatch.setattr(app.main, "send_school_clearance_report", record)
    return sent


@pytest.mark.parametrize("state", ["failed", "clean"])
@pytest.mark.parametrize("is_retake", ["true", "false"])
def test_ai_never_closes_batch_or_resolves_findings(api, monkeypatch, letters, state, is_retake):
    client, db = api
    db.get(Batch, BATCH).status = "on_hold"
    db.commit()

    async def inspect(_):
        return outcome_for(state)

    monkeypatch.setattr(app.main, "run_inspection", inspect)
    upload(client, is_retake)
    db.expire_all()
    assert db.get(Batch, BATCH).status == "on_hold"
    assert db.get(Finding, "old_finding").status == "open"
    assert letters == []


def test_clearance_letter_needs_supervisor_and_closed_batch(api, letters):
    client, db = api
    path = f"/api/notifications/dispatch-report/{BATCH}"
    assert client.post(path, headers={**SECRET, "X-Actor-Id": "supervisor"}).status_code == 409
    db.get(Batch, BATCH).status = "closed"
    db.commit()
    assert client.post(path, headers={**SECRET, "X-Actor-Id": "staff"}).status_code == 403
    assert client.post(path, headers={**SECRET, "X-Actor-Id": "supervisor"}).status_code == 200
    assert letters == [BATCH]


@pytest.mark.parametrize("actor,expected_letters", [("staff", []), ("supervisor", [BATCH])])
def test_only_supervisor_close_sends_clearance_letter(api, letters, actor, expected_letters):
    client, db = api
    db.get(Finding, "old_finding").status = "dismissed"
    db.commit()
    response = client.post("/api/actions", headers={**SECRET, "X-Actor-Id": actor}, json={"batch_id": BATCH, "action": "close", "reason": "All findings handled"})
    assert response.status_code == 200, response.text
    assert letters == expected_letters
