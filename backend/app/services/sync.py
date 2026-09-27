"""Sync engine (server side).

The client keeps an IndexedDB outbox. When connectivity returns it replays each
queued operation here with:
  * a stable idempotency key (generated once, on the device, when queued)
  * a snapshot of the state the client believed when it queued the mutation

Server rules:
  * replaying the same key never creates a second record
  * a mutation against a stale snapshot is reported as CONFLICT, not applied
  * a permanently impossible mutation is FAILED_REQUIRES_ACTION (never silently dropped)
  * transient failures are FAILED_RETRYING, with the client backing off
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import (
    AppError,
    ConflictError,
    InvalidTransitionError,
    NotFoundError,
    PermissionDeniedError,
    PolicyViolationError,
    ValidationError,
)
from app.models import Case, Notice, Notification, SyncOperation, User
from app.models.enums import (
    AuditEventType,
    SourceChannel,
    SyncOperationType,
    SyncStatus,
)
from app.services import audit, case_engine, clock, gate, notices, notifications

# Errors that will never succeed on retry without user or admin action.
PERMANENT_ERRORS = (PermissionDeniedError, PolicyViolationError, NotFoundError, ValidationError)
TRANSIENT_ERRORS = (ConflictError,)


@dataclass
class OperationInput:
    idempotency_key: str
    operation: str
    payload: dict = field(default_factory=dict)
    client_base: dict = field(default_factory=dict)
    entity_id: str | None = None
    source_channel: str = SourceChannel.PWA.value
    captured_offline_at: datetime | None = None


@dataclass
class OperationResult:
    idempotency_key: str
    status: str
    operation: str
    server_id: int | None = None
    detail: str | None = None
    retryable: bool = False
    conflicts: dict = field(default_factory=dict)
    data: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "idempotency_key": self.idempotency_key,
            "operation": self.operation,
            "status": self.status,
            "server_id": self.server_id,
            "detail": self.detail,
            "retryable": self.retryable,
            "conflicts": self.conflicts,
            "data": self.data,
        }


def _parse_dt(value) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return clock.ensure_aware(value)
    try:
        return clock.ensure_aware(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except ValueError:
        return None


def push(
    db: Session,
    *,
    user: User,
    device_uid: str | None,
    operations: list[OperationInput],
) -> list[OperationResult]:
    results: list[OperationResult] = []
    for operation in operations:
        results.append(apply_operation(db, user=user, device_uid=device_uid, operation=operation))
    return results


def apply_operation(
    db: Session, *, user: User, device_uid: str | None, operation: OperationInput
) -> OperationResult:
    record = db.scalar(
        select(SyncOperation).where(SyncOperation.idempotency_key == operation.idempotency_key)
    )
    if record is not None and record.status == SyncStatus.SYNCED.value:
        # Already applied: return the original server result (no duplicate work).
        return OperationResult(
            idempotency_key=operation.idempotency_key,
            operation=record.operation,
            status=SyncStatus.SYNCED.value,
            server_id=int(record.entity_id) if record.entity_id and record.entity_id.isdigit() else None,
            detail="Already applied on a previous attempt.",
            data=record.response or {},
        )
    if record is not None and record.user_id != user.id:
        return OperationResult(
            idempotency_key=operation.idempotency_key,
            operation=record.operation,
            status=SyncStatus.FAILED_REQUIRES_ACTION.value,
            detail="This operation key belongs to another account.",
        )

    if record is None:
        record = SyncOperation(
            campus_id=user.campus_id,
            user_id=user.id,
            device_id=device_uid,
            idempotency_key=operation.idempotency_key,
            operation=operation.operation,
            entity_type=_entity_type_for(operation.operation),
            entity_id=operation.entity_id,
            status=SyncStatus.SYNCING.value,
            attempts=1,
            source_channel=operation.source_channel,
            payload=operation.payload,
            client_base=operation.client_base,
            captured_offline_at=operation.captured_offline_at,
        )
        db.add(record)
        db.flush()
    else:
        record.attempts += 1
        record.status = SyncStatus.SYNCING.value

    handler = _HANDLERS.get(operation.operation)
    if handler is None:
        return _finalise(
            db,
            record,
            SyncStatus.FAILED_REQUIRES_ACTION,
            detail=f"Unsupported sync operation '{operation.operation}'.",
        )

    try:
        result = handler(db, user=user, device_uid=device_uid, operation=operation, record=record)
        return _finalise(
            db,
            record,
            SyncStatus.SYNCED,
            detail=result.get("detail"),
            server_id=result.get("server_id"),
            data=result.get("data") or {},
        )
    except PermissionDeniedError as exc:
        return _finalise(db, record, SyncStatus.FAILED_REQUIRES_ACTION, detail=exc.message)
    except PolicyViolationError as exc:
        return _finalise(
            db,
            record,
            SyncStatus.CONFLICT,
            detail=exc.message,
            conflicts={"policy": exc.details},
            retryable=False,
        )
    except InvalidTransitionError as exc:
        return _finalise(
            db,
            record,
            SyncStatus.CONFLICT,
            detail=exc.message,
            conflicts={"transition": exc.details},
        )
    except ConflictError as exc:
        # Stale client state: the client must reconcile, not blindly retry.
        return _finalise(
            db,
            record,
            SyncStatus.CONFLICT,
            detail=exc.message,
            conflicts={"server_state": exc.details},
            retryable=False,
        )
    except (NotFoundError, ValidationError) as exc:
        return _finalise(db, record, SyncStatus.FAILED_REQUIRES_ACTION, detail=exc.message)
    except AppError as exc:
        return _finalise(db, record, SyncStatus.FAILED_REQUIRES_ACTION, detail=exc.message)
    except Exception as exc:  # noqa: BLE001 - unexpected: retry rather than lose data
        return _finalise(
            db,
            record,
            SyncStatus.FAILED_RETRYING,
            detail=f"Unexpected server error: {type(exc).__name__}",
            retryable=True,
        )


def _finalise(
    db: Session,
    record: SyncOperation,
    status: str,
    *,
    detail: str | None = None,
    server_id: int | None = None,
    data: dict | None = None,
    conflicts: dict | None = None,
    retryable: bool | None = None,
) -> OperationResult:
    record.status = status
    record.last_error = detail if status != SyncStatus.SYNCED.value else None
    if server_id is not None:
        record.entity_id = str(server_id)
    response = {"detail": detail, "data": data or {}, "conflicts": conflicts or {}}
    record.response = response
    if status == SyncStatus.SYNCED.value:
        record.synced_at = clock.now()

    audit.record_audit(
        db,
        event_type=AuditEventType.SYNCED.value
        if status == SyncStatus.SYNCED.value
        else AuditEventType.SYNC_CONFLICT.value
        if status == SyncStatus.CONFLICT.value
        else AuditEventType.SYNC_FAILED.value,
        campus_id=record.campus_id,
        actor_role=None,
        entity_type=record.entity_type,
        entity_id=record.entity_id,
        source_channel=record.source_channel,
        device_uid=record.device_id,
        idempotency_key=f"sync:{record.idempotency_key}",
        payload={
            "operation": record.operation,
            "status": status,
            "attempts": record.attempts,
            "detail": detail,
        },
    )
    db.flush()
    return OperationResult(
        idempotency_key=record.idempotency_key,
        operation=record.operation,
        status=status,
        server_id=int(record.entity_id) if record.entity_id and record.entity_id.isdigit() else None,
        detail=detail,
        retryable=bool(
            retryable if retryable is not None else status == SyncStatus.FAILED_RETRYING.value
        ),
        conflicts=conflicts or {},
        data=data or {},
    )


def _entity_type_for(operation: str) -> str:
    return {
        SyncOperationType.CASE_CREATE.value: "CASE",
        SyncOperationType.CASE_COMMENT.value: "CASE_COMMENT",
        SyncOperationType.CASE_STATUS.value: "CASE",
        SyncOperationType.CASE_VERIFY.value: "CASE",
        SyncOperationType.NOTICE_READ.value: "NOTICE",
        SyncOperationType.NOTICE_ACTION.value: "NOTICE",
        SyncOperationType.NOTIFICATION_READ.value: "NOTIFICATION",
        SyncOperationType.GATE_LOG.value: "GATE_PASS",
    }.get(operation, "SYNC")


# --- Handlers -------------------------------------------------------------


def _handle_case_create(db, *, user, device_uid, operation, record) -> dict:
    draft = case_engine.CaseDraft(
        service_key=operation.payload.get("service_key"),
        description=operation.payload.get("description", ""),
        title=operation.payload.get("title"),
        category=operation.payload.get("category"),
        subcategory=operation.payload.get("subcategory"),
        priority=operation.payload.get("priority"),
        location_id=operation.payload.get("location_id"),
        location_code=operation.payload.get("location_code"),
        asset_id=operation.payload.get("asset_id"),
        state_payload=operation.payload.get("state_payload") or {},
        source_channel=operation.source_channel,
        language=operation.payload.get("language", "en"),
        client_ref=operation.idempotency_key,
        captured_offline_at=_parse_dt(operation.captured_offline_at),
        device_uid=device_uid,
        on_behalf_student_id=operation.payload.get("on_behalf_student_id"),
    )
    result = case_engine.create_case(db, actor=user, draft=draft)
    return {
        "server_id": result.case.id,
        "detail": "Case created on the server."
        if result.created
        else "Case already existed for this key.",
        "data": {
            "case_id": result.case.id,
            "case_number": result.case.case_number,
            "status": result.case.status,
            "created": result.created,
            "duplicate_of": result.duplicate_of.case_number if result.duplicate_of else None,
            "routing": result.routing_explanation,
        },
    }


def _handle_case_comment(db, *, user, device_uid, operation, record) -> dict:
    case = _require_case(db, operation.payload.get("case_id"), user)
    _assert_base_status(case, operation.client_base)
    comment = case_engine.add_comment(
        db,
        case=case,
        actor=user,
        body=operation.payload.get("body", ""),
        visibility=operation.payload.get("visibility", "PUBLIC"),
        client_ref=operation.idempotency_key,
        source_channel=operation.source_channel,
    )
    return {"server_id": comment.id, "detail": "Comment stored.", "data": {"case_id": case.id}}


def _handle_case_status(db, *, user, device_uid, operation, record) -> dict:
    case = _require_case(db, operation.payload.get("case_id"), user)
    action = operation.payload.get("action")
    conflicts = _status_conflicts(case, operation.client_base)
    if conflicts:
        raise ConflictError("Case changed on the server since you queued this action.")

    if action == "start":
        case_engine.start_work(db, case=case, actor=user, note=operation.payload.get("note"))
    elif action == "resolve":
        case_engine.resolve_case(
            db, case=case, actor=user, note=operation.payload.get("note"), source_channel=operation.source_channel
        )
    elif action == "reopen":
        case_engine.reopen_case(db, case=case, actor=user, reason=operation.payload.get("reason", "Reopened"))
    elif action == "cancel":
        case_engine.cancel_case(db, case=case, actor=user, reason=operation.payload.get("reason"))
    elif action == "escalate":
        case_engine.escalate_case(db, case=case, actor=user, reason=operation.payload.get("reason", "Escalated"))
    else:
        raise ValidationError(f"Unsupported case action '{action}'.")

    return {
        "server_id": case.id,
        "detail": f"Applied '{action}'.",
        "data": {"case_id": case.id, "status": case.status},
    }


def _handle_case_verify(db, *, user, device_uid, operation, record) -> dict:
    case = _require_case(db, operation.payload.get("case_id"), user)
    conflicts = _status_conflicts(case, operation.client_base)
    if conflicts:
        raise ConflictError("Case changed on the server since you queued this verification.")
    case_engine.verify_resolution(
        db,
        case=case,
        actor=user,
        accepted=bool(operation.payload.get("accepted", True)),
        note=operation.payload.get("note"),
        source_channel=operation.source_channel,
    )
    return {"server_id": case.id, "detail": "Verification recorded.", "data": {"status": case.status}}


def _handle_notice_read(db, *, user, device_uid, operation, record) -> dict:
    notice_id = operation.payload.get("notice_id")
    notice = db.get(Notice, notice_id)
    if notice is None or notice.campus_id != user.campus_id:
        raise NotFoundError("Notice not found.")
    notices.mark_read(
        db,
        notice=notice,
        user=user,
        source_channel=operation.source_channel,
        offline_captured_at=_parse_dt(operation.captured_offline_at),
    )
    return {"server_id": notice.id, "detail": "Notice read recorded.", "data": {}}


def _handle_notice_action(db, *, user, device_uid, operation, record) -> dict:
    notice = db.get(Notice, operation.payload.get("notice_id"))
    if notice is None or notice.campus_id != user.campus_id:
        raise NotFoundError("Notice not found.")
    action = notices.complete_action(
        db,
        notice=notice,
        user=user,
        action_type=operation.payload.get("action_type"),
        case_id=operation.payload.get("case_id"),
        payload=operation.payload.get("payload") or {},
    )
    return {"server_id": action.id, "detail": "Action recorded.", "data": {"notice_id": notice.id}}


def _handle_notification_read(db, *, user, device_uid, operation, record) -> dict:
    notification = db.get(Notification, operation.payload.get("notification_id"))
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    notifications.mark_read(db, notification=notification, user=user, source_channel=operation.source_channel)
    return {"server_id": notification.id, "detail": "Notification read.", "data": {}}


def _handle_gate_log(db, *, user, device_uid, operation, record) -> dict:
    log = gate.record_movement(
        db,
        actor=user,
        direction=operation.payload.get("direction"),
        pass_code=operation.payload.get("pass_code"),
        student_id=operation.payload.get("student_id"),
        gate_location_id=operation.payload.get("gate_location_id"),
        occurred_at=_parse_dt(operation.payload.get("occurred_at")),
        source_channel=operation.source_channel,
        device_uid=device_uid,
        client_ref=operation.idempotency_key,
        note=operation.payload.get("note"),
        offline_captured_at=_parse_dt(operation.captured_offline_at),
    )
    return {"server_id": log.id, "detail": "Gate movement recorded.", "data": {"direction": log.direction}}


_HANDLERS = {
    SyncOperationType.CASE_CREATE.value: _handle_case_create,
    SyncOperationType.CASE_COMMENT.value: _handle_case_comment,
    SyncOperationType.CASE_STATUS.value: _handle_case_status,
    SyncOperationType.CASE_VERIFY.value: _handle_case_verify,
    SyncOperationType.NOTICE_READ.value: _handle_notice_read,
    SyncOperationType.NOTICE_ACTION.value: _handle_notice_action,
    SyncOperationType.NOTIFICATION_READ.value: _handle_notification_read,
    SyncOperationType.GATE_LOG.value: _handle_gate_log,
}


def _require_case(db: Session, case_id, user: User) -> Case:
    if not case_id:
        raise ValidationError("case_id is required for this operation.")
    case = db.get(Case, int(case_id))
    if case is None or case.campus_id != user.campus_id:
        raise NotFoundError("Case not found.")
    return case


def _status_conflicts(case: Case, client_base: dict) -> dict:
    """Conflict detection: the client must act on the state it last saw."""
    if not client_base:
        return {}
    expected = client_base.get("status")
    if expected and expected != case.status:
        return {
            "status": {"expected": expected, "actual": case.status, "case_number": case.case_number}
        }
    expected_version = client_base.get("updated_at")
    if expected_version:
        expected_dt = _parse_dt(expected_version)
        actual_dt = clock.ensure_aware(case.updated_at)
        if expected_dt and actual_dt and actual_dt > expected_dt:
            return {"updated_at": {"expected": expected_version, "actual": actual_dt.isoformat()}}
    return {}


def _assert_base_status(case: Case, client_base: dict) -> None:
    conflicts = _status_conflicts(case, client_base)
    if conflicts.get("status"):
        # Comments are allowed on stale snapshots (append-only, no state change),
        # but a closed case should not attract new field notes from a queued draft.
        if case.status in {"CLOSED", "CANCELLED"}:
            raise ConflictError(
                f"{case.case_number} is {case.status}; this queued comment was not applied."
            )


def pending_operations(db: Session, *, user: User, limit: int = 50) -> list[dict]:
    rows = db.scalars(
        select(SyncOperation)
        .where(SyncOperation.user_id == user.id)
        .order_by(SyncOperation.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "idempotency_key": row.idempotency_key,
            "operation": row.operation,
            "status": row.status,
            "attempts": row.attempts,
            "entity_id": row.entity_id,
            "last_error": row.last_error,
            "created_at": row.created_at,
            "synced_at": row.synced_at,
        }
        for row in rows
    ]
