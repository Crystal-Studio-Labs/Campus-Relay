"""Career: placement postings and the applications students make to them.

A posting is published by the placement cell. An application is unique per
(student, posting) so a student cannot apply twice, and its state is the
pipeline stage - applied, shortlisted, interview, selected or rejected.
"""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import ApplicationState, JobKind, JobState


class JobPosting(Base, SurrogateIdMixin, TimestampMixin):
    """A placement or internship posting from the placement cell."""

    __tablename__ = "job_postings"
    __table_args__ = (
        Index("ix_jobs_deadline", "deadline"),
        enum_check("kind", JobKind, "ck_job_postings_kind"),
        enum_check("state", JobState, "ck_job_postings_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default=JobKind.FULL_TIME.value)
    state: Mapped[str] = mapped_column(String(12), nullable=False, default=JobState.OPEN.value)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(160))
    eligibility: Mapped[str | None] = mapped_column(String(300))
    # Lakhs per annum. Nullable because an internship posting often carries a
    # stipend instead of a package, and inventing a number would be worse.
    package_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    apply_url: Mapped[str | None] = mapped_column(String(400))
    deadline: Mapped[date_type | None] = mapped_column(Date)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    applications: Mapped[list["JobApplication"]] = relationship(
        back_populates="posting", lazy="selectin", cascade="all, delete-orphan"
    )


class JobApplication(Base, SurrogateIdMixin, TimestampMixin):
    """One student's application to one posting."""

    __tablename__ = "job_applications"
    __table_args__ = (
        UniqueConstraint("posting_id", "student_id", name="uq_application_posting_student"),
        enum_check("state", ApplicationState, "ck_job_applications_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    posting_id: Mapped[int] = mapped_column(
        ForeignKey("job_postings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=ApplicationState.APPLIED.value)
    resume_url: Mapped[str | None] = mapped_column(String(400))
    cover_note: Mapped[str | None] = mapped_column(Text)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(300))

    posting: Mapped[JobPosting] = relationship(back_populates="applications", lazy="joined")
    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821
