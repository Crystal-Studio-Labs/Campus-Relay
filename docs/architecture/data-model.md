# Data Model

PostgreSQL is the authoritative store. SQLAlchemy 2 declares the schema; Alembic
owns its history (`0001_initial`, `0002_append_only`). Column-level `CHECK`
constraints are generated from the enums in `app/models/enums.py`
(`app/models/base.py::enum_check`), so an invalid string is rejected by the
database even if application code is bypassed.

## Conventions

- Every campus-owned record carries `campus_id`, and the backend enforces tenant
  isolation on it.
- Surrogate integer primary keys (`SurrogateIdMixin`) plus human codes such as
  `CR-ROOM-AA-101` for QR and display.
- `TimestampMixin` gives `created_at` / `updated_at`.
- Append-only tables are protected by PostgreSQL triggers
  (`0002_append_only_guards`), not only by ORM listeners.

## Tables by domain

### Organisation (`app/models/org.py`)
| Table | Purpose |
| :-- | :-- |
| `campuses` | Tenant root |
| `departments` | Maintenance, Accounts, Registrar… |
| `branches` | Academic programmes |
| `academic_years`, `batches` | Cohorts for targeting |
| `hostels`, `blocks`, `rooms` | Residential structure |
| `locations` | Addressable places (washroom, lab, water cooler) — target of QR codes |
| `assets` | Physical equipment with operational history |

### Identity & access (`app/models/identity.py`)
| Table | Purpose |
| :-- | :-- |
| `users` | Login identity, role, campus |
| `roles`, `permissions`, `role_permissions` | RBAC catalogue |
| `students` | Roll number, branch, year, hostel, dues, has_smartphone |
| `staff` | Designation, department, capacity, availability |
| `devices` | Known device UIDs seen in audit |

### Service configuration (`app/models/workflow.py`)
| Table | Purpose |
| :-- | :-- |
| `services` | Service catalogue (hostel complaint, certificate, leave…) |
| `workflows`, `workflow_steps` | Reusable state machines |
| `policies` | Declarative policy clauses |
| `sla_rules` | Target duration per service/priority |

### Cases (`app/models/case.py`)
| Table | Purpose |
| :-- | :-- |
| `cases` | The universal CampusCase |
| `case_events` | Append-only timeline |
| `case_assignments` | Assignment history |
| `case_approvals` | Approval queue items |
| `case_comments` | Public and internal notes |
| `case_attachments` | Evidence and documents |
| `audit_logs` | Append-only event stream (`AuditEventType`) |

`cases.parent_case_id` links follow-ups; `cases.duplicate_group_id` groups
suspected duplicates.

### Communication (`app/models/comms.py`)
| Table | Purpose |
| :-- | :-- |
| `notices` | Notice content, type, status, schedule, expiry |
| `notice_targets` | Audience rules (campus/department/branch/year/batch/hostel/block/role/user) |
| `notice_recipients` | Per-person delivery + read + ack + action state |
| `notice_actions` | Required-action definitions and completion |
| `notice_shares` | Read-only public share tokens |
| `notifications` | Per-user notification centre items |
| `notification_events` | Delivery/read/actioned transitions (append-only) |
| `notification_deliveries` | The outbox: one mutable row per external-channel attempt, with retry state |
| `notification_preferences` | Per-user opt-in per channel and category |

### Documents, gate & sync
| Table | Purpose |
| :-- | :-- |
| `documents` | Generated PDFs with serial + verification code |
| `gate_passes` | Digital passes tied to approved leave |
| `gate_logs` | Append-only ENTRY/EXIT movements (anti-passback) |
| `sync_operations` | Server-side record of replayed offline operations (idempotency key) |

## Key relationships

```
campuses 1─* users 1─1 students ──*────┐
                  │                    │
                  └─1─1 staff          │
departments 1─* users                   │
hostels 1─* blocks 1─* rooms 1─* locations 1─* assets
                                        │
services 1─* workflows 1─* workflow_steps
services 1─* policies
services 1─* sla_rules
                                        │
cases *─1 users (requester)             │
cases *─1 locations / assets ───────────┘
cases 1─* case_events / case_assignments / case_approvals / case_comments / case_attachments
cases 1─* documents
cases 1─1 gate_passes 1─* gate_logs
notices 1─* notice_targets / notice_recipients / notice_actions / notice_shares
users 1─* notifications 1─* notification_events
                        └─* notification_deliveries   (outbox, drained by the worker)
```

## Integrity rules

- **Uniqueness**: `uq_user_campus_email` (email unique per campus), human codes
  (`CR-ROOM-…`, asset codes) unique within campus.
- **Foreign keys** everywhere a relationship is real; deletes are restricted
  rather than silently cascading on audit-relevant tables.
- **Append-only**: `audit_logs`, `case_events`, `gate_logs` and
  `notification_events` reject `UPDATE`/`DELETE` at the trigger level.
- **Enum checks**: invalid status/priority/etc. values are impossible at the
  column level.
- **Idempotency**: `sync_operations.idempotency_key` is unique, so replaying an
  offline operation returns the original result instead of a duplicate row.

## Migrations

```bash
cd backend
alembic upgrade head        # apply
alembic revision -m "…"     # create a new revision
alembic current             # show head
```

Production deployments run `alembic upgrade head` before serving (see
`render.yaml` and `backend/Dockerfile`).
