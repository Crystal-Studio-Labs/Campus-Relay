# 📢 Notification & Communication Architecture

> **Multi-Channel Dispatching, Asynchronous Outbox Worker & Guaranteed Tracking**  
> *Authored by **Crystal Studio Labs** for BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)*

[![Notifications](https://img.shields.io/badge/System-Multi--Channel_Outbox-2563eb.svg?style=flat-square)](#channels--adapters)
[![Tracking](https://img.shields.io/badge/Delivery-Audited_State_Machine-10b981.svg?style=flat-square)](#delivery-state-machine)
[![Adapters](https://img.shields.io/badge/Adapters-Telegram_%7C_WhatsApp_%7C_Push-purple.svg?style=flat-square)](#channels--adapters)
[![Contact](https://img.shields.io/badge/Support-connect.crystalstudio%40gmail.com-amber.svg?style=flat-square)](#-contact--institutional-support)

---

## 🧭 Navigation
[Root README](../../README.md) • [Documentation Hub](../README.md) • [Architecture](./architecture.md) • [Workflow Engine](./workflow-engine.md) • [Security](./security.md)

---

Campus Relay strictly distinguishes between **Notices** (public broadcast announcements targeted at groups) and **Notifications** (targeted system transactional alerts directed to a single user).

---

## 🔄 Delivery State Machine (`NotificationState`)

Every transactional notification is audited through a deterministic lifecycle recorded in `notification_events` (append-only):

```mermaid
stateDiagram-v2
    [*] --> SENT : Created by Service
    SENT --> DELIVERED : Acknowledged by Device / Provider
    SENT --> FAILED : Network Error / Invalid Recipient
    DELIVERED --> READ : User Opens Notification
    READ --> ACTIONED : User Clicks Deep-Link / Resolves Task
    ACTIONED --> [*]
    FAILED --> [*]
```

> [!NOTE]
> Every status change emits an immutable row to `notification_events`, providing administrators with a verifiable audit log for every dispatched message.

---

## ⚡ Asynchronous Outbox Architecture

> [!IMPORTANT]
> **Outbound provider calls NEVER occur within a user's web request transaction.**  
> A slow or unresponsive third-party messaging gateway can never cause a student's complaint submission to hang or time out.

```mermaid
flowchart TD
    subgraph RequestCycle ["FastAPI Web Request Cycle"]
        Action[User Action: e.g. Approve Leave] --> NotifCreate[create_notification Service]
        NotifCreate --> InAppWrite[Commit In-App Notification]
        NotifCreate --> OutboxQueue["Write to notification_deliveries (Outbox Table)"]
        OutboxQueue --> FastReturn[HTTP 200 OK Returned to User]
    end

    subgraph AsyncWorker ["Background Delivery Worker (services/delivery.py)"]
        OutboxQueue -.-> PollWorker[Worker polls outbox every 10s]
        PollWorker --> ProviderDispatch{Provider Dispatch}
        ProviderDispatch -- "Telegram" --> TG[Telegram Bot API]
        ProviderDispatch -- "WhatsApp" --> WA[Meta WhatsApp Cloud API]
        ProviderDispatch -- "Web Push" --> Push[Web Push Service]
        
        TG & WA & Push --> Outcome{Gateway Outcome}
        Outcome -- "Success" --> MarkDelivered["Append DELIVERED event"]
        Outcome -- "Failure" --> RetryCheck{Retry count < 3?}
        RetryCheck -- "Yes" --> ExponentialBackoff[Increment backoff timer]
        RetryCheck -- "No" --> MarkFailed["Append FAILED event"]
    end

    style RequestCycle fill:#eff6ff,stroke:#bfdbfe,color:#1e3a8a
    style AsyncWorker fill:#f0fdf4,stroke:#bbf7d0,color:#14532d
    style MarkDelivered fill:#10b981,stroke:#047857,color:#ffffff
    style MarkFailed fill:#ef4444,stroke:#b91c1c,color:#ffffff
```

---

## 📡 Channel Adapters & Status Registry

Campus Relay implements the `NotificationAdapter` protocol across several external communication channels:

| Adapter Name | Channel | Default Status | Configuration Requirements |
| :-- | :-- | :-- | :-- |
| **`InAppAdapter`** | `IN_APP` | **Always Active** | Zero setup. Delivered directly to the user's dashboard and IndexedDB cache. |
| **`TelegramAdapter`** | `TELEGRAM` | Configurable | Set `TELEGRAM_BOT_TOKEN`. Users link their Chat ID via Alerts Preferences. |
| **`WhatsAppAdapter`** | `WHATSAPP` | Configurable | Requires Meta Cloud API `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, and approved template. |
| **`PushAdapter`** | `PUSH` | Configurable | Requires `PUSH_PROVIDER_URL` and standard VAPID key pairs. |
| **`SmsAdapter`** | `SMS` | Reserved Slot | Reserved interface adapter slot; unconfigured by default. |
| **`EmailAdapter`** | `EMAIL` | Reserved Slot | Reserved interface adapter slot; unconfigured by default. |

### The Institutional Honesty Contract
- If an adapter has no credentials configured in `.env`, the system **never pretends** messages were sent.
- `GET /api/v1/meta` explicitly reports the live connection status of every adapter (`configured: true/false`).
- Read receipts are **never claimed** on external messaging platforms (WhatsApp/Telegram) where the provider does not offer privacy-compliant read webhooks.

---

## ⚙️ User Notification Preferences

Students and staff can configure their preferred delivery channels on a per-category basis via `PUT /api/v1/notification-preferences`:
- Maintenance Ticket Status Updates
- Official Notices & Circulars
- Mess Menu & Food Feedback
- Timetable & Class Rescheduling

> [!WARNING]
> **Safety Overrides**: Critical institutional alerts (such as disciplinary summons, emergency evacuations, or SLA escalation notifications) bypass user suppression preferences and are always delivered.

---

## 📊 Notices vs. Notifications: Architectural Comparison

| Dimension | Campus Notices (`notices`) | Personal Notifications (`notifications`) |
| :-- | :-- | :-- |
| **Audience** | Broadcast to groups (Hostel, Batch, Branch, Department) | Point-to-point to an individual user |
| **Tracking Detail** | Sent → Delivered → Read → Acknowledged → Actioned | Sent → Delivered → Read → Actioned |
| **Attachments** | Rich media (JPEG, PNG circular photos, PDF documents) | Deep-link actionable URLs |
| **Public Access** | Optional read-only cryptographic share link (`/s/{token}`) | Strictly authenticated private access only |

---

### 📬 Contact & Institutional Support
- **Lead Organization**: **Crystal Studio Labs**
- **Direct Technical Support**: [`connect.crystalstudio@gmail.com`](mailto:connect.crystalstudio@gmail.com)
- **Competition Track**: BPUT Hackathon 2026 — Problem Statement 07 (Fretbox)
- **Main Repository**: [GitHub: Crystal-Studio-Labs/Campus-Relay](https://github.com/Crystal-Studio-Labs/Campus-Relay)
