# Development guide

Shared working reference for Dapur Aman. Setup steps live in the READMEs. Updated 21 October 2026.

## 1. Status and next actions

**Status:** planning only. No application code, folders, agents, tables, photo bucket, cloud projects or deployments exist yet. Local Python is 3.12; the 3.13 target is untested.

**Next actions**

1. Zayed shares the remaining organizer requirements from the seminar; check them against this guide.
2. Team confirms the proposals marked *pending team confirmation*: ownership (§3), agent-backend interface and analysis approach (§4), first tasks (below).
3. Separate authorization to start; coding opens 21 October 13:00 WIB. Cloud provisioning needs its own authorization.
4. Build the first milestone below, then replace the simulated agent result with the real three-agent run.

### First milestone (pending team confirmation)

**Target ~18:00 WIB, 21 October:** a rough end-to-end slice. Deployment by then is a target, not a requirement; working integration and correctness come first.

| # | Who | Task | Depends on |
| --- | --- | --- | --- |
| 1 | Zayed + Rohmat | Agree the `run_inspection` interface and example input/output JSON (§4) | — |
| 2 | Zayed | Initialize `frontend/` and `backend/` skeletons; verify startup/build; hand `frontend/` to Finiko | — |
| 3 | Rohmat | FastAPI app: shared-secret check, login against seeded accounts, upload, run endpoint calling `run_inspection`, saving run/events/photo, one human action | 1, 2 |
| 4 | Zayed | Simulated `run_inspection` returning a validated, clearly labelled result; then the real Vision, Compliance/Research and Orchestrator agents behind the same interface | 1, 2 |
| 5 | Finiko | Login, upload with phone-side resize, loading state, result screen with Aktivitas AI, one human action; uses example JSON until generated types exist | 2 |
| 6 | Rabab | First staged scenario (one menu): reference tray, normal tray, deliberate visible concern, unclear/cropped photo, corrective retake. Then 5–8 source-linked rule candidates | — |
| 7 | Zayed | Provision Neon, Vercel, Cloud Run after authorization; deploy once owners have verified their parts | 3, 5 |

**Milestone accepted when:** a seeded user logs in, uploads a photo, the backend returns a validated result (simulated, labelled as such), the result screen shows it, one human action is recorded with actor, time and reason, and run, events, photo and action are all reloaded from Neon after refresh.

Expand to 2–3 menus only if time permits.

**MVP:** one-kitchen inspection, three agents, human actions, saved evidence. Later, after validation: multi-kitchen access and evidence exports.

Budget about 14 productive hours per developer; share progress before breaks. Agentic AI quality comes before polish. Selection pitch: **2 minutes**; Rabab drafts the story and test cases early, full slides after functionality works. The separate prototype is reference only and is not copied here.

## 2. Confirmed decisions

### Architecture (do not replace without explicit approval)

Three distinct Google ADK agents in one Python backend and one deployment, not separate services:

| Agent | Role |
| --- | --- |
| Vision | Inspects photos, reports possible visible concerns and uncertainty. Method in §4 (pending team confirmation) |
| Compliance/Research | Checks findings against menu, history and rules using deterministic tools; flags unsupported conclusions. Retrieval only when justified |
| Orchestrator/Synthesizer | Coordinates both specialists and prepares findings, next steps or retake requests for human review |

- Python enforces safety rules, validation, persistence and every human-controlled state change.
- Safety decisions need human review; supervisor sign-off is not mandatory.
- Photos cannot prove microbiological safety. "No visible concern" never means safe; incomplete analysis never means no concern.

### Stack and hosting

| Area | Decision |
| --- | --- |
| Frontend | `frontend/`: Next.js 16, TypeScript, Tailwind CSS, Material UI, d3. Vercel Hobby |
| Backend | `backend/`: Python 3.13, FastAPI, Google ADK. Cloud Run, Singapore (`asia-southeast1`), subject to organizer requirements |
| AI provider | Gemini through Vertex AI in our Google Cloud project, initially primary. OpenRouter (through LiteLLM) is the manual alternative. Switch by configuration and redeploy (proposed names `AI_PROVIDER`, `AI_MODEL`) |
| Gemini auth | Local: Application Default Credentials. Cloud Run: service account. No key files. Vertex flag depends on the installed ADK version: `GOOGLE_GENAI_USE_ENTERPRISE` (current docs) or `GOOGLE_GENAI_USE_VERTEXAI` (older). The model location may differ from Singapore |
| Database | Neon Postgres: dedicated Dapur Aman project in Zayed's console-managed Free organization, Singapore |
| Photos | Private Neon Object Storage. The database keeps permanent photo IDs and object keys, never URLs |
| Updates | Refresh after actions plus a refresh button; no realtime |
| Credit | $300 USD Google Cloud credit allocated to the project. Eligible services, quotas and expiry are unverified |

### Request flow and limits

- Browser → Next.js server route → Python as **one waiting call**. Show a loading state while the agents work; show the recorded activity with the result. Add polling or background jobs only if testing shows the waiting call is unreliable.
- The phone resizes photos to JPEG, initially 1600 px on the long edge; test whether this hides small concerns. Python rejects uploads over 4 MB.

Initial limits, final after latency tests:

| Limit | Value |
| --- | --- |
| Whole run (all three agents, tools, retries) | 120 s, then `failed` with a timeout error |
| Each model call | 45 s |
| Retries | One, only for schema-invalid output. Provider and tool failures are not retried |
| Next.js wait | 150 s |

The normal demo response should be much faster. A timed-out or incomplete run is never successful.

### Security and access

Suitable for a controlled hackathon demo, not a claim of production-ready authentication.

| Concern | Decision |
| --- | --- |
| Accounts | A few seeded accounts with hashed passwords; roles `kitchen_staff` and `supervisor`. No registration or account-management UI |
| Sessions | Next.js uses signed, secure, httpOnly cookies. Never trust an actor or role sent by the browser |
| Next.js → Python | HTTPS plus a shared secret header on every sensitive endpoint. Python rejects a missing or invalid secret. Next.js forwards the verified actor and role |
| Public routes | The secret does not protect Next.js routes: add basic server-side abuse protection and access checks there |
| Permissions | Python enforces them: only supervisors place or lift holds. Configurable, persistent per-account analysis limit |
| Photo viewing | Python checks access, then issues a fresh 10-minute signed link on every result or history load |
| Secrets | Never in Git, logs or shared documents. Shared secret only in Vercel and Cloud Run; backend keys in Secret Manager; other settings in environment variables |
| Neon access | Rohmat gets Dapur Aman database and storage credentials only; no invite to the organization, which holds unrelated projects |

Not used: Neon Auth, Cloud Run IAM/OIDC, permission frameworks, other Neon products.

### Replaced; do not reintroduce

Older research and roadmaps may still show these.

- Single inspection agent (rejected; keep all three).
- Supabase (replaced by Neon); frontend on Cloud Run (replaced by Vercel).
- Automatic AI fallback, model routing, provider-selection UI, a fixed Qwen-VL commitment.
- Ten-minute pitch (now 2 minutes); the older three-day plan (use §7).

## 3. Team ownership and boundaries

Zayed's preferred split, **pending team confirmation**:

| Person | Owns |
| --- | --- |
| Zayed | Project and frontend initialization; then all three ADK agents: prompts, tools, coordination, provider configuration and AI tests |
| Rohmat | Application backend: FastAPI, API endpoints, Neon database, photo storage and application data |
| Finiko | Frontend development after the handoff |
| Rabab | Testing, evidence, demo, presentation and business validation; no application code |

The previous split had Rohmat on the agents and Zayed on backend, database and cloud. Confirm before implementation starts.

Shared items and folders (also pending team confirmation):

| Item | Owner |
| --- | --- |
| `frontend/` | Finiko after Zayed's handoff; uses generated TypeScript types |
| `backend/app/` | Rohmat: API, database, storage, application API schemas, TypeScript type generation |
| `backend/agents/` | Zayed: three agents, tools, prompts, provider configuration, AI output schemas, AI tests |
| `backend/pyproject.toml` | Rohmat; Zayed coordinates agent dependency changes with him |
| Initial setup, Vercel and Cloud Run deploys | Zayed, only after the relevant owner has verified their work |

**Rules**

- Zayed and Rohmat agree the agent-backend interface (§4) before parallel work.
- No overlapping file ownership. Coordinate changes to shared files; ask before editing another owner's files.
- Separate clones; give your coding agents these boundaries.
- **Frontend handoff:** Zayed verifies startup and build, publishes, and shares run steps. Finiko pulls, confirms startup, then owns `frontend/`.

## 4. Integration contracts (v1 approved)

- Pydantic models are the single source; frontend types are generated from FastAPI's OpenAPI output. Agreed example JSON may be used meanwhile.
- Change schemas only with the affected owners' agreement; add fields only when implementation or testing needs them.
- The backend assigns persistent IDs, verified actors and UTC timestamps. Agents only propose observations and actions.
- Provider responses stay in the backend; the frontend never parses them. Both providers must produce the same validated result.
- **Provisional:** coordinate details are finalized through implementation testing.

**Agent-backend interface (pending team confirmation):** one in-process Python call, `run_inspection(input) -> outcome`, async if ADK needs it, with Pydantic input and output. Agents return a validated candidate result plus actual execution events; they never touch the database or HTTP. The backend handles persistence, authentication and human actions.

**Analysis approach (Zayed's preference, pending team confirmation):**

- Vision always inspects for possible visible concerns, with approximate boxes where reliable; otherwise the location is marked unknown.
- When a menu has a reference tray photo, Vision also compares food components semantically (present, missing, different), not by exact visual matching. Without a reference, inspection works normally.
- Never claim precise portion weights, pathogen detection or confirmed food safety.
- Keep reference comparison lightweight; if it adds significant complexity or fails testing, keep detection only.

| Boundary | Input | Output |
| --- | --- | --- |
| Frontend → backend | Multipart upload: `batch_id`, photo, menu reference; optional `retake_of_photo_id`, linked finding IDs | One run result or a structured error |
| Orchestrator → Vision | Photo, inspection context, prior concern when retaking | Observations: concern/type, evidence box (provisional), explanation, uncertainty; image-quality issues; missing evidence |
| Orchestrator → Compliance/Research | Vision observations, menu, batch history, rule-table version | Per observation: rule/source references, level, evidence gaps, recommended action, actual tool references |
| Backend ↔ storage | Photo and run data, events, findings, human actions | Saved references or an explicit storage failure |
| Backend → activity view | Run reference | Ordered events plus current run state |

**Run result:** `run_id`, `batch_id`, `photo_id`, `state` (`running`, `completed`, `failed`), `outcome` only when completed (`no_visible_concern`, `review_required`, `retake_required`), `findings`, `uncertainty`, `next_action`, `error`. Each finding links photo/observation, box (provisional), level/type, explanation, verified rule/source or evidence gap, suggested action. The backend records provider, model and rule version.

**Error:** `code`, safe `message`, `stage`, `retryable`. Stages distinguish input, provider/agent, rule, validation, timeout and storage. A failed save is not a saved action.

**Coordinates (provisional):** image-relative `[x_min, y_min, x_max, y_max]`, normalized 0–1, validated in Python; a missing box stays explicit.

**Human actions:** each records finding or batch ID, action, required reason and evidence reference; the backend adds verified actor and time.

| Finding state | Rule |
| --- | --- |
| `open` | Default. AI re-analysis never clears it |
| `fixed` | Needs a correction note and retake evidence |
| `dismissed` | Needs a reason |

| Batch state | Rule |
| --- | --- |
| `in_review` | Default |
| `on_hold` | Placed or lifted by a supervisor, with a reason |
| `closed` | Only with no open findings and no active hold. Closing does not certify the food as safe |

**Activity events:** saved with each run as structured JSON in Neon and returned with the result. Shown in an expandable "Aktivitas AI" section below the result and with the run history. Human actions keep their own records and appear alongside.

- Fields: event/run IDs, per-run sequence, timestamp, step and optional parent step, agent/actor, kind/status, safe summary, photo/finding/rule/tool-call references, uncertainty/error.
- Record only actual agent, tool and application execution plus human actions. Never private reasoning, secrets or invented progress.
- Integration-test runs use simulated results recorded with provider `fixture` and labelled "Simulated" in the UI. Never present them as genuine ADK execution.
- Missing records show as incomplete. Failed retries keep earlier results. A separate events table may come later if needed.

## 5. Pending decisions and blockers

| Item | Needed | Who |
| --- | --- | --- |
| Team confirmation | Ownership and folders (§3), agent-backend interface and analysis approach (§4), first tasks (§1). Zayed coordinates | Team |
| Organizer requirements | Remaining seminar information; do not assume there are none | Zayed |
| Demo data | Staged photos labelled as test data; no claim of real kitchen validation | Rabab |
| Models/runtime | Exact Gemini model and location, OpenRouter model; image input, tools, structured output on Python 3.13 across all three agents; both providers on identical cases, including invalid output and tool failure; latency against §2 limits | Agent owner |
| Credit | Whether the $300 covers Vertex AI and Cloud Run; quotas, expiry, billing | Zayed |
| Neon | Provision the project; verify signed-link behaviour on the real bucket | Zayed, then backend owner |
| Vercel | Check the Hobby commit-author restriction once during deploy testing | Zayed |
| Activity mapping | Map actual ADK/tool events to the event fields | Agent and backend owners |
| Rules | Start with 5–8 source-linked rules, each marked verified, pending verification or demo assumption. Qualified review pending; checks never certify food as safe. Decide later whether retrieval is needed | Zayed, sources from Rabab |
| Organizers | Required stack, credits/quotas, final judging weights (25% Agentic AI is provisional), freeze-recording procedure | Team |
| Commercial | Payer, budget, willingness to pay, revenue model, costs. No customers or revenue yet; billing is outside the MVP | Rabab |

## 6. Git and deployment workflow

**Git:** direct to `main`, small working commits, one publisher at a time, no pull requests.

1. `git status`; with a clean tree, `git pull --ff-only`. Announce your task and files.
2. Check your change, read `git diff`, stage exact files, commit one logical change (e.g. `feat: add photo analysis`).
3. Announce publishing and wait for any current publisher. `git pull --no-rebase --no-edit`, check the combined result, `git push origin main`, announce completion.
4. On conflicts or failures, stop and coordinate with Zayed. No force-pushes, no discarded work.

Each developer checks their own change; Zayed checks integration and deployment.

| Target | How |
| --- | --- |
| Frontend | Vercel Git integration on the public repo, root `frontend/`, `main` deploys production, other branches preview. Zayed is sole owner and deploys manually (dashboard/CLI) if automatic deploys fail. No Pro plan or extra members |
| Backend | Manual `gcloud run deploy --source backend/` after checking `main`. Singapore, 300 s request timeout, scale to zero while building, one warm instance during judging. Deployer: Zayed (pending team confirmation, §3) |

**If behind schedule, defer:** RAG expansion, web search, extra agents or models, chart polish, extra screens, realtime. **Keep:** all three agents collaborating, deterministic tools, human review, actual execution records, manual provider configuration, and one tested provider working.

## 7. Official deadlines (WIB)

| When | What |
| --- | --- |
| 21 Oct 2026, 13:00 | Implementation window opens |
| 22 Oct, 13:00 | Freeze code, prompts, provider/model settings, workflow configuration and result-affecting test data; record the frozen commit or tag |
| 22 Oct, 15:00 | Submit deliverables and the selection deck (2-minute pitch) |
| 23 Oct, 08:15 | Finalists submit final deck and backup demo of the same frozen version |

After the freeze, documentation and presentation work may continue. Execution fixes need technical PIC approval and a change record; no new features or capabilities.
