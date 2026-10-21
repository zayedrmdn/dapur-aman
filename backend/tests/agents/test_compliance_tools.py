from types import SimpleNamespace

from agents.compliance.tools import check_batch_history, check_evidence, lookup_rules


def test_lookup_rules_finds_the_foreign_object_rule():
    result = lookup_rules("Foreign_Object")

    [rule] = result["rules"]
    assert rule["rule_reference"] == "rule-table-v1:foreign-01"
    assert rule["level"] == "safety"


def test_lookup_rules_returns_nothing_for_an_unknown_concern():
    assert lookup_rules("glitter")["rules"] == []


def test_check_evidence_flags_a_missing_location_and_blur():
    context = SimpleNamespace(
        state={
            "observations": [
                {"concern_type": "foreign_object", "box": None, "uncertainty": None}
            ],
            "image_quality_issues": ["The tray edge is cropped."],
        }
    )

    gaps = check_evidence(0, context)["evidence_gaps"]

    assert gaps == [
        "The concern has no location in the photo.",
        "Image quality: The tray edge is cropped.",
    ]


def test_check_evidence_rejects_an_unknown_index():
    context = SimpleNamespace(state={"observations": []})

    assert "error" in check_evidence(3, context)


def test_check_batch_history_counts_earlier_findings_and_retakes():
    context = SimpleNamespace(
        state={
            "batch_history": [{"concern_type": "foreign_object"}],
            "prior_concern": {"concern_type": "foreign_object"},
        }
    )

    result = check_batch_history("foreign_object", context)

    assert result["earlier_findings_in_batch"] == 1
    assert result["is_retake_of_same_concern"] is True
