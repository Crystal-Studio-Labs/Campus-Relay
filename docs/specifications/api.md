# 🌐 RESTful API Surface & Specification

> **Interactive OpenAPI 3.0 Endpoints, DTO Schemas & Standard Error Contracts**  
> *Authored by **Crystal Studio Labs** for BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)*

[![API](https://img.shields.io/badge/OpenAPI-3.0_Compliant-0284c7.svg?style=flat-square)](http://127.0.0.1:8000/docs)
[![Auth](https://img.shields.io/badge/Auth-Bearer_JWT-10b981.svg?style=flat-square)](#authentication-endpoints)
[![Format](https://img.shields.io/badge/Payload-JSON_Strict_DTOs-purple.svg?style=flat-square)](#standardized-error-contract)
[![Contact](https://img.shields.io/badge/Support-connect.crystalstudio%40gmail.com-amber.svg?style=flat-square)](#-contact--institutional-support)

---

## 🧭 Navigation
[Root README](../../README.md) • [Documentation Hub](../README.md) • [Architecture](../architecture/architecture.md) • [Security](../architecture/security.md) • [Data Model](../architecture/data-model.md)

---

The Campus Relay backend provides an RFC-compliant REST API rooted at **`/api/v1`**. Interactive Swagger UI documentation is served live at [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs), and the raw OpenAPI specification is available at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).

> [!NOTE]
> All mutating requests accept optional client metadata headers:  
> - `X-Source-Channel`: Identifies origin (`WEB`, `PWA`, `KIOSK`, `HELPDESK`, `AGENT`).
> - `X-Device-Uid`: An anonymous persistent client installation UUID.  
> Both headers are committed to the immutable audit trail.

---

## 🏛️ System & Public Discovery Endpoints

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `GET` | `/api/v1/health` | Liveness and PostgreSQL database connectivity probe. |
| `GET` | `/api/v1/meta` | Environment details, demo mode flag, active AI provider, and notification adapter states. |
| `GET` | `/api/v1/institution` | Effective public branding, visual skin, terminology, and station parameters. |
| `GET` | `/api/v1/public/summary` | High-level campus metrics for the public landing portal. |
| `GET` | `/api/v1/qr/{code}.png` | Generates high-resolution PNG QR images for any room, asset, or pass code. |
| `GET` | `/api/v1/locations/{code}/label`| Returns printable SVG/HTML facility labels with metadata and QR code. |
| `GET` | `/api/v1/documents/{id}/download`| Streams generated PDF certificates or gate passes. |
| `GET` | `/api/v1/documents/verify/{code}`| Public zero-trust verification endpoint confirming certificate validity without exposing student PII. |

---

## 🔑 Authentication Endpoints

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `POST` | `/api/v1/auth/login` | Authenticates email/password credentials and issues a signed JWT bearer token. |
| `GET` | `/api/v1/auth/me` | Returns profile, active roles, departmental memberships, and permission flags. |
| `GET` | `/api/v1/auth/demo-accounts` | Returns pre-seeded persona accounts (available strictly in demo/development mode). |
| `GET` | `/api/v1/auth/roles` | System catalogue of registered roles and associated permissions. |

---

## 📚 Service Catalogue & Context

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `GET` | `/api/v1/services` | Active campus service catalogue entries with category and SLA rules. |
| `GET` | `/api/v1/locations` | Addressable spaces (hostels, rooms, laboratories, sports grounds). |
| `GET` | `/api/v1/locations/{code}` | Metadata for a specific location code (e.g. `CR-ROOM-AA-101`). |
| `GET` | `/api/v1/workflows` | Declarative multi-step state machine definitions. |
| `GET` | `/api/v1/policies` | Declarative validation rules evaluated during intake. |
| `GET` | `/api/v1/sla-rules` | Resolution targets indexed by service and priority. |
| `GET` | `/api/v1/catalog/context` | Consolidated bundle cached by the PWA for instant offline operation. |

---

## 🎫 Campus Case Lifecycle Endpoints

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `POST` | `/api/v1/cases` | Submits a new case (supports client-supplied `idempotency_key`). |
| `GET` | `/api/v1/cases` | Paginated ticket list filtered by role scope, status, priority, and date range. |
| `GET` | `/api/v1/cases/{id}` | Full ticket details, SLA countdown, and resolution notes. |
| `GET` | `/api/v1/cases/{id}/timeline` | Append-only chronological history of case events and transitions. |
| `GET` | `/api/v1/cases/{id}/workflow` | Computes active workflow step, required inputs, and authorized actors. |
| `POST` | `/api/v1/cases/{id}/comments` | Appends public requester updates or internal staff notes. |
| `POST` | `/api/v1/cases/{id}/attachments`| Uploads photographic evidence, repair invoices, or receipts (Max 5MB). |
| `GET` | `/api/v1/cases/{id}/attachments/{aid}`| Retrieves uploaded media file attachments. |
| `POST` | `/api/v1/cases/{id}/assign` | Reallocates case to a specific department or technician. |
| `POST` | `/api/v1/cases/{id}/start` | Technician marks work as `IN_PROGRESS`. |
| `POST` | `/api/v1/cases/{id}/resolve` | Technician marks work completed with completion notes. |
| `POST` | `/api/v1/cases/{id}/verify` | Requester Verification: Student confirms fix (`CLOSED`). |
| `POST` | `/api/v1/cases/{id}/reopen` | Student reports issue persists (`REOPENED` → `IN_PROGRESS`). |
| `POST` | `/api/v1/cases/{id}/cancel` | Requester or administrator cancels ticket. |
| `POST` | `/api/v1/cases/{id}/escalate` | Triggers supervisory escalation and alerts department head. |
| `POST` | `/api/v1/cases/{id}/approval` | Warden, HOD, or Registrar records approval or rejection decision. |
| `POST` | `/api/v1/cases/{id}/gate-pass` | Issues a cryptographic digital gate pass for approved leave. |
| `POST` | `/api/v1/cases/{id}/certificate`| Generates a verifiable PDF certificate with QR code and serial number. |
| `GET` | `/api/v1/approvals` | Aggregated queue of pending approval items scoped to the authenticated actor. |
| `GET` | `/api/v1/my/overview` | Personal dashboard metrics for enrolled students. |

---

## 📢 Official Notices & Circulars

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `GET` | `/api/v1/notices` | Campus notice board (filtered by audience targeting). |
| `GET` | `/api/v1/notices/inbox` | Personalized student circular inbox with unread counts. |
| `POST` | `/api/v1/notices` | Creates a new notice draft with multi-dimensional audience criteria. |
| `GET` | `/api/v1/notices/audience-preview`| Live calculation of recipient count prior to broadcast. |
| `GET` | `/api/v1/notices/{id}` | Detailed circular view with attachments and action status. |
| `POST` | `/api/v1/notices/{id}/status` | Lifecycle transition (`PUBLISHED`, `SCHEDULED`, `EXPIRED`, `ARCHIVED`). |
| `POST` | `/api/v1/notices/{id}/duplicate`| Duplicates an existing circular draft. |
| `POST` | `/api/v1/notices/{id}/read` | Records authenticated student read receipt timestamp. |
| `POST` | `/api/v1/notices/{id}/acknowledge`| Student confirms receipt of mandatory circular. |
| `POST` | `/api/v1/notices/{id}/action` | Records completion of mandatory call-to-action. |
| `POST` | `/api/v1/notices/{id}/share` | Creates a cryptographic public sharing URL token. |
| `GET` | `/api/v1/notices/{id}/analytics`| Broadcast performance metrics: Sent, Delivered, Read, and Acknowledged. |
| `GET` | `/api/v1/notices/{id}/recipients`| Granular per-student delivery audit log. |
| `GET` | `/api/v1/public/notices/{token}`| Sanitized read-only public browser view for parents and external stakeholders. |

---

## 🔔 Notifications & Communication Channels

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `GET` | `/api/v1/notifications` | Personal transactional notifications feed. |
| `POST` | `/api/v1/notifications/{id}/read` | Marks notification as read. |
| `POST` | `/api/v1/notifications/read-all` | Bulk marks all unread notifications as read. |
| `POST` | `/api/v1/notifications/{id}/actioned`| Marks notification action deep-link as clicked. |
| `GET` | `/api/v1/notifications/{id}/delivery`| Delivery audit trail (In-App, Push, Telegram, WhatsApp). |
| `GET` | `/api/v1/notification-preferences`| User delivery channel opt-in/opt-out matrix. |
| `PUT` | `/api/v1/notification-preferences`| Updates delivery channel preferences. |
| `GET` | `/api/v1/notification-channels` | Inspects linked external accounts (Telegram Chat ID, WhatsApp number). |
| `PUT` | `/api/v1/notification-channels` | Links Telegram Chat ID or phone number. |
| `POST` | `/api/v1/notification-channels/test`| Dispatches a test payload across configured external channels. |

---

## 🛡️ Gate Security & Anti-Passback Desk

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `POST` | `/api/v1/gate/verify` | Fast QR scan validation verifying student identity, photo, and leave window. |
| `POST` | `/api/v1/gate/movements` | Logs `EXIT` or `ENTRY` movements (strictly enforces anti-passback rules). |
| `GET` | `/api/v1/gate/passes` | Active gate passes list for the current shift. |
| `GET` | `/api/v1/gate/logs` | Real-time entry/exit movements ledger. |
| `POST` | `/api/v1/gate/passes/{id}/revoke`| Security desk or warden revokes an active pass. |
| `GET` | `/api/v1/gate/summary` | Real-time campus population count and students currently outside campus. |

---

## ⚡ Local-First Offline Synchronization

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `POST` | `/api/v1/sync/push` | Replays a batch of client mutations; guaranteed idempotent by UUID keys. |
| `GET` | `/api/v1/sync/operations` | Replay execution status of previously submitted operations. |
| `GET` | `/api/v1/sync/health` | Sync pipeline latency, pending backlog, and conflict metrics. |

---

## 🤖 Controlled AI Agents & Operations Subsystems

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `GET` | `/api/v1/agents/status` | Operational status of the intelligence subsystem (`rules` vs `openai_compatible`). |
| `POST` | `/api/v1/agents/intake` | Extracts category, priority, and location from freeform complaint descriptions. |
| `GET` | `/api/v1/agents/routing/{case_id}`| Algorithmic staff recommendation with stored explanatory reasoning. |
| `POST` | `/api/v1/agents/routing/preview`| Previews technician assignment workload balancing without writing changes. |
| `GET` | `/api/v1/agents/operations/briefing`| Automated executive operational summary for Command Centre. |
| `GET` | `/api/v1/agents/operations/recurring`| Clustering detector identifying chronic equipment and room defects. |
| `POST` | `/api/v1/agents/assistant/ask` | Answers natural language student queries and proposes concrete actions. |
| `POST` | `/api/v1/agents/assistant/confirm`| Executes a previously proposed action after explicit student confirmation. |
| `GET` | `/api/v1/agents/capabilities`| Inspects sandboxed tool catalog and supported intents. |
| `GET` | `/api/v1/agents/case-summary/{case_id}`| Generates a narrative timeline synopsis for complex multi-event cases. |

---

## 🖥️ Touch Kiosk & Assisted Helpdesk

| Method | Endpoint | Description & Access Control |
| :-- | :-- | :-- |
| `POST` | `/api/v1/kiosk/lookup` | Anonymous Roll Number lookup returning masked profile and pending tickets. |
| `GET` | `/api/v1/kiosk/student/{roll}/cases`| Fetches case summaries for an authenticated kiosk session. |
| `GET` | `/api/v1/kiosk/services` | Simplified high-contrast service catalog for touch terminals. |
| `POST` | `/api/v1/kiosk/cases` | Files a ticket from a kiosk station with `source_channel = KIOSK`. |
| `GET` | `/api/v1/kiosk/notices` | High-contrast broadcast cards for public corridor kiosk screens. |
| `GET` | `/api/v1/helpdesk/students` | Search student records by name, roll number, or phone number. |
| `GET` | `/api/v1/helpdesk/desk` | Helpdesk operator dashboard for logging proxy requests on behalf of students. |

---

## 📊 Administration, Analytics & Master Data

| Category | Endpoints |
| :-- | :-- |
| **Command Centre** | `/admin/dashboard`, `/admin/cases`, `/admin/aging`, `/admin/recurring-issues`, `/admin/resolution-times`, `/admin/analytics` |
| **Organizational Master Data** | `/admin/staff`, `/admin/departments`, `/admin/hostels`, `/admin/rooms`, `/admin/locations`, `/admin/assets` |
| **Audit & Governance** | `/admin/audit`, `/admin/audit/case/{id}`, `/admin/users` (`GET`/`POST`/`PATCH`), `/admin/users/{id}/reset-password`, `/admin/students`, `/admin/documents`, `/admin/services` |
| **Rules & Governance** | `/admin/sla-rules` (`POST`), `/admin/policies` (`POST`), `/admin/sla/sweep`, `/admin/notices/expire`, `/admin/config/summary`, `/admin/institution`, `/admin/institution/reload` |
| **Demonstration Controls** | `/admin/demo/reset`, `/admin/demo/time-travel`, `/admin/demo/time-reset` |

---

## ⚠️ Standardized Error Contract

All API errors return a uniform, predictable JSON envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Student dues balance is non-zero (₹12,400.00). Certificate generation blocked.",
    "details": {
      "field": "dues_balance",
      "required_status": "zero"
    }
  }
}
```

### Standard HTTP Status Codes
- `401 Unauthorized`: Missing or expired JWT bearer token.
- `403 Forbidden`: Authenticated user lacks permission or row-level tenant scope.
- `404 Not Found`: Entity does not exist within the user's campus scope.
- `409 Conflict`: Mutation conflicts with current server state or duplicate idempotency key detected.
- `422 Unprocessable Entity`: Request body violates Pydantic v2 validation rules.
- `429 Too Many Requests`: Sliding window rate limit exceeded (default 120 req/min).
- `503 Service Unavailable`: PostgreSQL connection dropped; explicitly affirms **nothing was committed**.

---

### 📬 Contact & Institutional Support
- **Lead Organization**: **Crystal Studio Labs**
- **API Integration Support**: [`connect.crystalstudio@gmail.com`](mailto:connect.crystalstudio@gmail.com)
- **Competition Track**: BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)
- **Main Repository**: [GitHub: Crystal-Studio-Labs/Campus-Relay](https://github.com/Crystal-Studio-Labs/Campus-Relay)
