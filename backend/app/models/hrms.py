"""HRMS: staff leave and payroll.

An "employee" here is a login account that holds a staff role (a teacher or an
administrator). Keying leave and payslips to ``user_id`` rather than to a Staff
row means every employee with an account has a payslip and a leave balance
without a second profile to keep in step - and the demo teacher, who has no
separate technician profile, sees exactly what a real faculty member would.

Net pay is derived (basic + allowances - deductions), never stored, so a
corrected deduction can never leave a stale total behind.
"""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import LeaveKind, LeaveState, PayslipState


class StaffLeave(Base, SurrogateIdMixin, TimestampMixin):
    """A staff member's application for leave."""

    __tablename__ = "staff_leave"
    __table_args__ = (
        Index("ix_staff_leave_user", "user_id"),
        Index("ix_staff_leave_window", "from_date", "to_date"),
        enum_check("kind", LeaveKind, "ck_staff_leave_kind"),
        enum_check("state", LeaveState, "ck_staff_leave_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=LeaveKind.CASUAL.value)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=LeaveState.PENDING.value)
    from_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    to_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    decided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))


class Payslip(Base, SurrogateIdMixin, TimestampMixin):
    """One month's pay for one employee."""

    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("user_id", "period", name="uq_payslip_user_period"),
        Index("ix_payslips_period", "period"),
        enum_check("state", PayslipState, "ck_payslips_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Pay period as YYYY-MM, so it sorts and filters as text without a date parse.
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    basic: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allowances: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deductions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    state: Mapped[str] = mapped_column(String(8), nullable=False, default=PayslipState.DRAFT.value)
    paid_on: Mapped[date_type | None] = mapped_column(Date)
    reference: Mapped[str | None] = mapped_column(String(64))

    @property
    def net_pay(self) -> int:
        return self.basic + self.allowances - self.deductions
