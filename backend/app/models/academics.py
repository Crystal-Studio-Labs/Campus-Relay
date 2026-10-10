"""Academic records: subjects and attendance.

These are the first tables of the college-management domain. They hang off the
existing organisation structure (campus / branch / year / batch) instead of
replacing it, so a student's academic scope and their existing hostel/campus
scope resolve from the same rows.

Enrolment is implicit: a subject belongs to a (branch, year), and every student
in that branch and year takes it. That keeps the model small while still letting
attendance be marked per subject, per day, per slot.
"""

from datetime import date as date_type
from datetime import time as time_type

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import AttendanceStatus


class Subject(Base, SurrogateIdMixin, TimestampMixin):
    """A taught subject, e.g. ``CS301 Data Structures``."""

    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_subject_campus_code"),
        Index("ix_subjects_branch_year", "branch_id", "year_id"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[int | None] = mapped_column(
        ForeignKey("branches.id", ondelete="SET NULL"), index=True
    )
    year_id: Mapped[int | None] = mapped_column(
        ForeignKey("years.id", ondelete="SET NULL"), index=True
    )
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    semester: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # The teacher who owns the subject and may mark its attendance.
    faculty_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    branch: Mapped["Branch | None"] = relationship(lazy="joined")  # noqa: F821
    year: Mapped["AcademicYear | None"] = relationship(lazy="joined")  # noqa: F821


class AttendanceRecord(Base, SurrogateIdMixin, TimestampMixin):
    """One student's attendance for one subject on one day in one slot."""

    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint(
            "subject_id", "student_id", "on_date", "slot", name="uq_attendance_subject_student_day_slot"
        ),
        Index("ix_attendance_student_date", "student_id", "on_date"),
        enum_check("status", AttendanceStatus, "ck_attendance_records_status"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    on_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    slot: Mapped[str] = mapped_column(String(12), nullable=False, default="P1")
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    marked_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(String(240))

    subject: Mapped[Subject] = relationship(lazy="joined")


class Mark(Base, SurrogateIdMixin, TimestampMixin):
    """A student's score in one assessment of one subject."""

    __tablename__ = "marks"
    __table_args__ = (
        UniqueConstraint(
            "subject_id", "student_id", "assessment", "term", name="uq_mark_subject_student_assessment"
        ),
        Index("ix_marks_student", "student_id"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment: Mapped[str] = mapped_column(String(60), nullable=False)
    term: Mapped[str] = mapped_column(String(24), nullable=False, default="CURRENT")
    max_marks: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    obtained_marks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entered_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    subject: Mapped[Subject] = relationship(lazy="joined")


class TimetableSlot(Base, SurrogateIdMixin, TimestampMixin):
    """One weekly teaching period of a subject."""

    __tablename__ = "timetable_slots"
    __table_args__ = (
        UniqueConstraint("subject_id", "day", "start_time", name="uq_slot_subject_day_start"),
        Index("ix_slots_day_start", "day", "start_time"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Three-letter weekday, e.g. MON. Stored as text so a timetable is readable
    # in the database without a lookup table.
    day: Mapped[str] = mapped_column(String(3), nullable=False)
    start_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    end_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    room: Mapped[str | None] = mapped_column(String(48))

    subject: Mapped[Subject] = relationship(lazy="joined")
