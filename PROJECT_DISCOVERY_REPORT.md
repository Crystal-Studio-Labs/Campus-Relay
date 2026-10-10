# PROJECT DISCOVERY REPORT — Campus Relay

**Prepared for:** BPUT Hackathon 2026, Problem Statement 07 (Fretbox) — 8-slide presentation
**Prepared on:** 2026-10-09
**Scope of this document:** read-only inspection of the repository at `D:\Projects\Campus-Relay` to document its *actual* state. No application source code was modified. This is not the presentation prompt and no `.pptx` was produced.

### How this report was produced (evidence method)

| Activity | Command / method | Result |
| :--- | :--- | :--- |
| Full backend test suite | `python -m app.seed.seed_data` then `python -m pytest` (in `backend/`) | **exit 0 — 145 passed** (the reseed is a precondition; see §13 defect 2) |
| TypeScript check | `npx tsc --noEmit` (in `frontend/`) | **exit 0** |
| Production build | `npm run build` (in `frontend/`) | **exit 0** (PWA service worker emitted) |
| Migrations | `alembic upgrade head` | **exit 0** (at head `0006_feedback_requests`) |
| Repository-supplied demo script | `python -m scripts.e2e_demo --base-url http://127.0.0.1:8000` | **exit 2 — FAILS at sign-in (HTTP 401)**, see §13 |
| Schema vs models | SQLAlchemy `inspect()` against live PostgreSQL | 60/60 tables match, no drift |
| Asset inspection | PIL `Image.open` on every image asset | real raster files, dimensions below |
| Live UI inspection | headless Chrome against `localhost:5173`, real logins | used for the screens specifically named in §9 |
| Static counts | `ripgrep`/`find` over the tree | numbers in §4 |

### Evidence legend (used throughout)

- **[V]** **Verified** — I executed or directly observed this in the run above, or the file/line exists as cited.
- **[I]** **Inferred** — a reasoned conclusion from code structure, not directly executed.
- **[P]** **Proposed** — my recommendation; **not** existing capability.
- **[?]** **Missing / unverified** — no evidence in the repository. Team, mentor and external-statistic gaps are marked **[INFORMATION REQUIRED]** or **[VERIFIED STATISTIC REQUIRED]**.

---

## 1. Executive summary

**Campus Relay** is a working, substantial software system — not a slide deck with a prototype. It is a single "operating layer" for day-to-day college operations, built around one universal *case* engine with policy, workflow, approval, SLA and audit stages, plus offline-first PWA clients, a gate-pass desk, notice broadcasting, campus services (leave, library, fees, clearance, career, HR, feedback) and academically-scoped attendance/marks.

**Verified scale of the implementation** [V]:

| Metric | Value |
| :--- | :--- |
| Backend Python (lines, `backend/app`) | ~22,857 |
| Frontend TypeScript/TSX/CSS (lines, `frontend/src`) | ~30,847 |
| API route handlers (`@router.get/post/...`) | 185 across 24 API modules |
| Database tables | 60 (schema matches models exactly) |
| Alembic migrations | 6 (`0001` … `0006`) |
| Backend service modules | 24 (incl. 6 agent files) |
| Frontend routes | 51 `<Route>` entries, 40 page components, 13 navigation modules |
| Permissions in catalogue | 71 |
| UI strings | 543 keys **each** in English, Hindi and Odia (parity) |
| Backend test files / tests | 18 files, **145 tests collected** (143 `def test_` functions, one parametrised ×3), 145 passing |
| Git | 28 commits on `main`; **85 modified + 52 untracked files uncommitted** |

**The single most important finding for the presentation:** the working tree is far ahead of what is committed. `main`'s last commit is `2026-09-28`; the newer domain modules (academics, fees, leave, library, clearance, career, HRMS, gate, security, engagement) and most of their tests and frontend pages are **untracked** [V]. If a judge clones the repository, they do **not** get the product described in the README. This must be resolved before the presentation.

**Two concrete defects found** [V]:
1. `backend/scripts/e2e_demo.py` — the repository's own flagship "end-to-end verification suite" (and `run.bat` menu option `[T]`) **fails at sign-in** because it still authenticates as `student2@`, `security@` and `helpdesk@campusrelay.demo`, accounts removed by the role consolidation.
2. The README states "There are **four roles**" while the code defines **three** (`MANAGEMENT`, `TEACHER`, `STUDENT`).

**Feasibility:** the core is already built, so a 36-hour window is not a from-scratch build — it is a hardening, demo-proofing and deployment-verification window (§10) [P]. Presenting it as a 36-hour greenfield build would not survive jury questioning.

---

## 2. Confirmed project identity and problem statement

| Field | Value | Status |
| :--- | :--- | :--- |
| Project name | **Campus Relay** | [V] `README.md:84`, `frontend/package.json` (`campus-relay-frontend`) |
| Tagline | "A resilient operating layer for everyday campus operations." | [V] `README.md`, `config/institution.json` |
| Hackathon | **BPUT Hackathon 2026** | [V] `docs/hackathon/README.md`, `docs/hackathon/prompt.txt:3` |
| Problem statement | **Problem Statement 07 (Fretbox)** | [V] `docs/hackathon/README.md`, `docs/hackathon/prompt.txt:14-16` |
| Official brief | `docs/hackathon/Problem_Statement_7.pdf` present | [V] file exists; **its text was not extracted in this pass** [?, to confirm exact official wording] |
| Repository | `https://github.com/Crystal-Studio-Labs/Campus-Relay` | [V] `git remote -v`; visibility/public status **[?]** |
| Licence | MIT, "Copyright (c) 2026 CRYSTAL STUDIO LABS" | [V] `LICENSE:1-3` |
| Team name | **Crystal Studio Labs** | [V] `docs/hackathon/README.md`, `docs/script/names.txt` |
| Team members | 6 named participants (roles + slide assignments) | [V] docs — see §11; **name spelling conflict** flagged there |
| Mentors | — | **[INFORMATION REQUIRED]** |
| Team's institution / college | — | **[INFORMATION REQUIRED]** (the `config/institution.json` tenant "Crystal Institute of Technology" is the *demo tenant*, not the team's college) |
| Contact published | `connect.crystalstudio@gmail.com` | [V] `docs/hackathon/README.md`, `README.md:665` |

**Problem the project solves.** [V, from README + code] College operations are fragmented: maintenance by paper register, notices scattered across unmonitored messaging groups, gate passes on paper slips, and students without reliable connectivity or devices left out. Campus Relay routes every such operation through one case engine with policy validation, workflow steps, approvals, SLA targets, notifications and an append-only audit trail, with an offline-capable PWA plus kiosk/assisted-desk fallbacks.

The PS07 focus areas documented in `docs/hackathon/README.md` are: (1) hostel & facility maintenance, (2) gate security & curfew enforcement, (3) official broadcasts & circulars, (4) local-first offline resilience. All four have corresponding code (§4) [V].

---

## 3. Problem and stakeholder analysis

**Stakeholders present in the code** (role and scope model) [V]:

| Actor | What they do in this system | Evidence |
| :--- | :--- | :--- |
| Students | File requests, attendance/marks/timetable/fees views, leave, clearance, library, feedback, activities, careers, notices; verify resolutions | `backend/app/core/permissions.py`, `frontend/src/pages/student/*` |
| Teachers / faculty | Own subjects and classes, mark attendance, enter marks, departmental case queue, approvals in scope, placements | `permissions.py` (`TEACHER`), `frontend/src/pages/staff/*` |
| Management (registrar / warden / gate / helpdesk / technicians — one role, narrowed by data scope) | Command centre, users and configuration, hostel and mess, fees, certificates, clearance, library, leave, gate, notices, HR/payroll, kiosk | `permissions.py` (`MANAGEMENT` + `_ALL_SERVICES`), `frontend/src/pages/admin/*` |
| Kiosk user (no smartphone) | Self-service by roll number at a touch kiosk; helpdesk operator can file on a student's behalf | `frontend/src/pages/kiosk/Kiosk.tsx`, `frontend/src/lib/kioskSection.ts`, `case:create_on_behalf` |
| External verifier | Anonymous verification of an issued document by code | `backend/app/api/v1/system.py:62` `GET /documents/verify/{verification_code}` |

**Current gaps the system targets** [I — the repo asserts these; no external sources are cited]:

- No unified request lifecycle across departments; no SLA ownership; no audit trail.
- Physical paper at the gate and in registers; no anti-passback control.
- Notices with no proof of receipt or acknowledgement.
- Connectivity dead zones in hostels; device inequality for students without smartphones.
- Documents (bonafide, etc.) that cannot be verified by the recipient.

**Supporting statistic for the "Problem" slide: [VERIFIED STATISTIC REQUIRED].**
The repository contains quantified claims (e.g. vendor pricing "₹100–₹300 per student annually", "resolution time dropped from 9 days to under 24 hours", "sub-150 ms scans") but **no source, dataset or benchmark is cited anywhere in the repository**, and I found no measurement artefact backing them. They are documentation assertions, not verified results. Do not present them as findings without a source; §14 recommends how to handle this slide.

---

## 4. Feature inventory with implementation status

Legend: **Done** = implemented and exercised by tests or by me today · **Partial** = implemented with a documented gap or unconfigured dependency · **Config** = built but inert without credentials · **Missing** = not found.

### 4.1 Core case engine and operations — **Done** [V]

| Feature | Evidence |
| :--- | :--- |
| Universal case model with state machine, transitions, comments, attachments | `backend/app/models/case.py`, `backend/app/services/case_engine.py`, `backend/app/api/v1/cases.py`, `backend/tests/test_case_engine.py` |
| Policy engine (location validity, duplicate detection, eligibility) | `backend/app/services/policy.py` |
| Routing + assignment to department/technician | `backend/app/services/routing.py`, `backend/app/services/agents/routing_agent.py` |
| SLA targets, at-risk ratio, breach sweep, escalation | `backend/app/services/sla.py`, `backend/tests/test_agents_tenant_sla.py` |
| Workflow definitions and steps | `backend/app/services/workflow.py`, `backend/app/models/workflow.py` |
| Approvals | `backend/app/models/workflow.py` (`CaseApproval`), `frontend/src/pages/admin/Approvals.tsx` |
| Append-only audit trail enforced in ORM **and** by PostgreSQL triggers | `backend/app/services/audit.py`, `backend/app/models/immutability.py`, `backend/alembic/versions/0002_append_only_guards.py` (`CREATE TRIGGER trg_*_append_only`) |
| Requester verification guard (student closes, not staff alone) | `case_engine.py`, README workflow A, `test_case_engine.py` |
| Analytics: ageing buckets, recurring issues, resolution times, staff workload | `backend/app/services/analytics.py`, `backend/app/api/v1/admin.py`, `frontend/src/pages/admin/Analytics.tsx` |

### 4.2 Access, identity, configuration — **Done** [V]

| Feature | Evidence |
| :--- | :--- |
| JWT auth (PyJWT), bcrypt password hashing, token in `localStorage` under `campusrelay.token` | `backend/app/core/security.py`, `backend/app/api/v1/auth.py`, `frontend/src/lib/api.ts:10` |
| 71-permission RBAC catalogue, materialised as `permissions` + `role_permissions` rows | `backend/app/core/permissions.py`, `models/identity.py` |
| Server-side data scoping (warden sees their hostels; teacher their subjects) | `backend/app/services/scoping.py` |
| Login attempt rate limiting, request rate limits | `backend/app/core/ratelimit.py`, `backend/app/api/v1/auth.py:31` |
| Per-institution config file → live API, no rebuild (`GET /institution`, reload endpoint) | `config/institution.json`, `backend/app/core/institution.py`, `frontend/src/pages/admin/InstitutionSetup.tsx` |
| Vocabulary, skins, themes, feature flags, accessibility guardrails in config | `config/institution.json` (verified: `wcag_level: AA`, `min_touch_target_px: 46`, `status_always_carries_word: true`) |

### 4.3 Campus services — **Done** [V]

Leave (+ gate pass issuance), clearance/no-dues, library circulation, fees & payments, career/placements, HRMS & payslips, feedback (with the new *ask* flow), activities — one API module, one service surface and one frontend page set each:

`backend/app/api/v1/{leave,clearance,library,fees,career,hrms,engagement}.py`, `backend/app/models/{leave,clearance,library,finance,career,hrms,engagement}.py`, `frontend/src/pages/campus/*`, `frontend/src/pages/admin/Fees.tsx`, with tests `test_{leave,clearance,library,fees,career,hrms,engagement}.py`.

### 4.4 Academics — **Done** [V]

Attendance (including a bulk roll-number paste with a colour-coded register), marks entry, timetables, subject ownership re-checked server-side: `backend/app/api/v1/academics.py`, `frontend/src/pages/staff/{Attendance,Marks,Timetable}.tsx`, `frontend/src/pages/student/{Attendance,Marks,Timetable}.tsx`, `test_{academics,marks,timetable}.py`.

### 4.5 Notices and notifications — **Done / Partial** [V]

| Feature | Status |
| :--- | :--- |
| Targeted notices with audience matching (hostel/branch/year/batch/role) | **Done** — `backend/app/api/v1/notices.py`, `backend/app/services/notices.py`, `models/comms.py`, `frontend/src/pages/admin/NoticeStudio.tsx` |
| Delivery lifecycle read/acknowledged tracking + analytics + public share link | **Done** — `notices.py`, `frontend/src/pages/Notices.tsx`, `test_notices_notifications.py` |
| In-app notifications | **Done** — stored in Postgres |
| Transactional outbox + background worker with retry/backoff | **Done** — `backend/app/services/delivery.py`; I observed the worker start in the live log: `delivery worker started (poll=10.0s, batch=25)` |
| Telegram adapter | **Config** — real adapter, inert without `TELEGRAM_BOT_TOKEN` |
| WhatsApp (Meta Cloud API) adapter | **Config** — implements the shape; inert without number id + token + approved template |
| Push / SMS / email | **Missing provider** — adapter slots that honestly report "not configured" |

*Honesty note:* the README states unconfigured channels "claim nothing"; the `/meta` endpoint reports configuration state. This is a deliberate design position, not an unfinished feature [V, code comment in `provider.py`/`notifications.py` style].

### 4.6 Offline-first PWA — **Done** [V]

| Feature | Evidence |
| :--- | :--- |
| Installable PWA, manifest, icons, screenshots, shortcuts | `frontend/vite.config.ts` (`VitePWA`, `injectManifest`) |
| Handwritten service worker with offline fallback document | `frontend/src/sw.ts`, `frontend/public/offline.html` |
| IndexedDB stores + client outbox + cached reads | `frontend/src/lib/db.ts`, `frontend/src/lib/offline.ts` |
| Sync engine, network probe, replay, stale-conflict handling | `frontend/src/lib/sync.ts`, `backend/app/api/v1/sync.py`, `backend/app/services/sync.py`, `backend/app/models/sync.py` |
| Server-side idempotency (replayed operation must not duplicate) | `models/sync.py`, `backend/tests/test_sync_idempotency.py` |
| Offline queue visibility in UI | `frontend/src/components/OfflineBar.tsx`, `frontend/src/pages/SyncCentre.tsx` |

### 4.7 Devices, accessibility, localisation — **Done** [V]

Multi-device ergonomics (desktop command centre, mobile PWA, touch kiosk), trilingual UI (en/hi/or at 543 keys each with English fallback), reduced-motion handling, skip-to-content, ARIA roles (`role="status"`/`role="alert"`) and a config-enforced WCAG-AA guardrail set: `frontend/src/layouts/{AppShell,KioskShell}.tsx`, `frontend/src/lib/i18n.ts`, `frontend/src/styles/*`, `config/institution.json`.

### 4.8 AI agents — **Done (deterministic by default)** [V]

Four agents exist as code: `intake` (classification/priority), `routing` (assignment explanation), `operations` (briefing/findings), `assistant` (tool-calling student/operator assistant) in `backend/app/services/agents/*.py`, exposed via `backend/app/api/v1/agents.py` and `frontend/src/pages/AssistantPage.tsx`.

The provider abstraction (`agents/provider.py`) defaults to **`RulesProvider` — no model, no network, no API key**; an `OpenAICompatibleProvider` exists but is only used when `AGENT_PROVIDER=openai_compatible` with base URL + key + model configured (`render.yaml` ships it empty). So: **the agents run deterministically in the judge's environment**; no LLM, no training, no ML model is present in the repository [V]. Do not present this as an ML system.

### 4.9 Demo/login surface — **Done**, with **three dead accounts referenced by tooling** [V]

Live logins today: `student@`, `teacher@`, `admin@`, `warden@`, `technician@` → 200. `student2@`, `security@`, `helpdesk@` → **401 (no such account)**.

---

## 5. Main end-to-end workflows (evidence-backed)

### Workflow 1 — Hostel maintenance, QR intake → requester verification [V]

1. **Initiator:** student. **Action:** scans the room/location QR or picks a service in the request form.
2. **Frontend:** `frontend/src/pages/student/Report.tsx` → `frontend/src/components/ScanTarget.tsx` (camera/QR), submits via `frontend/src/lib/api.ts` (`POST /api/v1/cases`).
3. **Backend:** `backend/app/api/v1/cases.py` → `backend/app/services/case_engine.py`, with `agents/intake.py` classifying urgency/category and `policy.py` validating the location and de-duplicating.
4. **Business logic:** `routing.py` picks a department/technician (explained by `agents/routing_agent.py`); `sla.py` starts the clock; `audit.py` appends the events.
5. **Database:** `cases`, `case_events`, `case_comments`, `case_approvals`, `sla_rules` (`backend/app/models/case.py`, `workflow.py`); immutability triggers from `0002_append_only_guards.py`.
6. **Response/notification:** API returns the case brief; `services/notifications.py` + `services/delivery.py` enqueue in-app (and optionally Telegram/WhatsApp) notifications.
7. **Closure:** technician resolves with evidence; the student verifies — otherwise the case reopens (`case_engine.py`; asserted in `backend/tests/test_case_engine.py`). **Fully implemented** [V].

### Workflow 2 — Leave → warden approval → digital gate pass → anti-passback exit/return [V]

1. **Initiator:** hostel student. **Action:** files a leave request with dates.
2. **Frontend:** `frontend/src/pages/campus/Leave.tsx` → `POST /api/v1/leave`; approvals surfaced in the same file's desk view.
3. **Backend:** `backend/app/api/v1/leave.py` + `policy.py` (date-window validation → `test_leave.py` covers backward dates), approval by management (warden scope).
4. **Gate:** pass generated; `backend/app/api/v1/gate.py` → `backend/app/services/gate.py` verifies the pass and records EXIT/ENTRY movements. Anti-passback is real, with distinct refusal reasons in code: `PASS_ALREADY_EXITED`, `PASS_ALREADY_USED`, `PASS_ALREADY_RETURNED` (`services/gate.py:97-128`).
5. **Database:** `leave_applications`, gate pass and movement tables (`models/leave.py`, `models/security.py`), all movements audited.
6. **Frontend desk:** `frontend/src/pages/security/GateDesk.tsx`.
7. **Outcome:** duplicate exit is refused; verified return closes the leave case. **Fully implemented** [V]; end-to-end behaviour also described as a scripted step in `backend/scripts/e2e_demo.py` (**but that script currently cannot log in — §13**).

### Workflow 3 — Offline outbox → idempotent replay [V]

1. **Initiator:** any user whose connection drops (hostel dead zone).
2. **Frontend:** `lib/offline.ts` writes the mutation to IndexedDB with a client idempotency key; `components/OfflineBar.tsx` shows "pending"; `lib/sync.ts` probes connectivity.
3. **Backend:** `backend/app/api/v1/sync.py` → `backend/app/services/sync.py` → `backend/app/models/sync.py` (`sync_operations`).
4. **Database:** first-seen operations execute in a transaction; replays return the **recorded prior result** rather than duplicating; stale mutations return a conflict for the client to reconcile.
5. **Evidence:** `backend/tests/test_sync_idempotency.py` asserts replay does not duplicate. **Fully implemented** [V].

### Workflow 4 — Verifiable document issuance and public verification [V]

Student requests a certificate → policy validates dues/eligibility (`policy.py`) → approval → `backend/app/services/documents.py` renders a PDF with ReportLab + a QR/serial (`reportlab`, `qrcode` in `backend/requirements.txt`) → student downloads → an external authority verifies anonymously at `GET /api/v1/documents/verify/{verification_code}` (`backend/app/api/v1/system.py:62-63`) which reveals validity without exposing academic or financial detail. **Fully implemented** [V].

### Workflow 5 — Targeted notice studio with delivery/acknowledgement analytics [V]

Management composes a notice, targets granular audiences (hostel/branch/year/batch/role) → `backend/app/api/v1/notices.py` matches audience at read time → recipients see it in `frontend/src/pages/Notices.tsx`; read/acknowledged events are recorded and aggregated for the studio's analytics; an optional sanitised public link can be shared. **Fully implemented** [V] (`backend/app/services/notices.py`, `test_notices_notifications.py`).

### Workflow 6 — Answering a request for feedback [V] *(built and verified today)*

Management asks a group for feedback (`POST /api/v1/feedback/requests`, audience teachers and/or students) → teachers/students see it on `/feedback` and answer through the same form with `request_id` attached → the office sees `answered / asked` per request. Backend: `backend/app/api/v1/engagement.py`, `backend/app/models/engagement.py`, migration `0006_feedback_requests.py`; frontend: `frontend/src/pages/campus/Engagement.tsx`; tests: `backend/tests/test_engagement.py` (17 pass). I drove this through the live UI for management, teacher and student roles. **Fully implemented** [V].

---

## 6. Actual technology stack and architecture

### 6.1 Stack (all [V] from manifests/config)

| Layer | Technology | Evidence |
| :--- | :--- | :--- |
| Frontend | React 18, TypeScript 5, React Router 6, Vite 5, lucide-react, html2canvas, jsPDF | `frontend/package.json` |
| PWA | `vite-plugin-pwa` (injectManifest), Workbox precaching/routing/strategies, handwritten SW | `frontend/package.json`, `frontend/src/sw.ts`, `frontend/vite.config.ts` |
| Offline data | IndexedDB via a native promised wrapper | `frontend/src/lib/db.ts`, `lib/offline.ts` |
| Styling | CSS custom-property token layers (tokens → base → components → app), skin registry, no CSS framework | `frontend/src/styles/*.css`, `frontend/src/theme/registry.ts` |
| Backend | FastAPI, Uvicorn, Pydantic v2 + pydantic-settings | `backend/requirements.txt` |
| ORM / DB | SQLAlchemy 2.0, PostgreSQL 16, psycopg 3 (binary) | `backend/requirements.txt`, `docker-compose.yml` |
| Migrations | Alembic (6 revisions) | `backend/alembic/versions/` |
| Auth | PyJWT (HS256, 720-minute tokens), bcrypt | `backend/app/core/security.py`, `core/config.py` |
| Documents | ReportLab (PDF), qrcode[pil] | `backend/requirements.txt`, `services/documents.py` |
| Tests | pytest + httpx/TestClient, pytest-asyncio | `backend/requirements.txt`, `backend/pytest.ini` |
| CI | GitHub Actions: Postgres 16 service → migrate → seed → pytest; frontend `npm ci` → typecheck → build | `.github/workflows/ci.yml` |
| Local run | Windows batch launchers (`run.bat` master menu, `backend.bat`, `frontend.bat`, `stop.bat`, `config.bat`) + Docker Compose for Postgres | root `*.bat`, `docker-compose.yml` |
| Hosted deploy | Render blueprint (API, `rootDir: backend`, migrations + bootstrap on deploy), frontend intended for Vercel, DB on Supabase | `render.yaml`, `docs/deployment/{DEPLOYMENT,SUPABASE}.md`, `supabase/schema.sql` |

### 6.2 Data flow, in the sequence requested

```
USER INPUT
  Student taps a QR / fills a form / acknowledges a notice / scans at the gate
  (frontend/src/pages/**; kiosk: frontend/src/pages/kiosk/Kiosk.tsx)
        |
        v
FRONTEND (React 18 + TS, PWA)
  - session + permission mirror: frontend/src/state/session.tsx
  - API client, auth header, idempotency key: frontend/src/lib/api.ts
  - offline decision: if no network -> IndexedDB outbox (lib/offline.ts, lib/db.ts)
        |
        v
BACKEND / API (FastAPI)
  - edge: app/main.py (middleware: CORS, rate limit, request context)
  - auth + RBAC dependency: app/api/deps.py  (CurrentUser, require_permission)
  - routes: app/api/v1/*.py  (185 handlers, 24 modules, aggregated in router.py)
        |
        v
BUSINESS LOGIC (deterministic services)
  policy.py -> workflow.py -> routing.py -> sla.py -> case_engine.py
  agents: intake / routing / operations / assistant  (rules provider by default)
  documents.py (PDF + QR), notices.py, notifications.py, delivery.py (outbox worker)
        |
        v
DATABASE (PostgreSQL 16 via SQLAlchemy 2.0)
  models/*.py (60 tables) + alembic (6 revisions) + append-only triggers (0002)
  scoping.py narrows every query by campus/role scope
        |
        v
RESPONSE / OUTPUT
  - JSON to the PWA (updated case, gate log, notice, metrics)
  - notification rows + outbox deliveries (in-app always; Telegram/WhatsApp if configured)
  - downloadable verifiable PDF (ReportLab) + public verify endpoint
```

### 6.3 Implemented vs planned integrations

| Integration | Status |
| :--- | :--- |
| PostgreSQL (local Docker or hosted) | **Implemented and used** [V] |
| Telegram messaging | **Implemented adapter, unconfigured by default** [V] |
| WhatsApp Cloud API | **Implemented adapter, unconfigured (needs WABA credentials + approved template)** [V] |
| Web push / SMS / email | **Not implemented (slots report unconfigured)** [V] |
| OpenAI-compatible LLM | **Implemented adapter, off by default** (`AGENT_PROVIDER=rules`) [V] |
| Render / Vercel / Supabase hosting | **Configured, deployment status unverified** (§9) [V config / ? live] |

---

## 7. Innovation and feasibility assessment

### 7.1 What is genuinely useful here [I, grounded in code]

- One case engine with **policy → workflow → approval → SLA → audit** means a new campus service is configuration, not a new application (`services/case_engine.py`, `catalog.py`, `admin/services`).
- **Requester verification** (staff cannot unilaterally close) plus **append-only audit enforced by DB triggers** is a stronger accountability stance than a CRUD ticketing form.
- **Honest offline**: a real outbox with idempotent replay and conflict reporting, not a cached read-only shell.
- **No-smartphone path**: kiosk + assisted helpdesk exist as first-class routes, which most campus portals omit.
- **Institution configurability**: `config/institution.json` drives identity, vocabulary, skins, feature flags and accessibility guardrails through a live API endpoint with no rebuild.

### 7.2 Differentiators — stated carefully

The README's comparison table (campus silos vs. generic campus tools vs. Campus Relay) is a **positioning claim** [I], not a benchmark. What can be said defensibly on stage: *the combination* of (a) one configurable case engine, (b) DB-triggered immutability, (c) requester verification, (d) offline outbox with idempotent replay, and (e) a kiosk/helpdesk path in a single deployable is unusual in the artefacts I inspected. **[P]** If the slide needs a sharper claim, run the repo's own comparison against one named competitor and cite it — do not assert "unique".

### 7.3 Working vs remaining

| Already working (verified today) | Needs work |
| :--- | :--- |
| 145 backend tests green (after a demo reseed); TS check and production build green; migrations at head | `scripts/e2e_demo.py` broken logins (§13) → `run.bat [T]` unusable |
| Case engine, SLA, workflow, approvals, audit, scoping | 85 modified + 52 untracked files uncommitted — judges cloning `main` get a smaller product |
| Gate desk with anti-passback; leave → pass → return | No verified live deployment (§9) |
| Notices with read/acknowledge tracking + analytics | Telegram/WhatsApp inert without credentials (by design; say so) |
| Offline outbox + idempotency tests | No automated frontend tests; UI verified only by manual/headless-chrome inspection |
| Trilingual UI at full key parity | `docs` vs code drift (roles count, CSV template count, slide counts, stale doc paths) |
| Feedback ask/answer flow (built today) | External stats for the "Problem" slide absent |

### 7.4 Feasibility within a 36-hour hackathon

- As a **from-scratch** build: **not plausible** — ~53k lines across 60 tables, 185 endpoints and 145 tests. [I]
- As a **36-hour window on an existing codebase**: **plausible and honest** — the window is for the defect fixes, commit hygiene, deployment verification, screenshot capture and demo rehearsal listed in §10. [P]

### 7.5 Free / open-source tools in use [V]

React, TypeScript, Vite, vite-plugin-pwa, Workbox, lucide-react, html2canvas, jsPDF, FastAPI, Uvicorn, SQLAlchemy, Alembic, psycopg, Pydantic, PyJWT, bcrypt, ReportLab, qrcode, pytest, httpx; PostgreSQL 16 and Redis (optional, off by default in `docker-compose.yml`); GitHub Actions. The project itself is MIT-licensed (`LICENSE`).

### 7.6 Scaling, security, privacy, reliability, accessibility — risks

| Area | Assessment |
| :--- | :--- |
| Security | JWT + bcrypt + per-endpoint RBAC + rate limiting + audit trail; token stored in `localStorage` (XSS-exposed by nature — a documented trade-off [I]); no penetration test performed; no MFA [V absent]. |
| Privacy | QR contains location metadata only per README [V docs]; anonymous feedback still records the author for follow-up (deliberate, documented in `models/engagement.py`); PII scope not formally audited [?]. |
| Reliability | PostgreSQL-backed, append-only triggers, outbox with retry/backoff, offline queue; in-process scheduler/worker means a single API instance is the scaling unit [V]. |
| Scaling | Pool sizes and Supabase connection caps are configurable (`core/config.py`); no load test exists, so **no throughput claim can be made** [?]. |
| Accessibility | WCAG-AA guardrails enforced in config (contrast 4.5, 46px targets, status always carries a word), reduced-motion rules, skip-link, ARIA roles [V]; no assistive-technology audit has been recorded [?]. |

---

## 8. Impact opportunities and measurable evaluation ideas

**Intended beneficiaries** [I, from role model]: students (especially those without smartphones/connectivity), hostel wardens and maintenance staff, faculty, the registrar/administration, gate security, and external document verifiers.

**What can be measured honestly** — all currently **unmeasured** in the repo; these are **[P] proposals**, framed so a jury can accept them as goals:

| Claim to avoid | Honest replacement |
| :--- | :--- |
| "9 days → 24 hours resolution" | "Report **median time-to-close by SLA band** from `case_events` for the demo dataset; target: every seeded case closes within its configured SLA." |
| "₹3L–₹9L/year saved" | "Cost comparison uses the college's own current spend; **no source cited in-repo** — supply the figure or drop the slide." |
| "Sub-150 ms gate scan" | "Measure `POST /gate/verify` latency locally over N runs and report the distribution we actually observe." |
| "100% tamper-proof audit" | "Audit rows are append-only by DB trigger (`0002_append_only_guards.py`); attempted UPDATE/DELETE is rejected — demonstrable live." |
| "Handles X students" | Do not state a number; state the configuration knobs (pool size, worker poll) and that no load test has been run. |

**SDG alignment (only if justified):** SDG 4 (quality education) via academic services and SDG 9 (industry, innovation and infrastructure) via campus digital infrastructure are defensible mappings [P]; SDG 11 (sustainable cities/communities) is arguable. **Do not** claim measured SDG impact — alignment is a mapping, not a result.

---

## 9. Prototype, screenshots, deployment and demo evidence

### 9.1 Real assets present in the repository [V, dimensions measured with PIL]

| Item | Path | Actual format/size |
| :--- | :--- | :--- |
| Wide app screenshot (PWA install art) | `frontend/public/screenshots/app-wide.png` | PNG **1280×720** — matches the manifest's declared size |
| Narrow app screenshot | `frontend/public/screenshots/app-narrow.png` | PNG **720×1280** — matches |
| Social preview | `frontend/public/social-preview.png` | **JPEG** coded 1376×768 (note: `.png` extension on JPEG data) |
| Architecture graphic | `frontend/public/assets/campus_architecture_graphic.jpg` | JPEG 1376×768 |
| App icons | `docs/assets/app-icon.png`, `app-icon.jpg` | 1024×1024 |
| PWA icons | `frontend/public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon}.png` | present |
| Offline fallback page | `frontend/public/offline.html` | present |
| Diagrams | Mermaid blocks embedded in `README.md` and `docs/**/*.md` (architecture, workflows, notification system, offline sync, data model) | source, renderable |
| Demo runbook | `docs/guides/demo-script.md` (12-minute walkthrough), `backend/scripts/e2e_demo.py` | present |

I inspected the PNG/JPEG headers and dimensions only — **I cannot see the picture content from here**, so these are "verified to exist at these dimensions", not "verified to depict the dashboard".

### 9.2 Not present [?, to obtain]

- **No verified live deployment URL.** The deployment docs contain `https://campus-relay.vercel.app` and `https://campus-relay-api.onrender.com` only as *examples* ("e.g.") in `docs/deployment/DEPLOYMENT.md:76,87`, `docs/deployment/SUPABASE.md:93`, `.env.example:38,92`. A bare `GET https://campus-relay.vercel.app` answered 200, but nothing ties that hostname to this project — **do not present it as our deployment**. `campus-relay-api.onrender.com` did not answer (`000`).
- No wireframes, Figma/Sketch/XD files.
- No demo video file in the repository.
- No dashboard screenshots beyond the two PWA screenshots above.
- No benchmark, load-test or latency measurement artefact.

### 9.3 Live UI evidence gathered today (headless Chrome, real sessions) [V]

| Screen | Role | Observation |
| :--- | :--- | :--- |
| `/directory` → People | management | 8 users listed; role filter now offers All/Student/Teacher/Management; filtering "Student" → 1 person; Places reference data populates |
| `/feedback/inbox` | management | "Ask for feedback" composer present; "Requests you have sent" lists both seeded asks with `answered/asked`; nav shows **Feedback inbox** but not the give-feedback page |
| `/feedback` | teacher | Request addressed to faculty appears; Answer pre-fills the form; submission returns "Thank you — your feedback has been recorded."; the new row is linked to the request |
| `/feedback` | student | The mess request shows **Answered** (no Answer button) — correct for a seeded reply |
| `/attendance/mark` | teacher | Bulk-paste plus colour-coded register, stat tiles and Save render with a real 9-student roster |
| `/` (nearest route to a screen) | management | No horizontal overflow at 1440 px on the pages measured (0 px) |

*Caveat:* these were DOM/state checks, not visual review; screenshots still need to be captured by a human for the deck.

---

## 10. Proposed 36-hour execution plan (proposal — not existing capability)

Assumption to state on the slide: the core exists; the 36 hours are hardening and demo-proofing. **Proposed** milestones, sized against the defects actually found:

| Window | Milestone | Done-when (verifiable) |
| :--- | :--- | :--- |
| H0–1 | Freeze scope; branch `demo-ready` | Clean worktree policy agreed |
| H1–3 | **Commit the working tree** in reviewable slices; tag `v-demo` | `git status` clean; a fresh clone runs the app |
| H3–5 | **Repair `scripts/e2e_demo.py`** to the three-role model (replace `student2@`/`security@`/`helpdesk@` with real accounts or multi-role logins) | `python -m scripts.e2e_demo` exits 0; `run.bat [T]` works |
| H5–7 | Fix documentation drift (roles count, CSV template count, stale paths) | `grep` shows no stale statements |
| H7–12 | Deployment: Supabase DB + Render API + Vercel frontend, seed demo campus | `GET /api/v1/health` 200 on the live URL |
| H12–15 | Register that URL in `CORS_ORIGINS` and verify login from the deployed frontend | Live login as each demo account succeeds |
| H15–20 | Capture the deck's screenshots from the live instance (desktop + mobile + kiosk) | Real images, no mockups |
| H20–24 | Rehearse the 12-minute `docs/guides/demo-script.md` path against the live instance | Timed run; every step works twice in a row |
| H24–28 | Reset-and-rehearse loop: `python -m app.seed.seed_data` then full demo | Reproducible between jury rounds |
| H28–32 | Slide assembly from §14; every number traced to a file or a live measurement | No unsourced statistic remains |
| H32–35 | Dry run with a hostile-question list (roles, offline, "is it deployed?", "who uses it?") | Answers rehearsed from evidence |
| H35–36 | Freeze, tag, back up demo data, publish the demo URL | Freeze declared |

**Constraint to respect:** this repository's own instructions forbid presenting planned work as done (root `ppt.txt`: "Do NOT invent components, statistics, screenshots, or claims that are not provable from the repository").

---

## 11. Verified team information and missing details

**From `docs/hackathon/README.md` and `docs/script/names.txt`** [V — documented, not independently verifiable by me]:

| # | Name | Documented role | Slides assigned (per `names.txt`) |
| :-- | :--- | :--- | :--- |
| 1 | Shuvransu Sekhar Sahoo | Lead Systems Architect & Orchestration | 1, 2, 14, 15 |
| 2 | Snehal Kumar Moharana | Backend Services & Database Engineering | 3, 4 |
| 3 | Manas Kumar Mallick | Case Lifecycle Engine & Verification | 5, 6 |
| 4 | Pruthiraj Lenka | Frontend Engineering & Local-First PWA | 7, 8 |
| 5 | Bibhu Bhusan Giri | Security Gate Pass & Station Infrastructure | 9, 10 |
| 6 | Nandita Das | UI Design System & Technical Specifications | 11, 12, 13 |

**Contact / org:** Crystal Studio Labs · `connect.crystalstudio@gmail.com` [V]

### Conflicts and gaps to resolve before the deck

| Item | Detail | Status |
| :--- | :--- | :--- |
| **Name spelling** | Docs say "Shuvransu"; the git author name is **"Shuvranshu"** Sekhar Sahoo | **[?] confirm the correct spelling** — it will be on slide 1 |
| Mentors | none recorded anywhere | **[INFORMATION REQUIRED]** |
| Team's institution | not recorded; `config/institution.json` "Crystal Institute of Technology" is the demo tenant | **[INFORMATION REQUIRED]** |
| Contact phone / team photo | none | **[INFORMATION REQUIRED]** if the template needs it |
| Individual contributions | slide assignments exist, but no per-member commit history (28 commits, all by one author email `sahooshuvranshusekhar@gmail.com`) | **[?]** Use the documented role split; do not claim measured contribution shares |

---

## 12. References and evidence (file paths / URLs)

**Identity and brief**
- `docs/hackathon/README.md`, `docs/hackathon/prompt.txt:1-28`, `docs/hackathon/Problem_Statement_7.pdf` (present, text not extracted)
- `README.md` (identity, tagline, workflows A–E, stack, RBAC), `LICENSE:1-3`, `config/institution.json`
- `git remote -v` → `https://github.com/Crystal-Studio-Labs/Campus-Relay.git`

**Architecture and specifications**
- `docs/architecture/{architecture,data-model,workflow-engine,offline-sync,notification-system,security,agent-system}.md`
- `docs/specifications/{api,ui-system,THEMES,CONFIGURATION}.md`
- `docs/ROUTE_VERIFICATION.md` (per-route verification table; its two feedback rows were updated today)
- `frontend/vite.config.ts`, `backend/app/api/v1/router.py`, `backend/app/api/deps.py`, `backend/app/core/{config,permissions,institution}.py`

**Deployment and CI**
- `render.yaml`, `docker-compose.yml`, `docker-compose.selfhost.yml`, `supabase/schema.sql`
- `docs/deployment/{DEPLOYMENT,SUPABASE}.md`, `.env.example`, `.github/workflows/ci.yml`
- Local launchers: `run.bat`, `stop.bat`, `backend.bat`, `frontend.bat`, `config.bat`

**Guides**
- `docs/guides/{demo-script,setup-guide,adoption-plan,requirements,competitive-gap}.md`

**External facts:** none were used — this report cites no outside statistic. Any number you want on the problem slide needs a source with URL and publication date, or it stays marked **[VERIFIED STATISTIC REQUIRED]**.

---

## 13. Technical limitations, unresolved questions and risks

**Verified defects (highest presentation risk first)**

1. **The E2E suite is broken** [V]. `backend/scripts/e2e_demo.py` authenticates as `student2@campusrelay.demo` (line 111), `security@campusrelay.demo` (115) and `helpdesk@campusrelay.demo` (569); all three return **401** — they were removed by the role consolidation (migration `0004_management_role`, `0005_remove_parent_role`) and the reseed. Observed: suite aborts immediately with `Client error '401 Unauthorized' … /api/v1/auth/login`, exit 2. **Impact:** the README's "End-to-End Automated Verification Suite" section and `run.bat` menu option `[T]` are the two things a jury is most likely to be shown. **Not fixed in this task** (I was instructed not to alter functionality) — flagged for your approval.
2. **`pytest` is not green on a *used* demo database** [V]. `backend/tests/test_engagement.py` (`test_only_the_office_sees_other_peoples_feedback`, assertion at line 66) requires the teacher's `/feedback/me` to be **exactly empty** — but the tests run against the persistent demo database, not a throwaway one. I observed this: after one teacher feedback row existed, the suite reported `1 failed, 144 passed`; immediately after `python -m app.seed.seed_data` it reported `145 passed` (exit 0), with no code change in between. This is a **pre-existing state-dependency**, not a code defect and not something this remediation introduced — but it is a live demo hazard: if anyone submits feedback as a teacher (or a jury member does), the suite goes red until the demo data is reset. **Always reseed before showing the suite.**
3. **Uncommitted work** [V]: 85 modified + 52 untracked paths; `main`'s last commit is 2026-09-28. The newer API modules (`academics, career, clearance, engagement, fees, hrms, leave, library`), their models, most frontend pages and most tests are untracked.
4. **Documentation drift** [V]: README says "four roles" (code: three); README/ppt claim "7 CSV templates" (`templates/` holds **8**, including `branches.csv`); `render.yaml` points to `docs/DEPLOYMENT.md` while the file is `docs/deployment/DEPLOYMENT.md`; `docs/hackathon/README.md` describes `ppt.txt` as a "10-slide" deck while the file contains 15 slides; the root `ppt.txt` demands exactly 6 slides; `docs/script/names.txt` assigns 15 slides. **Your new requirement is 8 slides — that is a fourth, different structure** (see §15).
5. **No verified deployment** [V]: all hosted URLs in the repo are examples.
6. **No frontend test suite** [V]: 0 automated tests under `frontend/`; UI evidence is manual/headless inspection only.
7. **No performance evidence** [V]: no benchmark, load test or latency run anywhere in the repo.

**Unresolved questions**

- Was the repository ever deployed, and to which host? (If yes, capture the URL and health check for slide 7.)
- Which account should replace the three removed demo logins in the E2E script?
- Do we hold permission to show the demo tenant "Crystal Institute of Technology" branding, or should the deployment be re-branded before judging?
- Does the official BPUT Hackathon 2026 template mandate a specific slide count/order (§15)?

**Risks for the pitch**

| Risk | Mitigation **[P]** |
| :--- | :--- |
| A judge clones the repo and finds features missing | Commit and tag before presenting; demo from the tagged commit |
| A judge asks to run the test suite | **Reseed first** (`python -m app.seed.seed_data`) then run `pytest` (145 green), or fix `e2e_demo.py` — see §13 |
| A judge sees the LLM-free agents and calls it "not AI" | Lead with *deterministic, auditable* agents by design; offer the optional provider as an integration, not the selling point |
| Numeric claims collapse under questioning | Replace every unsourced figure with a measured or clearly-labelled target (§8) |

---

## 14. Concise content for each of the 8 slides

Everything below is drawn from verified evidence; where evidence is absent I say so instead of filling the gap.

**Slide 1 — Title & Team** [V]
Campus Relay · "A resilient operating layer for everyday campus operations." · BPUT Hackathon 2026 · **Problem Statement 07 (Fretbox)** · Team **Crystal Studio Labs** · six named members with the documented roles (§11) · MIT-licensed · `github.com/Crystal-Studio-Labs/Campus-Relay`. *Confirm the spelling of the lead's name and supply mentors/institution before use.*

**Slide 2 — Problem Understanding** [V for the qualitative claim; **[VERIFIED STATISTIC REQUIRED]** for any figure]
Today: maintenance by paper register, notices lost in messaging groups, paper gate slips, documents that cannot be verified, and connectivity/device inequality. Consequence: no ownership, no SLA, no audit trail, and the least-connected students served worst. State these as observed operational gaps; **do not** attach an unsourced percentage.

**Slide 3 — Proposed Solution** [V]
One **universal case engine** (policy → workflow → approval → SLA → assignment → notification → resolution → requester verification → audit) applied to every campus service; **offline-first PWA** with an IndexedDB outbox and idempotent replay; **kiosk and assisted-desk** access for students without smartphones; **configurable per institution** through one JSON file. Representative workflow: hostel maintenance with room-QR intake (§5 Workflow 1).

**Slide 4 — Technical Architecture** [V]
React 18 + TS + Vite PWA ↔ FastAPI + SQLAlchemy 2.0 ↔ PostgreSQL 16 (60 tables, 6 Alembic revisions, append-only triggers); JWT/BCrypt with 71 permissions; ReportLab PDF + QR; Telegram/WhatsApp adapters (config-gated); Render/Vercel/Supabase blueprint; CI running 145 tests + typecheck + build. Use the §6.2 data-flow chain as the diagram.

**Slide 5 — Innovation & Feasibility** [I + P]
Innovation: one configurable engine instead of departmental silos; DB-trigger-enforced append-only audit; requester verification guard; honest offline with idempotent replay and conflict reporting; no-smartphone path; four deterministic agents with tool sandboxes. Feasibility: the system exists — ~53k lines, 185 endpoints, 145 passing tests — and the 36-hour window is hardening and demo-proofing (§10), not greenfield.

**Slide 6 — Impact & Benefits** [I; targets must be labelled as targets]
Beneficiaries: students, wardens, maintenance staff, faculty, administration, gate security, external verifiers. Measurable outcomes to *propose*: median time-to-close by SLA band, % notices acknowledged, % cases closed within SLA, gate refusals of invalid/duplicate passes, offline operations replayed without duplication. SDG 4 and SDG 9 as mappings, explicitly labelled as alignment rather than measured impact.

**Slide 7 — Prototype & Demonstration** [V, with gaps listed honestly]
Working: case lifecycle with verification, SLA sweep, gate desk with anti-passback, notices with acknowledgement analytics, campus services, academics, trilingual UI, offline sync, and the new feedback ask/answer flow. Evidence: `frontend/public/screenshots/app-wide.png` (1280×720) and `app-narrow.png` (720×1280), plus fresh screenshots to be captured from the live instance. **Limitations to state:** E2E demo script currently broken, no verified public deployment, external messaging channels unconfigured.

**Slide 8 — 36-Hour Execution Plan, Team & References** [P for the plan; V for team and references]
The §10 milestone table (commit → e2e repair → deploy → screenshots → rehearse → freeze), the documented team roles, and a references line citing the repository paths in §12. State plainly that the codebase predates the hackathon window and that the window is for hardening and demo-proofing.

---

## 15. Questions requiring your confirmation before the presentation prompt

1. **Slide count and template.** Four different structures exist in the repo: root `ppt.txt` = **6 slides**, `docs/hackathon/ppt.txt` = **15 slides**, `docs/hackathon/README.md` describes it as **10 slides**, `docs/script/names.txt` assigns **15 slides** — and you now need **8**. Which is authoritative, and does the official BPUT Hackathon 2026 template mandate an order/title set? The 8 sections you listed do not match the repo's existing 6/10/15-slide structures; I will follow your 8 unless told otherwise, and I will flag the discrepancy on the deck's terms pages rather than silently rewriting the repo's own docs.
2. **Problem slide statistic.** Provide a sourced statistic (with URL + date) or authorise "no statistic; qualitative gap description". Nothing in the repo qualifies.
3. **Deployment.** Is there a live instance? If yes, I need the frontend URL, API URL and confirmation the HTML route is reachable. If no, do you want the 36-hour plan to include deploying it, and may I do that deploy in a later task?
4. **E2E script repair.** May I fix `backend/scripts/e2e_demo.py` to the three-role account model? It is the single biggest demo risk, and it is a test script rather than application behaviour — I need your explicit go-ahead.
5. **May I commit the working tree?** 85 modified + 52 untracked files. If yes, in how many logical commits, and to `main` or a branch?
6. **Should the state-dependent test be made order-independent?** `test_engagement.py:66` asserts an absolutely empty teacher inbox against shared demo data. I can make it self-contained (assert on the rows it creates rather than on emptiness). This is a test-quality change, so I need your go-ahead; until then, reseed before running the suite.
7. **Team details.** Correct spelling of the lead's name; mentors (names + titles); the team's actual college/institution; whether to show the demo tenant name "Crystal Institute of Technology" or a neutral placeholder.
8. **Screenshots.** May I capture the deck's screenshots from the running app (localhost or a deployed instance)? Any branding/watermark or data-privacy constraint on what may appear?
9. **Beneficiary claims.** Do you have a partner college/hostel whose current process can be cited as the "before" state? Without it, slide 2 and slide 6 must stay qualitative.
10. **Slide 5 positioning.** Confirm whether the LLM-free deterministic agent design is a deliberate selling point ("auditable, offline, zero per-token cost") or whether the deck should present the optional LLM integration as the headline.
11. **Language/tone.** Any constraint on terminology (e.g. avoid "warden" vs "hostel superintendent"), and should the deck be English-only?

---

### Validation of this report

- Created at the repository root: **`PROJECT_DISCOVERY_REPORT.md`**.
- Containment check: sections 1–15 above correspond one-to-one with the 15 required elements (executive summary → confirmation questions), and the eight presentation buckets are folded into §14.
- No application source file was created, deleted or modified for this task; the only new file is this report. No `.pptx` was generated and no presentation prompt was written.
