"""Sync API: the server end of the client's IndexedDB outbox."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.api.v1.schemas import SyncPushRequest
from app.core.permissions import SYNC_SUBMIT
from app.models.enums import SyncStatus
from app.services import clock, sync as sync_service

router = APIRouter(tags=["sync"])


@router.post("/sync/push")
def push(payload: SyncPushRequest, db: DbSession, user: CurrentUser):
    """Replay queued offline operations.

    Responses mirror the client's outbox states:
      SYNCED                 - applied, and applied only once
      CONFLICT               - the server state moved; the client must reconcile
      FAILED_REQUIRES_ACTION - will never succeed without a human decision
      FAILED_RETRYING        - transient; back off and try again
    """
    assert_permission(user, SYNC_SUBMIT)

    operations = [
        sync_service.OperationInput(
            idempotency_key=item.idempotency_key,
            operation=item.operation,
            payload=item.payload,
            client_base=item.client_base,
            entity_id=item.entity_id,
            source_channel="PWA",
            captured_offline_at=item.captured_offline_at,
        )
        for item in payload.operations
    ]
    results = sync_service.push(db, user=user, device_uid=payload.device_uid, operations=operations)

    counts: dict[str, int] = {}
    for result in results:
        counts[result.status] = counts.get(result.status, 0) + 1

    return {
        "device_uid": payload.device_uid,
        "processed": len(results),
        "counts": counts,
        "results": [r.as_dict() for r in results],
        "server_time": clock.now(),
    }


@router.get("/sync/operations")
def operations(
    db: DbSession,
    user: CurrentUser,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
):
    """The user's operation history - useful when a queued item needs attention."""
    assert_permission(user, SYNC_SUBMIT)
    rows = sync_service.pending_operations(db, user=user, limit=limit)
    if status:
        rows = [row for row in rows if row["status"] == status]
    return {
        "operations": rows,
        "states": [s.value for s in SyncStatus],
    }


@router.get("/sync/health")
def sync_health(db: DbSession, user: CurrentUser):
    """Cheap endpoint the client uses to detect connectivity properly.

    A 200 here means the API and database are genuinely reachable - better than
    trusting navigator.onLine, which lies on captive portals.
    """
    assert_permission(user, SYNC_SUBMIT)
    from sqlalchemy import select

    from app.models import User

    # Force a real database round trip so this cannot report healthy from cache.
    db.scalar(select(User.id).where(User.id == user.id))
    return {"ok": True, "server_time": clock.now(), "user_id": user.id}
