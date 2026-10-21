"""run_inspection: the one call the backend makes into the agents (DEVELOPMENT.md §4).

The Orchestrator agent decides when to run Vision and Compliance through two
tools. Python then checks that the required steps really ran, builds the
findings from the specialists' results and validates the whole outcome.
"""

import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.run_config import RunConfig
from google.adk.apps import App
from google.adk.models.base_llm import BaseLlm
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import BaseModel, ValidationError

from agents.activity import ActivityRecorder
from agents.compliance.agent import Assessment, ComplianceResult, build_compliance_agent
from agents.compliance.rules import (
    RULE_TABLE_VERSION,
    known_concern_types,
    rule_by_reference,
    rules_for_concern,
)
from agents.compliance.tools import (
    BATCH_HISTORY_KEY,
    IMAGE_QUALITY_KEY,
    OBSERVATIONS_KEY,
    PRIOR_CONCERN_KEY,
    evidence_gaps,
)
from agents.contract import (
    ActivityEvent,
    ErrorStage,
    EvidenceBox,
    Finding,
    InspectionInput,
    InspectionOutcome,
    Observation,
    Outcome,
    RunError,
    RunState,
    VisionObservation,
)
from agents.orchestrator.agent import OrchestratorDecision, build_orchestrator_agent
from agents.providers import (
    FIXTURE,
    ProviderConfigError,
    ProviderSettings,
    build_model,
    read_provider_settings,
)

APP_NAME = "dapur_aman"
USER_ID = "backend"
RUN_TIMEOUT_SECONDS = 120
MAX_MODEL_CALLS_PER_AGENT = 10
FORMAT_REPAIR_REQUEST = (
    "Your last reply did not match the required JSON format. Reply again with "
    "JSON only, in the format from your instructions. Do not call any tool again."
)

VisionBuilder = Callable[[str | BaseLlm], BaseAgent]


class InspectionFailure(Exception):
    def __init__(self, error: RunError) -> None:
        super().__init__(error.message)
        self.error = error


def fail(code: str, message: str, stage: ErrorStage, retryable: bool) -> InspectionFailure:
    return InspectionFailure(
        RunError(code=code, message=message, stage=stage, retryable=retryable)
    )


async def run_inspection(inspection_input: InspectionInput) -> InspectionOutcome:
    try:
        settings = read_provider_settings()
    except ProviderConfigError as error:
        return failed_outcome(
            RunError(
                code="provider_not_configured",
                message=str(error),
                stage=ErrorStage.PROVIDER,
                retryable=False,
            ),
            events=[],
            settings=ProviderSettings(provider="unconfigured", model_id="unconfigured"),
        )

    if settings.provider == FIXTURE:
        return simulated_outcome()

    try:
        vision_builder = load_vision_builder()
    except ImportError:
        return failed_outcome(
            RunError(
                code="vision_agent_missing",
                message="The Vision agent is not available yet.",
                stage=ErrorStage.PROVIDER,
                retryable=False,
            ),
            events=[],
            settings=settings,
        )

    return await run_inspection_with(
        inspection_input, settings, build_model(settings), vision_builder
    )


def load_vision_builder() -> VisionBuilder:
    from agents.vision import build_vision_agent

    return build_vision_agent


async def run_inspection_with(
    inspection_input: InspectionInput,
    settings: ProviderSettings,
    model: str | BaseLlm,
    vision_builder: VisionBuilder,
    timeout_seconds: float = RUN_TIMEOUT_SECONDS,
) -> InspectionOutcome:
    run = InspectionRun(inspection_input, model, vision_builder)
    try:
        decision = await asyncio.wait_for(run.orchestrate(), timeout=timeout_seconds)
        return run.build_outcome(decision, settings)
    except TimeoutError:
        error = RunError(
            code="run_timeout",
            message=f"The inspection did not finish within {timeout_seconds} seconds.",
            stage=ErrorStage.TIMEOUT,
            retryable=True,
        )
        return failed_outcome(error, run.recorder.events, settings)
    except InspectionFailure as failure:
        error = run.specialist_failure or failure.error
        return failed_outcome(error, run.recorder.events, settings)
    except Exception as error:
        provider_error = RunError(
            code="agent_error",
            message=f"An agent or model call failed ({type(error).__name__}).",
            stage=ErrorStage.PROVIDER,
            retryable=True,
        )
        return failed_outcome(provider_error, run.recorder.events, settings)


class InspectionRun:
    def __init__(
        self,
        inspection_input: InspectionInput,
        model: str | BaseLlm,
        vision_builder: VisionBuilder,
    ) -> None:
        self.input = inspection_input
        self.model = model
        self.vision_builder = vision_builder
        self.recorder = ActivityRecorder()
        self.vision_result: VisionObservation | None = None
        self.compliance_result: ComplianceResult | None = None
        self.specialist_failure: RunError | None = None

    async def orchestrate(self) -> OrchestratorDecision:
        if self.input.rule_table_version != RULE_TABLE_VERSION:
            raise fail(
                "unknown_rule_table",
                f"Rule table {self.input.rule_table_version} is not available.",
                ErrorStage.RULE,
                retryable=False,
            )
        orchestrator = build_orchestrator_agent(
            self.model, self.inspect_photo, self.check_compliance
        )
        return await run_agent(
            orchestrator,
            text_message(self.orchestrator_briefing()),
            {},
            self.recorder,
            OrchestratorDecision,
        )

    async def inspect_photo(self) -> dict:
        """Run the Vision agent on the tray photo and return its observations."""
        try:
            return await self.run_vision()
        except InspectionFailure as failure:
            self.specialist_failure = failure.error
            raise

    async def check_compliance(self) -> dict:
        """Run the Compliance/Research agent on the Vision observations."""
        try:
            return await self.run_compliance()
        except InspectionFailure as failure:
            self.specialist_failure = failure.error
            raise

    async def run_vision(self) -> dict:
        self.compliance_result = None
        vision = self.vision_builder(self.model)
        self.vision_result = await run_agent(
            vision, self.vision_message(), {}, self.recorder, VisionObservation
        )
        observations = self.vision_result.observations
        return {
            "summary": f"Vision reported {len(observations)} observation(s).",
            "observations": [
                {
                    "observation_index": index,
                    "concern_type": observation.concern_type,
                    "has_location": observation.box is not None,
                    "uncertainty": observation.uncertainty,
                }
                for index, observation in enumerate(observations)
            ],
            "image_quality_issues": self.vision_result.image_quality_issues,
            "missing_evidence": self.vision_result.missing_evidence,
        }

    async def run_compliance(self) -> dict:
        if self.vision_result is None:
            return {"error": "Run inspect_photo first."}
        compliance = build_compliance_agent(self.model)
        self.compliance_result = await run_agent(
            compliance,
            text_message("Assess the observations in the session state."),
            self.compliance_state(),
            self.recorder,
            ComplianceResult,
        )
        return {
            "summary": (
                f"Compliance assessed {len(self.compliance_result.assessments)} "
                "observation(s)."
            ),
            "assessments": [
                assessment.model_dump() for assessment in self.compliance_result.assessments
            ],
        }

    def orchestrator_briefing(self) -> str:
        briefing = {
            "menu": self.input.menu.name,
            "has_reference_photo": self.input.menu.reference_photo is not None,
            "earlier_findings_in_batch": len(self.input.batch_history),
            "is_retake": self.input.prior_concern is not None,
        }
        return "Inspect this tray photo.\n" + json.dumps(briefing)

    def vision_message(self) -> types.Content:
        context = {
            "menu": self.input.menu.name,
            "known_concern_types": known_concern_types(),
            "prior_concern": dump_or_none(self.input.prior_concern),
        }
        parts = [
            types.Part.from_text(text="Inspect the tray photo.\n" + json.dumps(context)),
            types.Part.from_bytes(
                data=self.input.photo.content, mime_type=self.input.photo.media_type
            ),
        ]
        reference = self.input.menu.reference_photo
        if reference is not None:
            parts.append(types.Part.from_text(text="Reference tray photo for this menu:"))
            parts.append(
                types.Part.from_bytes(data=reference.content, mime_type=reference.media_type)
            )
        return types.Content(role="user", parts=parts)

    def compliance_state(self) -> dict:
        return {
            OBSERVATIONS_KEY: [
                observation.model_dump(mode="json")
                for observation in self.vision_result.observations
            ],
            IMAGE_QUALITY_KEY: self.vision_result.image_quality_issues,
            BATCH_HISTORY_KEY: [
                finding.model_dump(mode="json") for finding in self.input.batch_history
            ],
            PRIOR_CONCERN_KEY: dump_or_none(self.input.prior_concern),
        }

    def build_outcome(
        self, decision: OrchestratorDecision, settings: ProviderSettings
    ) -> InspectionOutcome:
        if self.vision_result is None or not self.recorder.tool_was_completed("inspect_photo"):
            raise fail(
                "vision_not_run",
                "The Orchestrator finished without running the Vision agent.",
                ErrorStage.VALIDATION,
                retryable=True,
            )
        findings = self.build_findings()
        check_decision(decision, findings, self.vision_result)
        try:
            return InspectionOutcome(
                state=RunState.COMPLETED,
                outcome=decision.outcome,
                findings=findings,
                uncertainty=self.collect_uncertainty(decision),
                next_action=decision.next_action,
                events=self.recorder.events,
                provider=settings.provider,
                model=settings.model_id,
            )
        except ValidationError as error:
            raise fail(
                "invalid_outcome",
                f"The outcome failed validation ({error.error_count()} error(s)).",
                ErrorStage.VALIDATION,
                retryable=True,
            )

    def build_findings(self) -> list[Finding]:
        observations = self.vision_result.observations
        if not observations:
            return []
        if self.compliance_result is None or not self.recorder.tool_was_completed(
            "check_compliance"
        ):
            raise fail(
                "compliance_not_run",
                "Vision reported concerns but the Compliance agent did not run.",
                ErrorStage.VALIDATION,
                retryable=True,
            )
        assessments = {item.observation_index: item for item in self.compliance_result.assessments}
        if sorted(assessments) != list(range(len(observations))):
            raise fail(
                "assessment_mismatch",
                "Compliance did not assess each observation exactly once.",
                ErrorStage.VALIDATION,
                retryable=True,
            )
        returned_references = self.recorder.rule_references_returned()
        image_quality_issues = self.vision_result.image_quality_issues
        return [
            build_finding(
                observation,
                assessments[index],
                returned_references,
                evidence_gaps(observation.model_dump(mode="json"), image_quality_issues),
            )
            for index, observation in enumerate(observations)
        ]

    def collect_uncertainty(self, decision: OrchestratorDecision) -> list[str]:
        uncertainty = list(decision.uncertainty)
        for observation in self.vision_result.observations:
            if observation.uncertainty and observation.uncertainty not in uncertainty:
                uncertainty.append(observation.uncertainty)
        for issue in self.vision_result.image_quality_issues:
            if issue not in uncertainty:
                uncertainty.append(issue)
        return uncertainty


def build_finding(
    observation: Observation,
    assessment: Assessment,
    returned_references: set[str],
    tool_gaps: list[str],
) -> Finding:
    rule = None
    if assessment.rule_reference is not None:
        rule = rule_by_reference(assessment.rule_reference)
        if rule is None or assessment.rule_reference not in returned_references:
            raise fail(
                "unverified_rule",
                f"Compliance cited {assessment.rule_reference}, which no rule tool returned.",
                ErrorStage.RULE,
                retryable=True,
            )
        if rule not in rules_for_concern(observation.concern_type):
            raise fail(
                "rule_mismatch",
                f"{assessment.rule_reference} does not cover {observation.concern_type}.",
                ErrorStage.RULE,
                retryable=True,
            )

    gaps = list(tool_gaps)
    if assessment.evidence_gap and assessment.evidence_gap not in gaps:
        gaps.append(assessment.evidence_gap)
    if rule is None and not gaps:
        gaps.append("No rule in the rule table covers this concern.")
    evidence_gap = " ".join(gaps) if gaps else None
    return Finding(
        level=rule.level if rule else "safety",
        concern_type=observation.concern_type,
        box=observation.box,
        explanation=observation.explanation,
        rule_reference=rule.reference if rule else None,
        evidence_gap=evidence_gap,
        suggested_action=assessment.suggested_action,
    )


def check_decision(
    decision: OrchestratorDecision,
    findings: list[Finding],
    vision_result: VisionObservation,
) -> None:
    if decision.outcome != Outcome.NO_VISIBLE_CONCERN:
        return
    evidence_incomplete = vision_result.image_quality_issues or vision_result.missing_evidence
    if findings or evidence_incomplete:
        raise fail(
            "unsupported_outcome",
            "The Orchestrator reported no visible concern despite findings or missing evidence.",
            ErrorStage.VALIDATION,
            retryable=True,
        )


async def run_agent(
    agent: BaseAgent,
    message: types.Content,
    state: dict,
    recorder: ActivityRecorder,
    reply_model: type[BaseModel],
) -> BaseModel:
    app = App(name=APP_NAME, root_agent=agent, plugins=[recorder])
    runner = InMemoryRunner(app=app)
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID, state=state
    )
    reply = await ask_agent(runner, session.id, agent, message)
    try:
        return parse_reply(reply, reply_model, agent.name)
    except InspectionFailure:
        recorder.record(
            step=f"{agent.name}_reply_check",
            parent_step=recorder.parent_step(),
            agent="workflow",
            kind="validation",
            status="retrying",
            summary=f"The {agent.name} reply did not match the expected format; asked once more.",
        )
    reply = await ask_agent(runner, session.id, agent, text_message(FORMAT_REPAIR_REQUEST))
    return parse_reply(reply, reply_model, agent.name)


async def ask_agent(
    runner: InMemoryRunner, session_id: str, agent: BaseAgent, message: types.Content
) -> str:
    run_config = RunConfig(max_llm_calls=MAX_MODEL_CALLS_PER_AGENT)
    final_text = ""
    async for event in runner.run_async(
        user_id=USER_ID, session_id=session_id, new_message=message, run_config=run_config
    ):
        if event.error_code:
            raise fail(
                "model_error",
                f"The {agent.name} model call failed ({event.error_code}).",
                ErrorStage.PROVIDER,
                retryable=True,
            )
        if event.author == agent.name and event.is_final_response() and event.content:
            final_text = "".join(part.text or "" for part in event.content.parts or [])
    if not final_text:
        raise fail(
            "empty_reply",
            f"The {agent.name} agent finished without a reply.",
            ErrorStage.VALIDATION,
            retryable=True,
        )
    return final_text


def parse_reply(text: str, model_class: type[BaseModel], agent_name: str) -> BaseModel:
    try:
        return model_class.model_validate_json(strip_code_fence(text))
    except ValidationError:
        raise fail(
            "invalid_agent_output",
            f"The {agent_name} agent replied in an unexpected format.",
            ErrorStage.VALIDATION,
            retryable=True,
        )


def strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1]
        stripped = stripped.rsplit("```", 1)[0]
    return stripped.strip()


def text_message(text: str) -> types.Content:
    return types.Content(role="user", parts=[types.Part.from_text(text=text)])


def dump_or_none(model: BaseModel | None) -> dict | None:
    return model.model_dump(mode="json") if model is not None else None


def failed_outcome(
    error: RunError, events: list[ActivityEvent], settings: ProviderSettings
) -> InspectionOutcome:
    return InspectionOutcome(
        state=RunState.FAILED,
        error=error,
        events=events,
        provider=settings.provider,
        model=settings.model_id,
    )


def simulated_outcome() -> InspectionOutcome:
    return InspectionOutcome(
        state=RunState.COMPLETED,
        outcome=Outcome.REVIEW_REQUIRED,
        findings=[
            Finding(
                level="safety",
                concern_type="foreign_object",
                box=EvidenceBox(x_min=0.42, y_min=0.31, x_max=0.58, y_max=0.47),
                explanation="Simulated: possible foreign object on the rice.",
                rule_reference=f"{RULE_TABLE_VERSION}:foreign-01",
                suggested_action="Remove or replace the affected portion, then retake the photo.",
            )
        ],
        uncertainty=["Simulated: no agent looked at this photo."],
        next_action="Simulated: review the finding before serving.",
        events=[
            ActivityEvent(
                sequence=1,
                timestamp=datetime.now(UTC),
                step="simulated_result",
                agent=FIXTURE,
                kind="simulated",
                status="completed",
                summary="Simulated result. No agent, tool or model ran.",
            )
        ],
        provider=FIXTURE,
        model=FIXTURE,
    )
