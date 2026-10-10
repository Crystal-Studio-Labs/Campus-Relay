"""Fees: what a student owes, and what they have paid.

Status is derived, never stored: a record is paid, partially paid, pending or
overdue based on its payments and due date. Storing it would let the two drift.
"""

from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin


class FeeRecord(Base, SurrogateIdMixin, TimestampMixin):
    """One fee a student owes for a term."""

    __tablename__ = "fee_records"
    __table_args__ = (
        UniqueConstraint("student_id", "term", "label", name="uq_fee_student_term_label"),
        Index("ix_fee_student", "student_id"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    term: Mapped[str] = mapped_column(String(24), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[date_type | None] = mapped_column(Date)

    payments: Mapped[list["Payment"]] = relationship(
        back_populates="record", lazy="selectin", cascade="all, delete-orphan"
    )

    @property
    def paid_amount(self) -> int:
        return sum(payment.amount for payment in self.payments)


class Payment(Base, SurrogateIdMixin, TimestampMixin):
    """A payment made against a fee record."""

    __tablename__ = "payments"
    __table_args__ = (Index("ix_payment_record", "fee_record_id"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fee_record_id: Mapped[int] = mapped_column(
        ForeignKey("fee_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paid_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(String(24), nullable=False, default="CASH")
    reference: Mapped[str | None] = mapped_column(String(64))
    recorded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    record: Mapped[FeeRecord] = relationship(back_populates="payments", lazy="joined")
