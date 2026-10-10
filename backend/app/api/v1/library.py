"""Library endpoints: the catalogue, issuing, and returning.

Availability is a stored count, so issuing holds the book row before it decrements
it. That turns a stampede for the last copy into an orderly queue: whoever gets
the lock second sees ``copies_available == 0`` and is told the book is out,
rather than both being told they succeeded.
"""

from datetime import date as date_type
from datetime import timedelta

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import ValidationError
from app.core.permissions import LIBRARY_MANAGE, LIBRARY_READ
from app.models import Book, BookLoan, Student
from app.models.enums import BookLoanState
from app.services.scoping import linked_student

router = APIRouter(tags=["library"])

DEFAULT_LOAN_DAYS = 14


class BookIn(BaseModel):
    isbn: str = Field(min_length=1, max_length=24)
    title: str = Field(min_length=1, max_length=200)
    author: str | None = Field(default=None, max_length=160)
    category: str | None = Field(default=None, max_length=60)
    shelf: str | None = Field(default=None, max_length=40)
    copies_total: int = Field(default=1, ge=1, le=1000)


class IssueIn(BaseModel):
    book_id: int
    student_id: int | None = None
    days: int = Field(default=DEFAULT_LOAN_DAYS, ge=1, le=180)


def _book_brief(book: Book) -> dict:
    return {
        "id": book.id,
        "isbn": book.isbn,
        "title": book.title,
        "author": book.author,
        "category": book.category,
        "shelf": book.shelf,
        "copies_total": book.copies_total,
        "copies_available": book.copies_available,
        "is_active": book.is_active,
    }


def _loan_brief(loan: BookLoan, today: date_type | None = None) -> dict:
    today = today or date_type.today()
    overdue = loan.overdue_days(today)
    return {
        "id": loan.id,
        "issued_on": loan.issued_on.isoformat(),
        "due_on": loan.due_on.isoformat(),
        "returned_on": loan.returned_on.isoformat() if loan.returned_on else None,
        "state": loan.state,
        "overdue_days": overdue,
        "fine": loan.outstanding_fine(today),
        "book": _book_brief(loan.book) if loan.book else None,
        "student": {
            "id": loan.student.id,
            "full_name": loan.student.full_name,
            "roll_number": loan.student.roll_number,
        }
        if loan.student
        else None,
    }


@router.get("/library/books")
def list_books(
    db: DbSession,
    user: CurrentUser,
    q: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=100, le=300),
):
    """The catalogue. Available copies are shown, not just the title."""
    assert_permission(user, LIBRARY_READ)
    stmt = select(Book).where(Book.campus_id == user.campus_id, Book.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Book.title.ilike(like), Book.author.ilike(like), Book.isbn.ilike(like)))
    if category:
        stmt = stmt.where(Book.category == category)
    rows = list(db.scalars(stmt.order_by(Book.title).limit(limit)).all())
    return {"books": [_book_brief(b) for b in rows], "count": len(rows)}


@router.post("/library/books", status_code=201)
def add_book(payload: BookIn, db: DbSession, user: CurrentUser):
    """Add a title to the catalogue. Adding an existing ISBN raises its stock."""
    assert_permission(user, LIBRARY_MANAGE)
    existing = db.scalar(
        select(Book).where(Book.campus_id == user.campus_id, Book.isbn == payload.isbn)
    )
    if existing is not None:
        added = payload.copies_total
        existing.copies_total += added
        existing.copies_available += added
        db.flush()
        return {"book": _book_brief(existing), "restocked": added}

    book = Book(
        campus_id=user.campus_id,
        isbn=payload.isbn,
        title=payload.title,
        author=payload.author,
        category=payload.category,
        shelf=payload.shelf,
        copies_total=payload.copies_total,
        copies_available=payload.copies_total,
    )
    db.add(book)
    db.flush()
    return {"book": _book_brief(book), "restocked": 0}


@router.get("/library/loans/me")
def my_loans(db: DbSession, user: CurrentUser):
    """Loans held by the signed-in student."""
    assert_permission(user, LIBRARY_READ)
    student = linked_student(db, user)
    if student is None:
        return {"student": None, "loans": [], "outstanding_fine": 0}
    rows = list(
        db.scalars(
            select(BookLoan)
            .where(BookLoan.student_id == student.id)
            .order_by(BookLoan.returned_on.is_(None).desc(), BookLoan.due_on)
        ).all()
    )
    today = date_type.today()
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "loans": [_loan_brief(r, today) for r in rows],
        "outstanding_fine": sum(r.outstanding_fine(today) for r in rows),
    }


@router.get("/library/loans")
def list_loans(
    db: DbSession,
    user: CurrentUser,
    active_only: bool = True,
    limit: int = Query(default=200, le=500),
):
    """The circulation desk: who holds what, and what is overdue."""
    assert_permission(user, LIBRARY_MANAGE)
    stmt = select(BookLoan).where(BookLoan.campus_id == user.campus_id)
    if active_only:
        stmt = stmt.where(BookLoan.state == BookLoanState.ISSUED.value)
    rows = list(db.scalars(stmt.order_by(BookLoan.due_on).limit(limit)).all())
    today = date_type.today()
    briefs = [_loan_brief(r, today) for r in rows]
    return {
        "loans": briefs,
        "count": len(briefs),
        "overdue": sum(1 for b in briefs if b["overdue_days"] > 0),
    }


@router.post("/library/loans", status_code=201)
def issue_book(payload: IssueIn, db: DbSession, user: CurrentUser):
    """Issue a copy. Refuses when no copy is free, or the student already holds one."""
    assert_permission(user, LIBRARY_MANAGE)
    # Lock the book row so two concurrent issues cannot both take the last copy.
    book = db.scalar(select(Book).where(Book.id == payload.book_id).with_for_update())
    if book is None or book.campus_id != user.campus_id:
        raise ValidationError("Unknown book.")
    if book.copies_available <= 0:
        raise ValidationError("No copy of this title is available right now.")

    if payload.student_id is not None:
        student = db.get(Student, payload.student_id)
        if student is None or student.campus_id != user.campus_id:
            raise ValidationError("Unknown student.")
    else:
        student = linked_student(db, user)
        if student is None:
            raise ValidationError("student_id is required.")

    already = db.scalar(
        select(BookLoan).where(
            BookLoan.book_id == book.id,
            BookLoan.student_id == student.id,
            BookLoan.state == BookLoanState.ISSUED.value,
        )
    )
    if already is not None:
        raise ValidationError("This student already holds a copy of this title.")

    today = date_type.today()
    loan = BookLoan(
        campus_id=user.campus_id,
        book_id=book.id,
        student_id=student.id,
        issued_on=today,
        due_on=today + timedelta(days=payload.days),
        state=BookLoanState.ISSUED.value,
        issued_by_user_id=user.id,
    )
    db.add(loan)
    book.copies_available -= 1
    db.flush()
    return {"loan": _loan_brief(loan, today), "book": _book_brief(book)}


@router.post("/library/loans/{loan_id}/return")
def return_book(loan_id: int, db: DbSession, user: CurrentUser):
    """Return a copy. A late return reports the fine it accrued."""
    assert_permission(user, LIBRARY_MANAGE)
    loan = db.get(BookLoan, loan_id)
    if loan is None or loan.campus_id != user.campus_id:
        raise ValidationError("Unknown loan.")
    if loan.state == BookLoanState.RETURNED.value:
        raise ValidationError("This copy has already been returned.")

    today = date_type.today()
    fine = loan.outstanding_fine(today)
    loan.returned_on = today
    loan.state = BookLoanState.RETURNED.value
    book = db.get(Book, loan.book_id)
    if book is not None:
        book.copies_available = min(book.copies_total, book.copies_available + 1)
    db.flush()
    return {"loan": _loan_brief(loan, today), "fine_charged": fine}


__all__ = ["router"]
