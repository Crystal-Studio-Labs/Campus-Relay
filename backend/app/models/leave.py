"""Leave: a student's application for absence.

A first-class record, separate from the LEAVE_REQUEST *service* (which opens a
case and drives the gate-pass workflow). This table is the register a warden
reads in the morning: who is away, from when, and whether it was approved.
Every decision names the person who made it and when.
"""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import LeaveKind, LeaveState


class LeaveApplication(Base, SurrogateIdMixin, TimestampMixin):
    """One leave application for one student."""

    __tablename__ = "leave_applications"
    __table_args__ = (
        Index("ix_leave_student", "student_id"),
        Index("ix_leave_window", "from_date", "to_date"),
        enum_check("kind", LeaveKind, "ck_leave_applications_kind"),
        enum_check("state", LeaveState, "ck_leave_applications_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=LeaveKind.CASUAL.value)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=LeaveState.PENDING.value)
    from_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    to_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(160))
    guardian_contact: Mapped[str | None] = mapped_column(String(24))
    applied_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))

    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821
