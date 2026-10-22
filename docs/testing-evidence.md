# Testing evidence

Every row below comes from a run the team actually did, with its date and source. No metric here is estimated. Demo data and test photos are synthetic.

## 1. Automated tests (22 Oct 2026, frozen commit)

| Suite | Command | Result |
| --- | --- | --- |
| Backend (pytest, in-memory SQLite, scripted model replies, no paid calls) | `cd backend && uv run --with pytest --with httpx pytest -q` | **92 passed** |
| Frontend unit tests (`.mjs`) | `cd frontend && node --test --test-isolation=none tests/*.mjs` | **13 passed, 0 failed** |
| Frontend integration tests (`.cjs`) | Need the scripted backend `backend/tests/local_mvp_server.py` on port 8765 | 16/16 passed with it running (22 Oct); fail with 502 without it |

What the backend tests cover is listed per file in [README → Testing](../README.md#testing). Key human-control test: `test_ai_never_closes_batch_or_resolves_findings`.

## 2. Real-model and live scenarios

| # | Scenario | Input | Actual output | Result |
| --- | --- | --- | --- | --- |
| S1 | Real photo, three agents, Vertex AI (21 Oct) | Staged non-ideal tray photo (PNG converted to JPEG), model `gemini-3.5-flash-lite` | Run `completed`, outcome `review_required`, 3 findings matched to rule `rule-table-v1:menu-01`, agents Orchestrator → Vision → Compliance, 18 events, 13.9 s | Pass |
| S2 | Same, before the Compliance briefing fix (21 Oct) | Same photo | Runs failed with `assessment_mismatch` and `compliance_not_run` | Fail, safe: validation refused to show a result. Fixed, then S1 |
| S3 | Vision reply format (21 Oct) | Real model runs | First Vision reply failed the format check; the single automatic repair succeeded | Known issue, handled |
| S4 | Live HTTP end to end (21 Oct, test batch, deleted afterwards) | Upload with no secret, wrong secret, then valid secret | 401, 401, then 200 in 13.5 s: `review_required`, 3 findings, 20 events, JPEG stored; batch detail and overview read back | Pass |
| S5 | Slow model call (22 Oct) | Real run | Vertex `DEADLINE_EXCEEDED` on the Compliance step; run ended as failed, not as clean | Fail, safe |
| S6 | Production read-only check (22 Oct, `backend/scripts/prod_check.py`) | GET requests and login POSTs only | health; 401 without secret; staff and supervisor login; wrong password 401; staff 403 on supervisor dashboard; dashboard, overview and batch fields present | **9/9 passed** |
| S7 | Vercel → tunnel → backend chain (22 Oct) | Login with a made-up username on `https://dapur-aman.vercel.app/api/staff/login` | HTTP 401 (backend reached) | Pass |
| S8 | Browser checks (22 Oct, isolated test backend) | Supervisor hold → refresh → release → refresh; staff view of a held batch; 360 and 390 px | Flow worked, inline feedback shown, no horizontal overflow | Pass |

Not exercised on production data: hold, release and close refusals (covered by backend tests only).

## 3. Human oversight

- The AI only proposes: concerns, rule match, uncertainty and one next step. It never marks food safe, resolves a finding, places or lifts a hold, or closes a batch.
- Those actions go through the human action endpoint, which the agents never call (checked by `test_ai_never_closes_batch_or_resolves_findings`).
- Holds and releases need a written reason from the supervisor. A finding marked fixed needs a retake photo.
- A failed or invalid run is never shown as clean (`test_inspection_api.py`, S2, S5).

## 4. Known failures and limitations

- Photo-only evidence: no temperature, smell, texture or microbiological check.
- Rules are demo assumptions, not yet linked to a regulation; the 4-hour holding limit is unverified.
- Model timeouts can fail a run (S5).
- Demo backend runs on one laptop behind a Cloudflare Quick Tunnel; Cloud Run is blocked on IAM.
- Telegram delivery is not confirmed or retried.

Full list: [README → Known limitations](../README.md#known-limitations).
