# Workflow, Policy & SLA Engines

The three engines are what make a fifth campus service a *configuration* task
rather than a new module.

## Case state machine

`app/models/enums.py::CaseStatus` and `app/services/case_engine.py` define the
only legal states and transitions. Invalid transitions are rejected in the
service layer, so no API call can force an illegal state.

```
DRAFT → SUBMITTED → VALIDATING → ROUTED → ASSIGNED → IN_PROGRESS
                                  │          │
                                  │          ├→ WAITING_FOR_USER
                                  │          ├→ WAITING_FOR_APPROVAL → (APPROVED) → IN_PROGRESS
                                  │          ├→ ESCALATED → IN_PROGRESS
                                  │          └→ RESOLVED → VERIFICATION_REQUIRED → CLOSED
                                  │                                  └→ REOPENED → IN_PROGRESS
                                  └→ CANCELLED
```

Derived sets used throughout (`app/models/enums.py`):

- `OPEN_STATUSES` — a case still being worked.
- `PENDING_HUMAN_STATUSES` — someone still owes the requester action.
- `CLOSED_STATUSES` — `CLOSED`, `CANCELLED`.

Two rules are enforced by the engine, not by convention:

1. **Requester verification guard** — a case cannot be closed by staff alone; the
   requester must verify, or it can be reopened.
2. **Append-only history** — every transition writes a `CaseEvent` and an
   `AuditLog`; neither can be updated or deleted (DB triggers).

## Workflow engine

A `Workflow` is an ordered list of `WorkflowStep` rows. Step types
(`WorkflowStepType`): `APPROVAL`, `ASSIGNMENT`, `ACTION`, `RESOLUTION`,
`VERIFICATION`, `NOTIFICATION`.

The engine (`app/services/workflow.py`) answers: *what step is this case on,
which role acts next, and what does that actor need?* The API exposes this at
`GET /cases/{id}/workflow`, which the UI uses to render the correct action
buttons — so the client never hardcodes "a warden approves leave".

Adding a service such as "library clearance" means inserting a `Service`, a
`Workflow` and its steps. No new endpoint is required.

## Policy engine

`app/services/policy.py` evaluates declarative clauses against case facts. A
clause names a `field`, an `op` (`required`, `truthy`, `falsy`, `equals`,
`not_equals`, `gte`, `lte`, …) and a human `message`. A failure reports exactly
which rule failed and on which field, so the UI can say *"your branch or year is
not recorded, so a certificate cannot be issued"* instead of a generic error.

Examples shipped in the seed:

- **Leave** — `leave_start` and `leave_end` required; return not before
  departure; leave cannot start in the past.
- **Certificate** — purpose required; branch/year must be recorded; dues are
  checked (dues block is stated, and Accounts is notified).
- **Gate pass** — an approved leave must exist; a pass may not be re-used out of
  order (anti-passback).

Policies are evaluated **before routing**, so a blocked request is stopped with a
stated reason rather than silently advanced.

## SLA engine

`app/services/sla.py` computes `due_at` from the matching `SlaRule` and derives
a state:

| State | Meaning |
| :-- | :-- |
| `ON_TIME` | Comfortably inside target |
| `AT_RISK` | Inside the last quarter of the target window |
| `BREACHED` | Past the target |
| `MET` / `MISSED` | Resolved within / after target |
| `NO_SLA` | Service defines no target |

Demo targets (these are **demo values**, replaceable by an institution):

| Priority | Target |
| :-- | :-- |
| `NORMAL` | 24 hours |
| `HIGH` | 8 hours |
| `CRITICAL` | 2 hours |

`POST /admin/sla/sweep` re-evaluates open cases and emits `SLA_AT_RISK` /
`SLA_BREACHED` audit events; the dashboard reads those results. A demo
time-travel endpoint (`POST /admin/demo/time-travel`) moves the clock so SLA
breaches can be demonstrated without waiting.

## Routing

`app/services/routing.py` classifies the request (deterministic keyword rules,
with an optional LLM behind the same interface) and resolves the department and
the least-loaded qualified staff member. The reasoning is stored on the case so
an administrator can see *why* it went where it did.

## Putting it together — hostel maintenance

```
QR scan → location resolved → SUBMITTED
  → policy: location required
  → intake agent classifies (plumbing, HIGH)
  → SLA: 8h target → due_at
  → routing: Maintenance dept → least-loaded technician → ASSIGNED
  → technician START → IN_PROGRESS → RESOLVED
  → requester VERIFY → CLOSED   (or REOPEN → IN_PROGRESS)
```
