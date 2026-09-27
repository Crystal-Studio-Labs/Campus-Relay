# API Reference

Base path: `/api/v1`. Interactive docs at `/docs`, raw schema at
`/openapi.json`. Authentication is a JWT bearer token from
`POST /auth/login`; every mutating endpoint is authorised server-side.

Every request may carry `X-Source-Channel` and `X-Device-Uid`; both are recorded
on the audit trail.

## System & meta
| Method | Path | Purpose |
| :-- | :-- | :-- |
| GET | `/health` | Liveness + DB check |
| GET | `/meta` | Env, demo mode, agent status, notification channels |
| GET | `/institution` | Effective institution config (public-safe view) |
| GET | `/public/summary` | Public landing summary |
| GET | `/qr/{code}.png` | Print-ready QR for a location/asset/pass |
| GET | `/locations/{code}/label` | Printable location label |
| GET | `/documents/{id}/download` | Download a generated PDF |
| GET | `/documents/verify/{code}` | Public zero-trust verification |

## Authentication
| Method | Path | Purpose |
| :-- | :-- | :-- |
| POST | `/auth/login` | Obtain a JWT |
| GET | `/auth/me` | Current profile + permissions |
| GET | `/auth/demo-accounts` | Seeded demo accounts (demo mode only) |
| GET | `/auth/roles` | Role catalogue |

## Catalogue
`GET /services`, `GET /locations`, `GET /locations/{code}`,
`GET /workflows`, `GET /policies`, `GET /sla-rules`,
`GET /catalog/context` (one call the client caches for offline).

## Cases
| Method | Path | Purpose |
| :-- | :-- | :-- |
| POST | `/cases` | Create (supports `idempotency_key`) |
| GET | `/cases` | List within scope (filters, pagination) |
| GET | `/cases/{id}` | Detail |
| GET | `/cases/{id}/timeline` | Event timeline |
| GET | `/cases/{id}/workflow` | Current workflow step + next actor |
| POST | `/cases/{id}/comments` | Add comment (public/internal) |
| POST | `/cases/{id}/attachments` | Upload evidence |
| GET | `/cases/{id}/attachments/{aid}` | Fetch evidence |
| POST | `/cases/{id}/assign` | Assign / reassign |
| POST | `/cases/{id}/start` | Move to IN_PROGRESS |
| POST | `/cases/{id}/resolve` | Mark resolved |
| POST | `/cases/{id}/verify` | Requester verification |
| POST | `/cases/{id}/reopen` | Reopen |
| POST | `/cases/{id}/cancel` | Cancel |
| POST | `/cases/{id}/escalate` | Escalate |
| POST | `/cases/{id}/approval` | Decide a pending approval |
| POST | `/cases/{id}/gate-pass` | Issue a digital gate pass |
| POST | `/cases/{id}/certificate` | Generate a verifiable PDF |
| GET | `/approvals` | Approval queue |
| GET | `/my/overview` | Requester dashboard summary |

## Notices
`GET /notices`, `GET /notices/inbox`, `POST /notices`,
`GET /notices/audience-preview`, `GET /notices/{id}`,
`POST /notices/{id}/status` (publish/schedule/expire/archive),
`POST /notices/{id}/duplicate`, `POST /notices/{id}/read`,
`POST /notices/{id}/acknowledge`, `POST /notices/{id}/action`,
`POST /notices/{id}/share`, `GET /notices/{id}/analytics`,
`GET /notices/{id}/recipients`, `GET /public/notices/{token}`.

## Notifications
`GET /notifications`, `POST /notifications/{id}/read`,
`POST /notifications/read-all`, `POST /notifications/{id}/actioned`,
`GET /notifications/{id}/delivery` (events + outbox + channel status),
`GET /notification-preferences`, `PUT /notification-preferences`,
`GET /notification-channels`, `PUT /notification-channels` (Telegram chat id /
WhatsApp number), `POST /notification-channels/test`.

## Gate
`POST /gate/verify`, `POST /gate/movements`, `GET /gate/passes`,
`GET /gate/logs`, `POST /gate/passes/{id}/revoke`, `GET /gate/summary`.

## Offline sync
| Method | Path | Purpose |
| :-- | :-- | :-- |
| POST | `/sync/push` | Replay a batch of queued operations (idempotent) |
| GET | `/sync/operations` | Status of previously pushed operations |
| GET | `/sync/health` | Server-side view of sync backlog |

## Agents
`GET /agents/status`, `POST /agents/intake`, `GET /agents/routing/{case_id}`,
`POST /agents/routing/preview`, `GET /agents/operations/briefing`,
`GET /agents/operations/recurring`, `POST /agents/assistant/ask`,
`POST /agents/assistant/confirm`, `GET /agents/capabilities`,
`GET /agents/case-summary/{case_id}`.

## Kiosk & helpdesk
`POST /kiosk/lookup`, `GET /kiosk/student/{roll}/cases`, `GET /kiosk/services`,
`POST /kiosk/cases`, `GET /kiosk/notices`, `GET /helpdesk/students`,
`GET /helpdesk/desk`.

## Admin
Dashboard/analytics: `/admin/dashboard`, `/admin/cases`, `/admin/aging`,
`/admin/recurring-issues`, `/admin/resolution-times`, `/admin/analytics`,
`/admin/staff`, `/admin/departments`, `/admin/hostels`, `/admin/rooms`,
`/admin/locations`, `/admin/assets`.
Audit & people: `/admin/audit`, `/admin/audit/case/{id}`, `/admin/users`
(GET/POST/PATCH), `/admin/users/{id}/reset-password`, `/admin/students`,
`/admin/documents`, `/admin/services`.
Config: `/admin/sla-rules` (POST), `/admin/policies` (POST),
`/admin/sla/sweep`, `/admin/notices/expire`, `/admin/config/summary`,
`/admin/institution`, `/admin/institution/reload`.
Demo: `/admin/demo/reset`, `/admin/demo/time-travel`, `/admin/demo/time-reset`.

## Errors

All errors share one shape:

```json
{ "error": { "code": "validation_error", "message": "…", "details": {} } }
```

`401` unauthenticated, `403` permission/scope denied, `404` not found in scope,
`409` conflict (state or idempotency), `422` validation, `429` rate limited,
`503` database unavailable. Status `0` in the client means a network-level
failure, which is what the offline outbox queues on.
