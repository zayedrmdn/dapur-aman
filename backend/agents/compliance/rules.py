"""Rule table v1. Every rule is a demo assumption until Rabab links a source.

A rule never certifies food as safe; it only says which visible concern needs
which human check.
"""

from dataclasses import dataclass
from typing import Literal

RULE_TABLE_VERSION = "rule-table-v1"


@dataclass(frozen=True)
class Rule:
    rule_id: str
    concern_types: tuple[str, ...]
    level: Literal["safety", "quality"]
    requirement: str
    suggested_action: str
    needs_location: bool
    source: str | None
    status: Literal["verified", "pending_verification", "demo_assumption"]

    @property
    def reference(self) -> str:
        return f"{RULE_TABLE_VERSION}:{self.rule_id}"


RULES = (
    Rule(
        rule_id="foreign-01",
        concern_types=("foreign_object", "hair", "insect", "packaging_fragment"),
        level="safety",
        requirement="Food with a possible foreign object is held until a person checks it.",
        suggested_action="Remove or replace the affected portion, then retake the photo.",
        needs_location=True,
        source=None,
        status="demo_assumption",
    ),
    Rule(
        rule_id="cooking-01",
        concern_types=("undercooked", "raw_appearance"),
        level="safety",
        requirement="Meat or egg that looks undercooked is checked before serving.",
        suggested_action="Check the core temperature and recook if needed.",
        needs_location=True,
        source=None,
        status="demo_assumption",
    ),
    Rule(
        rule_id="spoilage-01",
        concern_types=("spoilage", "mould", "discoloration"),
        level="safety",
        requirement="Food that may be spoiled is held and inspected by a person.",
        suggested_action="Set the portion aside and check smell, texture and storage time.",
        needs_location=True,
        source=None,
        status="demo_assumption",
    ),
    Rule(
        rule_id="menu-01",
        concern_types=("missing_component", "different_component"),
        level="quality",
        requirement="Each tray matches the planned menu components.",
        suggested_action="Add the missing component or record why it differs.",
        needs_location=False,
        source=None,
        status="demo_assumption",
    ),
)


def rules_for_concern(concern_type: str) -> list[Rule]:
    normalized = concern_type.strip().lower()
    return [rule for rule in RULES if normalized in rule.concern_types]


def rule_by_reference(reference: str) -> Rule | None:
    for rule in RULES:
        if rule.reference == reference:
            return rule
    return None


def known_concern_types() -> list[str]:
    return sorted({concern for rule in RULES for concern in rule.concern_types})
