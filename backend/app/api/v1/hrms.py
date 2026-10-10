"""HRMS endpoints: staff leave and payroll.

An employee is a login account that holds a staff role. Every employee sees
their own leave and their own payslips; the office sees all of them. Salary is
separated from leave by permission so a head of department can approve leave
without also being able to read the whole payroll.
"""

from datetime import date as date_type

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.permissions import HRMS_MANAGE, HRMS_READ, LEAVE_REQUEST, SALARY_MANAGE, SALARY_READ
from app.models import Payslip, StaffLeave, User
from app.models.enums import LeaveKind, LeaveState, PayslipState, RoleKey
from app.services import clock

router = APIRouter(tags=["hrms"])

STAFF_ROLES = (RoleKey.TEACHER.value, RoleKey.MANAGEMENT.value)


class StaffLeaveIn(BaseModel):
    kind: str = Field(default=LeaveKind.CASUAL.value, max_length=16)
    from_date: str = Field(pattern="^\\d{4}-\\d{2}-\\d{2}$")
    to_date: str = Field(pattern="^\\d{4}-\\d{2}-\\d{2}$")
    reason: str = Field(min_length=5, max_length=500)


class DecisionIn(BaseModel):
    state: str = Field(pattern="^(APPROVED|REJECTED)$")
    note: str | None = Field(default=None, max_length=500)


class PayslipIn(BaseModel):
    user_id: int | None = None
    period: str = Field(pattern="^\\d{4}-\\d{2}$")
    basic: int = Field(ge=0, le=100_000_000)
    allowances: int = Field(default=0, ge=0, le=100_000_000)
    deductions: int = Field(default=0, ge=0, le=100_000_000)
    reference: str | None = Field(default=None, max_length=64)


def _leave_brief(row: StaffLeave, employee: User | None = None) -> dict:
    employee = employee or getattr(row, "_employee", None)
    return {
        "id": row.id,
        "kind": row.kind,
        "state": row.state,
        "from_date": row.from_date.isoformat(),
        "to_date": row.to_date.isoformat(),
        "reason": row.reason,
        "applied_at": row.created_at.isoformat() if row.created_at else None,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "decision_note": row.decision_note,
        "employee": {"id": employee.id, "full_name": employee.full_name} if employee else None,
    }


def _payslip_brief(row: Payslip, employee: User | None = None) -> dict:
    return {
        "id": row.id,
        "period": row.period,
        "basic": row.basic,
        "allowances": row.allowances,
        "deductions": row.deductions,
        "net_pay": row.net_pay,
        "state": row.state,
        "paid_on": row.paid_on.isoformat() if row.paid_on else None,
        "reference": row.reference,
        "employee": {"id": employee.id, "full_name": employee.full_name} if employee else None,
    }


def _employees(db, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids))).all()}


def _parse_window(payload: StaffLeaveIn):
    try:
        start = date_type.fromisoformat(payload.from_date)
        end = date_type.fromisoformat(payload.to_date)
    except ValueError:
        raise ValidationError("Dates must look like YYYY-MM-DD.") from None
    if end < start:
        raise ValidationError("The return date cannot be before the departure date.")
    if (end - start).days > 90:
        raise ValidationError("Leave longer than 90 days needs a special approval.")
    return start, end


@router.get("/hrms/me")
def my_employment(db: DbSession, user: CurrentUser):
    """The signed-in employee's leave and payslips."""
    assert_permission(user, HRMS_READ)
    leave = list(
        db.scalars(
            select(StaffLeave).where(StaffLeave.user_id == user.id).order_by(StaffLeave.from_date.desc())
        ).all()
    )
    slips = list(
        db.scalars(
            select(Payslip).where(Payslip.user_id == user.id).order_by(Payslip.period.desc())
        ).all()
    )
    return {
        "employee": {"id": user.id, "full_name": user.full_name, "role": user.role_key},
        "leave": [_leave_brief(r, user) for r in leave],
        "payslips": [_payslip_brief(r, user) for r in slips],
        "summary": {
            "pending_leave": sum(1 for r in leave if r.state == LeaveState.PENDING.value),
            "approved_leave": sum(1 for r in leave if r.state == LeaveState.APPROVED.value),
            "payslips": len(slips),
            "last_net_pay": slips[0].net_pay if slips else None,
        },
    }


@router.post("/hrms/leave", status_code=201)
def apply_staff_leave(payload: StaffLeaveIn, db: DbSession, user: CurrentUser):
    """Apply for the signed-in employee's own leave."""
    assert_permission(user, LEAVE_REQUEST)
    start, end = _parse_window(payload)
    row = StaffLeave(
        campus_id=user.campus_id,
        user_id=user.id,
        kind=payload.kind,
        from_date=start,
        to_date=end,
        reason=payload.reason,
    )
    db.add(row)
    db.flush()
    return {"leave": _leave_brief(row, user)}


@router.get("/hrms/leave")
def list_staff_leave(
    db: DbSession,
    user: CurrentUser,
    state: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=200, le=500),
):
    """Every staff leave application on the campus."""
    assert_permission(user, HRMS_MANAGE)
    stmt = select(StaffLeave).where(StaffLeave.campus_id == user.campus_id)
    if state:
        stmt = stmt.where(StaffLeave.state == state)
    rows = list(
        db.scalars(stmt.order_by(StaffLeave.state.desc(), StaffLeave.from_date.desc()).limit(limit)).all()
    )
    employees = _employees(db, {r.user_id for r in rows})
    return {
        "leave": [_leave_brief(r, employees.get(r.user_id)) for r in rows],
        "count": len(rows),
    }


@router.post("/hrms/leave/{leave_id}/decide")
def decide_staff_leave(leave_id: int, payload: DecisionIn, db: DbSession, user: CurrentUser):
    """Approve or reject a staff leave application."""
    assert_permission(user, HRMS_MANAGE)
    row = db.get(StaffLeave, leave_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown leave application.")
    if row.state != LeaveState.PENDING.value:
        raise ValidationError("This application has already been decided.")
    if row.user_id == user.id:
        raise PermissionDeniedError("You cannot decide your own leave application.")

    row.state = payload.state
    row.decision_note = payload.note
    row.decided_by_user_id = user.id
    row.decided_at = clock.now()
    db.flush()
    return {"leave": _leave_brief(row, db.get(User, row.user_id))}


@router.get("/hrms/staff")
def staff_roster(db: DbSession, user: CurrentUser, limit: int = Query(default=200, le=500)):
    """The employee roster: every account that holds a staff role."""
    assert_permission(user, HRMS_MANAGE)
    rows = db.scalars(
        select(User).where(User.campus_id == user.campus_id, User.is_active.is_(True)).limit(limit)
    ).all()
    staff = [u for u in rows if u.role_key in STAFF_ROLES]
    return {
        "staff": [
            {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role_key}
            for u in staff
        ],
        "count": len(staff),
    }


@router.get("/hrms/payroll")
def payroll(
    db: DbSession,
    user: CurrentUser,
    period: str | None = Query(default=None, max_length=7),
    limit: int = Query(default=300, le=500),
):
    """Every payslip for a period, for the finance office."""
    assert_permission(user, SALARY_MANAGE)
    stmt = select(Payslip).where(Payslip.campus_id == user.campus_id)
    if period:
        stmt = stmt.where(Payslip.period == period)
    rows = list(db.scalars(stmt.order_by(Payslip.period.desc(), Payslip.id).limit(limit)).all())
    employees = _employees(db, {r.user_id for r in rows})
    briefs = [_payslip_brief(r, employees.get(r.user_id)) for r in rows]
    return {
        "payslips": briefs,
        "count": len(briefs),
        "total_net": sum(b["net_pay"] for b in briefs),
        "unpaid": sum(1 for b in briefs if b["state"] == PayslipState.DRAFT.value),
    }


@router.post("/hrms/payslips", status_code=201)
def create_payslip(payload: PayslipIn, db: DbSession, user: CurrentUser):
    """Generate one employee's payslip for a period. Duplicates are refused."""
    assert_permission(user, SALARY_MANAGE)
    employee_id = payload.user_id or user.id
    employee = db.get(User, employee_id)
    if employee is None or employee.campus_id != user.campus_id:
        raise ValidationError("Unknown employee.")
    if employee.role_key not in STAFF_ROLES:
        raise ValidationError("Payslips are only issued to staff accounts.")
    if payload.deductions > payload.basic + payload.allowances:
        raise ValidationError("Deductions cannot exceed gross pay.")

    existing = db.scalar(
        select(Payslip).where(Payslip.user_id == employee.id, Payslip.period == payload.period)
    )
    if existing is not None:
        raise ValidationError("A payslip already exists for that employee and period.")

    slip = Payslip(
        campus_id=user.campus_id,
        user_id=employee.id,
        period=payload.period,
        basic=payload.basic,
        allowances=payload.allowances,
        deductions=payload.deductions,
        reference=payload.reference,
    )
    db.add(slip)
    db.flush()
    return {"payslip": _payslip_brief(slip, employee)}


@router.post("/hrms/payslips/{payslip_id}/pay")
def settle_payslip(payslip_id: int, db: DbSession, user: CurrentUser):
    """Mark a payslip as paid and stamp the date."""
    assert_permission(user, SALARY_MANAGE)
    slip = db.get(Payslip, payslip_id)
    if slip is None or slip.campus_id != user.campus_id:
        raise ValidationError("Unknown payslip.")
    if slip.state == PayslipState.PAID.value:
        raise ValidationError("This payslip is already settled.")
    slip.state = PayslipState.PAID.value
    slip.paid_on = date_type.today()
    db.flush()
    return {"payslip": _payslip_brief(slip, db.get(User, slip.user_id))}


__all__ = ["router"]
