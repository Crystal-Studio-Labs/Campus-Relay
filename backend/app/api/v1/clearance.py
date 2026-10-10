"""Clearance endpoints: raising a no-dues request, and deciding one.

A student sees their own requests; faculty and administrators decide them.
Every decide call verifies the request belongs to
the caller's campus, so a guessed id from another tenant resolves to nothing.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import ValidationError
from app.core.permissions import CLEARANCE_DECIDE, CLEARANCE_READ, CLEARANCE_REQUEST
from app.models import ClearanceRequest, Student
from app.models.enums import ClearanceKind, ClearanceState
from app.services import clock
from app.services.scoping import linked_student

router = APIRouter(tags=["clearance"])


class ClearanceRequestIn(BaseModel):
    kind: str = Field(default=ClearanceKind.NO_DUES.value, max_length=24)
    purpose: str | None = Field(default=None, max_length=200)
    remarks: str | None = Field(default=None, max_length=500)
    student_id: int | None = None


class DecisionIn(BaseModel):
    state: str = Field(pattern="^(APPROVED|REJECTED)$")
    note: str | None = Field(default=None, max_length=500)


def _brief(row: ClearanceRequest, student: Student | None = None) -> dict:
    student = student or getattr(row, "student", None)
    return {
        "id": row.id,
        "kind": row.kind,
        "state": row.state,
        "purpose": row.purpose,
        "remarks": row.remarks,
        "requested_at": row.created_at.isoformat() if row.created_at else None,
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


def _resolve_student(db, user, student_id: int | None) -> Student:
    """The student a request is about: an explicit id, or the linked student."""
    if student_id is not None:
        student = db.get(Student, student_id)
        if student is None or student.campus_id != user.campus_id:
            raise ValidationError("Unknown student.")
        return student
    student = linked_student(db, user)
    if student is None:
        raise ValidationError("student_id is required.")
    return student


@router.get("/clearance/me")
def my_clearance(db: DbSession, user: CurrentUser):
    """Clearance requests for the signed-in student."""
    assert_permission(user, CLEARANCE_READ)
    student = linked_student(db, user)
    if student is None:
        return {"student": None, "requests": [], "summary": {"open": 0, "approved": 0, "rejected": 0}}
    rows = list(
        db.scalars(
            select(ClearanceRequest)
            .where(ClearanceRequest.student_id == student.id)
            .order_by(ClearanceRequest.id.desc())
        ).all()
    )
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "requests": [_brief(r, student) for r in rows],
        "summary": {
            "open": sum(1 for r in rows if r.state == ClearanceState.PENDING.value),
            "approved": sum(1 for r in rows if r.state == ClearanceState.APPROVED.value),
            "rejected": sum(1 for r in rows if r.state == ClearanceState.REJECTED.value),
        },
    }


@router.post("/clearance", status_code=201)
def raise_clearance(payload: ClearanceRequestIn, db: DbSession, user: CurrentUser):
    """Raise a clearance request for a student (or on a ward's behalf)."""
    assert_permission(user, CLEARANCE_REQUEST)
    student = _resolve_student(db, user, payload.student_id)
    row = ClearanceRequest(
        campus_id=user.campus_id,
        student_id=student.id,
        kind=payload.kind,
        purpose=payload.purpose,
        remarks=payload.remarks,
        requested_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    return {"request": _brief(row, student)}


@router.get("/clearance")
def list_clearance(
    db: DbSession,
    user: CurrentUser,
    state: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=100, le=300),
):
    """Every clearance request on the campus, for the office that decides them."""
    assert_permission(user, CLEARANCE_DECIDE)
    stmt = select(ClearanceRequest).where(ClearanceRequest.campus_id == user.campus_id)
    if state:
        stmt = stmt.where(ClearanceRequest.state == state)
    rows = list(
        db.scalars(stmt.order_by(ClearanceRequest.state.desc(), ClearanceRequest.id.desc()).limit(limit)).all()
    )
    students = {
        s.id: s
        for s in db.scalars(
            select(Student).where(Student.id.in_({r.student_id for r in rows} or {-1}))
        ).all()
    }
    return {
        "requests": [_brief(r, students.get(r.student_id)) for r in rows],
        "count": len(rows),
    }


@router.post("/clearance/{request_id}/decide")
def decide_clearance(request_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    """Approve or reject a clearance request. Re-deciding is refused."""
    assert_permission(user, CLEARANCE_DECIDE)
    row = db.get(ClearanceRequest, request_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown clearance request.")
    if row.state != ClearanceState.PENDING.value:
        raise ValidationError("This request has already been decided.")

    row.state = payload.state
    row.decision_note = payload.note
    row.decided_by_user_id = user.id
    row.decided_at = clock.now()
    db.flush()
    student = db.get(Student, row.student_id)
    return {"request": _brief(row, student)}


__all__ = ["router"]
