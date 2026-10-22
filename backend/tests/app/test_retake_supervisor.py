import io
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.auth
import app.main
from agents.contract import ActivityEvent, ErrorStage, Finding as AgentFinding
from agents.contract import InspectionOutcome, Outcome, RunError, RunState
from app.database import Base, get_db
from app.models import ActivityEvent as SavedEvent
from app.models import Batch, Finding, Photo, Run, User

STAFF = {"X-Shared-Secret": "test-secret", "X-Actor-Id": "staff"}


@pytest.fixture
def api(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        now = datetime.now(UTC)
        db.add_all([
            User(id="staff", username="staff", name="Test Staff", role="kitchen_staff", password_hash="unused"),
            User(id="supervisor", username="supervisor", name="Test Supervisor", role="supervisor", password_hash="unused"),
            Batch(id="batch_actual_identifier", menu_id="test", menu_name="Test menu", table_name="Table test", status="in_review", created_at=now),
        ])
        db.flush()
        db.add_all([
            Photo(id="old_photo", batch_id="batch_actual_identifier", object_key="old.jpg", created_at=now - timedelta(minutes=5)),
            Photo(id="new_photo", batch_id="batch_actual_identifier", object_key="new.jpg", created_at=now),
        ])
        db.flush()
        db.add_all([
            Run(id="old_run", batch_id="batch_actual_identifier", photo_id="old_photo", state="completed", outcome="review_required", created_at=now - timedelta(minutes=5)),
            Run(id="new_run", batch_id="batch_actual_identifier", photo_id="new_photo", state="completed", outcome="clean", created_at=now),
        ])
        db.flush()
        db.add(Finding(id="old_finding", run_id="old_run", batch_id="batch_actual_identifier", level="safety", concern_type="visible_concern", explanation="Synthetic test concern", box_json={"x_min": .1, "y_min": .1, "x_max": .2, "y_max": .2}, status="open", rule_reference="test-rule", suggested_action="Check"))
        db.commit()
        monkeypatch.setattr(app.auth, "BACKEND_SHARED_SECRET", "test-secret")
        monkeypatch.setattr(app.main, "generate_presigned_url", lambda key, expires_in=600: "https://example.test/" + key)
        monkeypatch.setattr(app.main, "upload_photo_bytes", lambda *args: None)
        app.main.app.dependency_overrides[get_db] = lambda: db
        try:
            yield TestClient(app.main.app), db
        finally:
            app.main.app.dependency_overrides.clear()
    engine.dispose()


@pytest.mark.parametrize("path", ["/api/supervisor/dashboard", "/api/supervisor/feed"])
@pytest.mark.parametrize("headers,expected", [({}, 401), ({"X-Shared-Secret": "wrong", "X-Actor-Id": "supervisor"}, 401), ({"X-Shared-Secret": "test-secret"}, 401), ({"X-Shared-Secret": "test-secret", "X-Actor-Id": "unknown"}, 401), ({"X-Shared-Secret": "test-secret", "X-Actor-Id": "staff"}, 403)])
def test_supervisor_requires_secret_and_verified_supervisor(api, path, headers, expected):
    client, _ = api
    assert client.get(path, headers=headers).status_code == expected


def test_supervisor_uses_real_ids_and_findings_original_photo(api):
    client, _ = api
    response = client.get("/api/supervisor/dashboard", headers={"X-Shared-Secret": "test-secret", "X-Actor-Id": "supervisor"})
    assert response.status_code == 200
    result = response.json()
    assert result["batches"][0]["batch_id"] == "batch_actual_identifier"
    for card in [result["active_concern"], result["safety_feed"][0]]:
        assert card["batch_id"] == "batch_actual_identifier"
        assert card["photo_id"] == "old_photo"
        assert card["run_id"] == "old_run"
    assert result["active_concern"]["photo_url"] == "https://example.test/old.jpg"
    assert result["safety_feed"][0]["thumbnail_url"] == "https://example.test/old.jpg"
    assert result["active_concern"]["assigned_staff"] == ""
    assert "today" not in result["headline"]


@pytest.mark.parametrize("outcome", [Outcome.REVIEW_REQUIRED, Outcome.RETAKE_REQUIRED, None])
def test_retake_preserves_workflow_current_findings_and_failed_state(api, monkeypatch, outcome):
    client, db = api
    prior = db.get(Finding, "old_finding")
    prior.status = "fixed"
    prior.resolution_note = "Human correction"
    prior.resolution_actor_id = "staff"
    prior.resolution_at = datetime.now(UTC)
    db.commit()
    event = ActivityEvent(sequence=1, timestamp=datetime.now(UTC), step="orchestrator", agent="orchestrator", kind="agent", status="completed" if outcome else "failed", summary="Synthetic test event")
    result = InspectionOutcome(
        state=RunState.COMPLETED if outcome else RunState.FAILED,
        outcome=outcome,
        findings=[AgentFinding(level="safety", concern_type="new_concern", box=None, explanation="New photo concern", suggested_action="Review", rule_reference="new-rule")] if outcome == Outcome.REVIEW_REQUIRED else [],
        events=[event], provider="test", model="test",
        error=None if outcome else RunError(code="agent_error", message="Synthetic failure", stage=ErrorStage.PROVIDER, retryable=True),
    )
    calls = []

    async def inspect(inspection_input):
        calls.append(inspection_input)
        return result

    monkeypatch.setattr(app.main, "run_inspection", inspect)
    photo = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(photo, "PNG")
    response = client.post("/api/inspections/upload-and-run", headers=STAFF, data={"batch_id": "batch_actual_identifier", "is_retake": "true"}, files={"photo": ("retake.png", photo.getvalue(), "image/png")})
    assert len(calls) == 1
    assert calls[0].photo.media_type == "image/jpeg"
    assert db.query(SavedEvent).count() == 1
    assert db.get(Finding, "old_finding").status == "fixed"
    if outcome is None:
        assert response.status_code == 424
        saved = db.get(Run, response.json()["detail"]["run_id"])
        assert saved.state == "failed" and saved.outcome is None
    else:
        assert response.status_code == 200
        data = response.json()
        assert data["is_retake"] is True
        assert all(f["id"] != "old_finding" for f in data["findings"])
        if outcome == Outcome.RETAKE_REQUIRED:
            assert data["status"] == "retake_required"
            assert data["primary_action_label"] == "Retake the photo"
        else:
            assert data["findings"][0]["run_id"] == data["run_id"]
            assert data["findings"][0]["photo_id"] == data["photo_id"]
            assert data["findings"][0]["rule_reference"] == "new-rule"
    detail = client.get("/api/batches/batch_actual_identifier", headers=STAFF).json()
    old = next(f for f in detail["findings"] if f["id"] == "old_finding")
    assert old["run_id"] == "old_run" and old["photo_id"] == "old_photo"
    assert old["photo_url"] == "https://example.test/old.jpg"
    assert old["resolution_actor"] == "Test Staff"
    assert old["resolution_note"] == "Human correction"
    assert old["rule_reference"] == "test-rule"


def test_overview_dynamic_metadata_uses_saved_batch_and_supervisor(api):
    client, _ = api
    response = client.get("/api/overview", headers=STAFF)
    assert response.status_code == 200
    data = response.json()
    assert data["batch_subtitle"] == "batch_actual_identifier: Test menu"
    assert data["today_menu_setter"] == "Test Supervisor"


def test_batch_lists_and_detail_carry_readable_table_school_and_time(api):
    client, db = api
    db.get(Batch, "batch_actual_identifier").target_school_name = "SD Uji"
    db.commit()
    headers = {"X-Shared-Secret": "test-secret", "X-Actor-Id": "supervisor"}
    row = client.get("/api/overview", headers=STAFF).json()["packing_photos"][0]
    listed = client.get("/api/supervisor/dashboard", headers=headers).json()["batches"][0]
    detail = client.get("/api/batches/batch_actual_identifier", headers=headers).json()
    assert listed["table_name"] == row["table_name"] == "Table test"
    assert row["school_name"] == listed["school_name"] == detail["school_name"] == "SD Uji"
    assert row["created_at"] and row["created_at"] == listed["created_at"] == detail["created_at"]
    assert listed["batch_id"] == row["batch_id"] == "batch_actual_identifier"


def test_missing_resolution_metadata_and_empty_safety_feed_are_honest(api):
    client, db = api
    finding = db.get(Finding, "old_finding")
    finding.status = "dismissed"
    finding.resolution_note = "Synthetic note without actor or timestamp"
    db.commit()
    headers = {"X-Shared-Secret": "test-secret", "X-Actor-Id": "supervisor"}
    response = client.get("/api/supervisor/dashboard", headers=headers)
    assert response.status_code == 200
    assert response.json()["safety_feed"][0]["duration_label"] == "Resolution time unavailable"
    detail = client.get("/api/batches/batch_actual_identifier", headers=headers).json()["findings"][0]
    assert detail["resolution_actor"] is None and detail["resolution_time_str"] is None
    db.delete(finding)
    db.get(Run, "new_run").state = "failed"
    db.get(Run, "new_run").outcome = None
    db.commit()
    empty = client.get("/api/supervisor/dashboard", headers=headers).json()
    assert empty["safety_feed"] == [] and empty["active_concern"] is None
    assert empty["stats"] == {"total_safety": 0, "fixed": 0, "dismissed": 0, "open": 0}
    assert empty["batches"][0]["badge_label"] == "Inspection incomplete"


@pytest.mark.parametrize("batch_id", [None, "missing_batch"])
def test_retake_requires_saved_batch_before_storage_or_agent_call(api, monkeypatch, batch_id):
    client, _ = api

    def unexpected(*args):
        raise AssertionError("storage must not be touched")

    monkeypatch.setattr(app.main, "upload_photo_bytes", unexpected)
    photo = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(photo, "PNG")
    data = {"is_retake": "true"}
    if batch_id:
        data["batch_id"] = batch_id
    response = client.post("/api/vision/inspect", headers=STAFF, data=data, files={"photo": ("retake.png", photo.getvalue(), "image/png")})
    assert response.status_code == 400
