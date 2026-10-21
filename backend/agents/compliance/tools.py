"""Deterministic tools for the Compliance/Research agent.

They read the run's observations and batch history from session state, which
the workflow fills before the agent starts.
"""

from google.adk.tools.tool_context import ToolContext

from agents.compliance.rules import RULE_TABLE_VERSION, rules_for_concern

OBSERVATIONS_KEY = "observations"
IMAGE_QUALITY_KEY = "image_quality_issues"
BATCH_HISTORY_KEY = "batch_history"
PRIOR_CONCERN_KEY = "prior_concern"


def lookup_rules(concern_type: str) -> dict:
    """Find the rule-table rules that apply to one concern type.

    Args:
        concern_type: The concern type reported by the Vision agent, for example "foreign_object".
    """
    matches = rules_for_concern(concern_type)
    return {
        "rule_table_version": RULE_TABLE_VERSION,
        "concern_type": concern_type,
        "rules": [
            {
                "rule_reference": rule.reference,
                "level": rule.level,
                "requirement": rule.requirement,
                "suggested_action": rule.suggested_action,
                "needs_location": rule.needs_location,
                "source_status": rule.status,
            }
            for rule in matches
        ],
    }


def check_evidence(observation_index: int, tool_context: ToolContext) -> dict:
    """List the evidence gaps of one Vision observation.

    Args:
        observation_index: Position of the observation in the Vision result, starting at 0.
    """
    observations = tool_context.state.get(OBSERVATIONS_KEY, [])
    if not 0 <= observation_index < len(observations):
        return {"error": f"no observation at index {observation_index}"}

    gaps = evidence_gaps(
        observations[observation_index], tool_context.state.get(IMAGE_QUALITY_KEY, [])
    )
    return {"observation_index": observation_index, "evidence_gaps": gaps}


def evidence_gaps(observation: dict, image_quality_issues: list[str]) -> list[str]:
    needs_location = any(
        rule.needs_location for rule in rules_for_concern(observation["concern_type"])
    )
    gaps = []
    if observation["box"] is None and needs_location:
        gaps.append("The concern has no location in the photo.")
    if observation.get("uncertainty"):
        gaps.append(f"Vision is uncertain: {observation['uncertainty']}")
    for issue in image_quality_issues:
        gaps.append(f"Image quality: {issue}")
    return gaps


def check_batch_history(concern_type: str, tool_context: ToolContext) -> dict:
    """Count earlier findings of the same concern type in this batch.

    Args:
        concern_type: The concern type to look for in the batch history.
    """
    normalized = concern_type.strip().lower()
    history = tool_context.state.get(BATCH_HISTORY_KEY, [])
    earlier = [item for item in history if item["concern_type"] == normalized]
    prior_concern = tool_context.state.get(PRIOR_CONCERN_KEY)
    is_retake_of_same_concern = bool(
        prior_concern and prior_concern["concern_type"] == normalized
    )
    return {
        "concern_type": normalized,
        "earlier_findings_in_batch": len(earlier),
        "is_retake_of_same_concern": is_retake_of_same_concern,
    }
