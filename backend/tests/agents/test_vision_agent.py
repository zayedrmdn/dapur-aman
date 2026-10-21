import asyncio

from agents.contract import InspectionInput, Menu, Outcome, Photo, RunState
from agents.providers import ProviderSettings
from agents.vision import build_vision_agent
from agents.workflow import load_vision_builder, run_inspection_with
from tests.agents.scripted_llm import ScriptedLlm, json_reply, tool_calls

PHOTO_BYTES = b"synthetic test photo"


def test_workflow_loads_the_real_vision_builder():
    assert load_vision_builder() is build_vision_agent
    assert build_vision_agent("gemini-test").name == "vision"


def test_real_vision_agent_gets_photo_and_menu_items():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply({"observations": [], "image_quality_issues": [], "missing_evidence": []}),
            json_reply(
                {
                    "outcome": "no_visible_concern",
                    "next_action": "Photo the next table.",
                    "uncertainty": [],
                }
            ),
        ],
    )
    inspection_input = InspectionInput(
        photo=Photo(content=PHOTO_BYTES),
        menu=Menu(menu_id="menu-1", name="Test menu", items=["Nasi putih", "Tahu goreng"]),
        rule_table_version="rule-table-v1",
    )

    outcome = asyncio.run(
        run_inspection_with(
            inspection_input,
            ProviderSettings(provider="test-scripted", model_id="scripted"),
            model,
            build_vision_agent,
        )
    )

    assert outcome.state == RunState.COMPLETED
    assert outcome.outcome == Outcome.NO_VISIBLE_CONCERN
    vision_request = model.requests[1]
    assert "Vision agent of Dapur Aman" in vision_request.config.system_instruction
    parts = [part for content in vision_request.contents for part in content.parts]
    assert [part.inline_data.data for part in parts if part.inline_data] == [PHOTO_BYTES]
    assert any("Tahu goreng" in (part.text or "") for part in parts)
