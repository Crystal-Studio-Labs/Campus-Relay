"""Engagement endpoints: feedback about the campus, and the activities it runs.

Two closely-related services in one module because both are about a student's
life outside the classroom, and both share the same audience: a student
submits, faculty and administrators read and act.

An anonymous feedback row still records its author, so the office can follow it
up; the author's identity is simply never serialised to another reader. A
feedback author can always read their own submission, anonymous or not.
"""

from datetime import datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.permissions import (
    ACTIVITY_MANAGE,
    ACTIVITY_PARTICIPATE,
    ACTIVITY_READ,
    FEEDBACK_MANAGE,
    FEEDBACK_READ,
    FEEDBACK_REQUEST,
    FEEDBACK_SUBMIT,
)
from app.models import Activity, ActivityRegistration, Feedback, FeedbackRequest, Role, Student, User
from app.models.enums import (
    ActivityState,
    FeedbackKind,
    FeedbackRequestState,
    FeedbackState,
    ParticipationState,
    RoleKey,
)
from app.services import clock
from app.services.scoping import linked_student

router = APIRouter(tags=["engagement"])


# --- Feedback --------------------------------------------------------------


# Feedback is asked for and given by the people the institution runs, never by
# the office itself - a management reply to its own request would be the campus
# rating itself. These are the roles a request may address.
ASKABLE_ROLES = (RoleKey.STUDENT.value, RoleKey.TEACHER.value)


def _audience_keys(raw: str) -> list[str]:
    return [key for key in raw.split(",") if key]


class FeedbackIn(BaseModel):
    kind: str = Field(default=FeedbackKind.OTHER.value, max_length=24)
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=5, max_length=4000)
    rating: int = Field(ge=1, le=5)
    is_anonymous: bool = False
    # Set when this submission answers a request from the office.
    request_id: int | None = None


class FeedbackRequestIn(BaseModel):
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=5, max_length=2000)
    audience: list[str] = Field(min_length=1)
    due_on: datetime | None = None


class ResponseIn(BaseModel):
    response: str = Field(min_length=1, max_length=4000)
    state: str = Field(default=FeedbackState.RESOLVED.value, pattern="^(OPEN|ACKNOWLEDGED|RESOLVED)$")


def _feedback_brief(row: Feedback, *, viewer_id: int | None, can_manage: bool) -> dict:
    """Serialise feedback, hiding the author from anyone but the office and the author.

    An anonymous submission must not be attributable by a reader, so the
    ``submitted_by_user_id`` is omitted unless the viewer manages feedback or is
    the author themselves.
    """
    reveal = can_manage or row.submitted_by_user_id == viewer_id
    return {
        "id": row.id,
        "kind": row.kind,
        "subject": row.subject,
        "message": row.message,
        "rating": row.rating,
        "is_anonymous": row.is_anonymous,
        "state": row.state,
        "response": row.response,
        "submitted_at": row.created_at.isoformat() if row.created_at else None,
        "responded_at": row.responded_at.isoformat() if row.responded_at else None,
        "request_id": row.request_id,
        "submitted_by_user_id": row.submitted_by_user_id if reveal else None,
    }


def _asked_count(db: DbSession, campus_id: int, keys: list[str]) -> int:
    """How many active accounts the request went out to."""
    if not keys:
        return 0
    return int(
        db.scalar(
            select(func.count(User.id))
            .join(Role, Role.id == User.role_id)
            .where(
                User.campus_id == campus_id,
                User.is_active.is_(True),
                Role.key.in_(keys),
            )
        )
        or 0
    )


def _feedback_request_brief(
    db: DbSession, row: FeedbackRequest, *, viewer_id: int | None = None
) -> dict:
    """A prompt, with how many people answered it.

    ``answered_by_me`` is only meaningful to a person being asked, so it is
    reported for them and left null for the office reading the list.
    """
    keys = _audience_keys(row.audience)
    answers = list(db.scalars(select(Feedback).where(Feedback.request_id == row.id)).all())
    ratings = [a.rating for a in answers]
    return {
        "id": row.id,
        "subject": row.subject,
        "message": row.message,
        "audience": keys,
        "due_on": row.due_on.isoformat() if row.due_on else None,
        "state": row.state,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "asked": _asked_count(db, row.campus_id, keys),
        "answered": len(answers),
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "answered_by_me": (
            None if viewer_id is None else any(a.submitted_by_user_id == viewer_id for a in answers)
        ),
    }


def _open_request_for(db: DbSession, user: CurrentUser, request_id: int) -> FeedbackRequest:
    """The request this person is allowed to answer, or a refusal.

    A closed prompt, someone else's campus, and a group the person is not part
    of are all the same answer to the client: not your request to answer.
    """
    row = db.get(FeedbackRequest, request_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown feedback request.")
    if row.state != FeedbackRequestState.OPEN.value:
        raise ValidationError("That request has been closed.")
    if user.role.key not in _audience_keys(row.audience):
        raise ValidationError("That request was not addressed to your role.")
    return row


@router.post("/feedback", status_code=201)
def submit_feedback(payload: FeedbackIn, db: DbSession, user: CurrentUser):
    """Submit feedback about the campus, optionally answering a request."""
    assert_permission(user, FEEDBACK_SUBMIT)
    request_id: int | None = None
    if payload.request_id is not None:
        request_id = _open_request_for(db, user, payload.request_id).id
    student = linked_student(db, user)
    row = Feedback(
        campus_id=user.campus_id,
        submitted_by_user_id=user.id,
        student_id=student.id if student else None,
        request_id=request_id,
        kind=payload.kind,
        subject=payload.subject,
        message=payload.message,
        rating=payload.rating,
        is_anonymous=payload.is_anonymous,
    )
    db.add(row)
    db.flush()
    return {"feedback": _feedback_brief(row, viewer_id=user.id, can_manage=True)}


@router.get("/feedback/me")
def my_feedback(db: DbSession, user: CurrentUser, limit: int = Query(default=50, le=200)):
    """Feedback the signed-in person submitted, including anonymous entries."""
    assert_permission(user, FEEDBACK_READ)
    rows = list(
        db.scalars(
            select(Feedback)
            .where(Feedback.submitted_by_user_id == user.id)
            .order_by(Feedback.id.desc())
            .limit(limit)
        ).all()
    )
    return {"feedback": [_feedback_brief(r, viewer_id=user.id, can_manage=False) for r in rows]}


@router.get("/feedback")
def list_feedback(
    db: DbSession,
    user: CurrentUser,
    state: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=200, le=500),
):
    """All feedback, for the office that acts on it."""
    assert_permission(user, FEEDBACK_MANAGE)
    stmt = select(Feedback).where(Feedback.campus_id == user.campus_id)
    if state:
        stmt = stmt.where(Feedback.state == state)
    rows = list(db.scalars(stmt.order_by(Feedback.state, Feedback.id.desc()).limit(limit)).all())
    counted = [r.rating for r in rows]
    return {
        "feedback": [_feedback_brief(r, viewer_id=user.id, can_manage=True) for r in rows],
        "count": len(rows),
        "average_rating": round(sum(counted) / len(counted), 2) if counted else None,
        "open": sum(1 for r in rows if r.state == FeedbackState.OPEN.value),
    }


@router.post("/feedback/{feedback_id}/respond")
def respond_feedback(feedback_id: int, payload: ResponseIn, db: DbSession, user: CurrentUser):
    """Record the office's response to a piece of feedback."""
    assert_permission(user, FEEDBACK_MANAGE)
    row = db.get(Feedback, feedback_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown feedback.")
    row.response = payload.response
    row.state = payload.state
    row.responded_by_user_id = user.id
    row.responded_at = clock.now()
    db.flush()
    return {"feedback": _feedback_brief(row, viewer_id=user.id, can_manage=True)}


# --- Asking for feedback ----------------------------------------------------


@router.post("/feedback/requests", status_code=201)
def create_feedback_request(payload: FeedbackRequestIn, db: DbSession, user: CurrentUser):
    """Ask teachers and students for their feedback on something."""
    assert_permission(user, FEEDBACK_REQUEST)
    keys = sorted({key.strip().upper() for key in payload.audience if key.strip()})
    if not keys:
        raise ValidationError("Choose who is being asked.")
    unknown = [key for key in keys if key not in ASKABLE_ROLES]
    if unknown:
        raise ValidationError(
            "Feedback can only be requested from teachers and students."
        )
    row = FeedbackRequest(
        campus_id=user.campus_id,
        created_by_user_id=user.id,
        subject=payload.subject,
        message=payload.message,
        audience=",".join(keys),
        due_on=payload.due_on,
        state=FeedbackRequestState.OPEN.value,
    )
    db.add(row)
    db.flush()
    return {"request": _feedback_request_brief(db, row)}


@router.get("/feedback/requests")
def list_feedback_requests(db: DbSession, user: CurrentUser):
    """What the office has asked, and how many of those people answered."""
    assert_permission(user, FEEDBACK_REQUEST)
    rows = list(
        db.scalars(
            select(FeedbackRequest)
            .where(FeedbackRequest.campus_id == user.campus_id)
            .order_by(FeedbackRequest.id.desc())
        ).all()
    )
    return {
        "requests": [_feedback_request_brief(db, row) for row in rows],
        "count": len(rows),
        "open": sum(1 for row in rows if row.state == FeedbackRequestState.OPEN.value),
    }


@router.get("/feedback/requests/mine")
def my_feedback_requests(db: DbSession, user: CurrentUser):
    """Open requests the signed-in person is being asked to answer."""
    assert_permission(user, FEEDBACK_SUBMIT)
    rows = list(
        db.scalars(
            select(FeedbackRequest)
            .where(
                FeedbackRequest.campus_id == user.campus_id,
                FeedbackRequest.state == FeedbackRequestState.OPEN.value,
            )
            .order_by(FeedbackRequest.id.desc())
        ).all()
    )
    addressed = [row for row in rows if user.role.key in _audience_keys(row.audience)]
    return {
        "requests": [
            _feedback_request_brief(db, row, viewer_id=user.id) for row in addressed
        ]
    }


@router.post("/feedback/requests/{request_id}/close")
def close_feedback_request(request_id: int, db: DbSession, user: CurrentUser):
    """Stop asking: the prompt disappears from the people it went to."""
    assert_permission(user, FEEDBACK_REQUEST)
    row = db.get(FeedbackRequest, request_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown feedback request.")
    row.state = FeedbackRequestState.CLOSED.value
    db.flush()
    return {"request": _feedback_request_brief(db, row)}


# --- Activities ------------------------------------------------------------


class ActivityIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    kind: str = Field(default="CLUB", max_length=16)
    description: str | None = Field(default=None, max_length=4000)
    venue: str | None = Field(default=None, max_length=120)
    starts_at: datetime
    ends_at: datetime | None = None
    capacity: int = Field(default=0, ge=0, le=10000)
    state: str = Field(default=ActivityState.OPEN.value, pattern="^(DRAFT|OPEN|CLOSED|CANCELLED)$")


def _activity_brief(row: Activity) -> dict:
    registered = sum(
        1
        for r in row.registrations
        if r.state in (ParticipationState.REGISTERED.value, ParticipationState.ATTENDED.value)
    )
    return {
        "id": row.id,
        "name": row.name,
        "kind": row.kind,
        "state": row.state,
        "description": row.description,
        "venue": row.venue,
        "starts_at": row.starts_at.isoformat() if row.starts_at else None,
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "capacity": row.capacity,
        "registered": registered,
        "seats_left": None if row.capacity == 0 else max(row.capacity - registered, 0),
        "is_full": row.capacity > 0 and registered >= row.capacity,
    }


def _registration_brief(reg: ActivityRegistration) -> dict:
    return {
        "id": reg.id,
        "state": reg.state,
        "note": reg.note,
        "registered_at": reg.created_at.isoformat() if reg.created_at else None,
        "activity": {
            "id": reg.activity.id,
            "name": reg.activity.name,
            "kind": reg.activity.kind,
            "venue": reg.activity.venue,
            "starts_at": reg.activity.starts_at.isoformat() if reg.activity.starts_at else None,
            "state": reg.activity.state,
        }
        if reg.activity
        else None,
        "student": {
            "id": reg.student.id,
            "full_name": reg.student.full_name,
            "roll_number": reg.student.roll_number,
        }
        if reg.student
        else None,
    }


@router.get("/activities")
def list_activities(
    db: DbSession,
    user: CurrentUser,
    kind: str | None = Query(default=None, max_length=16),
    include_closed: bool = False,
    limit: int = Query(default=100, le=300),
):
    """The activity board. Open items first, soonest first."""
    assert_permission(user, ACTIVITY_READ)
    stmt = select(Activity).where(Activity.campus_id == user.campus_id)
    if kind:
        stmt = stmt.where(Activity.kind == kind)
    if not include_closed:
        stmt = stmt.where(Activity.state.in_([ActivityState.OPEN.value, ActivityState.DRAFT.value]))
    rows = list(db.scalars(stmt.order_by(Activity.starts_at).limit(limit)).all())
    return {"activities": [_activity_brief(a) for a in rows], "count": len(rows)}


@router.post("/activities", status_code=201)
def create_activity(payload: ActivityIn, db: DbSession, user: CurrentUser):
    """Publish a club, sport, cultural or technical activity."""
    assert_permission(user, ACTIVITY_MANAGE)
    if payload.ends_at is not None and payload.ends_at < payload.starts_at:
        raise ValidationError("An activity cannot end before it starts.")
    row = Activity(
        campus_id=user.campus_id,
        name=payload.name,
        kind=payload.kind,
        state=payload.state,
        description=payload.description,
        venue=payload.venue,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        capacity=payload.capacity,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return {"activity": _activity_brief(row)}


@router.post("/activities/{activity_id}/register", status_code=201)
def register_activity(activity_id: int, db: DbSession, user: CurrentUser):
    """Take a place in an activity, or a waitlist place if it is full."""
    assert_permission(user, ACTIVITY_PARTICIPATE)
    activity = db.get(Activity, activity_id)
    if activity is None or activity.campus_id != user.campus_id:
        raise ValidationError("Unknown activity.")
    if activity.state != ActivityState.OPEN.value:
        raise ValidationError("This activity is not open for registration.")

    student = linked_student(db, user)
    if student is None:
        raise ValidationError("Only a student account can register for an activity.")

    existing = db.scalar(
        select(ActivityRegistration).where(
            ActivityRegistration.activity_id == activity.id,
            ActivityRegistration.student_id == student.id,
        )
    )
    if existing is not None and existing.state in (
        ParticipationState.REGISTERED.value,
        ParticipationState.WAITLISTED.value,
        ParticipationState.ATTENDED.value,
    ):
        raise ValidationError("You are already registered for this activity.")

    registered = sum(
        1
        for r in activity.registrations
        if r.state in (ParticipationState.REGISTERED.value, ParticipationState.ATTENDED.value)
    )
    is_full = activity.capacity > 0 and registered >= activity.capacity
    state = ParticipationState.WAITLISTED.value if is_full else ParticipationState.REGISTERED.value

    if existing is not None:
        existing.state = state
        reg = existing
    else:
        reg = ActivityRegistration(
            campus_id=user.campus_id, activity_id=activity.id, student_id=student.id, state=state
        )
        db.add(reg)
    db.flush()
    db.refresh(activity)
    return {"registration": _registration_brief(reg), "waitlisted": is_full}


@router.get("/activities/me")
def my_activities(db: DbSession, user: CurrentUser):
    """The activities the signed-in student is registered for."""
    assert_permission(user, ACTIVITY_READ)
    student = linked_student(db, user)
    if student is None:
        return {"student": None, "registrations": []}
    rows = list(
        db.scalars(
            select(ActivityRegistration)
            .where(ActivityRegistration.student_id == student.id)
            .order_by(ActivityRegistration.id.desc())
        ).all()
    )
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "registrations": [_registration_brief(r) for r in rows],
    }


@router.get("/activities/{activity_id}/registrations")
def activity_registrations(activity_id: int, db: DbSession, user: CurrentUser):
    """Who is taking part in an activity, for its organiser."""
    assert_permission(user, ACTIVITY_MANAGE)
    activity = db.get(Activity, activity_id)
    if activity is None or activity.campus_id != user.campus_id:
        raise ValidationError("Unknown activity.")
    db.refresh(activity)
    return {
        "activity": _activity_brief(activity),
        "registrations": [_registration_brief(r) for r in activity.registrations],
    }


@router.post("/activities/{activity_id}/withdraw")
def cancel_registration(activity_id: int, db: DbSession, user: CurrentUser):
    """Withdraw from an activity."""
    assert_permission(user, ACTIVITY_PARTICIPATE)
    student = linked_student(db, user)
    if student is None:
        raise PermissionDeniedError("Only a student account can withdraw from an activity.")
    reg = db.scalar(
        select(ActivityRegistration).where(
            ActivityRegistration.activity_id == activity_id,
            ActivityRegistration.student_id == student.id,
        )
    )
    if reg is None:
        raise ValidationError("You are not registered for this activity.")
    reg.state = ParticipationState.CANCELLED.value
    db.flush()
    return {"registration": _registration_brief(reg)}


__all__ = ["router"]
