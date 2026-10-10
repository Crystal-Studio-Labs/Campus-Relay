"""Library: the catalogue and the loan ledger.

``copies_available`` is maintained on the book row rather than counted from the
loans on every read: a library shelf is read constantly and written rarely, so
the denormalised count is the right trade. The issue/return paths are the only
writers, and both recompute it from the ledger inside the same transaction, so
the two cannot drift.

Overdue fines are derived at read time from the due date and the daily rate,
never stored on an open loan: a fine is a function of *when* you look at it.
"""

from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import BookLoanState

# Charged per day a loan is past its due date. A college publishing a different
# rate edits this constant; a real deployment would read it from policy config.
DAILY_FINE = 5


class Book(Base, SurrogateIdMixin, TimestampMixin):
    """A title in the catalogue."""

    __tablename__ = "books"
    __table_args__ = (
        UniqueConstraint("campus_id", "isbn", name="uq_book_campus_isbn"),
        Index("ix_books_title", "title"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    isbn: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    author: Mapped[str | None] = mapped_column(String(160))
    category: Mapped[str | None] = mapped_column(String(60))
    shelf: Mapped[str | None] = mapped_column(String(40))
    copies_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    copies_available: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)


class BookLoan(Base, SurrogateIdMixin, TimestampMixin):
    """One copy of a book issued to one student."""

    __tablename__ = "book_loans"
    __table_args__ = (
        Index("ix_loans_student", "student_id"),
        Index("ix_loans_book", "book_id"),
        enum_check("state", BookLoanState, "ck_book_loans_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issued_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    due_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    returned_on: Mapped[date_type | None] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(12), nullable=False, default=BookLoanState.ISSUED.value)
    fine_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    issued_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(300))

    book: Mapped[Book] = relationship(lazy="joined")
    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821

    def overdue_days(self, today: date_type | None = None) -> int:
        """Days past due, or 0 while the loan is still within its window."""
        today = today or date_type.today()
        end = self.returned_on or today
        if end <= self.due_on:
            return 0
        return (end - self.due_on).days

    def outstanding_fine(self, today: date_type | None = None) -> int:
        """The fine still owed on this loan, never negative."""
        return max(self.overdue_days(today) * DAILY_FINE - self.fine_paid, 0)
