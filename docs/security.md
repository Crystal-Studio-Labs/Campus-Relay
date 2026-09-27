# Security

## Authentication

- Passwords are hashed with bcrypt (`app/core/security.py`); plaintext is never
  stored.
- Login issues a signed JWT (PyJWT, `HS256`) with a configurable expiry
  (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 12 hours).
- The secret is `APP_SECRET_KEY`, environment-only. Nothing secret is committed;
  `.env` is git-ignored and `render.yaml` generates the key.
- Failed and successful logins both write audit events (`AUTH_LOGIN`,
  `AUTH_FAILED`), recording the email-present flag — never the password.

## Authorisation (RBAC)

- A permission catalogue lives in `app/core/permissions.py`; a role→permission
  map defines eight roles: `SUPER_ADMIN`, `ADMIN`, `WARDEN`, `DEPARTMENT_HEAD`,
  `STAFF`, `SECURITY`, `HELPDESK_OPERATOR`, `STUDENT`.
- Every mutating endpoint calls `assert_permission(...)`, so authorisation is
  enforced **server-side** on every request. The frontend's permission-gated
  routes are a rendering convenience, never a security boundary.
- Permission is necessary but not sufficient: the UI additionally restricts the
  command centre to roles that run the campus as a whole, and the server still
  scopes the data.

## Data scoping (row-level)

`app/services/scoping.py` answers *which rows may this role see* — a different
question from *which actions may this role take*:

- A **warden** sees only their assigned hostels.
- **Staff** see their own assignments.
- **Students** see only cases they raised.
- **Security** see gate activity and their scope.

Cross-student reads return `403`, not an empty list.

## Tenant isolation

- Every campus-owned record carries `campus_id`.
- The API derives `campus_id` from the authenticated user and filters on it;
  a token from one campus cannot read another's rows.

## Integrity

- **Append-only** `audit_logs`, `case_events`, `gate_logs` and
  `notification_events`, enforced by PostgreSQL triggers from migration
  `0002_append_only_guards` — not merely by application code. A future code
  change cannot quietly rewrite history.
- ORM-level immutability listeners (`app/models/immutability.py`) raise
  `ImmutableRecordError` as a second layer.
- Every important mutation records actor, role, channel, device and payload.

## Transport & input

- CORS is restricted to configured origins (`CORS_ORIGINS`); the split
  deployment must list the frontend origin.
- Pydantic v2 validates every request body; invalid input returns `422` with
  field-level detail and no echoed values.
- SQLAlchemy parameterises all queries; no string-built SQL from user input.
- Uploads are size-capped (`MAX_UPLOAD_BYTES`) and content-typed.
- In-process rate limiting (`RATE_LIMIT_PER_MINUTE`) returns `429`.

## Safe failure

- Error handlers return a stable JSON shape with no stack traces or SQL. A
  database error returns `503` and explicitly states **nothing was saved** —
  the system never reports a failed write as a success.

## QR and public links

- Location/asset QR codes contain only a location code — never student PII.
- Public document verification (`GET /documents/verify/{code}`) confirms
  validity, serial and issue date without exposing academic or financial data.
- Notice share links are read-only tokens with a sanitised public view.

## External messaging & notice media

- Telegram/WhatsApp are opt-in: a user stores a chat ID or phone number only by
  explicitly saving it, and it is used solely for notices they already receive
  in-app. Both remain personal data and are never exposed by any list or public
  endpoint.
- Media sent to an external channel is a notice attachment (image or PDF) that
  was already published to that audience in-app; the outbox carries a link, not
  a second copy.
- Outbound delivery records actor-free technical state (attempts, last error)
  in `notification_deliveries`; the append-only `notification_events` log stays
  the system of record.
- With no provider credentials configured, the channel reports *unconfigured*
  and sends nothing — the system never claims a message was delivered when no
  provider is wired up.

## Agent security

Agents run behind the same authorisation and policy pipeline as a human and can
never execute raw SQL. See `docs/agent-system.md`.
