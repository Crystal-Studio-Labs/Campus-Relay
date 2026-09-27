# Demo Script

A reproducible walkthrough. All accounts use password **`Campus@2026`**.
Allow ~12 minutes live.

## Setup (before the audience arrives)

```bash
docker compose up -d db
cd backend && alembic upgrade head && python -m scripts.bootstrap
# start backend and frontend (see docs/DEPLOYMENT.md or run.bat)
```

Open the landing page and the admin command centre once so data is warm.

## 1. The problem (30s)
Landing page. State the fragmentation plainly; do not oversell.

## 2. Student files a complaint (2 min)
1. Sign in as `student@campusrelay.demo`.
2. Open **Report**, pick a location (or scan a QR / paste `CR-ROOM-AA-101`).
3. Describe: *"Water tap has been leaking for nine days."*
4. Submit. Point out the reference number and the audit entry.

## 3. Agent classifies and routes (1 min)
Show the case timeline: classified (category, priority) → policy checked → routed
to Maintenance → assigned to the least-loaded technician → SLA due time set.
Emphasise the reasoning is stored on the case.

## 4. Technician resolves (1.5 min)
Sign in as `technician@campusrelay.demo` → **Tasks** → open the case → **Start** →
add evidence → **Resolve**.

## 5. Student verifies (1 min)
Back as the student: the case is `VERIFICATION_REQUIRED`. Verify → `CLOSED`.
Reopen it to show the requester guard, then close again.

## 6. Admin command centre (1.5 min)
Sign in as `admin@campusrelay.demo` → **Command centre**. Show open cases, SLA
breached/at risk, ageing buckets, recurring problems, department and staff load.
Open the **Queue**, filter by SLA state, then the **Audit trail**.

## 7. Notice with tracking (2 min)
**Notice studio** → type URGENT, target Year 3 · CSE · Hostel B → **attach the
circular** (a photo or PDF — the way a college actually publishes) → publish.
Switch to a student → the notice appears with the image previewed → mark read →
acknowledge. Back in the studio, show the delivered/read/acknowledged counts and
share link. Point out that the same attachment rides along to Telegram and
WhatsApp once those channels are configured.

## 8. Offline (2 min) — the centrepiece
1. On the student device, open DevTools → **Network → Offline** (or disable Wi-Fi).
2. File another complaint. It is accepted immediately and shows as queued.
3. Reload the app — the case is still there.
4. Restore the network. The bar shows it syncing.
5. Show exactly **one** case on the server (no duplicate) and the `SYNCED` audit
   event.

## 9. Certificate (1 min)
Student requests a **Bonafide certificate** → admin approves → PDF appears with a
serial and QR. Scan/open the public verification link on another device.

## 10. Leave → gate pass (1.5 min)
Student submits leave → warden approves → digital pass issued → switch to
`security@campusrelay.demo` → verify the pass → record EXIT → record EXIT again
(rejected — anti-passback) → record ENTRY → leave case auto-closes.

## 11. Kiosk / no-smartphone (1 min)
Open `/kiosk`. Enter a roll number, select a service, file on the student's
behalf. Show that the resulting case is a normal case with
`source_channel = KIOSK`.

## 12. Honesty (30s)
**Notifications** → the channel panel lists in-app, push, Telegram and WhatsApp
with a live configured/unconfigured state from the server. In a demo without
provider keys, Telegram and WhatsApp read **not configured** and nothing is sent
— say that plainly rather than claiming a delivery that did not happen.

## Reset between runs

As an admin, Profile → Demo controls → **Rebuild demo data**, or
`POST /admin/demo/reset`. Use **Jump 5 days ahead** to show SLA breaches.

## Troubleshooting

| Symptom | Fix |
| :-- | :-- |
| Empty dashboard | Run the bootstrap/seed step |
| Login fails | Confirm the backend is up on port 8000 |
| No offline queue | IndexedDB blocked (private window); the app says so |
