"""Bridges the API and the three-agent workflow (agents.workflow.run_inspection)."""

import io

from PIL import Image, UnidentifiedImageError

from agents.contract import Finding, InspectionOutcome, Outcome, RunState
from app.schemas.vision import EvidenceBoxSchema, FindingCardSchema, InspectionResponseSchema

UI_STATUS_BY_OUTCOME = {
    Outcome.NO_VISIBLE_CONCERN: "clean",
    Outcome.REVIEW_REQUIRED: "review_required",
    Outcome.RETAKE_REQUIRED: "retake_required",
}


class InvalidPhotoError(ValueError):
    pass


def to_jpeg(photo_bytes: bytes) -> bytes:
    """Return the photo as JPEG bytes, which the agent contract requires."""
    try:
        with Image.open(io.BytesIO(photo_bytes)) as image:
            if image.format == "JPEG":
                return photo_bytes
            output = io.BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=90)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidPhotoError("File is not a readable image.") from error


def spot_count_label(count: int, level: str) -> str:
    noun = "spot" if count == 1 else "spots"
    return f"{count} {level} {noun}"


def ui_texts(outcome: InspectionOutcome) -> dict[str, str]:
    if outcome.outcome == Outcome.NO_VISIBLE_CONCERN:
        return {
            "headline": "No visible concerns, packing goes on",
            "summary_label": "No spots",
            "primary_action_label": "Photo of the next table",
        }
    if outcome.outcome == Outcome.RETAKE_REQUIRED:
        return {
            "headline": "Photo needs a retake",
            "summary_label": "Retake needed",
            "primary_action_label": "Retake the photo",
        }

    safety_count = sum(1 for finding in outcome.findings if finding.level == "safety")
    quality_count = len(outcome.findings) - safety_count
    if safety_count:
        label = spot_count_label(safety_count, "safety")
    elif quality_count:
        label = spot_count_label(quality_count, "quality")
    else:
        label = "Needs review"
    headline = f"{label} to fix before packing on" if outcome.findings else "Needs review before packing on"
    return {
        "headline": headline,
        "summary_label": label,
        "primary_action_label": "Fix these, then retake",
    }


def finding_card(finding: Finding, finding_id: str) -> FindingCardSchema:
    box = EvidenceBoxSchema(**finding.box.model_dump()) if finding.box else None
    return FindingCardSchema(
        id=finding_id,
        title=finding.concern_type.replace("_", " ").capitalize(),
        level=finding.level,
        detail=finding.explanation,
        box=box,
        icon_type=finding.level,
        rule_reference=finding.rule_reference,
        evidence_gap=finding.evidence_gap,
        suggested_action=finding.suggested_action,
    )


def build_response(
    outcome: InspectionOutcome,
    table_name: str,
    timestamp_str: str,
    finding_ids: list[str],
) -> InspectionResponseSchema:
    if outcome.state != RunState.COMPLETED:
        raise ValueError("Only a completed run has a response.")
    return InspectionResponseSchema(
        table_name=table_name,
        timestamp_str=timestamp_str,
        status=UI_STATUS_BY_OUTCOME[outcome.outcome],
        findings=[
            finding_card(finding, finding_id)
            for finding, finding_id in zip(outcome.findings, finding_ids, strict=True)
        ],
        uncertainty=outcome.uncertainty,
        next_action=outcome.next_action,
        **ui_texts(outcome),
    )
