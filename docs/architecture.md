# Architecture

Campus Relay is a **modular monolith**: one FastAPI service, one PostgreSQL
database, one React PWA. There are no microservices, no message broker and no
distributed database, because a package of a programme of this size does not
need them and a six-person team has to be able to hold the whole thing in their
heads.

## The one idea

Every campus request — a leaking tap, a bonafide certificate, a leave pass, a
mess complaint — is the same object: a **CampusCase**. Everything else in the
system is a reusable engine that acts on that object.

```
REQUEST → CASE → POLICY → WORKFLOW → APPROVAL → SLA → ASSIGNMENT
        → NOTIFICATION → RESOLUTION → VERIFICATION → AUDIT
```

Adding a new campus service means configuring a service catalogue entry, a
workflow and a policy — not writing a new module.

## Layers

```
                    ┌──────────────────────────────────────────┐
                    │  Clients (one product, many experiences)   │
                    │  Student PWA · Admin web · Staff · Gate    │
                    │  Kiosk · Helpdesk                          │
                    └──────────────────┬───────────────────────┘
                                       │ HTTPS / JSON
                    ┌──────────────────▼───────────────────────┐
                    │  API layer      app/api/                  │
                    │  deps.py   auth + RBAC + scope injection  │
                    │  serializers.py   DTOs (never ORM rows)   │
                    │  v1/*.py   endpoint routers               │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │  Application services   app/services/     │
                    │  case_engine · workflow · policy · sla    │
                    │  routing · documents · gate · notices     │
                    │  notifications · sync · analytics · audit │
                    │  agents/  (intake, routing, ops, assist)  │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │  Event / audit layer                      │
                    │  AuditLog + CaseEvent, append-only,       │
                    │  enforced by PostgreSQL triggers          │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │  PostgreSQL 16 (SQLAlchemy 2 + Alembic)   │
                    └──────────────────────────────────────────┘
```

## Backend

| Area | Path | Responsibility |
| :-- | :-- | :-- |
| Entry | `app/main.py` | App factory, CORS, rate limiting, safe error handlers |
| Config | `app/core/config.py` | Environment settings, DB URL normalisation |
| Institution | `app/core/institution.py` | Loads/merges `config/institution.json` |
| DB | `app/core/db.py` | Engine, session factory, `session_scope()` |
| Permissions | `app/core/permissions.py` | Permission catalogue + role→permission map |
| Security | `app/core/security.py` | bcrypt hashing, JWT issue/verify |
| Errors | `app/core/errors.py` | Typed `AppError` hierarchy with safe payloads |
| Models | `app/models/` | SQLAlchemy domains (org, identity, workflow, case, comms, security, sync) |
| Services | `app/services/` | The engines listed above |
| API | `app/api/v1/` | Routers, schemas, serializers |
| Seed | `app/seed/seed_data.py` | Deterministic 30-day demo campus |

## The engines

- **Case engine** (`services/case_engine.py`) owns the state machine. Invalid
  transitions are rejected here, so the API cannot be talked into an illegal
  state.
- **Workflow engine** (`services/workflow.py`) reads `Workflow` /
  `WorkflowStep` rows and decides what step a case is on and who acts next.
- **Policy engine** (`services/policy.py`) evaluates declarative clauses against
  case facts and returns explicit failures (which rule, on which field).
- **SLA engine** (`services/sla.py`) computes due dates and derives `ON_TIME`,
  `AT_RISK`, `BREACHED`, `MET`, `MISSED`.
- **Routing engine** (`services/routing.py`) resolves a department and the
  least-loaded qualified staff member.
- **Notification engine** (`services/notifications.py`) writes notifications and
  queues external-channel deliveries; the **delivery worker**
  (`services/delivery.py`) drains that outbox with retry and backoff, so no
  provider call ever sits inside a request. See `docs/notification-system.md`.
- **Sync engine** (`services/sync.py`) replays offline operations idempotently
  and detects conflicts.
- **Audit** (`services/audit.py`) appends immutable events.
- **Agents** (`services/agents/`) are advisory only and sit *behind* the same
  authorization/policy pipeline as a human (see `docs/agent-system.md`).

## Request flow (write path)

1. Router receives the call; `app/api/deps.py` resolves the user from the JWT,
   asserts the required permission, and injects the data scope.
2. `app/api/v1/schemas.py` validates the body (Pydantic v2).
3. A service performs the domain work inside one transaction.
4. The service writes an `AuditLog` (and often a `CaseEvent`) row.
5. `serializers.py` converts to a DTO. ORM objects never leave the API layer.
6. `get_db()` commits, or rolls back and re-raises on error.

## Why a monolith

The product is explicitly a **single operational engine with multiple
interfaces**, not a fleet of services. Keeping the case engine, policy engine
and audit in one process and one transaction is what makes "approve this and
record who approved it" atomic and auditable. Scale-out is a deployment concern
(Render or Docker), not an architecture one.
