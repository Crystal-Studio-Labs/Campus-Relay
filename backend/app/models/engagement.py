"""Engagement: feedback about the campus, and the activities students join.

Feedback carries an ``is_anonymous`` flag rather than hiding the author's id:
the row still records who wrote it, because an institution acting on a complaint
needs to be able to follow it up, but the id is never returned to anyone but the
author and the office that manages feedback.

An activity has a capacity, so registration is a small queue: register past
capacity and you are waitlisted rather than refused, which is what a student
actually wants to hear.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import (
    ActivityKind,
    ActivityState,
    FeedbackKind,
    FeedbackRequestState,
    FeedbackState,
    ParticipationState,
)


class FeedbackRequest(Base, SurrogateIdMixin, TimestampMixin):
    """The office asking a group of people for their feedback.

    Feedback is one-way by design (people tell the institution, the institution
    reads and answers), so the way an institution gets more of it is not a reply
    but a prompt: this names what the office wants to hear about and who is
    being asked. The prompt is data, not a notification, so it can be listed,
    answered and closed rather than scrolling away in an inbox.

    ``audience`` holds the role keys being asked, comma-separated, because a
    request is normally for one group (students about mess food, or faculty
    about a timetable change), and a join table would model a many-to-many that
    never exists.
    """

    __tablename__ = "feedback_requests"
    __table_args__ = (
        Index("ix_feedback_requests_state", "state"),
        enum_check("state", FeedbackRequestState, "ck_feedback_requests_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(40), nullable=False)
    due_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(
        String(16), nullable=False, default=FeedbackRequestState.OPEN.value
    )


class Feedback(Base, SurrogateIdMixin, TimestampMixin):
    """Feedback or a suggestion about the campus."""

    __tablename__ = "feedback"
    __table_args__ = (
        Index("ix_feedback_state", "state"),
        enum_check("kind", FeedbackKind, "ck_feedback_kind"),
        enum_check("state", FeedbackState, "ck_feedback_state"),
    )

    # Set when this row is an answer to a FeedbackRequest. Nullable, and
    # SET NULL rather than CASCADE: closing or deleting the prompt must never
    # delete the feedback someone took the trouble to write.
    request_id: Mapped[int | None] = mapped_column(
        ForeignKey("feedback_requests.id", ondelete="SET NULL"), index=True
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submitted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=FeedbackKind.OTHER.value)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # 1 (poor) to 5 (excellent). Required: a rating is what makes feedback
    # aggregatable, and a free-text-only channel cannot be summarised.
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=FeedbackState.OPEN.value)
    response: Mapped[str | None] = mapped_column(Text)
    responded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Activity(Base, SurrogateIdMixin, TimestampMixin):
    """A club, sport, cultural or technical activity students can join."""

    __tablename__ = "activities"
    __table_args__ = (
        Index("ix_activities_window", "starts_at", "ends_at"),
        enum_check("kind", ActivityKind, "ck_activities_kind"),
        enum_check("state", ActivityState, "ck_activities_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=ActivityKind.CLUB.value)
    state: Mapped[str] = mapped_column(String(12), nullable=False, default=ActivityState.OPEN.value)
    description: Mapped[str | None] = mapped_column(Text)
    venue: Mapped[str | None] = mapped_column(String(120))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Zero means "no cap" - a common case for an open club meeting.
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    registrations: Mapped[list["ActivityRegistration"]] = relationship(
        back_populates="activity", lazy="selectin", cascade="all, delete-orphan"
    )


class ActivityRegistration(Base, SurrogateIdMixin, TimestampMixin):
    """One student's place (or waitlist place) in one activity."""

    __tablename__ = "activity_registrations"
    __table_args__ = (
        UniqueConstraint("activity_id", "student_id", name="uq_registration_activity_student"),
        enum_check("state", ParticipationState, "ck_activity_registrations_state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(
        String(12), nullable=False, default=ParticipationState.REGISTERED.value
    )
    note: Mapped[str | None] = mapped_column(String(300))

    activity: Mapped[Activity] = relationship(back_populates="registrations", lazy="joined")
    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821
