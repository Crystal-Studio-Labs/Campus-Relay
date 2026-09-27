# Configuring Campus Relay for a new institution

Campus Relay is a **template**. One file — `config/institution.json` at the
repository root — is the difference between the demo deployment and your
college. You edit values; you do not fork code.

This document is the reference. The product itself documents its current state
on the **Institution setup** screen (`/setup`, administrators only), which reads
from the running server — so if the screen and this file ever disagree, the
screen is what the server is actually serving.

---

## 1. The thirty-second version

1. Copy `config/institution.json` (or create it — a missing file is valid and
   starts the deployment on built-in defaults).
2. Change the values under `identity` at minimum.
3. Tell the server: press **Reload from disk** on `/setup`, or call
   `POST /api/v1/admin/institution/reload`, or restart the API.
4. Every screen — landing page, sign-in stations, kiosk, shell, documents — now
   carries your institution's name, design language and vocabulary.

No rebuild. No database migration. No code change.

---

## 2. Where the file lives and who reads it

| Path | Purpose |
| --- | --- |
| `config/institution.json` | The file you edit. Not a secret; safe to commit. |
| `backend/app/core/institution.py` | Loads, deep-merges, validates and caches it. Also the schema: every key exists in `DEFAULT_INSTITUTION` first. |
| `backend/app/api/v1/institution.py` | Serves it: `GET /api/v1/institution` (public), `GET /api/v1/admin/institution` (full + provenance + edit checklist), `POST /api/v1/admin/institution/reload`. |
| `backend/app/api/v1/institution.py` (`POST /admin/institution/identity`) | Whitelisted live write used by the onboarding wizard: identity and branding update without a code change or restart. |
| `frontend/src/lib/institution.ts` | Types, defaults mirror, cache, helpers. |
| `frontend/src/state/institution.tsx` | React provider: applies config before first paint from cache, refreshes from the server in the background. |
| `INSTITUTION_CONFIG_PATH` (env) | Optional override of the file location, for deployments that keep config outside the repo. |

Rules the loader enforces, so a bad edit cannot break a deployment:

- **A partial file works.** Nested dictionaries deep-merge over defaults; a
  college changing one vocabulary word does not restate the other nine.
- **A broken file degrades.** Invalid JSON, a wrong type, or an out-of-range
  number falls back to the default and records a *warning* — visible on
  `/setup` and in the reload response — rather than refusing to start.
- **Keys beginning with `_` are comments.** The shipped file uses `_readme`.

---

## 3. Every key, with what it does

### `identity` — what every screen calls you

| Key | Example | Used for |
| --- | --- | --- |
| `name` | `Crystal Institute of Technology` | Page titles, landing page footer, station strip |
| `short_name` | `Crystal Institute` | The brand plate in the sidebar / top bar |
| `monogram` | `CIT` (max 4 chars) | Fallback compact branding; truncated with a warning if longer |
| `code` | `CIT` | Institutional code in exports and document serials context |
| `tagline` | one sentence | Sign-in screen subtitle |
| `kind` | `Institute of Technology` | Landing page kicker |
| `city`, `region` | `Bhubaneswar`, `Odisha` | Landing page kicker, provenance |
| `support_email`, `support_phone` | helpdesk contact | Shown on the setup screen; slot for stations |
| `website` | URL | Reserved for the crest/branding slot |

### `academics` — the academic calendar context

| Key | Default | Notes |
| --- | --- | --- |
| `term_label` | `Current term` | Shown in the station strip on every screen |
| `timezone` | `Asia/Kolkata` | Deadline and SLA context |
| `week_starts_on` | `monday` | Calendar grouping |

### `localisation` — languages offered

| Key | Notes |
| --- | --- |
| `default_language` | Must be one of `languages`; validated, falls back to the first |
| `languages` | Language codes offered in the picker, in order. Codes not in the frontend dictionary are ignored by the picker, so listing a language before its dictionary exists is safe. |

### `appearance` — the design language

| Key | Values | Notes |
| --- | --- | --- |
| `skin` | `modern` (default), `industrial`, `govt-portal`, `university-portal` (all shipped) | Registered in `frontend/src/theme/registry.ts`; unknown values fall back to the shipped skin. See `docs/THEMES.md`. |
| `default_theme` | `device`, `light`, `dark` | First-visit default per device. `device` follows the operating system. |
| `allow_user_theme_override` | `true`/`false` | `false` locks the sun/moon switch (shown disabled with the reason, not hidden). |
| `accent` | CSS colour or `null` | Institution accent colour applied as `--signal`. The interface validates contrast on ingest and keeps the shipped colour if the accent cannot carry readable button copy, so an arbitrary colour cannot make a button unreadable. |
| `crest_url` | URL or path under `public/`, or `""` | Crest shown on the brand plate beside the wordmark. Empty means the wordmark alone. The dark theme applies a monochrome treatment so a two-colour crest stays legible. |
| `direction` | `ltr`, `rtl` | Reading direction of the shell. `rtl` mirrors the layout for right-to-left scripts; the shell and layout primitives use logical properties. Invalid values revert to `ltr`. |

### `vocabulary` — the words this institution uses

Each entry has `singular` and `plural`. Keys: `campus`, `department`, `branch`,
`year`, `batch`, `hostel`, `block`, `student`, `staff`.

An institute that calls hostels *residences* and blocks *houses* writes that
here; screens that name these things read from the configuration, so nothing
needs translating in code. Served publicly so screens can render before
sign-in.

### `stations` — shared-device behaviour

| Key | Default | Notes |
| --- | --- | --- |
| `kiosk_idle_seconds` | `90` | Idle seconds before the kiosk resets to its sign-in screen. Validated 15–3600. |
| `kiosk_default_theme` | `light` | Intended default for kiosk stations (per-station themes are on the roadmap). |
| `helpdesk_channel` | `ASSISTED_DESK` | Audit channel recorded for desk filings. |
| `default_channel` | `PWA` | Audit channel for personal devices. |

### `features` — module switches

`agents`, `kiosk`, `gate`, `notices`, `offline_sync`, `guided_tours`,
`device_lab`. A module switched off removes its navigation and screens. This is
a product decision, not a security boundary: the server still enforces the
underlying permission on every request.

### `guardrails` — the accessibility floor (declare, don't weaken)

| Key | Shipped value |
| --- | --- |
| `wcag_level` | `AA` |
| `min_body_contrast` | `4.5` |
| `min_touch_target_px` | `46` |
| `status_always_carries_word` | `true` — status chips are always word + colour |
| `require_audit_reason` | `true` |

These are printed on `/setup` so whoever signs off can check the promise against
the product. They are declarations of what the build holds itself to; weakening
them in the file changes the label, not the code, and the code is what the
contrast floor actually is.

---

## 4. The API surface

| Endpoint | Auth | Returns |
| --- | --- | --- |
| `GET /api/v1/institution` | none | Everything the interface needs to render the institution: identity, academics, languages, appearance, vocabulary, stations, features, guardrails. No file path, no warnings. |
| `GET /api/v1/admin/institution` | `config:manage` | The full config **plus** `source` (file path, found, loaded-at, warnings, env-override flag) and `editable_keys` — the checklist of every knob with its group, JSON path and current value. |
| `POST /api/v1/admin/institution/reload` | `config:manage` | Re-reads the file, audits the reload (`INSTITUTION_CONFIG_RELOADED`), reports which sections changed and any loader warnings. |

The public endpoint intentionally serves the whole config rather than a
branding-only subset: screens render before sign-in (kiosk, landing, sign-in),
and a kiosk in a hostel needs the right word for *hostel* before anybody is
authenticated.

---

## 5. What is deliberately *not* configurable in this file

- **Roles and permissions** — they are code (`backend/app/core/permissions.py`)
  and are re-checked server-side on every request. A config file that could
  grant permissions would be a vulnerability, not a convenience.
- **Users, departments, hostels, rooms, services** — operational data, managed
  through the admin screens and seed tooling, because they change during the
  life of a deployment, not at its start.
- **Secrets** — environment variables only (`.env`), never this file.
- **Workflow and SLA rules per service** — service catalogue territory; the
  template boundary is drawn at "what differs between colleges on day one",
  not "everything anyone might tune".

---

## 6. Checklist for a new college

- [ ] `identity.*` — name, short name, monogram, kind, city, support contacts
- [ ] `academics.term_label` — the visible academic period
- [ ] `localisation.languages` — which languages the picker offers
- [ ] `appearance.skin` — which design language (see `docs/THEMES.md`)
- [ ] `appearance.default_theme` — `device` unless you have a reason
- [ ] `vocabulary.*` — your words for campus structure
- [ ] `stations.kiosk_idle_seconds` — how long a lobby tablet holds a screen
- [ ] `features.*` — which modules this deployment runs
- [ ] Create your real campus structure (departments, hostels, blocks, rooms,
      services) through the admin screens or a seed script
- [ ] Create real users and assign roles
- [ ] Press **Reload from disk** and read the setup screen top to bottom
