import asyncio

import pytest

from agents.contract import (
    ErrorStage,
    InspectionInput,
    Menu,
    Outcome,
    Photo,
    RunState,
)
from agents.providers import ProviderSettings
from agents.workflow import FORMAT_REPAIR_REQUEST, run_inspection, run_inspection_with
from tests.agents.scripted_llm import (
    ScriptedLlm,
    build_test_vision_agent,
    json_reply,
    tool_calls,
)

TEST_SETTINGS = ProviderSettings(provider="test-scripted", model_id="scripted")
PHOTO_BYTES = b"synthetic test photo"

FOREIGN_OBJECT_SEEN = {
    "observations": [
        {
            "concern_type": "foreign_object",
            "box": {"x_min": 0.4, "y_min": 0.3, "x_max": 0.6, "y_max": 0.5},
            "explanation": "Test data: a small plastic piece on the rice.",
            "uncertainty": None,
        }
    ],
    "image_quality_issues": [],
    "missing_evidence": [],
}


def make_input() -> InspectionInput:
    return InspectionInput(
        photo=Photo(content=PHOTO_BYTES),
        menu=Menu(menu_id="menu-1", name="Rice, chicken and vegetables"),
        rule_table_version="rule-table-v1",
    )


def compliance_replies(rule_reference: str, check_rules_first: bool = True) -> list:
    checks = [
        ("check_evidence", {"observation_index": 0}),
        ("check_batch_history", {"concern_type": "foreign_object"}),
    ]
    if check_rules_first:
        checks.insert(0, ("lookup_rules", {"concern_type": "foreign_object"}))
    assessment = {
        "observation_index": 0,
        "rule_reference": rule_reference,
        "evidence_gap": None,
        "suggested_action": "Remove the portion and retake the photo.",
        "applicability_note": "A foreign object needs a person to check it.",
    }
    return [tool_calls(*checks), json_reply({"assessments": [assessment]})]


def run(model: ScriptedLlm, timeout_seconds: float = 120):
    return asyncio.run(
        run_inspection_with(
            make_input(), TEST_SETTINGS, model, build_test_vision_agent, timeout_seconds
        )
    )


def test_visible_foreign_object_needs_review():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply(FOREIGN_OBJECT_SEEN),
            tool_calls(("check_compliance", {})),
            *compliance_replies("rule-table-v1:foreign-01"),
            json_reply(
                {
                    "outcome": "review_required",
                    "next_action": "Check the tray before serving.",
                    "uncertainty": [],
                }
            ),
        ],
    )

    outcome = run(model)

    assert outcome.state == RunState.COMPLETED
    assert outcome.outcome == Outcome.REVIEW_REQUIRED
    [finding] = outcome.findings
    assert finding.level == "safety"
    assert finding.rule_reference == "rule-table-v1:foreign-01"

    rule_lookup = next(event for event in outcome.events if event.step == "lookup_rules")
    assert rule_lookup.agent == "compliance"
    assert rule_lookup.references == ["rule-table-v1:foreign-01"]
    vision_start = next(event for event in outcome.events if event.agent == "vision")
    assert vision_start.parent_step == "inspect_photo"
    assert [event.sequence for event in outcome.events] == list(
        range(1, len(outcome.events) + 1)
    )

    vision_request = model.requests[1]
    sent_images = [
        part.inline_data.data
        for content in vision_request.contents
        for part in content.parts
        if part.inline_data
    ]
    assert sent_images == [PHOTO_BYTES]

    compliance_request = next(
        request
        for request in model.requests
        if "You are the Compliance/Research agent" in request.config.system_instruction
    )
    compliance_text = compliance_request.contents[0].parts[0].text
    assert "Assess all 1 observation(s)" in compliance_text
    assert "foreign_object" in compliance_text


def test_rule_not_returned_by_a_tool_fails_the_run():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply(FOREIGN_OBJECT_SEEN),
            tool_calls(("check_compliance", {})),
            *compliance_replies("rule-table-v1:foreign-01", check_rules_first=False),
            json_reply({"outcome": "review_required", "next_action": "Check it."}),
        ],
    )

    outcome = run(model)

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "unverified_rule"
    assert outcome.error.stage == ErrorStage.RULE
    assert outcome.events


def test_skipping_vision_fails_the_run():
    model = ScriptedLlm(
        model="scripted",
        replies=[json_reply({"outcome": "no_visible_concern", "next_action": "Serve."})],
    )

    outcome = run(model)

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "vision_not_run"


def test_invalid_vision_reply_fails_after_one_retry():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply({"looks": "fine"}),
            json_reply({"still": "wrong"}),
        ],
    )

    outcome = run(model)

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "invalid_agent_output"
    assert outcome.error.stage == ErrorStage.VALIDATION


class SlowLlm(ScriptedLlm):
    async def generate_content_async(self, llm_request, stream=False):
        await asyncio.sleep(1)
        yield json_reply({})


def test_slow_run_times_out():
    outcome = run(SlowLlm(model="slow"), timeout_seconds=0.1)

    assert outcome.state == RunState.FAILED
    assert outcome.error.stage == ErrorStage.TIMEOUT
    assert outcome.outcome is None


@pytest.mark.parametrize("provider", ["", "gemini-but-misspelled"])
def test_missing_provider_fails_visibly(monkeypatch, provider):
    monkeypatch.setenv("AI_PROVIDER", provider)

    outcome = asyncio.run(run_inspection(make_input()))

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "provider_not_configured"


def test_fixture_result_is_labelled_simulated(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "fixture")

    outcome = asyncio.run(run_inspection(make_input()))

    assert outcome.provider == "fixture"
    assert all(event.kind == "simulated" for event in outcome.events)
    assert all(finding.explanation.startswith("Simulated") for finding in outcome.findings)


def test_second_vision_run_drops_the_old_compliance_result():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply(FOREIGN_OBJECT_SEEN),
            tool_calls(("check_compliance", {})),
            *compliance_replies("rule-table-v1:foreign-01"),
            tool_calls(("inspect_photo", {})),
            json_reply(FOREIGN_OBJECT_SEEN),
            json_reply({"outcome": "review_required", "next_action": "Check it."}),
        ],
    )

    outcome = run(model)

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "compliance_not_run"


def test_tool_evidence_gaps_stay_when_compliance_omits_them():
    unlocated_object = {
        "observations": [
            {
                "concern_type": "foreign_object",
                "box": None,
                "explanation": "Test data: something shiny near the tray edge.",
                "uncertainty": None,
            }
        ],
        "image_quality_issues": [],
        "missing_evidence": [],
    }
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply(unlocated_object),
            tool_calls(("check_compliance", {})),
            *compliance_replies("rule-table-v1:foreign-01"),
            json_reply({"outcome": "review_required", "next_action": "Check it."}),
        ],
    )

    outcome = run(model)

    [finding] = outcome.findings
    assert finding.evidence_gap == "The concern has no location in the photo."


def test_invalid_vision_reply_is_retried_once():
    model = ScriptedLlm(
        model="scripted",
        replies=[
            tool_calls(("inspect_photo", {})),
            json_reply({"looks": "fine"}),
            json_reply(FOREIGN_OBJECT_SEEN),
            tool_calls(("check_compliance", {})),
            *compliance_replies("rule-table-v1:foreign-01"),
            json_reply({"outcome": "review_required", "next_action": "Check it."}),
        ],
    )

    outcome = run(model)

    assert outcome.state == RunState.COMPLETED
    [retry] = [event for event in outcome.events if event.status == "retrying"]
    assert retry.step == "vision_reply_check"
    assert retry.parent_step == "inspect_photo"
    repair_request = model.requests[2].contents[-1].parts[0].text
    assert repair_request == FORMAT_REPAIR_REQUEST


def test_model_failure_is_not_retried():
    model = ScriptedLlm(model="scripted", replies=[tool_calls(("inspect_photo", {}))])

    outcome = run(model)

    assert outcome.state == RunState.FAILED
    assert outcome.error.code == "model_error"
    assert len(model.requests) == 2
    assert not [event for event in outcome.events if event.status == "retrying"]
