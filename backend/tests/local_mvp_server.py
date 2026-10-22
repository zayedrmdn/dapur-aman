"""Isolated local demo: real APIs/ADK, scripted model, in-memory DB and photos. Never deploy."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["BACKEND_SHARED_SECRET"] = "synthetic-local-secret"
os.environ["AI_PROVIDER"] = "fixture"
os.environ["OTEL_SDK_DISABLED"] = "true"

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import Response, HTTPException
import uvicorn
import app.main
from app.auth import hash_password
from app.database import Base, get_db
from app.models import User
from app.seed import seed_default_schools
from agents.providers import ProviderSettings
from agents.workflow import run_inspection_with
from tests.agents.scripted_llm import ScriptedLlm, build_test_vision_agent, json_reply, tool_calls
from tests.agents.test_workflow import FOREIGN_OBJECT_SEEN, compliance_replies

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
with Session(engine) as db:
    db.add(User(id="test_staff", username="local_staff", name="Staf Pengujian Terisolasi", role="kitchen_staff", password_hash=hash_password("local-test-password")))
    db.add(User(id="test_supervisor", username="local_supervisor", name="Supervisor Pengujian Terisolasi", role="supervisor", password_hash=hash_password("local-test-password")))
    db.commit()
    seed_default_schools(db)

def database():
    with Session(engine) as db:
        yield db

photos = {}
def upload(key, data, content_type):
    photos[key] = data

def signed(key, expires_in=600):
    import time
    return "http://127.0.0.1:8765/__test/photos/" + key + "?fresh=" + str(time.time_ns())

async def scripted(inspection_input):
    failed = "FAIL" in inspection_input.menu.name
    model = ScriptedLlm(model="scripted-local", replies=[] if failed else [
        tool_calls(("inspect_photo", {})), json_reply(FOREIGN_OBJECT_SEEN),
        tool_calls(("check_compliance", {})), *compliance_replies("rule-table-v1:foreign-01"),
        json_reply({"outcome": "review_required", "next_action": "Check the tray before serving.", "uncertainty": ["Test-only scripted replies; no paid model was called."]}),
    ])
    return await run_inspection_with(inspection_input, ProviderSettings(provider="test-scripted", model_id="scripted-local"), model, build_test_vision_agent)

app.main.app.dependency_overrides[get_db] = database
app.main.upload_photo_bytes = upload
app.main.generate_presigned_url = signed
app.main.run_inspection = scripted

@app.main.app.get("/__test/photos/{key:path}")
def photo(key: str):
    if key not in photos:
        raise HTTPException(status_code=404)
    return Response(photos[key], media_type="image/jpeg")

if __name__ == "__main__":
    uvicorn.run(app.main.app, host="127.0.0.1", port=8765, lifespan="off", access_log=False)
