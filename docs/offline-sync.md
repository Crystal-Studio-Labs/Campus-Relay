# Offline-First Architecture & Sync

Hostels, basements and gates have no signal. The PWA is therefore built
**local-first**: a request is written to the device before it is sent anywhere,
and it survives a reload, a dead battery or a week without network.

PostgreSQL remains the single source of truth. IndexedDB is a client-side
replica and outbox — never the authoritative database.

```
PWA → IndexedDB → local OUTBOX → sync engine → POST /sync/push → PostgreSQL
```

## Client storage (`frontend/src/lib/db.ts`)

Three IndexedDB stores:

| Store | Contents |
| :-- | :-- |
| `cache` | Last server responses (cases, notices, profile, catalogue context) |
| `outbox` | Pending mutations with their idempotency keys |
| `drafts` | Autosaved, partially-filled forms |

If IndexedDB is unavailable (private mode, hardened browser) the app says so
plainly and disables queueing rather than pretending to save.

## Operations (`SyncOperationType`)

`CASE_CREATE`, `CASE_COMMENT`, `CASE_STATUS`, `CASE_VERIFY`, `NOTICE_READ`,
`NOTICE_ACTION`, `NOTIFICATION_READ`, `GATE_LOG`.

## Idempotency

Every queued operation carries an immutable device-generated key
(`op-<timestamp>-<rand>`). The server records it in `sync_operations` with a
unique constraint. Replaying the same payload any number of times yields the
same record — a complaint filed twice on a flaky connection creates one case.

## Status lifecycle (`SyncStatus`)

```
QUEUED → SYNCING → SYNCED
            │
            ├→ FAILED_RETRYING         (transient; exponential backoff)
            ├→ CONFLICT                (server state moved on)
            └→ FAILED_REQUIRES_ACTION  (needs a human decision)
```

The status is always visible in the UI — the connectivity bar, the profile
screen and the full Sync Centre (`/sync`). Data is never silently lost: a
failure is a state the person can see, not a silent no-op.

## Conflict handling (`app/services/sync.py`)

Blind last-write-wins is explicitly **not** used for critical operations:

- **State** must pass state-machine validation; an illegal transition is
  rejected and returned as a conflict.
- **Approval** cannot be overwritten by stale offline data.
- **Assignment** must respect current permissions and state.
- **Audit** is append-only and is never overwritten.
- **Duplicate submission** is absorbed by the idempotency key.

On conflict the server returns the **latest server state** so the client can
reconcile instead of clobbering it.

## Server side

| Method | Path | Purpose |
| :-- | :-- | :-- |
| POST | `/sync/push` | Replay a batch; idempotent per operation |
| GET | `/sync/operations` | Status of previously pushed operations |
| GET | `/sync/health` | Server view of the sync backlog |

## Guarantees

1. A queued operation is never lost on reload or restart.
2. The same key never creates a second record.
3. A stale mutation never silently overwrites newer server state.
4. Every replay writes an audit event (`SYNCED`, `SYNC_CONFLICT`, `SYNC_FAILED`).
5. When the API is unreachable, a network failure is surfaced as status `0` and
   queued — it is never reported as success.

## Mandatory offline test

1. Open the app online; let it sync.
2. Disable the network.
3. File a complaint → it appears immediately as "filed offline", reference
   issued.
4. Reload the app → the case is still there.
5. Re-enable the network → the outbox drains.
6. Confirm exactly one case exists on the server (no duplicate).
7. Confirm the admin sees it and an audit event exists.

`backend/scripts/e2e_demo.py` automates the server-side half of this against a
running instance.
