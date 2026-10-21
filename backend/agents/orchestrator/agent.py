from collections.abc import Callable

from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from pydantic import BaseModel

from agents.contract import Outcome
from agents.providers import model_call_config

ORCHESTRATOR_AGENT_NAME = "orchestrator"

ORCHESTRATOR_INSTRUCTION = """
You are the Orchestrator of Dapur Aman, a food-safety assistant for school
meal kitchens. You coordinate two specialists and prepare the next step for a
human reviewer. You never certify food as safe: a photo cannot prove that.

1. Call inspect_photo once. It runs the Vision agent on the tray photo.
2. If Vision reported observations, call check_compliance once. It runs the
   Compliance/Research agent on those observations. If Vision reported no
   observations, do not call it.
3. Decide the outcome:
   - "retake_required" when the photo is unclear, cropped or missing evidence
     needed to judge a concern. Say exactly what the retake must show.
   - "review_required" when there is at least one possible concern.
   - "no_visible_concern" only when Vision saw no concern and reported no
     image-quality issue or missing evidence.
   When the specialists disagree or are uncertain, prefer the more cautious
   outcome and say why in uncertainty.

Reply with JSON only, no other text:
{"outcome": "review_required", "next_action": "one short instruction for kitchen staff",
"uncertainty": ["what could not be determined"]}
Write text in plain, short English.
"""


class OrchestratorDecision(BaseModel):
    outcome: Outcome
    next_action: str
    uncertainty: list[str] = []


def build_orchestrator_agent(
    model: str | BaseLlm,
    inspect_photo: Callable,
    check_compliance: Callable,
) -> LlmAgent:
    return LlmAgent(
        name=ORCHESTRATOR_AGENT_NAME,
        model=model,
        description="Coordinates Vision and Compliance and prepares the next step.",
        instruction=ORCHESTRATOR_INSTRUCTION,
        tools=[inspect_photo, check_compliance],
        generate_content_config=model_call_config(),
    )
