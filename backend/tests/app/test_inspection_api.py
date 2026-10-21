import io
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

import app.auth
import app.main
from agents.contract import ActivityEvent, ErrorStage, InspectionOutcome, RunError, RunState
from app.database import get_db
from app.inspection import InvalidPhotoError, build_response, to_jpeg

TEST_SECRET = "test-secret"


class UnusedDatabase:
    def query(self, *args):
        raise AssertionError("the database must not be touched")


@pytest.fixture
def client(monkeypatch):
    calls = []

    async def fake_run_inspection(inspection_input):
        calls.append(inspection_input)
        raise AssertionError("run_inspection must not be called")

    def fake_upload(*args):
        raise AssertionError("storage must not be touched")

    monkeypatch.setattr(app.auth, "BACKEND_SHARED_SECRET", TEST_SECRET)
    monkeypatch.setattr(app.main, "run_inspection", fake_run_inspection)
    monkeypatch.setattr(app.main, "upload_photo_bytes", fake_upload)
    app.main.app.dependency_overrides[get_db] = UnusedDatabase
    yield TestClient(app.main.app)
    app.main.app.dependency_overrides.clear()


def post_photo(client, headers):
    files = {"photo": ("tray.jpg", b"synthetic", "image/jpeg")}
    return client.post("/api/inspections/upload-and-run", files=files, headers=headers)


def test_inspect_without_secret_is_rejected(client):
    assert post_photo(client, {}).status_code == 401


def test_inspect_with_wrong_secret_is_rejected(client):
    assert post_photo(client, {"X-Shared-Secret": "wrong"}).status_code == 401


def test_inspect_fails_closed_when_secret_not_configured(client, monkeypatch):
    monkeypatch.setattr(app.auth, "BACKEND_SHARED_SECRET", "")
    assert post_photo(client, {"X-Shared-Secret": ""}).status_code == 503


def test_actor_header_is_required():
    with pytest.raises(HTTPException) as error:
        app.auth.get_current_actor(x_actor_id=None, db=UnusedDatabase())
    assert error.value.status_code == 401


def test_png_photo_is_converted_to_jpeg():
    png = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(png, format="PNG")
    jpeg = to_jpeg(png.getvalue())
    assert Image.open(io.BytesIO(jpeg)).format == "JPEG"


def test_non_image_labelled_jpeg_is_rejected():
    with pytest.raises(InvalidPhotoError):
        to_jpeg(b"not an image")


def test_failed_run_never_becomes_a_ui_result():
    failed = InspectionOutcome(
        state=RunState.FAILED,
        error=RunError(
            code="agent_error", message="test", stage=ErrorStage.PROVIDER, retryable=True
        ),
        events=[
            ActivityEvent(
                sequence=1,
                timestamp=datetime.now(UTC),
                step="orchestrator",
                agent="orchestrator",
                kind="agent",
                status="failed",
                summary="test",
            )
        ],
        provider="vertex",
        model="test",
    )
    with pytest.raises(ValueError):
        build_response(failed, "Table 1", "08:00", [])
