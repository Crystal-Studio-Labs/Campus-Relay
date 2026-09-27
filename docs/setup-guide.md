# Setup Guide

From nothing to a running, configured campus. The goal is **operational within an
hour** for a college that has its data to hand.

## 0. Prerequisites

- Docker (single machine) **or** a Render + Vercel + Supabase account (split
  cloud).
- Your college's information: name, monogram, city/region, and CSV exports of
  departments, hostels, rooms, staff and students.

## 1. Choose a deployment

Follow `docs/DEPLOYMENT.md`. The short version:

**Single machine**

```bash
cp .env.example .env        # set APP_SECRET_KEY and POSTGRES_PASSWORD
docker compose -f docker-compose.selfhost.yml up -d --build
# open http://<server-ip>:8080
```

**Split cloud** — deploy the backend via `render.yaml`, the frontend on Vercel
with `VITE_API_BASE_URL` set, and create the Supabase database.

## 2. Configure the institution

Edit `config/institution.json` — the one file a college edits:

| Key | Meaning |
| :-- | :-- |
| `identity` | Name, short name, monogram, city, region, support contact |
| `academics` | Term label, timezone, week start |
| `localisation` | Default language and the languages offered |
| `appearance` | Design skin, default theme, accent colour, crest, reading direction |
| `vocabulary` | What you call a hostel, a branch, a batch… |
| `stations` | Kiosk idle timeout, default theme, helpdesk channel |
| `features` | Module switches (agents, kiosk, gate, notices, offline_sync) |
| `guardrails` | WCAG level, min contrast, min touch target |

On a single-machine install the file is mounted, so press **Reload from disk** on
the **Institution setup** screen (`/setup`) or `POST /admin/institution/reload`.
Identity and branding can also be written live from the **onboarding wizard** on
the same screen (`POST /admin/institution/identity`): name, monogram, accent,
crest and reading direction are applied without a rebuild or a restart.

## 3. Bring in your data

Download the CSV templates and fill them in this order (foreign keys depend on
it):

```
departments.csv → branches.csv → hostels.csv → rooms.csv
→ locations.csv → assets.csv → staff.csv → students.csv
→ services.csv → existing_complaints.csv
```

Download the whole set at once with **Download onboarding pack** on the
**Institution setup** screen (`GET /admin/data/onboarding-pack`): it bundles the
CSV templates, a README and an `institution.json` skeleton.

Import from the admin **Directory → Import** screen (or `POST /admin/data/import/{entity}`).
The importer reports per-row errors; fix and re-import. It never silently drops
rows and never reports a partial import as complete.

> Until you import your own people, the seeded **demo campus** is present.
> Rebuild it any time from Profile → Demo controls (demo mode only).

## 4. Verify the first workflow

1. Sign in as an administrator.
2. Open **Command centre** — metrics should reflect your imported data.
3. Raise a test complaint as a student, resolve it as a technician, verify it.
4. Confirm the audit trail shows every step.

## 5. Set your real targets

- Review **SLA rules** (service + priority → target). The seeded 24h/8h/2h values
  are demo defaults; replace them with institutional ones.
- Review **policies** for leave, certificate and gate pass.
- Assign wardens to hostels and staff to departments so scoping is correct.

## 6. Configure notification channels

In-app delivery needs nothing. To reach students where they already are, set the
provider credentials in `.env` and restart the backend:

| Channel | Variables |
| :-- | :-- |
| Telegram | `TELEGRAM_BOT_TOKEN` (and, optionally, `TELEGRAM_API_BASE` for a local Bot API server) |
| WhatsApp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, and the approved `WHATSAPP_TEMPLATE` / `WHATSAPP_TEMPLATE_LANGUAGE` |
| Public media | `PUBLIC_BASE_URL` — the backend's public origin, so an image/PDF notice has a URL the provider can fetch |

The delivery outbox worker is tuned with `DELIVERY_WORKER_ENABLED`,
`DELIVERY_POLL_SECONDS` and `DELIVERY_BATCH_SIZE` (see
`docs/notification-system.md`).

Students opt in under **Profile → Notifications** (and set their chat id or
number). A notice with an image or PDF attachment is delivered as that media.
Until a credential is present, `/meta` reports the channel as *not configured*
and nothing is queued — so a demo never claims a delivery that did not happen.

## 7. Train and roll out

- Students: the PWA (`/`), installable on a phone.
- Staff: their task queue (`/tasks`).
- Security: the gate desk (`/gate`).
- Set a shared tablet up as a **kiosk** (`/kiosk`) for students without phones.

## 8. Go-live checklist

- [ ] `APP_ENV=production` (disables the demo reset endpoint).
- [ ] `APP_SECRET_KEY` changed from the default.
- [ ] `CORS_ORIGINS` set to the real frontend origin (split cloud).
- [ ] Database backed up and a restore tested.
- [ ] Your data imported and spot-checked.
- [ ] SLA targets replaced with real ones.
- [ ] At least one real case completed end to end.

## Troubleshooting

| Symptom | Likely cause |
| :-- | :-- |
| Backend cannot reach the database | Wrong `DATABASE_URL`, or missing `?sslmode=require` |
| Browser blocked by CORS | Frontend origin missing from `CORS_ORIGINS` |
| Kiosk resets too fast/slow | `stations.kiosk_idle_seconds` |
| Config changes not appearing | Press "Reload from disk", or restart the container |
