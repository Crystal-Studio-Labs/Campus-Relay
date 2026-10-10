"""Clearance: a student's no-dues / transfer / graduation request.

Kept as its own table rather than a case: clearance is a standing record a
student needs a *state* for (pending, approved, rejected), not a piece of work
that is routed and assigned. The decision is recorded with the person who made
it, so a cleared student can always point at who cleared them.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import ClearanceKind, ClearanceState


class ClearanceRequest(Base, SurrogateIdMixin, TimestampMixin):
    """One clearance request raised by (or for) a student."""

    __tablename__ = "clearance_requests"
    __table_args__ = (
        Index("ix_clearance_student", "student_id"),
        Index("ix_clearance_state", "state"),
        enum_check("kind", ClearanceKind, "ck_clearance_requests_kind"),
        enum_check("state", ClearanceState, "ck_clearance_requests_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=ClearanceKind.NO_DUES.value)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=ClearanceState.PENDING.value)
    purpose: Mapped[str | None] = mapped_column(String(200))
    remarks: Mapped[str | None] = mapped_column(String(500))
    # Who raised it - the student themselves, or the helpdesk on their behalf.
    requested_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))

    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821
