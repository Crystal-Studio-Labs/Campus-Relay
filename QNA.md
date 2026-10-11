# 🎤 Campus Relay — Mock Evaluation Q&A Playbook

> **A practice guide for the mid-evaluation and final-selection rounds**
> *Campus Relay — "A resilient operating layer for everyday campus operations."*
> **Event:** BPUT Hackathon 2026 · **Problem Statement:** PS07 (Fretbox) · **Category:** Software
> **Team:** Crystal Studio Labs · **Team ID:** BH26PS07T065 · **Team leader:** Shuvransu
> **Repository:** https://github.com/Crystal-Studio-Labs/Campus-Relay

---

## How to use this document

This playbook is built from an inspection of the **actual repository as it is today**, not from the
project's marketing copy. Every answer is written so Shuvransu and the Crystal Studio Labs team can say
it out loud, honestly, under questioning.

Ten independent evaluation rounds are included:

| Set | Round | Evaluator mindset |
| :-- | :-- | :-- |
| 1 | First-Round Mid-Evaluation | Friendly, wants the basics clear |
| 2 | Existing Alternatives & Differentiation | Skeptical — "this already exists" |
| 3 | Real-World Problems & Usage Scenarios | Wants the user journey, step by step |
| 4 | Product Demonstration & Implementation Reality | Wants proof, not promises |
| 5 | Feasibility, Adoption & Sustainability | Doubts a college would ever adopt it |
| 6 | Risks, Trust, Privacy & Accountability | Looking for real-world failure modes |
| 7 | Aggressive Evaluator & Difficult Follow-Ups | Strict, fair, unconvinced |
| 8 | Impact, Measurement & Future Roadmap | Wants measurable value |
| 9 | Rapid-Fire Evaluation | 28 short questions in quick succession |
| 10 | Final Selection Round | Deciding who progresses |

### Ground rules for the team

1. **Never claim more than the repository can prove.** If it is planned, say "planned". If it is
   configured but inert, say "built, waiting for credentials". If it has not been measured, say
   "we have not measured it — here is how we would".
2. **Separate "works today" from "designed for".** Many features work; some are real adapters with no
   provider configured; some are documented designs only.
3. **Where an answer depends on facts not in the repository** (the team's own college, a mentor,
   a live deployment URL, a real pilot), the answer is marked:
   `[TEAM MUST VERIFY OR PERSONALIZE THIS ANSWER]` — do not replace it with a plausible-sounding story.
4. **Aim each spoken answer at 20–40 seconds.** The answers below are written at roughly that length.

### Evidence legend used in "Evidence to check"

- `backend/…`, `frontend/…`, `docs/…` — the file to re-read before relying on the claim.
- **[Verified]** — confirmed by a command run against this repository.
- **[Documented]** — the repository says so, but no measurement artefact exists.
- **[Unverified in this pass]** — true per prior inspection, but not re-run while writing this document.

---

## Quick facts sheet (verified against the repository)

Use these numbers only if you can point to the source.

| Fact | Value | Source |
| :-- | :-- | :-- |
| Backend Python (approx. lines, `backend/app`) | ~22,900 | static count |
| Frontend TS/TSX/CSS (approx. lines, `frontend/src`) | ~30,900 | static count |
| API route handlers | ~185 across 24 modules | `backend/app/api/v1/` |
| Database tables | 60 | models + `supabase/schema.sql` |
| Alembic migrations | 6 (`0001` … `0006`) | `backend/alembic/versions/` |
| System roles | **3** — `MANAGEMENT`, `TEACHER`, `STUDENT` | `backend/app/models/enums.py` (`RoleKey`) |
| Permissions in catalogue | 71 | `backend/app/core/permissions.py` |
| Frontend page components | 41 | `frontend/src/pages/**/*.tsx` |
| Backend test files / test functions | 19 files / 146 `def test_` | static count |
| Backend test suite result | **145 passed** after a demo reseed | PROJECT_DISCOVERY_REPORT.md, prior run |
| TypeScript check | `npx tsc --noEmit` exit 0 | prior run **[Unverified in this pass]** |
| UI languages | English, Hindi, Odia (543 keys each) | `frontend/src/lib/i18n.ts` |
| AI agents | 4, deterministic by default (`AGENT_PROVIDER=rules`) | `backend/app/services/agents/` |
| Notification channels | in-app real; Telegram + WhatsApp adapters config-gated; push/SMS/email unconfigured | `backend/app/services/delivery.py` |
| CI | pytest + typecheck + production build | `.github/workflows/ci.yml` |
| Licence | MIT | `LICENSE` |

### PS07 brief, in the brief's own words (extracted from `docs/hackathon/Problem_Statement_7.pdf`)

- Title: *"Attendance, Mess, Hostel, Repeat: Campus Life, Debugged"* — Organisation: Fretbox.
- Required deliverables: **≥3 distinct everyday campus workflows end-to-end**; an **administrator
  dashboard** (pending, ageing, resolution time, recurring issues); a **notification layer with
  targeting and delivery/action tracking**; an **accessibility demonstration** (poor connection, low-end
  device, and a fallback for students with no smartphone); and an **adoption note**.
- Evaluation weights: friction reduction **30%**, workflow breadth **20%**, admin visibility **20%**,
  accessibility/low-bandwidth **15%**, usability/adoption/demo **15%**.
- Optional: auto-routing, recurring-issue detection, demand prediction, a chatbot for repeated questions.

---

# SET 1 — First-Round Mid-Evaluation

**Evaluator's mindset:** *"I have just heard the introduction. I don't know the details yet. Explain the
project to me clearly, in plain language, and show me it is worth my remaining time."*

### Q1. In one sentence, what is Campus Relay?

**Evaluator's intent:** Test whether the team can state the product without jargon.

**Recommended spoken answer:**
Campus Relay is one place where every everyday college request — a hostel repair, a bonafide certificate,
a leave and gate pass, a notice, a mess complaint — is filed, tracked, routed and closed, instead of being
spread across registers, notice boards, WhatsApp groups and five different offices. We call it an operating
layer because one engine handles all of them, not a separate app for each department.

**Possible follow-up:** "Operating layer" sounds like marketing. What does that actually mean?

**Recommended follow-up answer:**
It means every request becomes the same kind of record — a Campus Case — with the same policy checks,
approval steps, SLA targets and audit trail. A new campus service is then a configuration entry rather
than a new application. That is the difference between one engine and five silos.

**Evidence to check:** `backend/app/services/case_engine.py`, `backend/app/services/policy.py`,
`backend/app/services/workflow.py`, README "Master End-to-End Workflows".

---

### Q2. What problem are you solving, and for whom?

**Evaluator's intent:** Check that the problem statement is genuinely understood.

**Recommended spoken answer:**
A student today needs a leaking tap fixed, a certificate issued, a class-cancelled update and a gate pass —
and each of those lives in a different place: a register, an office queue, a notice board, a WhatsApp group.
The administrators on the other side have no single view of what is pending, for how long, or who is
responsible. So the people who feel it most are ordinary students on patchy hostel Wi-Fi and the staff
expected to keep track of two thousand of them. Campus Relay puts both sides on one tracked workflow.

**Possible follow-up:** "Everyone says 'fragmentation'. Give me one concrete consequence."

**Recommended follow-up answer:**
The brief's own example: a tap leaking for nine days with nobody accountable, because there is no owner,
no deadline and no history. In our system that ticket has an assigned department, an SLA due time, an
append-only event history, and it cannot be marked closed until the student who reported it confirms the
repair. That is a concrete change from "it's somewhere in the register".

**Evidence to check:** `docs/hackathon/Problem_Statement_7.pdf` (The Story), `backend/app/services/sla.py`,
`backend/app/services/case_engine.py`.

---

### Q3. What have you actually built so far?

**Evaluator's intent:** Establish the real scope, not the intended scope.

**Recommended spoken answer:**
A working full-stack system: a FastAPI backend on PostgreSQL with about 60 tables and roughly 185 API
endpoints, and a React TypeScript PWA with about 40 screens. The core is the case engine — policy,
workflow, approvals, SLA, routing, notifications, requester verification and an append-only audit trail.
On top of that we have hostel maintenance, leave and gate pass with anti-passback, verifiable certificate
PDFs, targeted notices with read and acknowledgement tracking, campus services like library, fees,
clearance, placements and HR, and academics like attendance, marks and timetables. There are 146 backend
tests.

**Possible follow-up:** That is a lot. Did you really build all of that in the hackathon window?

**Recommended follow-up answer:**
Honestly, no — the codebase predates the hackathon window and we say that openly. The hours are going into
hardening, fixing defects, deployment verification and rehearsing the demo, not a from-scratch build.
The brief asks for a working prototype; we would rather present something that runs and be honest about
its history than pretend 53,000 lines appeared in 36 hours.

**Evidence to check:** `PROJECT_DISCOVERY_REPORT.md` §4 and §7.4, `backend/tests/`, `.github/workflows/ci.yml`.

---

### Q4. Who experiences this problem in a real college, and how big is it?

**Evaluator's intent:** See whether the team can talk about scale without inventing statistics.

**Recommended spoken answer:**
Three groups. Students, especially those in hostel dead zones or without a smartphone. Operational staff
and wardens, who currently keep parallel paper records. And administration, who need pending counts,
ageing and resolution times they simply do not have today. On size, I will be honest: we do not have a
sourced campus statistic in the repository, so I will not quote a fake percentage. The brief itself
describes the problem, and we can describe the gap qualitatively with real examples.

**Possible follow-up:** A judge will expect a number on the problem slide. What do you do?

**Recommended follow-up answer:**
We either get a sourced figure from our college's own records — number of complaints per month, average
resolution time, notices sent — or we present the gap qualitatively and label the targets as targets.
What we will not do is put an unsourced "9 days to 24 hours" claim on a slide as if we had measured it.

**Evidence to check:** `PROJECT_DISCOVERY_REPORT.md` §3 and §8; `docs/guides/requirements.md` §"Deliberately Out of Scope".

---

### Q5. Which single feature are you most proud of, and why?

**Evaluator's intent:** Find out what the team believes its differentiator is.

**Recommended spoken answer:**
The requester verification guard. In most ticketing systems staff can mark a ticket closed, which means
resolution statistics can be faked and a student has no say. In Campus Relay a technician can resolve a
case, but it moves to verification required — the student either confirms the fix, which closes it, or
reopens it, which puts it back in progress. Combined with the append-only audit trail, the history of who
did what and when cannot be quietly rewritten.

**Possible follow-up:** What stops a student from never verifying and leaving tickets open forever?

**Recommended follow-up answer:**
That is a fair risk, and the honest answer is that today it is a policy question, not a code-locked one —
we have reopen and cancel paths and the command centre surfaces ageing, so an unverified case shows up as
ageing rather than disappearing. An auto-close-after-N-days rule with a recorded notice to the student
would be a sensible next addition.

**Evidence to check:** `backend/app/services/case_engine.py`, `backend/tests/test_case_engine.py`,
`backend/alembic/versions/0002_append_only_guards.py`.

---

### Q6. Why should we evaluate your project further?

**Evaluator's intent:** Ask for a reason grounded in evidence, not enthusiasm.

**Recommended spoken answer:**
Because you can see it work end to end today. A complaint can be filed, classified, routed, resolved and
verified; a leave request can become a gate pass that refuses a duplicate exit; a notice can be targeted
and its read and acknowledgement status tracked; and the whole thing can keep working when the network
drops. The three required workflows in PS07 all exist as working code with tests behind them, not slides.

**Possible follow-up:** "Working" is your word. How do I verify it in two minutes?

**Recommended follow-up answer:**
Two ways. The backend suite — about 146 tests — runs green after a demo reseed, and the CI pipeline runs
it plus the frontend typecheck and production build on every push. Or watch the live demo: student files
a case, staff resolves it, the student verifies, and the command centre updates. Both are reproducible.

**Evidence to check:** `.github/workflows/ci.yml`, `backend/tests/`, `docs/guides/demo-script.md`.

---

### Q7. Which role does each of your three user types play?

**Evaluator's intent:** Confirm the role model is intentional, not accidental.

**Recommended spoken answer:**
We have three system roles. Students read their own records and raise their own requests. Teachers own
their subjects and classes and work their departmental queue. Management runs the campus — command centre,
hostel and mess, fees, certificates, clearance, library, leave, the gate, notices and configuration. The
functions people expect as separate roles — warden, gate security, helpdesk operator, technician — are
permissions and stations held by management or staff, and what narrows a person's view is the data scope
the server resolves, not a second credential.

**Possible follow-up:** Isn't merging warden and admin into one role a security weakness?

**Recommended follow-up answer:**
The separation is by permission and by scope rather than by separate login tables. A warden station holds
leave and gate permissions and is scoped to their hostels; it does not get the identity or configuration
screens. So the blast radius of a station account is still narrow, and the audit trail records the actor.

**Evidence to check:** `backend/app/models/enums.py` (`RoleKey`), `backend/app/core/permissions.py`,
`backend/app/services/scoping.py`.

---

### Q8. What is genuinely original here, as opposed to good engineering of common ideas?

**Evaluator's intent:** Separate novelty from quality — and see if the team overclaims.

**Recommended spoken answer:**
I will not claim we invented ticketing, offline sync or audit logs — those exist. What is unusual is the
combination in one deployable: a single configurable case engine, immutability enforced by PostgreSQL
triggers rather than application code, the requester verification guard, an actual offline outbox with
idempotent replay, and a kiosk and assisted-desk path for students with no smartphone. Most tools have
one or two of those. Putting all five behind one engine is what we are defending.

**Possible follow-up:** Any one of those could be copied in a weekend. What is hard to copy?

**Recommended follow-up answer:**
The hard part is the coherence — the same policy, SLA, approval and audit pipeline applied to a repair, a
certificate and a gate pass, plus being able to add a new service by configuration. Reimplementing one
feature is easy; making every service share one state machine and one audit ledger is the engineering.

**Evidence to check:** `docs/guides/competitive-gap.md`, `backend/app/services/policy.py`,
`backend/app/services/case_engine.py`.

---

### Q9. What does the system not do yet?

**Evaluator's intent:** Test honesty and self-awareness.

**Recommended spoken answer:**
Several things, and I would rather name them. There is no frontend automated test suite — the UI is
verified by manual and headless browser checks, not committed tests. Push, SMS and email channels are
adapter slots with no provider configured; Telegram and WhatsApp are real adapters but inert until
credentials exist. There is no load or performance test, so we make no throughput claims. We also have
documentation drift in one architecture file that still lists eight roles while the code has three — we
know about it and it is being corrected.

**Possible follow-up:** That security doc drift is embarrassing. Why should I trust the rest of your docs?

**Recommended follow-up answer:**
You shouldn't trust documents over code, and neither do we. That is exactly why our answers point at the
code and the tests. The docs are being reconciled to the code, but the source of truth is the repository
itself — models, services and tests.

**Evidence to check:** `docs/architecture/security.md` (stale role list) vs `backend/app/models/enums.py`;
`frontend/package.json` (no test script); `backend/app/services/delivery.py`.

---

### Q10. How do I know this is a real system and not a hackathon ornament?

**Evaluator's intent:** Distinguish a working product from a demo shell.

**Recommended spoken answer:**
Three signals. First, the schema is real: 60 tables, 6 migrations, append-only triggers created in
migration 0002. Second, the behaviour has tests: leave date validation, cross-student access returning
403, sync replay not duplicating a case, gate anti-passback refusing a duplicate exit. Third, it runs
offline-first, which is not the easy path — a genuinely decorative app would just fail when the network
drops. We can show all three.

**Possible follow-up:** Tests can be written to pass. Show me a real failure you found.

**Recommended follow-up answer:**
A good one: our own end-to-end demo script broke after we consolidated roles — it still tried to log in as
accounts that the consolidation removed, and failed at sign-in with HTTP 401. We found it through our own
inspection and reseeded those operational accounts. That is a defect we created and then had to own.

**Evidence to check:** `backend/scripts/e2e_demo.py`, `backend/app/seed/seed_data.py`,
`backend/alembic/versions/0002_append_only_guards.py`.

---

### Q11. How does the offline feature actually work? Someone on the team explain it simply.

**Evaluator's intent:** Verify the team understands its own hardest feature.

**Recommended spoken answer:**
The app writes to the device first. When you submit a complaint with no network, it goes into an IndexedDB
outbox with a unique idempotency key, and the screen shows it as pending rather than failing. When the
connection returns, a background sync worker replays that queue to the server. The server checks the key:
if it has not seen it, it executes the mutation once; if it has, it returns the original result instead of
creating a duplicate. If the server state moved while you were offline, you get a conflict, not a silent
overwrite.

**Possible follow-up:** What if the same complaint is submitted twice by two different devices?

**Recommended follow-up answer:**
The idempotency key is client-generated and specific to that operation, so two devices create two
operations — which is correct, they are two submissions. What the key prevents is the *same* operation
being applied twice because of a retry or a repeated replay. For duplicate complaints about the same
issue, the policy engine has a deduplication check at intake.

**Evidence to check:** `frontend/src/lib/offline.ts`, `frontend/src/lib/db.ts`, `frontend/src/lib/sync.ts`,
`backend/app/services/sync.py`, `backend/tests/test_sync_idempotency.py`.

---

### Q12. What is the single strongest reason a college would adopt this?

**Evaluator's intent:** Force a crisp value proposition.

**Recommended spoken answer:**
Because it replaces several disconnected habits with one tracked workflow without demanding a
re-engineering project. The institution's identity, vocabulary, design language and enabled modules come
from one configuration file, so adopting it is configuration and CSV import — departments, hostels,
rooms, staff and students — rather than a fork or a rebuild. And because it works offline and at a kiosk,
it covers the students who are usually left out of digital rollouts.

**Possible follow-up:** "Adopting it is configuration" — has any college actually done it?

**Recommended follow-up answer:**
No, and I will not claim one. We have written the migration order and the import sequence, and the
bootstrap only seeds sample data when a database is empty so a real institution is never overwritten —
but a real pilot is exactly what is still missing.

`[TEAM MUST VERIFY OR PERSONALIZE THIS ANSWER if any pilot, campus, or partner discussion has actually happened.]`

**Evidence to check:** `config/institution.json`, `docs/guides/adoption-plan.md`, `backend/scripts/bootstrap.py`,
`backend/app/services/data_transfer.py`.

---

# SET 2 — Existing Alternatives and Differentiation

**Evaluator's mindset:** *"Campus software already exists. Fretbox already exists — it set the problem. ERP
modules already exist. Convince me you are not just re-covering the same ground."*

### Q1. Why not simply use an existing college ERP?

**Evaluator's intent:** Test whether the team understands the incumbents fairly.

**Recommended spoken answer:**
An ERP is usually strong at records — admissions, fees, payroll — and weaker at live operational
workflows: a tap that leaks, a notice that must be acknowledged, a gate pass that is used twice. It is
often a set of departmental modules with separate data models. Campus Relay does not try to replace the
ERP's records; it aims at the day-to-day request layer, with one case engine and one audit trail across
departments. If a college already has an ERP, integrating with it is more realistic than ripping it out.

**Possible follow-up:** Then you are a bolt-on, and bolt-ons die. Why would you be kept?

**Recommended follow-up answer:**
Fair. The honest position is that we are the operational layer, not the system of record for everything.
If we do our job, the measurable thing the college keeps is the audit trail and the SLA visibility —
which the ERP typically does not give them for a leaking tap.

**Evidence to check:** `docs/guides/competitive-gap.md` §"Where Capabilities Overlap (Table Stakes)".

---

### Q2. Fretbox is the organisation that set this problem statement. Why should they look at you?

**Evaluator's intent:** Test humility and a clear architectural claim.

**Recommended spoken answer:**
We treat Fretbox as a real incumbent with real capabilities, not a straw man — our competitive note says
so explicitly. What we are putting forward is an architectural claim: a single configurable case engine
with trigger-enforced immutability, requester-side verification and local-first offline behaviour, in one
deployable, plus a no-smartphone path. We are not claiming to be better at everything.

**Possible follow-up:** So why not just say the incumbent is better and go home?

**Recommended follow-up answer:**
Because the brief asks teams to build a working answer, not to rank vendors. The value is in the design
choices and in whether they solve the friction the brief describes. We can defend those choices; we cannot
claim market superiority, and we do not.

**Evidence to check:** `docs/guides/competitive-gap.md` §"Deliberately Honest Framing" and "Explicit Non-Claims".

---

### Q3. Why can't a student just use WhatsApp or Google Forms?

**Evaluator's intent:** See whether the value is real or assumed.

**Recommended spoken answer:**
For a single message, WhatsApp is excellent and we should say so. What it cannot do is give the complaint
an owner, a deadline or a history: it cannot say who is responsible, warn that the SLA is breached, refuse
a duplicate gate exit, give the administration ageing buckets, or let an external authority verify a
bonafide certificate. It also cannot work in a hostel dead zone without re-sending, or help a student who
has no phone. WhatsApp moves information; it does not run a workflow.

**Possible follow-up:** Students already have WhatsApp open. Why would they open your app instead?

**Recommended follow-up answer:**
Two reasons we can defend: visibility — they can see the status and the SLA clock, which WhatsApp never
gives them — and the fact that the status is actionable, meaning they verify the fix or reopen it. On the
softer point, whether students will adopt it is an assumption we have not tested; that is validation work,
not something we can claim today.

**Evidence to check:** `docs/guides/competitive-gap.md`, `backend/app/services/sla.py`,
`backend/app/services/gate.py`.

---

### Q4. Why should a college trust a notice system over its existing notice board or email?

**Evaluator's intent:** Probe the communication-layer claim.

**Recommended spoken answer:**
Because it answers a question a notice board cannot: did the people who needed to see this actually see
it? Our notices are targeted by hostel, branch, year, batch or role, and each recipient has a tracked
state — sent, delivered, read, and acknowledged where the notice requires action. Management can see the
counts per notice. Email can tell you it was sent, not that the right cohort read and acknowledged it.

**Possible follow-up:** Email has read receipts. How is yours different?

**Recommended follow-up answer:**
Read tracking in our system is inside the institution's own database and is not dependent on a mail client
choosing to report. And it is tied to a targeted audience computed from campus structure, so "year 3 CSE
in Hostel A who owe dues" is a real audience, not a mailing list someone maintains by hand.

**Evidence to check:** `backend/app/api/v1/notices.py`, `backend/app/services/notices.py`,
`frontend/src/pages/admin/NoticeStudio.tsx`.

---

### Q5. Would a college have to replace its existing software to use this?

**Evaluator's intent:** Test the adoption claim honestly.

**Recommended spoken answer:**
No, and that is deliberate. The realistic path in our adoption note is to start with three high-volume
workflows — hostel maintenance, bonafide certificates, and leave with gate pass — at a pilot department,
then expand the service catalogue by configuration. Records like admissions and payroll stay where they
are. We have not piloted this anywhere, so I present it as the plan, not as experience.

**Possible follow-up:** What data would they have to move?

**Recommended follow-up answer:**
Mostly reference data: departments, branches, hostels, rooms, locations, assets, staff and students, then
the service catalogue. Optionally historical closed cases, which keep their original timestamps so ageing
charts are meaningful from day one.

**Evidence to check:** `docs/guides/adoption-plan.md` (Phase 1 ingestion order).

---

### Q6. Is your idea genuinely differentiated, or are you combining common features?

**Evaluator's intent:** Reward honesty and precision.

**Recommended spoken answer:**
Partly combining, and I would rather say that plainly. Ticketing exists, offline caching exists, audit
logs exist. Our differentiation is the specific combination and the enforcement points: immutability
guaranteed by database triggers rather than only application code, requester-side verification so staff
cannot unilaterally close cases, idempotent offline replay with explicit conflict reporting, and a kiosk
and helpdesk fallback modelled as first-class stations. If a judge says "each of these exists", I agree —
none of them alone is new.

**Possible follow-up:** So what is the one thing you would call genuinely uncommon?

**Recommended follow-up answer:**
The requester verification guard combined with trigger-enforced immutability. Closing a case is not a staff
decision alone, and the event history cannot be rewritten even by an administrator running raw SQL. That
pairing is the thing I would defend hardest.

**Evidence to check:** `backend/app/services/case_engine.py`, `backend/alembic/versions/0002_append_only_guards.py`.

---

### Q7. Another team has built something similar. Why should we choose yours?

**Evaluator's intent:** Force a comparison without denigrating others.

**Recommended spoken answer:**
I cannot judge another team's work and I will not pretend to. What I can do is say what is verifiable in
ours: it runs end to end, the backend suite is green after a reseed, the typecheck and production build
pass, it works offline with idempotent replay, and it maps to the PS07 deliverables with real code. If
another team's solution does that better on a criterion, they deserve the mark — but on demonstrable
coverage, ours is not thin.

**Possible follow-up:** That is a non-answer. Name one thing yours does that a typical submission will not.

**Recommended follow-up answer:**
The kiosk and assisted-desk path with a roll-number lookup and proxy filing, which directly answers the
brief's "students who genuinely have no smartphone" line, plus offline gate logging. Many submissions will
skip the no-smartphone fallback because it is inconvenient.

**Evidence to check:** `frontend/src/pages/kiosk/Kiosk.tsx`, `backend/app/api/v1/kiosk.py`,
`backend/app/core/permissions.py` (`case:create_on_behalf`).

---

### Q8. What would make your solution difficult to replace once adopted?

**Evaluator's intent:** Test whether there is any lock-in or switching cost — and whether the team is
honest about it.

**Recommended spoken answer:**
Honestly, not much lock-in, and we think that is a feature, not a weakness. The database is the
institution's own PostgreSQL, the configuration is one editable file, and there is a data export path.
The thing that would make it sticky is the history: once a term of cases, resolutions, gate movements and
notices live in the audit trail, the institution's own accountability record is there. That is the real
switching cost.

**Possible follow-up:** "No lock-in" sounds like a sales pitch. Isn't that just because there is no
adoption yet?

**Recommended follow-up answer:**
Yes — with no live adoption, there is no lock-in to speak of. I am describing the design intent, which is
that a college owns its data and can leave. I will not dress that up as a market position.

**Evidence to check:** `docs/guides/adoption-plan.md` §"Data Ownership & Sovereignty" and "Rollback & Recovery".

---

### Q9. What does a normal ERP do that you do not?

**Evaluator's intent:** Find the boundary of scope.

**Recommended spoken answer:**
A full ERP typically owns admissions, examination records, finance and payroll as systems of record. We
have fees and clearance views and an HRMS surface for staff records, but we do not claim to be the
authoritative examination or admissions system. Our scope is operational requests, their approvals,
their SLAs and their audit — plus the academic visibility a student and teacher need day to day.

**Possible follow-up:** Then the college still needs two systems. Isn't that more work, not less?

**Recommended follow-up answer:**
It is one more integration rather than one more queue for a student, which is the friction the brief
targets. A student asking today about a bonafide certificate does not care which back office owns the
record; they care that the request has a status and an owner. That is the layer we are.

**Evidence to check:** `docs/guides/requirements.md` §"Deliberately Out of Scope".

---

### Q10. Would a college need to change how staff work?

**Evaluator's intent:** Probe the change-management reality.

**Recommended follow-up answer path:** Start by admitting the human cost.

**Recommended spoken answer:**
To some extent, yes, and that is the main adoption risk — not the software. A technician has to update the
case rather than tell someone, and a warden has to approve in the system rather than on a slip. What
reduces the friction is that the station surfaces are role-specific: the technician sees assigned tasks and
evidence upload, the gate desk sees pass scanning, the helpdesk sees roll-number lookup. Training is
departmental and short, but we have not run it anywhere, so this is a plan.

**Possible follow-up:** What if staff simply refuse?

**Recommended follow-up answer:**
Then the pilot fails, and the honest answer is that management has to want the visibility. The pitch to
staff is relief, not surveillance: their queue and workload are visible, so they can demonstrate what they
did. `[TEAM MUST VERIFY OR PERSONALIZE THIS ANSWER for your own campus context.]`

**Evidence to check:** `docs/guides/adoption-plan.md` (Phase 4 training step), `frontend/src/lib/navigation.ts`.

---

### Q11. Why should a college choose your project instead of improving its current system?

**Evaluator's intent:** Test the incremental-vs-rebuild argument.

**Recommended spoken answer:**
Because improving a system of disconnected departmental forms does not fix the missing audit trail, the
missing SLA ownership or the hostel dead zone. Those are architectural, not cosmetic. Where a college
already has something that works, integrating is a legitimate option — but the specific things the brief
asks for, offline resilience and a no-smartphone path, are usually absent and cannot be bolted on easily.

**Possible follow-up:** "Usually absent" is an assumption. Do you have evidence?

**Recommended follow-up answer:**
No hard evidence, and I will label it as an assumption. What I can show is our own implementation of the
offline outbox and the kiosk, which is evidence that it can be done — not evidence that it is missing
elsewhere.

**Evidence to check:** `docs/guides/competitive-gap.md` (positioning claim, not a benchmark).

---

# SET 3 — Real-World Problems and Usage Scenarios

**Evaluator's mindset:** *"Enough architecture. Walk me through what actually happens to a real person,
step by step, in plain language."*

### Q1. A student reports a leaking tap in a hostel washroom. What happens next?

**Evaluator's intent:** Test the end-to-end maintenance workflow.

**Recommended spoken answer:**
The student opens the request form, or scans the QR code on the washroom, which fills in the location. They
describe the problem and attach a photo. On submit, the intake step classifies a category and a priority
from the text, the policy engine validates the location and checks for duplicates, and the routing step
picks the department and the staff member. An SLA due time is set, the case appears in the technician's
assigned queue, and every one of those steps is written to the append-only event history.

**Possible follow-up:** What if the classification gets it wrong?

**Recommended follow-up answer:**
It can, which is why the operator or staff member can re-categorise or reassign, and that change is itself
recorded as an event. The classification is an assistant, not an authority. With the default rules
provider it is deterministic, and there is a unit-tested path for it.

**Evidence to check:** `backend/app/api/v1/cases.py`, `backend/app/services/policy.py`,
`backend/app/services/routing.py`, `backend/app/services/agents/`.

---

### Q2. How does the student know who is handling it, and when it will be done?

**Evaluator's intent:** Test visibility and SLA honestly.

**Recommended spoken answer:**
The case detail screen shows the current state, the assigned department and staff member, and the SLA
target. The student gets in-app notifications as the state changes and can reopen a case if the fix does
not hold. The administration side sees open cases by age band — under 24 hours, one to three days, three
to seven, and over seven — so an ageing ticket cannot sit invisible in someone's inbox.

**Possible follow-up:** Is the SLA target configurable, or is it hardcoded?

**Recommended follow-up answer:**
There are SLA rules in the database with defaults, and the adoption plan explicitly includes tuning them to
the institution's own service levels. The demo ships with default thresholds, which a college would
replace.

**Evidence to check:** `backend/app/services/sla.py`, `backend/app/api/v1/admin.py` (ageing buckets).

---

### Q3. What happens when staff say the problem does not exist, or reject a request?

**Evaluator's intent:** Test the negative paths, which are where demos usually break.

**Recommended spoken answer:**
A request can be rejected or cancelled with a reason, and that reason lives in the case event history, so
the student can see why. For a resolved case, the student must verify — if they say the issue persists,
the case reopens and goes back to in progress rather than quietly closing.

**Possible follow-up:** Can a technician just mark it resolved and move on?

**Recommended follow-up answer:**
They can mark it resolved, but that does not close it. It moves to verification required by the student.
So the short answer is: they can claim a fix, they cannot unilaterally declare the ticket finished.

**Evidence to check:** `backend/app/services/case_engine.py`, `backend/tests/test_case_engine.py`.

---

### Q4. Walk me through a leave request and the gate pass.

**Evaluator's intent:** Test the second required workflow and the security integration.

**Recommended spoken answer:**
The student submits a leave request with dates; the policy engine checks the date window — a backward
date is rejected, and there is a test for that. The warden approves it within their hostel scope, and a
digital gate pass is generated with a token. At the gate, security scans or enters the pass; the system
records the exit movement. If the same pass is used to exit again, the anti-passback check refuses it —
the code returns a specific reason like already exited, already used, or already returned.

**Possible follow-up:** Why does exiting twice matter?

**Recommended follow-up answer:**
Because a paper register cannot tell you whether someone is inside or outside, and one pass being reused
defeats the whole point of the pass. Refusing the second exit, and recording the entry on return, is what
makes a live outside-headcount meaningful. On verified return the leave case closes.

**Evidence to check:** `backend/app/services/gate.py` (refusal reasons around lines 97–128),
`backend/app/api/v1/leave.py`, `backend/tests/test_leave.py`.

---

### Q5. How does management issue an official notice?

**Evaluator's intent:** Test the communication workflow.

**Recommended spoken answer:**
Management opens the notice studio, writes the notice, attaches a circular if needed, and selects the
audience by hostel, branch, year, batch or role. On publish, it appears only in the targeted inboxes. Each
recipient has a state — delivered, read, and acknowledged where the notice requires an action — and the
studio shows the counts. There is also an optional public share link with a sanitized view.

**Possible follow-up:** How do you know the audience calculation is right?

**Recommended follow-up answer:**
The audience is computed from the campus structure in the database rather than from a hand-maintained
list, and the studio shows the calculated audience before publishing. Whether the *matching rules* are
what the college wants is a configuration discussion.

**Evidence to check:** `backend/app/services/notices.py`, `frontend/src/pages/admin/NoticeStudio.tsx`,
`backend/tests/test_notices_notifications.py` **[verified in prior inspection]**.

---

### Q6. What happens if a request is closed incorrectly?

**Evaluator's intent:** Probe accountability after closure.

**Recommended spoken answer:**
There are two answers. Before closure, the student can reopen instead of verifying, which returns the case
to in progress. After closure, the case history is still append-only, so reopening produces a new event
rather than erasing the old one — the record shows it was closed and then reopened. Nothing about the
history can be quietly edited, including by an administrator running SQL directly, because the triggers
reject updates and deletes on the event tables.

**Possible follow-up:** Can an administrator delete a case to hide a mistake?

**Recommended follow-up answer:**
Not the event history. The append-only triggers cover the audit log, case events, gate logs and
notification events. A case record itself is a different table, but the trail of what happened cannot be
removed.

**Evidence to check:** `backend/alembic/versions/0002_append_only_guards.py`,
`backend/app/models/immutability.py`.

---

### Q7. How could an outside authority verify a document you issue?

**Evaluator's intent:** Test the verifiable-document workflow.

**Recommended spoken answer:**
When a bonafide certificate is approved, we generate a PDF with a serial number and a QR code. The QR
points at a public verification endpoint — it does not need a login. Anyone scanning it sees whether the
document is valid, its serial and issue date, without exposing the student's academic or financial
details. So a bank or an employer can check authenticity without calling the college.

**Possible follow-up:** What stops someone from forging the QR or copying a valid code onto a fake PDF?

**Recommended follow-up answer:**
The code maps to a record on the server, so a copied code on a different document would still resolve to
the original record with its own details, and a fabricated code returns not found. I would not call it
cryptographically unforgeable in the sense a signed certificate chain would be — it is server-verified
lookup, and I will describe it that way.

**Evidence to check:** `backend/app/services/documents.py`, `backend/app/api/v1/system.py`
(`/documents/verify/{verification_code}`).

---

### Q8. What happens if a student submits misleading information?

**Evaluator's intent:** Test handling of bad-faith input.

**Recommended spoken answer:**
The submission is attached to an authenticated student account, and there is a helpdesk path where staff
file on someone's behalf — those are separate, permissioned actions. Misleading content is handled at the
policy and human level: staff can reject with a reason, close with a recorded explanation, and the history
retains who said what. We do not claim to detect deliberate misinformation automatically, and I would not
pretend a form can.

**Possible follow-up:** Could a student file a case against another student?

**Recommended follow-up answer:**
A case is filed about a location or a service, not about a person, and a student can only read their own
cases. A helpdesk operator filing on behalf must hold the create-on-behalf permission. So the abuse paths
are narrow and audited, though not impossible.

**Evidence to check:** `backend/app/core/permissions.py` (student vs management permission sets),
`backend/app/services/scoping.py`.

---

### Q9. How would staff find unresolved requests that everyone forgot about?

**Evaluator's intent:** Test administrative visibility — 20% of the brief's weight.

**Recommended spoken answer:**
Through the command centre and the admin analytics. There is an ageing breakdown into under 24 hours,
one to three days, three to seven and over seven, an SLA view that sweeps for at-risk and breached cases,
resolution-time metrics, and a recurring-issue view that clusters cases by location, asset and category.
Staff workload is visible too, so a concentration on one technician shows up.

**Possible follow-up:** Does the SLA sweep run automatically, or do you have to open a screen?

**Recommended follow-up answer:**
There is a scheduled sweep service and an endpoint to trigger it, so the escalation shows up without
someone hunting for it. What we have not done is run it for a long period against real volume, so I can
describe the mechanism, not its field performance.

**Evidence to check:** `backend/app/services/sla.py`, `backend/app/services/analytics.py`,
`frontend/src/pages/admin/CommandCentre.tsx`.

---

### Q10. What is the experience for a student with no smartphone?

**Evaluator's intent:** Test the accessibility deliverable directly.

**Recommended spoken answer:**
That student can use the campus kiosk: a touch-first screen where they enter their roll number and file or
check a request, with an idle timeout so the next person is not left in someone else's session. If they
would rather speak to a person, the assisted helpdesk station lets an operator look up the student and file
on their behalf, and that action is permissioned and recorded.

**Possible follow-up:** How does the kiosk know it is really that student, and not someone else?

**Recommended follow-up answer:**
There is a supervisor or operator path for anything sensitive, and filings made on behalf are attributed
to the operator in the audit trail. The kiosk session itself times out when idle. I would not claim the
kiosk is a strong identity check — it is an access channel, and the sensitive actions sit behind staff.

**Evidence to check:** `frontend/src/pages/kiosk/Kiosk.tsx`, `frontend/src/layouts/KioskShell.tsx`,
`backend/app/api/v1/kiosk.py`, `config/institution.json` (`stations.kiosk_idle_seconds`).

---

### Q11. What happens to all this when the hostel Wi-Fi goes down mid-request?

**Evaluator's intent:** Test the resilience claim as a scenario, not a diagram.

**Recommended spoken answer:**
The submission is written locally first and shown as pending, with a key attached. It survives a page
reload because it is in IndexedDB, not in memory or a form on screen. When the network returns, the
background worker replays the queue and the server applies each operation once. If the state on the server
moved in the meantime, the student gets a conflict to reconcile rather than a silent duplicate or a
silent overwrite.

**Possible follow-up:** What if the worker never gets to run because the student uninstalls the app?

**Recommended follow-up answer:**
Then the queued operation is lost with the device — that is a genuine limitation of local-first on a
single device. It is the same class of risk as a draft email that never sends. We keep the window short by
replaying as soon as connectivity returns, and the UI shows the pending state so the student knows.

**Evidence to check:** `frontend/src/lib/offline.ts`, `frontend/src/lib/sync.ts`, `docs/architecture/offline-sync.md`.

---

# SET 4 — Product Demonstration and Implementation Reality

**Evaluator's mindset:** *"I want proof. Show me it running. Tell me what is finished, what is half done,
and what you would not put on screen."*

### Q1. Can you demonstrate your main workflow right now?

**Evaluator's intent:** Confirm a live, reproducible demo exists.

**Recommended spoken answer:**
Yes. The runbook is: student files a hostel complaint with a location code, the case appears with its
priority and SLA; the technician moves it to in progress and resolves it with evidence; the student either
verifies, which closes it, or reopens it; and the admin command centre shows the case in the ageing and
resolution views. That whole loop runs against the local stack.

**Possible follow-up:** What if it fails on stage?

**Recommended follow-up answer:**
We reset the demo data with one command and re-run. If the browser misbehaves, we have the API docs and
the backend test suite as a fallback proof, and we would rather show the test suite than stand there
apologising.

**Evidence to check:** `docs/guides/demo-script.md`, `backend/app/seed/seed_data.py` (reseed).

---

### Q2. Which features are fully implemented, and which are partial?

**Evaluator's intent:** Get the honest status list.

**Recommended spoken answer:**
Fully implemented and exercised: the case engine with policy, workflow, approvals, SLA and audit; hostel
maintenance; leave and gate pass with anti-passback; verifiable certificate PDFs; targeted notices with
read and acknowledgement tracking; the offline outbox with idempotent replay; academics and the campus
services; the kiosk and helpdesk stations. Partial or configuration-gated: Telegram and WhatsApp
notification adapters, which are real but inert without credentials; push, SMS and email, which are
adapter slots with no provider. Not present: automated frontend tests and any load measurement.

**Possible follow-up:** So your "multi-channel communication" is really one channel.

**Recommended follow-up answer:**
In the box as shipped, in-app is the real channel and it is fully tracked. Telegram and WhatsApp are
implemented adapters waiting for credentials, and the system reports them as unconfigured rather than
faking delivery. That is deliberate: we would rather be honest than show a green tick that means nothing.

**Evidence to check:** `backend/app/services/delivery.py`, `backend/app/api/v1/notifications.py`, `/api/v1/meta`.

---

### Q3. What evidence shows the backend and frontend actually work together?

**Evaluator's intent:** Test integration, not two separate projects.

**Recommended spoken answer:**
The PWA calls the same API the tests exercise, with the same auth and permission dependencies. Concretely:
the typecheck and production build run in CI, the backend test suite runs in CI against a real PostgreSQL
service, and the demo drives a live browser against the live API. We also found real defects this way —
for example, a role consolidation left some operational accounts referenced by our own end-to-end script,
and the login failed with a 401 until the seed data was brought back in line.

**Possible follow-up:** CI passing does not prove the UI works. What frontend evidence do you have?

**Recommended follow-up answer:**
None that is committed, and I will not dress it up. There is no frontend test suite; the UI evidence is
manual and headless browser inspection. It is the clearest testing gap we have, and it is on the roadmap
before we would call anything production ready.

**Evidence to check:** `.github/workflows/ci.yml`, `frontend/package.json` (no test script),
`backend/scripts/e2e_demo.py`.

---

### Q4. How do you know the application behaves correctly, beyond it looking right?

**Evaluator's intent:** Test whether correctness is asserted or verified.

**Recommended spoken answer:**
Through tests that assert behaviour rather than rendering: a backward-dated leave request is rejected; a
student reading another student's case gets 403, not an empty list; a replayed sync operation does not
create a second case; a duplicate gate exit is refused with a reason; the append-only trigger rejects an
update to an event row. Those are the behaviours a demo cannot fake, which is why we test them.

**Possible follow-up:** Are those tests green right now?

**Recommended follow-up answer:**
The suite is green after a demo reseed — 145 passing in the last full run. One honest caveat we found: the
tests run against the persistent demo database, so a test that asserts a teacher has no feedback fails
until the data is reseeded. Always reseed before running the suite in front of a jury.

**Evidence to check:** `backend/tests/test_auth_rbac.py`, `backend/tests/test_sync_idempotency.py`,
`backend/tests/test_leave.py`, `backend/tests/test_case_engine.py`, `PROJECT_DISCOVERY_REPORT.md` §13.

---

### Q5. What would you show first to establish credibility?

**Evaluator's intent:** Test judgment about what earns trust quickly.

**Recommended spoken answer:**
The case lifecycle, because it is the spine of the product: file, classify, route, resolve, verify, and the
audit history underneath. Then the offline outbox, because that is the part a jury is least likely to have
seen done properly. Then the gate desk anti-passback, because it is short, visual and obviously correct
when the second exit is refused.

**Possible follow-up:** You skipped the dashboard, which carries 20% of the marks.

**Recommended follow-up answer:**
Fair — then the command centre comes second, right after the lifecycle, because the ageing buckets and
resolution metrics are exactly what the brief asks the administrator to get. The order in our runbook has
the command centre before the offline showpiece for that reason.

**Evidence to check:** `docs/guides/demo-script.md` (timeline), `frontend/src/pages/admin/CommandCentre.tsx`.

---

### Q6. What can you prove today that you could not prove a month ago?

**Evaluator's intent:** Find real progress, not a static codebase.

**Recommended spoken answer:**
The cohesion: today the three-role model is consistent across permissions, seed data and the screens, and
the operational stations — warden, gate, helpdesk — are permissions and scopes rather than leftover
accounts. The feedback ask-and-answer flow is also newer and verified through the live UI. A month ago
some of that was documented but not aligned in the code.

**Possible follow-up:** That sounds like cleanup, not progress. Did you add anything new?

**Recommended follow-up answer:**
The feedback request flow is a new capability: management asks a group, teachers or students answer
against that request, and the office sees answered versus asked. That is New with a capital N, and it came
out of a real gap — feedback that had no addressee.

`[TEAM MUST VERIFY OR PERSONALIZE the specific dates and the exact feature that is newest if the timeline differs.]`

**Evidence to check:** `backend/app/api/v1/engagement.py`, `backend/app/models/engagement.py`,
`backend/alembic/versions/0006_feedback_requests.py`, `backend/tests/test_engagement.py`.

---

### Q7. Which known issues are still unresolved, in order of risk?

**Evaluator's intent:** See whether the team keeps an honest defect list.

**Recommended spoken answer:**
First, no recorded live deployment — every hosted URL in the docs is an example, so if the venue network
fails, the demo depends on the local stack. Second, the documentation drift: one architecture file still
lists eight roles while the code has three. Third, the end-to-end demo script had been broken by the role
consolidation and depends on seeded operational accounts being present. Fourth, the absence of any load or
latency measurement. Fifth, unconfigured external messaging channels.

**Possible follow-up:** Which of those would you fix with 24 hours?

**Recommended follow-up answer:**
The documentation drift and a fresh, timed rehearsal of the demo — both are cheap and directly affect how
the project is judged. Deployment would be next, because a reachable URL is worth more than another
feature.

**Evidence to check:** `docs/architecture/security.md`, `docs/deployment/DEPLOYMENT.md` (URLs are examples),
`backend/scripts/e2e_demo.py`.

---

### Q8. Is there a demo you would deliberately not run?

**Evaluator's intent:** Reward self-awareness over bravado.

**Recommended spoken answer:**
Yes, two. I would not stake the demo on a specific claimed latency figure, because we have not measured
one — I would show the behaviour instead. And I would not demonstrate an external messaging channel
delivering a real WhatsApp or Telegram message, because those adapters are inert without credentials, so
the honest demo is the configuration panel reporting them as unconfigured.

**Possible follow-up:** So your multi-channel claim is unproven. Why is it in the README?

**Recommended follow-up answer:**
Because "implemented adapter, unconfigured by default" is the accurate description, and the README does say
channels report themselves honestly. The claim is capability, not delivery. If a channel matters for the
demo, the honest move is to configure Telegram for the review, since it only needs a bot token.

**Evidence to check:** README "Notification channels", `backend/app/api/v1/notifications.py` (`/meta`).

---

### Q9. Can you show the offline mode without editing your own settings blindly?

**Evaluator's intent:** Test a controlled, honest offline demonstration.

**Recommended spoken answer:**
Yes — we cut the network in the browser dev tools, file a complaint, point out the pending state, reload
the page to prove it survived, then restore the network and show the queue drain in the sync centre and
exactly one case created on the admin side. The point of the reload is that a fake "offline" message would
not survive it.

**Possible follow-up:** What if the service worker is not registered on the judge's browser?

**Recommended follow-up answer:**
That is a genuine risk on a first visit; the demo device is prepared beforehand with the app already
loaded once so the worker and IndexedDB are in place. If it is not, the offline queue degrades to the
informing message rather than pretending to save, which is the designed behaviour.

**Evidence to check:** `frontend/src/lib/sw.ts`, `frontend/public/offline.html`, `frontend/src/pages/SyncCentre.tsx`.

---

### Q10. Give me a short, realistic demonstration sequence.

**Evaluator's intent:** See whether the team has rehearsed, and whether the sequence is achievable.

**Recommended spoken answer:**
In about eight minutes: student files a hostel complaint from a location code; show the case with its
priority, SLA and assigned department; switch to staff and resolve it with a note; switch back and verify
it, then reopen to show the guard; open the command centre for ageing and resolution; publish a targeted
notice and show the audience count; cut the network briefly to show the offline queue and replay; finish
at the gate desk refusing a duplicate exit. Then stop, and leave time for questions.

**Possible follow-up:** That is a lot for eight minutes. What do you cut first?

**Recommended follow-up answer:**
The notice studio, because it is the most self-explanatory from a screenshot, and the certificate PDF,
because it is already an asset. The lifecycle, the offline queue and the gate refusal are the three I would
protect.

**Evidence to check:** `docs/guides/demo-script.md` (12-minute version), `backend/scripts/e2e_demo.py`.

---

### Q11. If your demo fails completely, what is your fallback?

**Evaluator's intent:** Test crisis planning.

**Recommended spoken answer:**
Three layers. First, reset and retry — reseeding is a single command and the local stack is independent of
the venue network. Second, the backend test suite as behavioural proof, run in front of the jury if
needed. Third, the API's own interactive documentation, which shows the endpoints are real. What I would
not do is claim something works while a red error is on the screen.

**Possible follow-up:** What single preparation step matters most before this review?

**Recommended follow-up answer:**
A full timed rehearsal on the actual review laptop, twice in a row, including the reseed between runs.
Everything else is recoverable; an unrehearsed path is not.

**Evidence to check:** `run.bat`, `stop.bat`, `docs/guides/demo-script.md` §"Rapid Presentation Troubleshooting".

---

# SET 5 — Feasibility, Adoption, and Sustainability

**Evaluator's mindset:** *"The hackathon ends. Nobody signs a contract. Why would this survive Monday?"*

### Q1. Who in a college would actually approve adoption?

**Evaluator's intent:** Test understanding of the buying decision.

**Recommended spoken answer:**
Realistically, the registrar or an administrative head who feels the visibility gap, with the principal or
dean signing off, and IT standing up the deployment. That is exactly why we designed management as one
configurable role: the office that runs the campus day to day also configures it, so adoption does not
require two departments to agree on a workflow. We have not taken this to any institution, so I am
describing the intended path, not a closed deal.

**Possible follow-up:** Has any institution expressed interest?

**Recommended follow-up answer:**
`[TEAM MUST VERIFY OR PERSONALIZE THIS ANSWER — do not invent a pilot, a letter of intent, or a
conversation.]` If nothing exists, say plainly: no, and a pilot is the thing we would want next.

**Evidence to check:** `docs/guides/adoption-plan.md` (Phase 0, "First Responders").

---

### Q2. How would a college introduce this without disrupting a term?

**Evaluator's intent:** Test rollout realism.

**Recommended spoken answer:**
Our adoption note proposes a four-week, phased rollout: configure the institution file and import
reference data, import staff and students, pilot hostel maintenance at one hostel, then add certificates
and the gate pass, then training and the optional agents. It is deliberately additive — the pilot runs
beside existing processes rather than replacing them on day one.

**Possible follow-up:** Four weeks is optimistic. What usually goes wrong?

**Recommended follow-up answer:**
The reference data. Rooms, locations and assignments are the imports most likely to be incomplete, and
without them QR codes and routing do not line up. If I had to bet on a delay, it would be there, not in
the software.

**Evidence to check:** `docs/guides/adoption-plan.md` (four-week timetable and ingestion order).

---

### Q3. Why would busy staff change how they work?

**Evaluator's intent:** Probe motivation, not features.

**Recommended spoken answer:**
The honest answer is that they change when the system makes their day easier or their manager asks for
it. Our bet is the first: the technician sees one queue instead of being told about a problem twice, the
warden approves a leave without chasing a slip, and the gate desk gets a refusal reason instead of an
argument. And because the workload view is shared, a technician can show what they cleared without being
asked.

**Possible follow-up:** A technophobic warden may just ignore it. Then what?

**Recommended follow-up answer:**
Then the pilot tells you that quickly, which is itself useful. The mitigation is that their approval queue
is scoped and small, and the notice and feedback features can carry the nudge. I will not claim that
solves a resistant person; people are the hard part of any rollout.

**Evidence to check:** `docs/guides/adoption-plan.md`, `frontend/src/pages/admin/Approvals.tsx`.

---

### Q4. How hard is initial setup, honestly?

**Evaluator's intent:** Test whether "an hour to set up" is a real claim.

**Recommended spoken answer:**
For a demo instance, one command: a launcher brings up PostgreSQL, runs the migrations, seeds a demo
campus, and starts the backend and frontend. For a real institution it is more work — editing the
institution configuration and importing their reference data, which our guide lays out step by step. The
"within an hour" claim in our README is about a running instance, not about a fully migrated campus, and
I would rather say that than blur the two.

**Possible follow-up:** So the one-hour claim is misleading?

**Recommended follow-up answer:**
It is accurate for setup and misleading for adoption, and I will not defend it as adoption. Setup is an
hour; migration is weeks.

**Evidence to check:** `README.md` ("The Adoption Promise"), `run.bat`, `docs/guides/setup-guide.md`.

---

### Q5. Who maintains this after the hackathon?

**Evaluator's intent:** Test sustainability of the team, not just the code.

**Recommended spoken answer:**
Today, the team — six of us, with the repository as the source of truth. Sustainability depends on a
decision we have not made: whether this becomes a maintained open-source project or gets handed to an
institution's IT team. The code is MIT-licensed and self-hostable with a documented update path, so
handover is possible without us. `[TEAM MUST VERIFY OR PERSONALIZE your actual post-hackathon commitment.]`

**Possible follow-up:** If you all graduate, does the college lose the system?

**Recommended follow-up answer:**
Not the system — it is a standard FastAPI, PostgreSQL and React stack with migrations and a documented
deploy path, so any competent team can take it. What they would lose is our familiarity. That is a real
risk for any student project and I will not pretend otherwise.

**Evidence to check:** `LICENSE`, `docs/deployment/DEPLOYMENT.md`, `docker-compose.selfhost.yml`.

---

### Q6. What might a college have to pay for?

**Evaluator's intent:** Detect invented business models.

**Recommended spoken answer:**
We have not priced anything, and I will not invent a model on the spot. The concrete costs a college would
face are infrastructure — a server or a managed database and hosting — plus someone's time for
maintenance and migration. The software is MIT-licensed, so there is no licence fee as it stands. Pricing
is a business decision the team has not taken.

**Possible follow-up:** Then how is this sustainable as a product?

**Recommended follow-up answer:**
As a hackathon submission it does not need to be a business. If the team chose to continue it, hosting and
support would be the natural cost centres, but that is a plan, not a commitment. `[TEAM MUST VERIFY OR
PERSONALIZE if the team has an intended model.]`

**Evidence to check:** `LICENSE` (MIT), `docs/deployment/SUPABASE.md` and `render.yaml` (hosting shape).

---

### Q7. The college already has an ERP. What is your answer to that?

**Evaluator's intent:** Test the coexistence story.

**Recommended spoken answer:**
Coexist rather than replace. The ERP keeps the records it is good at; Campus Relay carries the operational
request layer and the audit trail that the ERP usually does not cover well. The realistic integration
points are staff and student reference data from the ERP and, later, an API handshake. We have not built
that connector against a specific ERP, so it is an integration we would scope with the college rather than
a feature I can show today.

**Possible follow-up:** "Scope it later" means it does not exist. Why mention it?

**Recommended follow-up answer:**
Because the alternative — promising a connector we have not built — is worse. The honest position is that
import paths exist for CSV reference data, and a live ERP connector is future work.

**Evidence to check:** `backend/app/services/data_transfer.py`, `templates/` (CSV import templates).

---

### Q8. What if the administration simply refuses to adopt it?

**Evaluator's intent:** Test the pitch under rejection.

**Recommended spoken answer:**
Then we would ask what they are afraid of, because the usual answers are loss of control or extra work.
The first is answered by data ownership and by the fact that nothing is overwritten — the audit trail is
append-only and the data is theirs. The second is answered by scoping each station to what that person
already does. If they still refuse, the honest conclusion is that the problem is not felt strongly enough
there yet, and no demo fixes that.

**Possible follow-up:** Convince me as a reluctant administrator in one line.

**Recommended follow-up answer:**
"You will stop losing requests, and you will be able to prove what your office did about them — without
replacing the systems that already work."

**Evidence to check:** `docs/guides/adoption-plan.md` §"Data Ownership & Sovereignty".

---

### Q9. Would you need to change the software for each college?

**Evaluator's intent:** Test the configurability claim.

**Recommended spoken answer:**
That is the design goal, and I can point at the mechanism: identity, vocabulary, design language,
languages, station behaviour, module switches and accessibility guardrails all come from one institution
configuration file served by the API and editable without a rebuild. Reference data is imported. So a new
college should be configuration, not a fork — with the honest caveat that no college has actually done it
yet.

**Possible follow-up:** Show me one thing that is still hardcoded.

**Recommended follow-up answer:**
The demo tenant's identity is in the seeded data, and the design tokens ship with defaults even though the
skin is configurable. Those are defaults rather than hard limits, but I would rather admit the seam than
claim a perfectly clean configuration boundary.

**Evidence to check:** `config/institution.json`, `backend/app/api/v1/institution.py`,
`frontend/src/state/institution.tsx`, `docs/specifications/CONFIGURATION.md`.

---

### Q10. How would you prove the effort is worth it before a college commits?

**Evaluator's intent:** Test the pilot design.

**Recommended spoken answer:**
By running one workflow in one hostel for a fixed period and comparing before and after on measures the
college already tracks: complaints received, complaints closed, median time to close, and how many were
reopened. If the numbers do not improve, the pilot has told the college something useful cheaply. We have
not run such a pilot, so these are proposed measurements, not results.

**Possible follow-up:** How long would a pilot need to be meaningful?

**Recommended follow-up answer:**
One term is a reasonable minimum, because the weekly rhythm of complaints matters and a two-week window
would be noisy. `[TEAM MUST VERIFY this against your own recommendation.]`

**Evidence to check:** `docs/guides/adoption-plan.md`, `backend/app/services/analytics.py`.

---

### Q11. What is the biggest adoption risk, and what would you do about it?

**Evaluator's intent:** Test prioritisation of real risks.

**Recommended spoken answer:**
People, not technology. If staff find the system to be extra reporting rather than less chasing, they
will work around it, and no amount of features fixes that. The mitigation is to pilot where the pain is
sharpest — hostel maintenance, with technicians who currently get told twice about the same tap — and to
show the office the visibility it gains, so the people doing the work see why it is worth their minute.

**Possible follow-up:** And if that fails?

**Recommended follow-up answer:**
Then the project stays a strong technical answer to the brief with no institutional traction, and I would
report that honestly rather than inflate a pilot that did not happen.

**Evidence to check:** `docs/guides/adoption-plan.md`, PS07 evaluation criterion "usability, adoption
realism and demo quality" (15%).

---

# SET 6 — Risks, Trust, Privacy, and Accountability

**Evaluator's mindset:** *"I am looking for the ways this hurts someone in real use. Do not sell me
reassurance; show me the controls and the gaps."*

### Q1. How do you control what each role can access?

**Evaluator's intent:** Test the RBAC model.

**Recommended spoken answer:**
On the server, not the client. Every route carries a permission check, and there are 71 permissions mapped
to three roles. Beyond permission, there is data scope: a warden's queries are narrowed to their hostels, a
teacher to the classes and department they own, a student to their own records. The frontend also hides
what you cannot use, but that is convenience — the enforcement is server-side.

**Possible follow-up:** What stops someone from calling the API directly with a stolen token?

**Recommended follow-up answer:**
They get exactly the rights of that token's role and scope, no more. So a stolen student token reaches
student endpoints for that student only, and reading another student's case returns 403. The exposure is
the token lifetime, which defaults to twelve hours, and that is the part I would tighten first in a real
deployment.

**Evidence to check:** `backend/app/api/deps.py`, `backend/app/core/permissions.py`,
`backend/app/services/scoping.py`, `backend/tests/test_auth_rbac.py`.

---

### Q2. What stops a student from reading another student's complaint?

**Evaluator's intent:** Test tenant and row-level isolation.

**Recommended spoken answer:**
Scoping on the server combined with the permission set. A student holds read-own on cases, and the query
is filtered to their own records; guessing another case's ID returns a forbidden response rather than an
empty list or, worse, the record. There is a test asserting cross-student reads are refused.

**Possible follow-up:** What about management? Can they read everything?

**Recommended follow-up answer:**
Management is deliberately one broad role with campus-wide visibility, because that is the office that
runs the campus. The narrowing for a warden or gate station is scope, not a separate credential. So yes,
an administrator can see campus data — and every action they take is in the audit trail.

**Evidence to check:** `backend/app/core/permissions.py`, `backend/tests/test_auth_rbac.py`.

---

### Q3. What if a student submits a false request, or one staff disagree with?

**Evaluator's intent:** Test dispute handling.

**Recommended spoken answer:**
The request is linked to an authenticated account, and a rejection carries a reason that stays in the
history. If it was genuinely wrong, the case can be closed with an explanation and that explanation is
part of the record. What the system deliberately does not do is let anyone quietly delete it — the event
history is append-only.

**Possible follow-up:** False complaints could be a workload problem. Can you rate-limit or ban?

**Recommended follow-up answer:**
There is request rate limiting on the API, and the policy engine deduplicates at intake, so a flood of
identical complaints does not become a flood of cases. An account-level abuse policy is an institutional
decision more than a code feature — we provide the evidence trail to support it.

**Evidence to check:** `backend/app/core/ratelimit.py`, `backend/app/services/policy.py`.

---

### Q4. Can somebody manipulate or dispute a resolution?

**Evaluator's intent:** Test the integrity of the record.

**Recommended spoken answer:**
Manipulating the history is designed to be impossible even for an administrator with database access:
updates and deletes on the audit log, case events, gate logs and notification events are rejected by
database triggers created in a migration. Disputing a resolution is expected, not prevented — the student
reopens and a new event is appended. So the record shows the disagreement instead of hiding it.

**Possible follow-up:** Triggers can be dropped by a database owner. Is that real protection?

**Recommended follow-up answer:**
A superuser can drop a trigger; no schema-level control stops someone who owns the database. What it stops
is accidental or application-level rewriting, and casual tampering through the app or a query console.
For protection from the database owner you would need external immutable storage or signed log shipping,
which we have not built.

**Evidence to check:** `backend/alembic/versions/0002_append_only_guards.py`, `backend/app/models/immutability.py`.

---

### Q5. What happens if synchronization fails halfway?

**Evaluator's intent:** Test failure handling in the offline path.

**Recommended spoken answer:**
Each queued operation is replayed individually with its own key, so a failure in one does not lose the
others. A transient network failure moves the operation to retrying with backoff; a permanent failure,
like a policy violation, stops and requires the user to fix the data; and a state mismatch becomes a
conflict with the server's current record returned so the user can reconcile. The sync centre shows which
operations are in which state.

**Possible follow-up:** Have you tested this under real network flakiness?

**Recommended follow-up answer:**
We have tested the logic — replay does not duplicate, and a stale mutation conflicts — and demonstrated it
with the browser offline toggle. We have not run it against genuinely flaky networks over days, so I would
call that unverified in the field.

**Evidence to check:** `backend/app/services/sync.py`, `backend/tests/test_sync_idempotency.py`,
`frontend/src/pages/SyncCentre.tsx`.

---

### Q6. Conflicting offline changes from two staff members — what wins?

**Evaluator's intent:** Test conflict semantics.

**Recommended spoken answer:**
Not last-write-wins, deliberately. A replayed transition has to be valid from the server's current state,
so if one person already moved the case on, the other's stale change is rejected with a conflict and the
current record, rather than silently overwriting. That is stricter than a document-editing model, and it
is the right strictness for approvals and resolved statuses.

**Possible follow-up:** That means staff get an error and have to redo work. Isn't that annoying?

**Recommended follow-up answer:**
It can be, and the trade-off is deliberate: for a leave approval or a case status, silently resolving a
conflict is worse than asking. If we wanted smoother merges we would need field-level rules, which is
future work.

**Evidence to check:** `backend/app/services/sync.py`, `docs/architecture/offline-sync.md` §conflict semantics.

---

### Q7. What if the server is unavailable?

**Evaluator's intent:** Test availability story.

**Recommended spoken answer:**
The client keeps working from its cache and queues writes, so a student can still file and read on their
device. What stops working is anything needing a fresh server decision — approvals, verification results,
gate validation against the live pass state. The gate desk is the sensitive one; I would not claim offline
gate validation is safe without a clear reconciliation rule, and I would check what our gate logging
actually does offline before asserting it. `[TEAM MUST VERIFY the offline gate-logging behaviour before
answering this in a live review.]`

**Possible follow-up:** So the gate — your security feature — may not work offline?

**Recommended follow-up answer:**
That is a genuine boundary and I would rather state it than hand-wave. Offline gate logging is listed as a
supported sync operation, which means movements can be recorded and replayed, but anti-passback depends on
knowing the pass state. If the answer matters for a review, we should verify it on the machine beforehand
rather than guess.

**Evidence to check:** `docs/architecture/offline-sync.md` (`GATE_LOG`), `backend/app/services/gate.py`,
`frontend/src/lib/offline.ts`.

---

### Q8. What personal information do you collect, and where does it live?

**Evaluator's intent:** Test privacy awareness.

**Recommended spoken answer:**
The usual institutional records: identity and contact details, student academic and hostel context, the
requests they raise, and audit events about actions taken. It lives in the institution's own PostgreSQL
database — for a self-hosted install, nothing leaves the campus. The physical QR codes are designed to
carry only a location identifier, never student details.

**Possible follow-up:** Do students know what is recorded about them?

**Recommended follow-up answer:**
There is a privacy expectation setting in the configuration, and the notice system can carry the
institution's own policy. But a formal data-protection review has not been done, and I would not claim full
compliance with any specific act.

**Evidence to check:** `config/institution.json`, `docs/architecture/security.md`, `frontend/src/pages/GuidePage.tsx`.

---

### Q9. What security testing have you actually performed?

**Evaluator's intent:** Separate testing from hoping.

**Recommended spoken answer:**
Automated permission and isolation tests — cross-student reads refused, unauthenticated requests refused,
role boundaries asserted — plus an authorization audit script that checks the permission matrix, and
static review of the auth dependencies. What we have not done is a penetration test, an OWASP-style review
or any fuzzing. So I can say the access control is tested, not that the system is secure.

**Possible follow-up:** Is there any known security weakness you would disclose?

**Recommended follow-up answer:**
Two I would name: the session token is stored in browser local storage, which means an XSS flaw would expose
it, and that is a documented trade-off rather than an accident; and there is no multi-factor
authentication. Both would be on the list before any real deployment.

**Evidence to check:** `backend/scripts/audit_authz.py`, `frontend/src/lib/api.ts` (token storage),
`backend/app/core/security.py`.

---

### Q10. What has to happen before a real college could go live?

**Evaluator's intent:** Test the go-live checklist.

**Recommended follow-up answer path:** Give a concrete, short list.

**Recommended spoken answer:**
Replace the development secret key, put the API behind TLS with a real domain and correct CORS origins, do
a data-protection review, set an institution-specific policy for retention and access, run a pilot with
training, and add the frontend tests and a load test so we have evidence rather than assurance. And a
backup and restore rehearsal — pg_dump works, but we have not timed a restore.

**Possible follow-up:** That is a long list. Is the project ready for production?

**Recommended follow-up answer:**
No — and our README's badge saying production ready is aspirational, not a verified statement. For a
hackathon prototype it is strong; for production I would insist on the list above.

**Evidence to check:** `.env.example`, `backend/app/core/config.py`, `docs/deployment/DEPLOYMENT.md`.

---

### Q11. Who is accountable when something goes wrong inside the system?

**Evaluator's intent:** Test the accountability model end to end.

**Recommended spoken answer:**
The audit trail answers "who did what and when": logins and failed logins, case transitions, assignments,
approvals, gate movements and notice receipts each become an append-only event. So an incorrect closure
points at the person and the moment, and the student's verification or reopen is part of the same chain.
The institution owns the data and the policy; the software's job is to not let that history be rewritten.

**Possible follow-up:** Could someone blame the system instead of themselves?

**Recommended follow-up answer:**
They can try, but the events record the actor and the reasons they gave. What the trail cannot tell you is
whether a reason was honest — that is a management judgment, not a database one.

**Evidence to check:** `backend/app/services/audit.py`, `backend/app/models/case.py`, `backend/app/api/v1/admin.py`.

---

# SET 7 — Aggressive Evaluator and Difficult Follow-Ups

**Evaluator's mindset:** *"I am not convinced. I will keep pushing on the weak points. Answer the question
you were asked, concede what is true, and do not argue with me."*

### Q1. You say this is innovative, but what is actually new here?

**Evaluator's intent:** Strip away language and find a defensible novelty claim.

**Recommended spoken answer:**
Very little is new in isolation; I will concede that. Ticketing, offline caching and audit logs all exist.
What I would defend is the combination and the enforcement: one configurable case engine across services,
immutability enforced at the database, requester-side verification, and a kiosk path for students with no
phone. If the standard is "has nobody ever built anything like this", we fail — and so would most
submissions.

**Possible follow-up:** Then why should you get marks for innovation?

**Recommended follow-up answer:**
Because the brief rewards solving the friction, not novelty for its own sake, and because the combination
is what makes the friction go away. I would rather be judged on whether the workflow works than on whether
the idea is unprecedented.

**Evidence to check:** PS07 evaluation criteria; `docs/guides/competitive-gap.md`.

---

### Q2. You have described a large problem, but where is your evidence?

**Evaluator's intent:** Test whether the problem claim is grounded.

**Recommended spoken answer:**
Our evidence for the problem is the brief itself and the operational reality it describes, plus the
qualitative gap we can point at: no SLA ownership, no audit trail, no proof of notice receipt. Our evidence
that we solve it is the running system and its tests. What we do not have is our own measured problem
data — no campus survey, no complaint statistics — so I will not quote a figure.

**Possible follow-up:** So you built a solution to a problem you have not measured?

**Recommended follow-up answer:**
Yes, and that is a fair criticism. Measuring the problem at one hostel is exactly what a pilot would do
first. Building the wrong solution precisely is worse than building a good one against a documented brief.

**Evidence to check:** `docs/hackathon/Problem_Statement_7.pdf`, `PROJECT_DISCOVERY_REPORT.md` §3.

---

### Q3. How do you know students will actually use it?

**Evaluator's intent:** Expose adoption assumptions.

**Recommended spoken answer:**
I do not know, and I will not claim I do. There is no usage data. What I can argue is the incentive
structure: the student gets a visible status, an SLA clock and a say in whether the fix is accepted, which
a WhatsApp message does not give them. Whether that is enough to change habit is a hypothesis a pilot
would test.

**Possible follow-up:** What would make you abandon that hypothesis?

**Recommended follow-up answer:**
If students kept filing through existing channels and only used our system when told to, or if the reopen
rate showed they did not trust the verification step. That would tell us the status visibility is not the
value we think it is.

**Evidence to check:** No usage data exists in the repository — say so plainly.

---

### Q4. What if your solution is more complicated than the problem itself?

**Evaluator's intent:** Test self-criticism about over-engineering.

**Recommended spoken answer:**
That is the fairest challenge in this room. A tap that leaks needs a phone call, not a state machine. Our
answer is that the machinery exists for the cases where the simple route fails: nobody owns it, it ages,
it is disputed, or the network is down. Where the simple route works, we are heavier. I would rather say
that than pretend the complexity is free.

**Possible follow-up:** Then simplify. What would you cut?

**Recommended follow-up answer:**
For a pilot, I would hide the parts a hostel does not need — placements, HR, the broader catalogue — and
ship the maintenance and notice flow alone. The configuration already allows module switches, so cutting
scope is configuration rather than rewriting.

**Evidence to check:** `config/institution.json` (module switches), `frontend/src/lib/navigation.ts`.

---

### Q5. Why should I invest resources in this instead of improving the current ERP?

**Evaluator's intent:** Force the value comparison.

**Recommended spoken answer:**
Because the gap is architectural: the missing audit trail, the missing SLA and the offline dead zone are
not colours on a form. If the college's ERP already has them, then honestly, improve the ERP. Our case is
strongest where it does not — and for a college with registers and WhatsApp groups, that is most of the
operational layer.

**Possible follow-up:** Which is it — replace or integrate? Pick one.

**Recommended follow-up answer:**
Integrate for the reference data and the records, replace only the operational request handling. That is a
single position, not a dodge.

**Evidence to check:** `docs/guides/adoption-plan.md` (phased, additive rollout).

---

### Q6. What happens if nobody uses it?

**Evaluator's intent:** Test resilience to failure.

**Recommended spoken answer:**
Then it remains a working prototype and an honest negative result. The team would have a system with real
tests and a documented migration path, and the campus would learn that the friction was tolerated rather
than painful. I would rather report that than fabricate a pilot.

**Possible follow-up:** Isn't that a failed project?

**Recommended follow-up answer:**
It would be a project without adoption, which is different from a project that does not work. For a
hackathon the deliverable is a working prototype against the brief, and that part stands on its own.

**Evidence to check:** PS07 deliverables list.

---

### Q7. What is your strongest single piece of evidence?

**Evaluator's intent:** Make the team choose.

**Recommended spoken answer:**
The running case lifecycle with the verification guard, backed by the test that asserts staff cannot
unilaterally close it. It is the shortest path from "we claim accountability" to "here is the mechanism
and here is the test". If I could show the judge one thing, that is it.

**Possible follow-up:** That is one workflow. The brief wants three.

**Recommended follow-up answer:**
Then the hostels, the gate pass and the notices, which are exactly the three the brief names, all with code
and tests. The verification guard is simply the one I would lead with because it is the most defensible.

**Evidence to check:** `backend/tests/test_case_engine.py`, `backend/tests/test_leave.py`,
`backend/tests/test_notices_notifications.py`.

---

### Q8. What is your biggest failure so far?

**Evaluator's intent:** Test candour.

**Recommended spoken answer:**
Letting the documentation drift from the code. Our own architecture document still describes eight roles
while the system has three, and our README claimed a state that the code did not match until we aligned
it. That is a real failure of discipline in a project whose whole pitch is auditability, and we found it by
inspecting our own repository rather than trusting the docs.

**Possible follow-up:** If you cannot keep your docs honest, why should I trust your audit trail?

**Recommended follow-up answer:**
You should trust the thing that is mechanically enforced and tested, and check the rest. The audit trail is
enforced by database triggers and covered by tests; the prose is not. That gap is exactly why our answers
point at code, and the docs are being corrected.

**Evidence to check:** `docs/architecture/security.md` (eight roles) vs `backend/app/models/enums.py` (three).

---

### Q9. What would make me reject this proposal?

**Evaluator's intent:** See whether the team understands the bar.

**Recommended spoken answer:**
If the three required workflows did not actually run, if the offline claim were only a message on screen,
or if the numbers were invented. Any of those would deserve rejection. Also, if I could not explain what
problem a specific feature solves, I would rather cut it than decorate the submission with it.

**Possible follow-up:** Is there any feature you would cut right now on that test?

**Recommended follow-up answer:**
The predictive or "intelligence" framing around the agents, unless we are precise: they are deterministic
helpers for classification and briefing, not machine learning. If a judge hears "AI" and we cannot show a
model, that embellishment hurts us more than it helps.

**Evidence to check:** `backend/app/services/agents/provider.py` (`RulesProvider` default).

---

### Q10. If I give you only 30 more days, what will you do first?

**Evaluator's intent:** Test prioritisation under constraint.

**Recommended spoken answer:**
Week one: fix the documentation drift, repair and rehearse the end-to-end demo script, and re-run the full
suite from a clean reseed. Week two: get a verified deployment with a public health endpoint and correct
origin configuration, and capture real screenshots from it. Week three: add frontend tests for the two
flows that matter — filing a case and the offline queue. Week four: a live pilot at one hostel with
baseline measurements. That order is deliberate: credibility, then evidence, then adoption.

**Possible follow-up:** You put deployment before features. Why?

**Recommended follow-up answer:**
Because a reachable URL and a green suite answer the judge's hardest question — "does it actually run?" —
faster than another feature does. Features we already have in plenty.

**Evidence to check:** `PROJECT_DISCOVERY_REPORT.md` §10 (proposed plan).

---

### Q11. Can you defend your claims without relying on future promises?

**Evaluator's intent:** Separate present from planned.

**Recommended spoken answer:**
For the core, yes. The case engine, the leave and gate flow, the notices, the offline queue and the
document verification are present and testable now. What I would have to mark as planned is the deployment
verification, the frontend tests, frontend load evidence, and any real pilot. I will say the word
"planned" whenever it applies.

**Possible follow-up:** Give me one claim you have made today that is actually only planned.

**Recommended follow-up answer:**
"Production ready" — that is a badge in our README, and it is aspirational. We have a working prototype and
a go-live checklist, not a production deployment.

**Evidence to check:** `README.md` (badge), `docs/deployment/DEPLOYMENT.md`.

---

### Q12. What is the single strongest reason I should select your project?

**Evaluator's intent:** Force the closing argument, once.

**Recommended spoken answer:**
Because it is the rare submission where the hard parts are real: it genuinely works offline with
idempotent replay, the audit trail is enforced at the database rather than promised, and the brief's
no-smartphone requirement is answered with a working kiosk and helpdesk path. And it does that inside one
engine rather than five disconnected apps. You can verify all of it today, and we have been honest about
what is not finished.

**Possible follow-up:** Summarise the project in one sentence.

**Recommended follow-up answer:**
One tracked workflow for every routine campus request, working offline and at a kiosk, with an audit trail
that cannot be quietly rewritten.

**Evidence to check:** `backend/app/services/`, `frontend/src/pages/kiosk/`, `.github/workflows/ci.yml`.

---

# SET 8 — Impact, Measurement, and Future Roadmap

**Evaluator's mindset:** *"Show me how you would know this is working, and what you would do next. I will
treat every number as a proposal unless you can prove it."*

### Q1. How will you measure whether Campus Relay is successful?

**Evaluator's intent:** Test whether impact can be measured without invention.

**Recommended spoken answer:**
Through the data the system already records, compared before and after a pilot at one hostel: how many
cases are raised, how many close within their SLA target, the median time from the first event to
closure, and how many are reopened after a resolution. Those come from the case event history, so they are
derived from real activity rather than a survey. Today they are proposed measures — we have not recorded a
pilot period.

**Possible follow-up:** Those are system metrics. What about the student's experience?

**Recommended follow-up answer:**
The honest proxies are reopen rate, which says whether the fix held, and verification rate, which says
whether students engaged with the closure step at all. A short pilot survey would be the direct measure,
and we have not run one.

**Evidence to check:** `backend/app/services/analytics.py`, `backend/app/api/v1/admin.py` (resolution times).

---

### Q2. What would you measure before and after a pilot?

**Evaluator's intent:** Test experimental design, lightly.

**Recommended spoken answer:**
Baseline from the hostel's own records for a comparable period: complaints received, complaints resolved,
median resolution time, and complaints that were raised twice. During the pilot, the same measures from the
system, plus the two new ones the system enables — cases closed within SLA, and the reopen rate. Same
workflow, same hostel, so the comparison is at least honest.

**Possible follow-up:** What if the baseline does not exist because it was all paper?

**Recommended follow-up answer:**
Then the paper register is the baseline, and the first job is transcribing a representative period. If even
that is impossible, we can only report pilot-period metrics as a description, not an improvement claim.

**Evidence to check:** `docs/guides/adoption-plan.md` (baseline idea), `backend/app/services/analytics.py`.

---

### Q3. How could the system reduce unresolved requests?

**Evaluator's intent:** Test the mechanism, not a promise.

**Recommended spoken answer:**
By making unresolved work visible. The SLA sweep flags cases at risk or breached, the ageing buckets make a
ticket older than a week stand out instead of sitting in a register, and the workload view shows
concentration on one technician. Reducing unresolved cases comes from nobody being able to say "I did not
know it was still open" — that mechanism exists; the reduction itself is a claim we have not measured.

**Possible follow-up:** Have you seen that happen?

**Recommended follow-up answer:**
Not with real cases. In the demo data, the sweep correctly flags seeded cases, but that is a mechanism
demonstration, not field evidence.

**Evidence to check:** `backend/app/services/sla.py`, `frontend/src/pages/admin/CommandCentre.tsx`.

---

### Q4. How would you measure service resolution time?

**Evaluator's intent:** Test measurement precision.

**Recommended spoken answer:**
From the append-only event history: the timestamp of the first event on a case to the timestamp of the
closure event, reported as a median by service and by SLA band rather than a single campus average, which
would hide the difference between a plumbing fix and a certificate. The admin analytics already compute
resolution-time metrics; the interpretation would come from splitting them this way.

**Possible follow-up:** What would a good value be?

**Recommended follow-up answer:**
Whatever the college's own SLA says, which is why the SLA targets are configurable rather than fixed by us.
I will not invent a target like "under 24 hours".

**Evidence to check:** `backend/app/services/analytics.py`, `backend/app/services/sla.py`,
README's honest-replacement table (PROJECT_DISCOVERY_REPORT.md §8).

---

### Q5. How would you know whether notices reach their intended audience?

**Evaluator's intent:** Test the communication measurement.

**Recommended spoken answer:**
Each recipient carries a state — delivered, read, and acknowledged where the notice requires action — and
the studio aggregates the counts per notice. So "sent" is not the measure; the read and acknowledgement
rates for the targeted audience are. What we have not done is test whether a low acknowledgement rate
means the notice was ignored or that the requirement was unnecessary — that is a policy question for the
institution.

**Possible follow-up:** External platforms like WhatsApp do not give privacy-safe read receipts. How do you
square that?

**Recommended follow-up answer:**
Our read tracking is in-app, inside our own database. External delivery is treated as delivery, not read,
and we do not claim a WhatsApp read receipt. That is stated in our requirements note as a deliberate
scope boundary.

**Evidence to check:** `backend/app/api/v1/notices.py`, `docs/guides/requirements.md` §"Deliberately Out of Scope".

---

### Q6. How would you test offline synchronization properly?

**Evaluator's intent:** Test verification rigour.

**Recommended spoken answer:**
Three levels. Logic level, which exists: replaying the same operation must not create a second case, and a
stale mutation must conflict. Behaviour level, which we demonstrate: cut the network, file, reload, restore,
and show exactly one case and one synced event. Field level, which we have not done: run the tablet on
genuinely patchy Wi-Fi over several days and count queued operations, replays, conflicts and losses. The
third is the one that would actually convince me.

**Possible follow-up:** What is a failure you would specifically look for?

**Recommended follow-up answer:**
A queued operation that never replays and never reports — a silent loss. That would be worse than a visible
conflict, and it is the case I would instrument first.

**Evidence to check:** `backend/tests/test_sync_idempotency.py`, `frontend/src/lib/sync.ts`.

---

### Q7. Which features should be prioritised next?

**Evaluator's intent:** Test whether priorities match the evaluation criteria.

**Recommended spoken answer:**
In order: close the evidence gaps before adding features — a verified deployment, frontend tests for the
filing and offline flows, and a real pilot with a baseline. Then strengthen the accessibility story, since
the brief weights it at fifteen percent, with an actual slow-network and low-end-device measurement. Then
the external channel configuration for whichever channel a college actually uses.

**Possible follow-up:** No new features at all?

**Recommended follow-up answer:**
Not until the ones we claim are verified. Adding a feature we cannot prove would lower the average quality
of what we present.

**Evidence to check:** `PROJECT_DISCOVERY_REPORT.md` §10, PS07 evaluation weights.

---

### Q8. What would you need to conduct a pilot?

**Evaluator's intent:** Test concrete planning.

**Recommended spoken answer:**
One willing hostel and its warden, one hosting decision, the reference data for that hostel — rooms,
locations, staff — the institution configuration edited, a short training session for the warden and
technician, and agreement on the baseline period and the measures. Permission to hold students' data is
the non-negotiable item, and that belongs to the college.

`[TEAM MUST VERIFY OR PERSONALIZE who would authorise this and where it would run. Do not name an
institution that has not agreed.]`

**Possible follow-up:** How long would the pilot need to be?

**Recommended follow-up answer:**
A term, as a minimum, so the comparison is not dominated by one unusual week. `[TEAM MUST VERIFY this
recommendation.]`

**Evidence to check:** `docs/guides/adoption-plan.md`, `templates/` (import templates).

---

### Q9. What evidence would convince a college to continue using it?

**Evaluator's intent:** Test the retention argument.

**Recommended spoken answer:**
A full term where the numbers the college already tracks moved in the right direction — more cases closed,
fewer raised twice, shorter median resolution — while staff did not spend more time on the system than they
saved. The second half is the one people forget: if the system saves management time but costs the
technician more, the pilot will not survive the term.

**Possible follow-up:** What if the numbers improve but staff hate it?

**Recommended follow-up answer:**
Then I would treat adoption as failed. Staff continuing to use it is part of the outcome, not a footnote.

**Evidence to check:** `docs/guides/adoption-plan.md` (Phase 4 training).

---

### Q10. What would success look like after six months?

**Evaluator's intent:** Test the long view without fantasy.

**Recommended spoken answer:**
Six months in, success would be: one pilot department or hostel running day to day on the system, notices
going out through it with acknowledgement tracked, the gate pass used at a real gate, and a term's worth
of audit history the college could actually rely on. Not campus-wide — one place where it demonstrably
replaced the old habit.

**Possible follow-up:** And failure at six months?

**Recommended follow-up answer:**
A system that runs but nobody uses, and a college that politely thanks us and goes back to the register.
That is the honest definition of the downside.

**Evidence to check:** `docs/guides/adoption-plan.md` (phased rollout).

---

### Q11. How would you know the accessibility claims are true?

**Evaluator's intent:** Test the low-end-device evidence.

**Recommended spoken answer:**
Partly now, partly by measurement. The interface has configurable accessibility guardrails — a contrast
level, a minimum touch target, and a rule that a status always carries its word and not only its colour —
plus trilingual strings and reduced-motion handling. What is not measured is performance on a genuinely
low-end phone over a slow connection; the production build passes, but that is not the same evidence. A
throttled-network test on a low-end device is the missing piece.

**Possible follow-up:** So the low-bandwidth requirement is unproven?

**Recommended follow-up answer:**
The design and the PWA assets are in place, and the offline path is tested at the logic level. The
low-end-device performance measurement is not done, and I will call it unproven rather than implied.

**Evidence to check:** `config/institution.json` (accessibility guardrails), `frontend/src/lib/i18n.ts`,
`frontend/vite.config.ts`.

---

# SET 9 — Rapid-Fire Evaluation

**Evaluator's mindset:** *"Short questions, quick answers. Do not over-explain."*
Answer format: 5–15 seconds spoken per answer. Practice these until they are reflexes.

**Q1.** What is Campus Relay in one line?
**A.** One tracked workflow for every routine campus request, with an audit trail.

**Q2.** Which problem statement are you on?
**A.** PS07, Fretbox — "Campus Life, Debugged".

**Q3.** How many roles does the system have?
**A.** Three: management, teacher and student. Warden, gate and helpdesk are permissions and stations.

**Q4.** How many users does it have today?
**A.** None — it is a prototype. We have not run a pilot.

**Q5.** How many backend tests pass?
**A.** 145 passing after a demo reseed, across 19 test files.

**Q6.** Why not just use WhatsApp?
**A.** WhatsApp moves a message; it cannot assign an owner, set a deadline or prove who read it.

**Q7.** Why not use an ERP?
**A.** ERPs are strong on records. We are the operational request layer above them.

**Q8.** What is your best feature?
**A.** The requester verification guard — staff cannot unilaterally close a case.

**Q9.** What is your weakest part?
**A.** No frontend automated tests, and no measured performance.

**Q10.** Does the offline mode really work?
**A.** Yes — IndexedDB outbox with idempotent replay; verified at the logic level and in a browser.

**Q11.** What happens on a duplicate sync?
**A.** The server returns the original result instead of creating a second record.

**Q12.** What happens on an offline conflict?
**A.** It returns a conflict with the current server record, not a silent overwrite.

**Q13.** How do you handle a student with no smartphone?
**A.** A touch kiosk with roll-number lookup, and an assisted helpdesk that files on their behalf.

**Q14.** Who approves the adoption in a college?
**A.** An administrative head, with the principal signing off and IT deploying.
**Note:** `[TEAM MUST PERSONALIZE for a real campus context.]`

**Q15.** Is it deployed anywhere public?
**A.** Not verified. The hosted URLs in our docs are examples.

**Q16.** What is the tech stack?
**A.** FastAPI and PostgreSQL behind a React TypeScript PWA.

**Q17.** How many database tables?
**A.** Sixty, with six migrations.

**Q18.** Can an admin rewrite the audit history?
**A.** No — PostgreSQL triggers reject updates and deletes on the event tables.

**Q19.** How many permissions are there?
**A.** Seventy-one, mapped to the three roles, enforced on the server.

**Q20.** Is it available in regional languages?
**A.** Yes — English, Odia and Hindi, all at the same key count.

**Q21.** What is the biggest risk to the project?
**A.** Adoption — staff keeping to old habits and students not switching.

**Q22.** Have you done a security audit?
**A.** Automated access-control tests and an authorization audit script. No penetration test.

**Q23.** Can I verify a certificate you issue?
**A.** Yes — a public endpoint checks the serial and validity without exposing student data.

**Q24.** How do you stop a gate pass being used twice?
**A.** Anti-passback refuses the second exit with a recorded reason.

**Q25.** Is this AI-driven?
**A.** There are four deterministic helper agents by default. An LLM provider is optional and off.

**Q26.** What would you do with 30 more days?
**A.** Fix doc drift and the demo script, deploy it, add frontend tests, then pilot.

**Q27.** What is the strongest reason to select you?
**A.** The hard parts are real and testable: offline replay, trigger-enforced audit, kiosk access.

**Q28.** What is unproven?
**A.** Real adoption, low-end-device performance, and any live deployment.

---

# SET 10 — Final Selection Round

**Evaluator's mindset:** *"This is the last round. I am choosing which projects progress. Be concise, be
honest, and make your case on evidence."*

### Q1. Why should Campus Relay be selected?

**Evaluator's intent:** Test the final argument's concentration.

**Recommended spoken answer:**
Because the brief's hardest requirements are the ones we actually built: three end-to-end workflows, an
administrative view of ageing and resolution, tracked targeted notices, an offline-first client, and a
no-smartphone path. And the parts that usually stay aspirational in a hackathon — trigger-enforced
immutability and idempotent offline replay — are implemented and tested. You can verify all of it in this
session.

**Possible follow-up:** Every team will say their work is real. What is different?

**Recommended follow-up answer:**
The difference is that ours points at files and tests rather than adjectives, and we have named what is
missing. Ask us anything and we will tell you which answers are verified and which are not.

**Evidence to check:** `.github/workflows/ci.yml`, `backend/tests/`, `docs/hackathon/Problem_Statement_7.pdf`.

---

### Q2. Why is the project relevant to this problem statement specifically?

**Evaluator's intent:** Confirm the mapping is deliberate.

**Recommended spoken answer:**
The brief names the four focus areas: hostel maintenance, gate security and curfew, official broadcasts,
and offline resilience. We have a working flow for each — QR-based maintenance with requester
verification, leave to gate pass with anti-passback, targeted notices with read and acknowledgement
tracking, and a local-first outbox. Plus the brief's accessibility requirement, which we answer with a
kiosk and an assisted desk.

**Possible follow-up:** Which of the five evaluation criteria do you score weakest on?

**Recommended follow-up answer:**
Accessibility and low-bandwidth, at fifteen percent — we have the designs and the offline logic, but no
measured low-end-device performance. That is the number I would expect to lose marks on.

**Evidence to check:** `docs/hackathon/Problem_Statement_7.pdf` (focus areas and weights),
`docs/guides/requirements.md`.

---

### Q3. What is your strongest demonstrated capability?

**Evaluator's intent:** Make them commit to one.

**Recommended spoken answer:**
The offline-first case flow end to end: a complaint filed with no network, stored locally, surviving a
reload, replayed once when the network returns, and appearing as a single audited case on the
administrator's side. It is the capability most submissions will not have, and it is demonstrable in a few
minutes.

**Possible follow-up:** Could another team fake that in a video?

**Recommended follow-up answer:**
Not the replay. Faking the queue is easy; proving one operation produced exactly one case after a reload
and a reconnect is where the mechanism shows. That is why I would demonstrate it live rather than show a
recording.

**Evidence to check:** `frontend/src/lib/offline.ts`, `backend/app/services/sync.py`,
`backend/tests/test_sync_idempotency.py`.

---

### Q4. Which assumption remains unproven?

**Evaluator's intent:** Test intellectual honesty at the highest stakes.

**Recommended spoken answer:**
That students and staff will change their habits. Everything technical we can demonstrate here; adoption
is the assumption with no evidence behind it. The second unproven assumption is that a low-end device on a
poor connection is fast enough to be pleasant — we have the design for it, not the measurement.

**Possible follow-up:** If adoption is unproven, why build it at all?

**Recommended follow-up answer:**
Because the brief asks for a working prototype against a documented problem, and adoption is what a pilot
tests. We are not claiming a deployment, and I would rather say that than invent one.

**Evidence to check:** No usage data exists in the repository.

---

### Q5. What is the main reason your project might fail?

**Evaluator's intent:** Test risk judgment.

**Recommended spoken answer:**
Adoption. If a college's staff treat it as extra reporting and students keep using existing channels,
nothing else about the design matters. The second reason would be over-scope — we built a wide catalogue,
and a narrow pilot would have been a stronger story.

**Possible follow-up:** How do you mitigate the second one now?

**Recommended follow-up answer:**
By presenting the pilot as one hostel's maintenance flow, not the campus-wide platform, and using the
configuration switches to show scope is a choice rather than a monolith.

**Evidence to check:** `config/institution.json` (module switches).

---

### Q6. What will your team accomplish next?

**Evaluator's intent:** Test the roadmap's realism.

**Recommended spoken answer:**
Four things, in order: reconcile the documentation with the code and rehearse the demo from a clean
reseed; deploy a verified instance with a live health check; add frontend tests for case filing and the
offline queue; and run a baseline-measured pilot in one hostel. If only one happens, I would choose the
pilot, because it answers the question we cannot.

**Possible follow-up:** Who in the team does what?

**Recommended follow-up answer:**
The roles are documented — architecture and integration, backend and database, frontend and offline,
the case engine and verification, gate pass and stations, and the design system and specifications.
`[TEAM MUST PERSONALIZE if individual assignments have changed.]`

**Evidence to check:** `docs/hackathon/README.md` (team roster), `PROJECT_DISCOVERY_REPORT.md` §11.

---

### Q7. What would you say to an institution that is reluctant to adopt the platform?

**Evaluator's intent:** Test the final pitch to a hesitant customer.

**Recommended spoken answer:**
Start small and reversible. Run one hostel's maintenance flow for a term, keep everything else as it is,
and look at two numbers you already track: how long a complaint takes to close and how often it is raised
twice. The data stays yours, the system is open source, and if it does not help, you have lost a term's
configuration work rather than a procurement project.

**Possible follow-up:** What if they say the software is not mature enough?

**Recommended follow-up answer:**
Then I agree with them for a campus-wide rollout — we have not done a pilot or a load test. The honest ask
is a scoped pilot, not a deployment.

**Evidence to check:** `docs/guides/adoption-plan.md`.

---

### Q8. What final evidence would you present to justify selection?

**Evaluator's intent:** Ask for the closing proof.

**Recommended spoken answer:**
Four things. The live lifecycle — file, route, resolve, verify, reopen. The offline queue surviving a
reload and replaying exactly once. The full backend suite green from a clean reseed, and the CI pipeline
running it with the frontend typecheck and build. And the requirement trace from the PS07 brief to the
specific files that implement each deliverable. Plus an honest list of what is not finished.

**Possible follow-up:** Anything on that list you would not want me to inspect?

**Recommended follow-up answer:**
The frontend tests, because they do not exist — inspect the backend suite instead. And the docs, because
one architecture file still lists the older role model while the code is authoritative. I would rather
point you at the gaps than have you find them.

**Evidence to check:** `backend/tests/`, `.github/workflows/ci.yml`, `docs/guides/requirements.md`.

---

### Q9. In one sentence, what does Campus Relay mean for a student on a bad connection?

**Evaluator's intent:** End on the human point.

**Recommended spoken answer:**
It means their complaint is saved the moment they submit it, has an owner and a deadline, reaches the
person who can fix it, and cannot be quietly closed until they say it is fixed — even if the Wi-Fi dies
while they are filing it.

---

## Closing statement for Shuvransu

*Use this at the end of the evaluation. It is short, grounded in the repository, and makes no claim the
project cannot support.*

> "Campus Relay is our answer to PS07: one tracked workflow for the everyday requests that currently live
> in registers, notice boards and WhatsApp groups. A hostel complaint, a bonafide certificate, a leave and
> gate pass, a notice that needs acknowledging — each one gets a status, an owner, a deadline and an audit
> trail, and the whole thing keeps working when the network does not, plus a kiosk for students who have no
> smartphone at all.
>
> Concretely, what exists today is a working FastAPI and PostgreSQL backend of about sixty tables and a
> React PWA, with a case engine covering policy, workflow, approvals, SLA and audit; leave and gate pass
> with anti-passback; verifiable certificate PDFs; targeted notices with read and acknowledgement tracking;
> an offline outbox with idempotent replay; and roughly a hundred and forty-six backend tests that run in
> CI alongside the frontend typecheck and build.
>
> What we are not claiming is a deployment or a pilot. There is no verified live URL, no measured
> low-end-device performance, and no frontend automated test suite — and one of our architecture documents
> still carries an older role model that the code has moved past. Those are our next four weeks, in that
> order, starting with the pilot.
>
> We would rather show you a system that runs and tell you exactly where it is thin than promise you one
> that does everything. Thank you."

---

# 📋 Shuvransu's Personal Preparation Checklist

### 1. The first 10 questions to practise (in this order)

1. What is Campus Relay in one sentence? *(Set 1, Q1)*
2. What problem does it solve, and for whom? *(Set 1, Q2)*
3. Why not just use WhatsApp or Google Forms? *(Set 2, Q3)*
4. Walk me through the hostel maintenance workflow end to end. *(Set 3, Q1)*
5. What have you actually built so far? *(Set 1, Q3)*
6. Which features are fully implemented, and which are partial? *(Set 4, Q2)*
7. How does the offline mode work? *(Set 1, Q11)*
8. What are your biggest limitations? *(Set 4, Q7 and Set 1, Q9)*
9. What is your strongest demonstrated capability? *(Set 10, Q3)*
10. What is the main reason this might fail? *(Set 10, Q5)*

### 2. The most important competitor comparison to get right

Do **not** claim Campus Relay beats Fretbox or any ERP. The defensible position, straight from
`docs/guides/competitive-gap.md`, is: **feature overlap is expected; the difference is architectural** —
one configurable case engine with database-enforced immutability, requester verification, offline
idempotent replay, and a no-smartphone path in a single deployable. Practise saying "we do not claim
market superiority; we claim an architectural position" without sounding defensive.

**Read before the review:** `docs/guides/competitive-gap.md` — its "Deliberately Honest Framing" and
"Explicit Non-Claims" sections are your script.

### 3. Five features that must be verified on the demo machine before you demonstrate

1. **The case lifecycle** — file, classify, route, resolve, student verifies, and the reopen path.
   `backend/app/services/case_engine.py`
2. **The offline outbox** — file offline, reload, restore network, exactly one case created.
   `frontend/src/lib/offline.ts`, `frontend/src/lib/sync.ts`
3. **The gate anti-passback** — a second exit is refused with a reason, not silently accepted.
   `backend/app/services/gate.py` (around lines 97–128)
4. **Notice targeting and tracking** — publish to a computed audience; read and acknowledgement counts update.
   `backend/app/api/v1/notices.py`
5. **Every demo login** — `student@`, `student2@`, `teacher@`, `admin@`, `warden@`, `technician@`,
   `security@`, `helpdesk@campusrelay.demo`, all seeded and working. Run `python -m app.seed.seed_data`
   first; do not assume yesterday's data is still correct.

### 4. Current bugs, limitations and drift the team must understand

| Item | State | Why it matters in the room |
| :-- | :-- | :-- |
| No verified public deployment | Every hosted URL in `docs/deployment/` is an example | If the venue network dies, the demo depends entirely on the local stack |
| No frontend automated tests | `frontend/package.json` has no test script | Never claim the UI is automatically tested |
| Documentation drift: roles | `docs/architecture/security.md` still lists **eight** roles; the code has **three** | A judge who reads the docs will catch it — get ahead of it |
| "Production ready" README badge | Aspirational, not verified | Concede it if asked; point to the go-live checklist instead |
| Test state dependency | The suite needs a reseed; a teacher feedback row can turn one test red | **Always reseed immediately before running the suite** |
| E2E demo script | Previously broken by the role consolidation; operational accounts are seeded again | Re-run `python -m scripts.e2e_demo --base-url http://127.0.0.1:8000` before relying on it |
| External channels | Telegram and WhatsApp are real adapters but inert without credentials; push/SMS/email unconfigured | Demo the honest configuration panel, not a fake delivery |
| No load or latency measurement | No benchmark artefact in the repository | Do not quote "sub-150 ms" as a measured result |
| Agents are not ML | `AGENT_PROVIDER=rules` is the default; the determinism is deliberate | Say "deterministic helpers", not "AI model" |
| Token in local storage | Documented trade-off; XSS-exposed by nature | Disclose it before you are asked |

### 5. Claims that require evidence you do not currently hold

Do **not** say any of the following unless you can show the artefact on the spot:

- Any resolution-time improvement ("9 days to under 24 hours") — no measurement exists.
- Any pricing or cost-saving figure ("₹100–₹300 per student annually", "₹3L–₹9L saved") — no source cited.
- Any latency number ("sub-150 ms gate scan") — no benchmark run.
- Any user count, pilot, partner institution, letter of intent, award or mentor — none recorded.
- Any claim that the system is deployed, secure, or production ready.
- Any claim of measured low-end-device performance on a poor connection.

If a judge asks for one of these, the correct answer is: *"We have not measured that. Here is how we would
measure it, and here is what we can show you instead."*

### 6. Suggested demonstration order (about eight minutes)

1. **Landing and roles** (30s) — one screen, three roles, one login page.
2. **Student files a hostel complaint** (1.5 min) — location code or QR, photo, submit, show the reference.
3. **The case detail** (1 min) — priority, SLA target, assigned department, event history.
4. **Staff resolves it** (1 min) — in progress, evidence, resolved.
5. **Requester verification guard** (1 min) — student verifies → closed; then reopen to show the guard.
6. **Admin command centre** (1.5 min) — open cases, ageing buckets, resolution times, workload.
7. **Targeted notice** (1 min) — audience count, publish, read tracking.
8. **Offline showpiece** (1.5 min) — cut network, file, reload, restore, one case on the admin side.
9. **Gate desk** (1 min) — approve leave, issue pass, scan exit, attempt a second exit and get refused.
10. **Honesty slide / panel** (30s) — configured versus unconfigured channels, and what is not finished.

**If you are running short:** cut step 7, then step 6. Protect steps 3–5, 8 and 9 — they are the argument.

### 7. When you do not know an answer

Use this, verbatim, and do not improvise a fact:

> "I don't know that from memory, and I don't want to guess. What I can tell you is where it would be —
> and I'd say the honest position is that we haven't verified it. Can I show you the part I am sure about?"

Then offer the nearest thing you *can* prove, and follow up with the file or the test that would answer it.
Never invent a number to fill a silence; a judge who catches one invented figure will distrust every other
answer you gave.

---

### 📬 Contact

**Lead Organization:** Crystal Studio Labs
**Email:** connect.crystalstudio@gmail.com
**Repository:** https://github.com/Crystal-Studio-Labs/Campus-Relay
**Event:** BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)
**Team ID:** BH26PS07T065
