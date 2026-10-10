"""Fee endpoints: what a student owes, and recording payments.

A student reads their own records; only an administrator creates records or
records payments.
"""

from datetime import date as date_type

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import ValidationError
from app.core.permissions import FEES_MANAGE, FEES_READ
from app.models import FeeRecord, Payment, Student

router = APIRouter(tags=["fees"])


class FeeRecordRequest(BaseModel):
    student_id: int | None = None
    term: str = Field(min_length=1, max_length=24)
    label: str = Field(min_length=1, max_length=80)
    amount: int = Field(gt=0)
    due_date: date_type | None = None


class PaymentRequest(BaseModel):
    amount: int = Field(gt=0)
    paid_on: date_type | None = None
    method: str = Field(default="CASH", max_length=24)
    reference: str | None = Field(default=None, max_length=64)


def _linked_student(db, user) -> Student | None:
    return db.scalar(select(Student).where(Student.user_id == user.id))


def _record_status(record: FeeRecord, today: date_type) -> str:
    """Derived, never stored: paid, partially paid, overdue, or pending."""
    paid = record.paid_amount
    if record.amount > 0 and paid >= record.amount:
        return "PAID"
    if paid > 0:
        return "PARTIALLY_PAID"
    if record.due_date and record.due_date < today:
        return "OVERDUE"
    return "PENDING"


def _record_brief(record: FeeRecord) -> dict:
    today = date_type.today()
    return {
        "id": record.id,
        "term": record.term,
        "label": record.label,
        "amount": record.amount,
        "paid": record.paid_amount,
        "balance": max(record.amount - record.paid_amount, 0),
        "due_date": record.due_date.isoformat() if record.due_date else None,
        "status": _record_status(record, today),
        "payments": [
            {
                "id": payment.id,
                "amount": payment.amount,
                "paid_on": payment.paid_on.isoformat(),
                "method": payment.method,
                "reference": payment.reference,
            }
            for payment in record.payments
        ],
    }


def _student_summary(records: list[FeeRecord]) -> dict:
    total = sum(r.amount for r in records)
    paid = sum(r.paid_amount for r in records)
    return {
        "total": total,
        "paid": paid,
        "pending": max(total - paid, 0),
        "percentage": round(paid * 100 / total, 1) if total else None,
    }


@router.get("/fees/me")
def my_fees(db: DbSession, user: CurrentUser):
    """Fee records for the signed-in student."""
    assert_permission(user, FEES_READ)
    student = _linked_student(db, user)
    if student is None:
        return {
            "student": None,
            "summary": {"total": 0, "paid": 0, "pending": 0, "percentage": None},
            "records": [],
        }
    records = list(
        db.scalars(
            select(FeeRecord).where(FeeRecord.student_id == student.id).order_by(FeeRecord.due_date)
        ).all()
    )
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "summary": _student_summary(records),
        "records": [_record_brief(r) for r in records],
    }


@router.get("/fees/outstanding")
def outstanding(db: DbSession, user: CurrentUser):
    """Every fee record with a balance, for the finance desk."""
    assert_permission(user, FEES_MANAGE)
    records = list(
        db.scalars(
            select(FeeRecord).where(FeeRecord.campus_id == user.campus_id).order_by(FeeRecord.due_date)
        ).all()
    )
    students = {
        s.id: s
        for s in db.scalars(
            select(Student).where(Student.id.in_({r.student_id for r in records} or {-1}))
        ).all()
    }
    rows = []
    for record in records:
        brief = _record_brief(record)
        if brief["balance"] <= 0:
            continue
        student = students.get(record.student_id)
        rows.append(
            {
                **brief,
                "student": {
                    "id": student.id,
                    "full_name": student.full_name,
                    "roll_number": student.roll_number,
                }
                if student
                else None,
            }
        )
    return {"records": rows, "count": len(rows)}


@router.post("/fees", status_code=201)
def create_fee_record(payload: FeeRecordRequest, db: DbSession, user: CurrentUser):
    """Create a fee a student owes. Defaults to the administrator's own student row if any."""
    assert_permission(user, FEES_MANAGE)
    student_id = payload.student_id
    if student_id is None:
        student = _linked_student(db, user)
        if student is None:
            raise ValidationError("student_id is required.")
        student_id = student.id
    student = db.get(Student, student_id)
    if student is None or student.campus_id != user.campus_id:
        raise ValidationError("Unknown student.")

    record = FeeRecord(
        campus_id=user.campus_id,
        student_id=student.id,
        term=payload.term,
        label=payload.label,
        amount=payload.amount,
        due_date=payload.due_date,
    )
    db.add(record)
    db.flush()
    return {"record": _record_brief(record)}


@router.post("/fees/{record_id}/payments", status_code=201)
def record_payment(record_id: int, payload: PaymentRequest, db: DbSession, user: CurrentUser):
    """Record a payment against a fee. Overpayment is refused rather than silently held."""
    assert_permission(user, FEES_MANAGE)
    record = db.get(FeeRecord, record_id)
    if record is None or record.campus_id != user.campus_id:
        raise ValidationError("Unknown fee record.")
    if record.paid_amount + payload.amount > record.amount:
        raise ValidationError("This payment is more than the outstanding balance.")

    payment = Payment(
        campus_id=user.campus_id,
        fee_record_id=record.id,
        amount=payload.amount,
        paid_on=payload.paid_on or date_type.today(),
        method=payload.method,
        reference=payload.reference,
        recorded_by_user_id=user.id,
    )
    db.add(payment)
    db.flush()
    db.refresh(record)
    return {"record": _record_brief(record)}
