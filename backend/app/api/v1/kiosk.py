"""Kiosk and helpdesk (assisted access).

A student without a smartphone is not a different kind of case. The resulting
record is an ordinary CampusCase whose source_channel is KIOSK or ASSISTED_DESK,
and it flows through the same workflow, SLA and audit trail as a PWA request.
"""

from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession, RequestContext, assert_permission
from app.api.serializers import case_brief, student_profile
from app.api.v1.schemas import CaseCreateRequest, KioskCaseRequest, KioskLookupRequest
from app.core.errors import NotFoundError, ValidationError
from app.core.permissions import CASE_CREATE_ON_BEHALF, CASE_READ_SCOPE
from app.models import Case, Service, Student, User
from app.models.enums import SourceChannel
from app.services import case_engine
from app.services import notices as notice_service

router = APIRouter(tags=["kiosk"])


@router.post("/kiosk/lookup")
def lookup_student(payload: KioskLookupRequest, db: DbSession, user: CurrentUser):
    """Step 1 of the kiosk flow: identify the student by roll number or ID."""
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    student = _find_student(db, user, payload.roll_number)
    recent = db.scalars(
        select(Case)
        .where(Case.campus_id == user.campus_id, Case.requester_student_id == student.id)
        .order_by(Case.created_at.desc())
        .limit(5)
    ).all()
    return {
        "student": {
            **student_profile(student),
            "has_app_account": student.user_id is not None,
        },
        "recent_cases": [case_brief(db, case) for case in recent],
        "services": _kiosk_services(db, user),
    }


@router.get("/kiosk/student/{roll_number}/cases")
def student_cases(roll_number: str, db: DbSession, user: CurrentUser):
    """Case status check at a kiosk, without needing the student's device."""
    assert_permission(user, CASE_READ_SCOPE)
    student = _find_student(db, user, roll_number)
    cases = db.scalars(
        select(Case)
        .where(Case.campus_id == user.campus_id, Case.requester_student_id == student.id)
        .order_by(Case.created_at.desc())
        .limit(10)
    ).all()
    return {
        "student": {"full_name": student.full_name, "roll_number": student.roll_number},
        "cases": [case_brief(db, case, audience="staff") for case in cases],
    }


@router.get("/kiosk/services")
def kiosk_services(db: DbSession, user: CurrentUser):
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    return {"services": _kiosk_services(db, user)}


@router.post("/kiosk/cases", status_code=201)
def create_kiosk_case(payload: KioskCaseRequest, db: DbSession, user: CurrentUser, context: RequestContext):
    """Create a case on behalf of a student who has no device.

    `source_channel` records KIOSK/ASSISTED_DESK so the administrator can see
    which channels are actually being used.
    """
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    student = _find_student(db, user, payload.roll_number)

    channel = (
        SourceChannel.KIOSK.value
        if context.source_channel.upper() == SourceChannel.KIOSK.value
        else SourceChannel.ASSISTED_DESK.value
    )

    draft = case_engine.CaseDraft(
        service_key=payload.service_key,
        description=payload.description,
        title=payload.title,
        category=payload.category,
        priority=payload.priority,
        location_id=payload.location_id,
        location_code=payload.location_code,
        asset_id=payload.asset_id,
        state_payload=payload.state_payload,
        source_channel=channel,
        language=payload.language,
        client_ref=payload.client_ref or context.idempotency_key,
        on_behalf_student_id=student.id,
        device_uid=context.device_uid,
    )
    result = case_engine.create_case(db, actor=user, draft=draft)
    return {
        "created": result.created,
        "channel": channel,
        "on_behalf_of": {"full_name": student.full_name, "roll_number": student.roll_number},
        "case": case_brief(db, result.case, audience="staff"),
        "intake": result.intake,
        "receipt": {
            "case_number": result.case.case_number,
            "status": result.case.status,
            "service": result.case.service.name if result.case.service else result.case.service_key,
            "message": (
                f"Request {result.case.case_number} has been registered. "
                "Keep this number, or quote your roll number to check status at any kiosk."
            ),
        },
    }


@router.get("/kiosk/notices")
def kiosk_notices(db: DbSession, user: CurrentUser, limit: int = Query(default=5, le=20)):
    """Public-safe campus notices for the kiosk idle screen: no personal data."""
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    from app.models import Notice
    from app.models.enums import NoticeStatus

    rows = db.scalars(
        select(Notice)
        .where(
            Notice.campus_id == user.campus_id,
            Notice.status == NoticeStatus.PUBLISHED.value,
            Notice.notice_type.in_(("IMPORTANT", "URGENT", "EMERGENCY")),
        )
        .order_by(Notice.publish_at.desc())
        .limit(limit)
    ).all()
    return {
        "notices": [
            {
                "id": n.id,
                "title": n.title,
                "type": n.notice_type,
                "summary": n.summary,
                "published_at": n.publish_at,
            }
            for n in rows
        ],
        "privacy_note": "Kiosk notice view exposes no student information.",
    }


@router.get("/helpdesk/students")
def search_students(
    db: DbSession,
    user: CurrentUser,
    q: str = Query(min_length=2, max_length=48),
    limit: int = Query(default=10, le=50),
):
    """Helpdesk search: roll number, name or registration number."""
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    pattern = f"%{q}%"
    rows = db.scalars(
        select(Student)
        .where(
            Student.campus_id == user.campus_id,
            or_(
                Student.roll_number.ilike(pattern),
                Student.full_name.ilike(pattern),
                Student.registration_number.ilike(pattern),
            ),
        )
        .order_by(Student.roll_number)
        .limit(limit)
    ).all()
    return {
        "students": [
            {
                **student_profile(student),
                "has_app_account": student.user_id is not None,
                "recent_case_count": _recent_case_count(db, student),
            }
            for student in rows
        ]
    }


@router.get("/helpdesk/desk")
def helpdesk_desk(db: DbSession, user: CurrentUser):
    """Walk-in queue for the assisted desk: cases filed at the desk today."""
    assert_permission(user, CASE_CREATE_ON_BEHALF)
    rows = db.scalars(
        select(Case)
        .where(
            Case.campus_id == user.campus_id,
            Case.source_channel.in_((SourceChannel.KIOSK.value, SourceChannel.ASSISTED_DESK.value)),
        )
        .order_by(Case.created_at.desc())
        .limit(25)
    ).all()
    return {
        "walk_in_cases": [case_brief(db, case, audience="staff") for case in rows],
        "counts": {
            "kiosk": sum(1 for c in rows if c.source_channel == SourceChannel.KIOSK.value),
            "assisted_desk": sum(1 for c in rows if c.source_channel == SourceChannel.ASSISTED_DESK.value),
        },
        "note": "These are ordinary cases; only the source channel differs.",
    }


def _find_student(db, user: CurrentUser, identifier: str) -> Student:
    cleaned = identifier.strip()
    student = db.scalar(
        select(Student).where(
            Student.campus_id == user.campus_id,
            or_(Student.roll_number == cleaned, Student.registration_number == cleaned),
        )
    )
    if student is None and cleaned.isdigit():
        student = db.get(Student, int(cleaned))
        if student is not None and student.campus_id != user.campus_id:
            student = None
    if student is None:
        raise NotFoundError(
            "No student found with that roll number on this campus.",
            details={"hint": "Check the number, or search by name at the helpdesk."},
        )
    return student


def _recent_case_count(db, student: Student) -> int:
    from sqlalchemy import func

    return int(
        db.scalar(select(func.count(Case.id)).where(Case.requester_student_id == student.id)) or 0
    )


def _kiosk_services(db, user: CurrentUser) -> list[dict]:
    services = db.scalars(
        select(Service)
        .where(Service.campus_id == user.campus_id, Service.is_active.is_(True))
        .order_by(Service.sort_order)
    ).all()
    return [
        {
            "key": s.key,
            "name": s.name,
            "category": s.category,
            "icon": s.icon,
            "form_schema": s.form_schema or [],
            "default_priority": s.default_priority,
        }
        for s in services
    ]
