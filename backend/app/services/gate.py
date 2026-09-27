"""Gate operations.

Policy: only a valid, approved gate pass may be used. Security staff cannot
override that by accident - an expired or revoked pass is refused with a reason
the guard can read out loud.

Gate devices are frequently offline, so every movement carries a client
reference and is replay-safe.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, PolicyViolationError, ValidationError
from app.models import Case, GateLog, GatePass, Student, User
from app.models.enums import (
    AuditEventType,
    CaseStatus,
    GateDirection,
    GatePassState,
    NotificationCategory,
    Priority,
    SourceChannel,
    VerificationState,
)
from app.services import audit, case_engine, clock, notifications


def _pass_by_code(db: Session, *, campus_id: int, pass_code: str) -> GatePass | None:
    normalised = (pass_code or "").strip().upper().replace("CR-PASS:", "")
    if not normalised:
        return None
    return db.scalar(
        select(GatePass).where(GatePass.campus_id == campus_id, GatePass.pass_code == normalised)
    )


def record_movement(
    db: Session,
    *,
    actor: User,
    direction: str,
    pass_code: str | None = None,
    student_id: int | None = None,
    gate_location_id: int | None = None,
    occurred_at: datetime | None = None,
    source_channel: str = SourceChannel.PWA.value,
    device_uid: str | None = None,
    client_ref: str | None = None,
    note: str | None = None,
    offline_captured_at: datetime | None = None,
) -> GateLog:
    if direction not in {d.value for d in GateDirection}:
        raise ValidationError("Direction must be ENTRY or EXIT.")

    if client_ref:
        existing = db.scalar(select(GateLog).where(GateLog.client_ref == client_ref))
        if existing is not None:
            return existing

    gate_pass: GatePass | None = None
    if pass_code:
        gate_pass = _pass_by_code(db, campus_id=actor.campus_id, pass_code=pass_code)
        if gate_pass is None:
            raise PolicyViolationError(
                "That pass code is not valid on this campus.",
                details={"reason": "PASS_NOT_FOUND"},
            )

    if gate_pass is None and student_id is None:
        raise ValidationError("Provide a pass code or a student id.")

    if gate_pass is not None:
        student_id = gate_pass.student_id

    student = db.get(Student, student_id) if student_id else None
    if student is None or student.campus_id != actor.campus_id:
        raise NotFoundError("Student record not found on this campus.")

    now = clock.now()
    event_time = clock.ensure_aware(occurred_at) or now

    # --- Policy enforcement: only valid approved passes may be accepted ---
    if direction == GateDirection.EXIT.value:
        if gate_pass is None:
            raise PolicyViolationError(
                "An exit requires an approved gate pass.",
                details={"reason": "PASS_REQUIRED"},
            )
        if gate_pass.state == GatePassState.REVOKED.value:
            raise PolicyViolationError("This pass has been revoked.", details={"reason": "PASS_REVOKED"})
        # One exit and one return per pass: re-scanning must not open the gate again.
        if gate_pass.state == GatePassState.PARTIALLY_USED.value:
            raise PolicyViolationError(
                "This pass has already been used for an exit.",
                details={"reason": "PASS_ALREADY_EXITED", "state": gate_pass.state},
            )
        if gate_pass.state == GatePassState.USED.value:
            raise PolicyViolationError(
                "This pass has already been used for a full exit and return.",
                details={"reason": "PASS_ALREADY_USED"},
            )
        if event_time < clock.ensure_aware(gate_pass.valid_from):
            raise PolicyViolationError(
                f"This pass is not valid until {gate_pass.valid_from.isoformat()}.",
                details={"reason": "PASS_NOT_YET_VALID"},
            )
        if event_time > clock.ensure_aware(gate_pass.valid_to):
            gate_pass.state = GatePassState.EXPIRED.value
            raise PolicyViolationError("This pass has expired.", details={"reason": "PASS_EXPIRED"})
        case = db.get(Case, gate_pass.case_id)
        if case is not None and case.status == CaseStatus.CANCELLED.value:
            raise PolicyViolationError(
                "The underlying leave request was cancelled.",
                details={"reason": "UNDERLYING_CASE_CANCELLED"},
            )
    else:
        # ENTRY: a returning student may have no pass (walk-in), which is allowed,
        # but we always record what was actually presented.
        if gate_pass is not None and gate_pass.state in {
            GatePassState.USED.value,
            GatePassState.REVOKED.value,
        }:
            raise PolicyViolationError(
                "That pass has already been used for a return.",
                details={"reason": "PASS_ALREADY_RETURNED", "state": gate_pass.state},
            )
        if gate_pass is not None and event_time > clock.ensure_aware(gate_pass.valid_to):
            raise PolicyViolationError(
                "That pass window has closed; log a walk-in entry instead.",
                details={"reason": "PASS_WINDOW_CLOSED"},
            )

    log = GateLog(
        campus_id=actor.campus_id,
        gate_pass_id=gate_pass.id if gate_pass else None,
        student_id=student.id,
        case_id=gate_pass.case_id if gate_pass else None,
        direction=direction,
        occurred_at=event_time,
        gate_location_id=gate_location_id,
        logged_by_id=actor.id,
        device_id=device_uid,
        source_channel=source_channel,
        offline_captured_at=offline_captured_at,
        client_ref=client_ref,
        note=note,
        payload={
            "pass_code": gate_pass.pass_code if gate_pass else None,
            "logged_offline": offline_captured_at is not None,
        },
    )
    db.add(log)

    if direction == GateDirection.EXIT.value:
        _transition_pass(db, gate_pass, GatePassState.PARTIALLY_USED.value)
        audit.record_audit(
            db,
            event_type=AuditEventType.GATE_EXIT.value,
            campus_id=actor.campus_id,
            actor=actor,
            case_id=gate_pass.case_id,
            entity_type="GATE_PASS",
            entity_id=gate_pass.id,
            source_channel=source_channel,
            device_uid=device_uid,
            idempotency_key=f"gate:{client_ref}" if client_ref else None,
            payload={
                "pass_code": gate_pass.pass_code,
                "student_id": student.id,
                "occurred_at": event_time.isoformat(),
                "offline_captured_at": offline_captured_at.isoformat() if offline_captured_at else None,
            },
        )
    # ENTRY audit is written in the block below; EXIT was audited above.
    if direction == GateDirection.ENTRY.value:
        if gate_pass is not None:
            _transition_pass(db, gate_pass, GatePassState.USED.value)
        audit.record_audit(
            db,
            event_type=AuditEventType.GATE_ENTRY.value,
            campus_id=actor.campus_id,
            actor=actor,
            case_id=log.case_id,
            entity_type="GATE_PASS",
            entity_id=gate_pass.id if gate_pass else None,
            source_channel=source_channel,
            device_uid=device_uid,
            idempotency_key=f"gate:{client_ref}" if client_ref else None,
            payload={
                "student_id": student.id,
                "occurred_at": event_time.isoformat(),
                "pass_code": gate_pass.pass_code if gate_pass else None,
            },
        )

    # The leave/gate workflow completes when the student is back on campus.
    if direction == GateDirection.ENTRY.value and gate_pass is not None:
        case = db.get(Case, gate_pass.case_id)
        if case is not None and case.status not in {CaseStatus.CLOSED.value, CaseStatus.CANCELLED.value}:
            _close_gate_case(db, case=case, actor=actor)

    notifications.create_notification(
        db,
        user=student_user(db, student),
        category=NotificationCategory.GATE_PASS.value,
        title=f"Gate {direction.lower()} recorded",
        body=f"{event_time.strftime('%d %b %Y, %H:%M')}"
        + (f" - pass {gate_pass.pass_code}" if gate_pass else ""),
        action_label="View pass",
        action_type="OPEN_GATE_PASS",
        action_target=f"/cases/{gate_pass.case_id}" if gate_pass else "/cases",
        case_id=gate_pass.case_id if gate_pass else None,
        dedupe_key=f"gate-{direction.lower()}:{client_ref or event_time.isoformat()}",
    )
    return log


def student_user(db: Session, student: Student) -> User:
    if student.user_id is None:
        # Students without a device still need a record; fall back to the warden
        # so the notification is not silently dropped into nowhere.
        from app.models import Hostel

        if student.hostel_id:
            hostel = db.get(Hostel, student.hostel_id)
            if hostel and hostel.warden_user_id:
                warden = db.get(User, hostel.warden_user_id)
                if warden is not None:
                    return warden
        raise ConflictError(
            "This student has no app account, so the notification cannot be delivered.",
            details={"student_id": student.id, "requires_action": "Link a user account to the student record."},
        )
    user = db.get(User, student.user_id)
    if user is None:
        raise ConflictError("The student's linked account no longer exists.")
    return user


def _transition_pass(db: Session, gate_pass: GatePass, state: str) -> None:
    if gate_pass.state == GatePassState.USED.value and state == GatePassState.USED.value:
        return
    gate_pass.state = state
    if state in {GatePassState.EXPIRED.value, GatePassState.REVOKED.value}:
        gate_pass.revoked_at = gate_pass.revoked_at or clock.now()


def _close_gate_case(db: Session, *, case: Case, actor: User) -> None:
    """A returned student closes the leave case, with the audit trail intact."""
    if case.status == CaseStatus.WAITING_FOR_APPROVAL.value:
        return
    if case.status not in {
        CaseStatus.RESOLVED.value,
        CaseStatus.VERIFICATION_REQUIRED.value,
        CaseStatus.IN_PROGRESS.value,
        CaseStatus.ASSIGNED.value,
        CaseStatus.ESCALATED.value,
    }:
        return

    if case.status != CaseStatus.RESOLVED.value:
        try:
            case_engine.resolve_case(
                db, case=case, actor=actor, note="Student returned to campus; gate entry recorded."
            )
        except ConflictError:
            return

    case.verification_state = VerificationState.VERIFIED.value
    try:
        case_engine.verify_resolution(
            db,
            case=case,
            actor=actor,
            accepted=True,
            note="Auto-closed on verified re-entry.",
        )
    except ConflictError:
        # Already closed by someone else - that is fine, don't fake a change.
        return
    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type="GATE_RETURN_VERIFIED",
        actor=actor,
        actor_role="SECURITY",
        to_status=case.status,
        payload={"note": "Gate entry recorded by security"},
    )


def revoke_pass(db: Session, *, gate_pass: GatePass, actor: User, reason: str) -> GatePass:
    if gate_pass.state == GatePassState.USED.value:
        raise ConflictError("A fully used pass cannot be revoked.")
    gate_pass.state = GatePassState.REVOKED.value
    gate_pass.revoked_at = clock.now()
    gate_pass.revoke_reason = reason
    audit.record_audit(
        db,
        event_type="GATE_PASS_REVOKED",
        campus_id=gate_pass.campus_id,
        actor=actor,
        entity_type="GATE_PASS",
        entity_id=gate_pass.id,
        case_id=gate_pass.case_id,
        payload={"reason": reason, "pass_code": gate_pass.pass_code},
    )
    return gate_pass


def active_passes(db: Session, *, campus_id: int, limit: int = 100) -> list[dict]:
    now = clock.now()
    rows = db.scalars(
        select(GatePass)
        .where(
            GatePass.campus_id == campus_id,
            GatePass.state.in_((GatePassState.ISSUED.value, GatePassState.PARTIALLY_USED.value)),
        )
        .order_by(GatePass.valid_to.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": gp.id,
            "pass_code": gp.pass_code,
            "student_name": gp.student.full_name if gp.student else None,
            "roll_number": gp.student.roll_number if gp.student else None,
            "hostel": gp.student.hostel.name if gp.student and gp.student.hostel else None,
            "room": gp.student.room.number if gp.student and gp.student.room else None,
            "valid_from": gp.valid_from,
            "valid_to": gp.valid_to,
            "state": gp.state,
            "destination": gp.destination,
            "is_currently_valid": clock.ensure_aware(gp.valid_from) <= now <= clock.ensure_aware(gp.valid_to),
            "case_id": gp.case_id,
        }
        for gp in rows
    ]


def recent_logs(db: Session, *, campus_id: int, limit: int = 100) -> list[dict]:
    rows = db.scalars(
        select(GateLog)
        .where(GateLog.campus_id == campus_id)
        .order_by(GateLog.occurred_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": log.id,
            "direction": log.direction,
            "occurred_at": log.occurred_at,
            "student_name": db.get(Student, log.student_id).full_name if log.student_id else None,
            "roll_number": db.get(Student, log.student_id).roll_number if log.student_id else None,
            "pass_code": (log.payload or {}).get("pass_code"),
            "logged_by": db.get(User, log.logged_by_id).full_name if log.logged_by_id else None,
            "offline_captured_at": log.offline_captured_at,
            "source_channel": log.source_channel,
        }
        for log in rows
    ]
