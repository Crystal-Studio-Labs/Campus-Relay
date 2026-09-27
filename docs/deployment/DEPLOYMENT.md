# Deployment Guide

Campus Relay ships in two shapes. Pick one:

| | **Split cloud** | **Single machine** |
| :-- | :-- | :-- |
| Frontend | Vercel | nginx container |
| Backend | Render | backend container |
| Database | Supabase | Postgres container |
| Best for | the public demo, review panels | a college that must keep data on-premises |
| Config file | `render.yaml`, `frontend/vercel.json` | `docker-compose.selfhost.yml` |
| Origin | two origins (CORS + `VITE_API_BASE_URL`) | one origin (no CORS) |

The application code is identical. Only environment variables and the two
deployment files differ, which is the point of the institution template.

---

## 1. Split cloud (Vercel + Render + Supabase)

This is the fastest path to a shareable demo URL.

### 1.1 Database — Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → Database → Connection string → URI**.
3. Copy the **Connection pooling** URI (Session mode, port `5432`) and append
   `?sslmode=require`. It looks like:

   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

4. Keep it for the Render step. You do **not** need to create tables — Alembic
   migrations run automatically on the first Render deploy.

> The backend rewrites `postgresql://` to `postgresql+psycopg://` itself
> (`app/core/config.py::normalise_database_url`), so paste the URI exactly as
> Supabase gives it.

### 1.2 Backend — Render

1. Push this repository to GitHub.
2. In Render choose **New → Blueprint** and point it at the repository.
   Render reads [`render.yaml`](../render.yaml) and creates the
   `campus-relay-api` web service.
3. When prompted, fill the values marked `sync: false`:

   | Variable | Value |
   | :-- | :-- |
   | `DATABASE_URL` | the Supabase URI from 1.1 |
   | `CORS_ORIGINS` | your Vercel URL, e.g. `https://campus-relay.vercel.app` |

   `APP_SECRET_KEY` is generated for you.
4. Deploy. The start command runs `alembic upgrade head` first, so the schema is
   created on the first boot.
5. The service is live at `https://<name>.onrender.com`; check
   `/api/v1/health` and `/docs`.

To load the demo campus on a fresh database, run once from the Render shell:

```
python -m app.seed.seed_data
```

(Render's free tier sleeps after inactivity; the first request after a sleep is
slow. That is a plan limit, not an application problem.)

### 1.3 Frontend — Vercel

1. In Vercel choose **Add New → Project** and import the repository.
2. Set **Root Directory** to `frontend`. Vercel detects Vite; `frontend/vercel.json`
   supplies the build command, output directory and SPA rewrites.
3. Add one environment variable (Production and Preview):

   | Variable | Value |
   | :-- | :-- |
   | `VITE_API_BASE_URL` | your Render URL, e.g. `https://campus-relay-api.onrender.com` |

   Leave it empty only if the API is on the same origin.
4. Deploy. Add the resulting Vercel domain to `CORS_ORIGINS` on Render and
   redeploy the backend so the browser is allowed to call it.

### 1.4 Checklist

- [ ] `https://<api>.onrender.com/api/v1/health` returns JSON.
- [ ] `https://<app>.vercel.app` loads, and a sign-in succeeds.
- [ ] `CORS_ORIGINS` contains the exact Vercel origin (no trailing slash).
- [ ] `VITE_API_BASE_URL` points at Render.
- [ ] The public document-verification and notice-share links resolve (they use
      the API base, not the frontend origin).

---

## 2. Single machine (one college, one server)

For a college that must keep every record on its own hardware. Requires only
Docker on the server.

```bash
cp .env.example .env          # edit APP_SECRET_KEY and POSTGRES_PASSWORD
docker compose -f docker-compose.selfhost.yml up -d --build
```

Then open `http://<server-ip>:8080` (change the port with `WEB_PORT` in `.env`).

What happens on first start:

1. `db` starts and reports healthy.
2. `backend` waits for it, runs `alembic upgrade head`, then
   `python -m scripts.bootstrap`, which seeds the demo campus **only if the
   database is empty**, then serves the API.
3. `web` serves the built PWA and proxies `/api` to `backend`.

Because everything is one origin, `VITE_API_BASE_URL` stays empty and no CORS
configuration is needed.

### Customising for your college

Edit `config/institution.json` — it is mounted into the backend read-only, so no
image rebuild is required. Press **Reload from disk** on the **Institution
setup** screen (`/setup`), or call `POST /api/v1/admin/institution/reload`.

### Operations

```bash
# logs
docker compose -f docker-compose.selfhost.yml logs -f backend

# stop (keeps data)
docker compose -f docker-compose.selfhost.yml down

# stop and DELETE all data
docker compose -f docker-compose.selfhost.yml down -v

# rebuild after a code update
docker compose -f docker-compose.selfhost.yml up -d --build
```

Data lives in the `campus-relay_campus_relay_selfhost_pgdata` volume and
uploaded evidence in `..._selfhost_media`. Back those up like any Postgres.

### Putting it on the internet

For TLS, put a reverse proxy (Caddy or nginx) in front of `web` and forward
`80 → web:80`. Caddy needs two lines:

```
campus.example.edu {
    reverse_proxy localhost:8080
}
```

---

## 3. Environment variables

All variables are described in [`.env.example`](../.env.example). The ones that
differ between the two modes:

| Variable | Split cloud | Single machine |
| :-- | :-- | :-- |
| `DATABASE_URL` | Supabase URI (with `?sslmode=require`) | empty (uses `POSTGRES_*`) |
| `CORS_ORIGINS` | the Vercel origin | not needed |
| `VITE_API_BASE_URL` | the Render origin | empty (nginx proxy) |
| `APP_ENV` | `demo` | `production` once real data is in |
| `WEB_PORT` | n/a | port to publish, default `8080` |
| `PUBLIC_BASE_URL` | the Render origin | the machine's origin |
| `TELEGRAM_BOT_TOKEN` | optional | optional |
| `WHATSAPP_*` | optional | optional |
| `DELIVERY_WORKER_ENABLED` | `true` | `true` |

`APP_ENV` controls whether the demo reset endpoint and demo credentials are
exposed. Set it to `production` on a real college install.

### Database schema

Two equivalent ways to create the schema on the host:

- `cd backend && alembic upgrade head` (tables + append-only triggers), or
- run [`supabase/schema.sql`](../supabase/schema.sql) in the Supabase SQL editor,
  which additionally enables row-level security and creates the storage bucket.
  That file is **generated** from the models:
  `python -m scripts.export_supabase_schema`.

Full Supabase walkthrough: [SUPABASE.md](SUPABASE.md).

### External messaging and the delivery worker

`PUBLIC_BASE_URL` is the deployment's publicly reachable origin. External
channels (Telegram, WhatsApp) fetch notice attachments **by URL**, so without it
they send the notice text and state that the file is on the portal — they never
claim to have delivered a file they could not.

The delivery worker starts beside the API and drains the notification outbox
every `DELIVERY_POLL_SECONDS`. It is disabled automatically under
`APP_ENV=test`. To drain by hand (a cron, or a one-off):

```bash
cd backend && python -m app.services.delivery --once
```

An unconfigured channel queues nothing and claims nothing. Check what is live at
any time with `GET /api/v1/meta` → `notification_channels`.

---

## 4. Local development (unchanged)

```bash
docker compose up -d db                    # Postgres only
cd backend
alembic upgrade head
python -m app.seed.seed_data
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd frontend
npm install
npm run dev                                 # http://localhost:5173
```

The Vite dev server proxies `/api` to `127.0.0.1:8000`, so
`VITE_API_BASE_URL` stays empty here too.
