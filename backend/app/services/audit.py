"""Audit and event recording.

Every meaningful mutation flows through here. Records are append-only (see
app/models/immutability.py) and replay-safe: re-using an idempotency key returns
the original record instead of writing a second one.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, CaseEvent, User
from app.models.enums import ActorKind, SourceChannel
from app.services import clock


def _existing_audit(db: Session, idempotency_key: str | None) -> AuditLog | None:
    if not idempotency_key:
        return None
    return db.scalar(select(AuditLog).where(AuditLog.idempotency_key == idempotency_key))


def record_audit(
    db: Session,
    *,
    event_type: str,
    campus_id: int | None,
    actor: User | None = None,
    actor_role: str | None = None,
    actor_kind: str = ActorKind.USER.value,
    case_id: int | None = None,
    entity_type: str = "CASE",
    entity_id: str | int | None = None,
    source_channel: str = SourceChannel.PWA.value,
    device_uid: str | None = None,
    idempotency_key: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    existing = _existing_audit(db, idempotency_key)
    if existing is not None:
        return existing

    if actor is not None:
        actor_role = actor_role or actor.role_key

    entry = AuditLog(
        campus_id=campus_id,
        event_type=event_type,
        actor_id=actor.id if actor else None,
        actor_role=actor_role,
        actor_kind=actor_kind,
        case_id=case_id,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        source_channel=source_channel,
        device_id=device_uid,
        idempotency_key=idempotency_key,
        payload=payload or {},
        created_at=clock.now(),
    )
    db.add(entry)
    return entry


def record_case_event(
    db: Session,
    *,
    case_id: int,
    campus_id: int,
    event_type: str,
    actor: User | None = None,
    actor_role: str | None = None,
    actor_kind: str = ActorKind.USER.value,
    from_status: str | None = None,
    to_status: str | None = None,
    step_key: str | None = None,
    source_channel: str = SourceChannel.PWA.value,
    device_uid: str | None = None,
    idempotency_key: str | None = None,
    payload: dict[str, Any] | None = None,
) -> CaseEvent:
    """Append to a case timeline. Also writes the campus-wide audit entry."""
    if idempotency_key:
        existing = db.scalar(
            select(CaseEvent).where(
                CaseEvent.case_id == case_id, CaseEvent.idempotency_key == idempotency_key
            )
        )
        if existing is not None:
            return existing

    if actor is not None:
        actor_role = actor_role or actor.role_key

    event = CaseEvent(
        campus_id=campus_id,
        case_id=case_id,
        event_type=event_type,
        actor_id=actor.id if actor else None,
        actor_role=actor_role,
        actor_kind=actor_kind,
        from_status=from_status,
        to_status=to_status,
        step_key=step_key,
        source_channel=source_channel,
        device_id=device_uid,
        idempotency_key=idempotency_key,
        payload=payload or {},
        created_at=clock.now(),
    )
    db.add(event)

    record_audit(
        db,
        event_type=event_type,
        campus_id=campus_id,
        actor=actor,
        actor_role=actor_role,
        actor_kind=actor_kind,
        case_id=case_id,
        entity_type="CASE",
        entity_id=case_id,
        source_channel=source_channel,
        device_uid=device_uid,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return event
