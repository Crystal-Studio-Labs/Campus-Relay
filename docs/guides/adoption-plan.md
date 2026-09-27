# Adoption & Data Migration Plan

Campus Relay is a template. A college adopts it by editing one config file and
importing its own records — not by forking the code.

## Phase 0 — Decide the shape

| Question | Options |
| :-- | :-- |
| Where does data live? | Single machine (on-premises) or split cloud |
| Who is the first department? | Start with maintenance + hostel ops |
| Which services first? | Hostel complaint, bonafide, leave/gate |

See `docs/DEPLOYMENT.md` for both deployment shapes.

## Phase 1 — Data migration

Migration is CSV-based. Templates live in `templates/` and are also described in
`docs/setup-guide.md`. Import order matters because of foreign keys:

1. `departments.csv`
2. `branches.csv`
3. `hostels.csv` (→ blocks → rooms)
4. `rooms.csv`
5. `locations.csv`
6. `assets.csv`
7. `staff.csv`
8. `students.csv`
9. `services.csv` (usually kept from the seed initially)
10. `existing_complaints.csv` (historical cases, optional)

### Rules

- Import **staff before students** (staff own assignments).
- Codes (`CR-ROOM-AA-101`, `CR-FAN-014`) must be unique within the campus; QR
  labels are generated from location/asset codes.
- The importer reports per-row failures with the row number and field; it never
  fails silently and never reports a partial import as complete.
- Historical complaints are imported with their original timestamps so ageing
  and resolution-time analytics are meaningful from day one.

## Phase 2 — The three workflows

Enable and verify, in this order: hostel maintenance, bonafide certificate, then
leave + gate pass. Do not proceed until all three pass the offline test.

## Phase 3 — Additional services

Add mess complaint, facility request, fee query, academic query and lost item by
adding catalogue entries and reusing existing workflows.

## Phase 4 — Analytics and agents

Enable the operations agent, review SLA targets against real expectations, and
turn on notification channels as providers are configured.

## Data ownership

- The institution owns its database.
- The single-machine install keeps everything on-premises.
- Exports are available to administrators; no lock-in format is used.

## Rollback

Migrations are additive and idempotent (`alembic upgrade head` on every deploy).
Demo data can be rebuilt from the admin reset endpoint in demo mode. A production
database is never truncated by a redeploy — the container start runs
`scripts/bootstrap.py`, which seeds only an empty database.

## Timetable (indicative)

| Week | Milestone |
| :-- | :-- |
| 1 | Configure institution.json, import departments/hostels/rooms |
| 2 | Import staff and students; pilot maintenance workflow |
| 3 | Certificate and leave/gate workflows; notices |
| 4 | Analytics review, agent enablement, staff training |
