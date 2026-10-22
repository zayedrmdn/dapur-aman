import pytest

from app.models import ActivityEvent, Batch, Finding, Run
from tests.app.test_retake_supervisor import api


@pytest.mark.parametrize("state,outcome,uncertainty,expected", [
    ("failed", None, [], "retake_required"),
    ("running", "clean", [], "retake_required"),
    ("completed", None, [], "retake_required"),
    ("completed", "clean", ["Cannot see the surface"], "review_required"),
    ("completed", "clean", [], "clean"),
])
def test_overview_never_clears_incomplete_or_uncertain_runs(api, state, outcome, uncertainty, expected):
    client, db = api
    db.get(Finding, "old_finding").status = "fixed"
    run = db.get(Run, "new_run")
    run.state, run.outcome, run.uncertainty_json = state, outcome, uncertainty
    db.commit()
    data = client.get("/api/overview", headers={"X-Shared-Secret": "test-secret"}).json()
    row = data["packing_photos"][0]
    assert row["status"] == expected
    assert row["has_check"] is (state == "completed" and outcome is not None)
    assert "packing goes on" not in data["headline"]
    if expected != "clean":
        assert row["summary_label"] != "No spots"
    detail = client.get("/api/batches/batch_actual_identifier", headers={"X-Shared-Secret": "test-secret"}).json()
    assert detail["menu_name"] == "Test menu"
    saved = next(item for item in detail["runs"] if item["id"] == "new_run")
    assert saved["outcome"] == expected
    assert saved["state"] == state


@pytest.mark.parametrize("action,finding_id", [("fixed", "old_finding"), ("dismissed", "old_finding"), ("fixed", None)])
def test_action_rejects_wrong_batch_or_missing_finding(api, action, finding_id):
    client, db = api
    db.add(Batch(id="other", menu_name="Other batch"))
    db.commit()
    response = client.post("/api/actions", headers={"X-Shared-Secret": "test-secret", "X-Actor-Id": "staff"}, json={"batch_id": "other", "finding_id": finding_id, "action": action, "reason": "Synthetic reason"})
    assert response.status_code in (400, 404)
    assert db.get(Finding, "old_finding").status == "open"


def test_events_return_saved_trace_and_require_secret(api):
    client, db = api
    db.add(ActivityEvent(id="event_test", run_id="old_run", sequence=1, agent="Vision", step="vision", kind="agent", status="completed", summary="Synthetic saved trace"))
    db.commit()
    path = "/api/runs/old_run/events"
    assert client.get(path).status_code == 401
    response = client.get(path, headers={"X-Shared-Secret": "test-secret"})
    assert response.status_code == 200
    assert response.json()["events"][0]["summary"] == "Synthetic saved trace"
    assert client.get("/api/runs/missing/events", headers={"X-Shared-Secret": "test-secret"}).status_code == 404


def test_uncertain_inspection_response_cannot_be_clean():
    from agents.contract import InspectionOutcome, Outcome, RunState
    from app.inspection import build_response
    result = InspectionOutcome(state=RunState.COMPLETED, outcome=Outcome.NO_VISIBLE_CONCERN, uncertainty=["Surface is partly obscured"], events=[], provider="test", model="test")
    response = build_response(result, "Table test", "00:00", [])
    assert response.status == "review_required"
    assert "packing goes on" not in response.headline
