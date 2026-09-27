# Notification System

Notifications are **separate from notices**. A notice is an announcement; a
notification is a system event for one person ("your certificate is ready").

## Categories (`NotificationCategory`)

`CASE_UPDATE`, `APPROVAL`, `CERTIFICATE_READY`, `LEAVE_STATUS`, `GATE_PASS`,
`TIMETABLE`, `NOTICE`, `URGENT_ANNOUNCEMENT`, `SLA_ALERT`, `SYSTEM`, `MESS`,
`ACADEMIC`, `HOSTEL`.

## Delivery state (`NotificationState`)

```
SENT → DELIVERED → READ → ACTIONED
                 └→ FAILED
```

Each transition is recorded in `notification_events` (append-only) and visible
to the sender via `GET /notifications/{id}/delivery`.

## Channels & adapters

`app/services/notifications.py` defines a `NotificationAdapter` protocol with
four implementations and a registry (`register_adapter` / `get_adapter`):

| Adapter | Channel | State |
| :-- | :-- | :-- |
| `InAppAdapter` | `IN_APP` | Always on. The row is the delivery. |
| `PushAdapter` | `PUSH` | Optional; needs a provider URL + VAPID pair. |
| `TelegramAdapter` | `TELEGRAM` | Real. A `TELEGRAM_BOT_TOKEN` is enough; each user links a chat id. |
| `WhatsAppAdapter` | `WHATSAPP` | Optional; Meta Cloud API needs a business account, phone-number id, token and an approved template. |

SMS and email remain **adapter slots with no provider configured**.

### Delivery is asynchronous (the outbox)

A provider call never happens inside the request transaction. When a channel is
configured and the recipient has an address, `create_notification` writes a row
to `notification_deliveries` (the outbox). The background worker
(`app/services/delivery.py`, started beside the API) drains it with retry and
exponential backoff, then records the true outcome as an append-only
`NotificationEvent`. A slow or hanging gateway therefore cannot delay filing a
case. Drain the queue by hand with `python -m app.services.delivery --once`.

### The honesty contract

| Situation | What is recorded |
| :-- | :-- |
| Provider not configured | **nothing** is queued and nothing is claimed; `GET /meta` says so |
| Configured, but the recipient has no address | a `FAILED` event naming `no_recipient` |
| Configured and addressed | queued, then `DELIVERED` only if the provider accepted it |

A read receipt is never claimed on any external channel.

`GET /meta` exposes the channel status so the UI can state plainly which
channels exist:

```json
"notification_channels": {
  "in_app":   { "configured": true },
  "push":     { "configured": false, "note": "OPTIONAL INTEGRATION …" },
  "telegram": { "configured": false, "note": "REAL INTEGRATION - set TELEGRAM_BOT_TOKEN …" },
  "whatsapp": { "configured": false, "note": "OPTIONAL INTEGRATION - needs Meta business credentials …" },
  "sms":      { "configured": false, "note": "OPTIONAL INTEGRATION - adapter slot reserved." },
  "email":    { "configured": false, "note": "OPTIONAL INTEGRATION - adapter slot reserved." }
}
```

Adding another channel means implementing `NotificationAdapter` and registering
it; no call-site changes.

## Preferences

Non-critical categories can be disabled per user
(`notification_preferences`, `PUT /notification-preferences`). Critical
institutional notifications (SLA/escalation, system) cannot be silently
disabled.

## Endpoints

`GET /notifications`, `POST /notifications/{id}/read`,
`POST /notifications/read-all`, `POST /notifications/{id}/actioned`,
`GET /notifications/{id}/delivery`, `GET /notification-preferences`,
`PUT /notification-preferences`.

## Notices vs notifications

| | Notice | Notification |
| :-- | :-- | :-- |
| Audience | Many (targeted) | One person |
| Tracking | Sent/Delivered/Read/Acknowledged/Actioned per recipient | Sent/Delivered/Read/Actioned |
| Required action | Optional (`NoticeActionType`) | Optional deep-link action |
| Sharing | Public read-only link | Not shareable |
