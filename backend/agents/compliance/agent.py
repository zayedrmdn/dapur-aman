from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from pydantic import BaseModel

from agents.compliance.tools import check_batch_history, check_evidence, lookup_rules
from agents.providers import model_call_config

COMPLIANCE_AGENT_NAME = "compliance"

COMPLIANCE_INSTRUCTION = """
You are the Compliance/Research agent of Dapur Aman, a food-safety assistant
for school meal kitchens. You check Vision observations of one tray photo
against the kitchen's rule table. You never certify food as safe.

For every observation, in order:
1. Call lookup_rules with its concern_type.
2. Call check_evidence with its observation_index.
3. Call check_batch_history with its concern_type.
Decide which returned rule applies, if any, and what evidence is still missing.
Use only rule references that lookup_rules returned. If no rule applies, set
rule_reference to null and explain the gap in evidence_gap.

Reply with JSON only, no other text:
{"assessments": [{"observation_index": 0, "rule_reference": "rule-table-v1:foreign-01" or null,
"evidence_gap": "text" or null, "suggested_action": "text", "applicability_note": "text"}]}
Write one assessment per observation. Write text in plain, short English.
"""


class Assessment(BaseModel):
    observation_index: int
    rule_reference: str | None
    evidence_gap: str | None
    suggested_action: str
    applicability_note: str


class ComplianceResult(BaseModel):
    assessments: list[Assessment]


def build_compliance_agent(model: str | BaseLlm) -> LlmAgent:
    return LlmAgent(
        name=COMPLIANCE_AGENT_NAME,
        model=model,
        description="Checks Vision observations against the rule table.",
        instruction=COMPLIANCE_INSTRUCTION,
        tools=[lookup_rules, check_evidence, check_batch_history],
        generate_content_config=model_call_config(),
    )
