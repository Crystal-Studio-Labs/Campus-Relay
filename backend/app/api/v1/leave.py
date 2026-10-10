"""Leave endpoints: applying for absence, and deciding on it.

The register the warden reads. Dates are validated on the server - a leave
cannot end before it starts - because a date picker on a phone is not a
guarantee. A student may withdraw their own pending application; only a person
with ``leave:decide`` may approve or reject one.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.permissions import LEAVE_DECIDE, LEAVE_READ, LEAVE_REQUEST
from app.models import LeaveApplication, Student
from app.models.enums import LeaveKind, LeaveState, RoleKey
from app.services import clock
from app.services.scoping import linked_student

router = APIRouter(tags=["leave"])


class LeaveIn(BaseModel):
    kind: str = Field(default=LeaveKind.CASUAL.value, max_length=16)
    from_date: str = Field(pattern="^\\d{4}-\\d{2}-\\d{2}$")
    to_date: str = Field(pattern="^\\d{4}-\\d{2}-\\d{2}$")
    reason: str = Field(min_length=5, max_length=500)
    destination: str | None = Field(default=None, max_length=160)
    guardian_contact: str | None = Field(default=None, max_length=24)
    student_id: int | None = None


class DecisionIn(BaseModel):
    state: str = Field(pattern="^(APPROVED|REJECTED)$")
    note: str | None = Field(default=None, max_length=500)


def _brief(row: LeaveApplication, student: Student | None = None) -> dict:
    student = student or getattr(row, "student", None)
    return {
        "id": row.id,
        "kind": row.kind,
        "state": row.state,
        "from_date": row.from_date.isoformat(),
        "to_date": row.to_date.isoformat(),
        "reason": row.reason,
        "destination": row.destination,
        "guardian_contact": row.guardian_contact,
        "applied_at": row.created_at.isoformat() if row.created_at else None,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "decision_note": row.decision_note,
        "student": {
            "id": student.id,
            "full_name": student.full_name,
            "roll_number": student.roll_number,
        }
        if student
        else None,
    }


def _parse_dates(payload: LeaveIn):
    from datetime import date as date_type

    try:
        start = date_type.fromisoformat(payload.from_date)
        end = date_type.fromisoformat(payload.to_date)
    except ValueError:
        raise ValidationError("Dates must look like YYYY-MM-DD.") from None
    if end < start:
        raise ValidationError("The return date cannot be before the departure date.")
    if (end - start).days > 90:
        raise ValidationError("Leave longer than 90 days needs the Dean's approval at the office.")
    return start, end


def _resolve_student(db, user, student_id: int | None) -> Student:
    if student_id is not None:
        student = db.get(Student, student_id)
        if student is None or student.campus_id != user.campus_id:
            raise ValidationError("Unknown student.")
        return student
    student = linked_student(db, user)
    if student is None:
        raise ValidationError("student_id is required.")
    return student


@router.get("/leave/me")
def my_leave(db: DbSession, user: CurrentUser):
    """Leave applications for the signed-in student."""
    assert_permission(user, LEAVE_READ)
    student = linked_student(db, user)
    if student is None:
        return {"student": None, "applications": [], "summary": {"pending": 0, "approved": 0, "rejected": 0}}
    rows = list(
        db.scalars(
            select(LeaveApplication)
            .where(LeaveApplication.student_id == student.id)
            .order_by(LeaveApplication.from_date.desc())
        ).all()
    )
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "applications": [_brief(r, student) for r in rows],
        "summary": {
            "pending": sum(1 for r in rows if r.state == LeaveState.PENDING.value),
            "approved": sum(1 for r in rows if r.state == LeaveState.APPROVED.value),
            "rejected": sum(1 for r in rows if r.state == LeaveState.REJECTED.value),
        },
    }


@router.post("/leave", status_code=201)
def apply_for_leave(payload: LeaveIn, db: DbSession, user: CurrentUser):
    """Apply for leave for a student."""
    assert_permission(user, LEAVE_REQUEST)
    student = _resolve_student(db, user, payload.student_id)
    start, end = _parse_dates(payload)
    row = LeaveApplication(
        campus_id=user.campus_id,
        student_id=student.id,
        kind=payload.kind,
        from_date=start,
        to_date=end,
        reason=payload.reason,
        destination=payload.destination,
        guardian_contact=payload.guardian_contact,
        applied_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    return {"application": _brief(row, student)}


@router.get("/leave")
def list_leave(
    db: DbSession,
    user: CurrentUser,
    state: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=200, le=500),
):
    """The leave register across the campus, for whoever approves it."""
    assert_permission(user, LEAVE_DECIDE)
    stmt = select(LeaveApplication).where(LeaveApplication.campus_id == user.campus_id)
    if state:
        stmt = stmt.where(LeaveApplication.state == state)
    rows = list(
        db.scalars(
            stmt.order_by(LeaveApplication.state.desc(), LeaveApplication.from_date.desc()).limit(limit)
        ).all()
    )
    students = {
        s.id: s
        for s in db.scalars(
            select(Student).where(Student.id.in_({r.student_id for r in rows} or {-1}))
        ).all()
    }
    briefs = [_brief(r, students.get(r.student_id)) for r in rows]
    return {"applications": briefs, "count": len(briefs)}


@router.post("/leave/{application_id}/decide")
def decide_leave(application_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    """Approve or reject a leave application."""
    assert_permission(user, LEAVE_DECIDE)
    row = db.get(LeaveApplication, application_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown leave application.")
    if row.state != LeaveState.PENDING.value:
        raise ValidationError("This application has already been decided.")

    row.state = payload.state
    row.decision_note = payload.note
    row.decided_by_user_id = user.id
    row.decided_at = clock.now()
    db.flush()
    return {"application": _brief(row, db.get(Student, row.student_id))}


@router.post("/leave/{application_id}/cancel")
def cancel_leave(application_id: int, db: DbSession, user: CurrentUser):
    """Withdraw a pending application. Only its owner (or an admin) may."""
    assert_permission(user, LEAVE_READ)
    row = db.get(LeaveApplication, application_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown leave application.")
    if row.state != LeaveState.PENDING.value:
        raise ValidationError("Only a pending application can be withdrawn.")

    student = linked_student(db, user)
    is_owner = student is not None and student.id == row.student_id
    if not is_owner and user.role_key != RoleKey.MANAGEMENT.value:
        raise PermissionDeniedError("You can only withdraw your own leave application.")

    row.state = LeaveState.CANCELLED.value
    db.flush()
    return {"application": _brief(row, db.get(Student, row.student_id))}


__all__ = ["router"]
