# Supabase Setup

Campus Relay runs on plain PostgreSQL. Supabase is one supported host for it —
useful because the free tier gives a managed database, a storage bucket and a
dashboard for inspecting rows without a local client.

There are exactly three things to do: create the database, apply the schema, and
point the API at it.

---

## 1. Create the project

1. Sign in at **supabase.com** and create a project. Choose the region closest
   to the campus, and save the database password — it is shown once.
2. In **Project settings → Database**, copy the connection string. You want the
   **connection pooler** URI (port `6543`) for a hosted API, because Supabase's
   free tier caps direct connections.

It looks like this:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

> The backend rewrites `postgres://` and `postgresql://` to
> `postgresql+psycopg://` automatically and preserves `?sslmode=require`, so you
> can paste the string exactly as Supabase gives it
> (`app/core/config.py → normalise_database_url`).

---

## 2. Apply the schema

Two equivalent routes. Pick one.

### Option A — run the generated schema (recommended for a fresh project)

In **Database → SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](../supabase/schema.sql) and press **Run**. It creates:

- all 42 tables, constraints and indexes;
- the append-only trigger function and its four triggers;
- row-level security on every table (with no permissive policies);
- the `campus-relay-media` storage bucket;
- a final `select count(*)` you can eyeball to confirm 42 tables.

The file is **generated** from the SQLAlchemy models, so it always matches the
code:

```bash
cd backend
python -m scripts.export_supabase_schema
```

### Option B — let Alembic build it

```bash
cd backend
alembic upgrade head
```

This produces the same tables and triggers. It will **not** create the storage
bucket or the RLS statements, so run the relevant part of `supabase/schema.sql`
afterwards if you want those.

---

## 3. Point the API at it

In the backend environment (Render dashboard, or `.env` for a local run):

```env
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
APP_ENV=production
APP_SECRET_KEY=<a real 32+ character secret>
CORS_ORIGINS=https://<your-frontend-host>
```

Then seed an empty database once (or import your own data — see
[adoption-plan.md](adoption-plan.md)):

```bash
cd backend
python -m app.seed.seed_data
```

`python -m scripts.bootstrap` does migrate + seed-if-empty in one step and is
safe to run on every deploy.

---

## Security model

The API owns all data access. The browser never talks to PostgREST.

| Layer | Setting | Why |
| :-- | :-- | :-- |
| Row-level security | **enabled on every table, no permissive policies** | A leaked `anon` or `authenticated` key reads nothing. Defence in depth, not the primary control. |
| API connection | privileged Postgres role via `DATABASE_URL` | Bypasses RLS, so the API works; the API applies its own RBAC and campus scoping on every request. |
| Storage bucket | `campus-relay-media`, **private** | Attachments are served by the API, which checks permission first. |

Do **not** add a public policy to make a dashboard query work. If a table must
be reachable through PostgREST, add an explicit, narrow policy for it in
`supabase/schema.sql`.

---

## Storage and attachments

Notice circulars (images/PDFs) and case evidence are uploaded through the API
and stored under the media root (`MEDIA_ROOT`). Two supported shapes:

- **On-disk** — set `MEDIA_ROOT` to a persistent volume and leave it at that.
- **Supabase Storage** — the bucket from `schema.sql` exists; point `MEDIA_ROOT`
  at a synced/mounted directory, or extend `app/services/documents.py`.

External channels (Telegram, WhatsApp) fetch media **by URL**, so
`PUBLIC_BASE_URL` must be set to the API's publicly reachable origin. With it
empty, the app sends the notice text and states that the attachment is on the
portal, rather than claiming it delivered a file.

---

## Troubleshooting

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `database_unavailable` (HTTP 503) | Connection string wrong, or pool exhausted | Check `DATABASE_URL`; lower `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`. |
| `SSL connection is required` | Missing `?sslmode=require` | Paste the full Supabase URI including the query string. |
| Migration says "already exists" | Schema applied by both Alembic and `schema.sql` | Use one route. `alembic stamp head` marks the DB without re-running DDL. |
| Attachments 404 on a host | `MEDIA_ROOT` on an ephemeral disk | Use a persistent volume or Supabase Storage. |
| WhatsApp/Telegram never sends | No provider configured (by design) | Set `TELEGRAM_BOT_TOKEN` (Telegram works with just that), or WhatsApp credentials. Check `GET /meta`. |
