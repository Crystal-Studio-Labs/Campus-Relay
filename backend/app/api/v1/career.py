"""Career endpoints: placement postings and the applications to them.

Applying is a one-way write for a student: postings are closed by the deadline,
and a student cannot apply twice. Moving an application through the pipeline
(shortlisted, interview, selected) is the placement cell's job.
"""

from datetime import date as date_type

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.permissions import CAREER_APPLY, CAREER_MANAGE, CAREER_READ
from app.models import JobApplication, JobPosting, Student
from app.models.enums import ApplicationState, JobKind, JobState
from app.services import clock
from app.services.scoping import linked_student

router = APIRouter(tags=["career"])


class JobIn(BaseModel):
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=160)
    kind: str = Field(default=JobKind.FULL_TIME.value, max_length=12)
    description: str | None = Field(default=None, max_length=8000)
    location: str | None = Field(default=None, max_length=160)
    eligibility: str | None = Field(default=None, max_length=300)
    package_lpa: float | None = Field(default=None, ge=0, le=9999)
    apply_url: str | None = Field(default=None, max_length=400)
    deadline: str | None = Field(default=None, pattern="^\\d{4}-\\d{2}-\\d{2}$")
    state: str = Field(default=JobState.OPEN.value, pattern="^(DRAFT|OPEN|CLOSED)$")


class ApplyIn(BaseModel):
    resume_url: str | None = Field(default=None, max_length=400)
    cover_note: str | None = Field(default=None, max_length=4000)


class StageIn(BaseModel):
    state: str = Field(
        pattern="^(APPLIED|SHORTLISTED|INTERVIEW|SELECTED|REJECTED|WITHDRAWN)$"
    )
    note: str | None = Field(default=None, max_length=300)


def _job_brief(job: JobPosting) -> dict:
    return {
        "id": job.id,
        "company": job.company,
        "role": job.role,
        "kind": job.kind,
        "state": job.state,
        "description": job.description,
        "location": job.location,
        "eligibility": job.eligibility,
        "package_lpa": float(job.package_lpa) if job.package_lpa is not None else None,
        "apply_url": job.apply_url,
        "deadline": job.deadline.isoformat() if job.deadline else None,
        "applications": len(job.applications),
        "posted_at": job.created_at.isoformat() if job.created_at else None,
    }


def _application_brief(row: JobApplication) -> dict:
    return {
        "id": row.id,
        "state": row.state,
        "resume_url": row.resume_url,
        "cover_note": row.cover_note,
        "note": row.note,
        "applied_at": row.applied_at.isoformat() if row.applied_at else None,
        "job": {
            "id": row.posting.id,
            "company": row.posting.company,
            "role": row.posting.role,
            "kind": row.posting.kind,
            "deadline": row.posting.deadline.isoformat() if row.posting.deadline else None,
        }
        if row.posting
        else None,
        "student": {
            "id": row.student.id,
            "full_name": row.student.full_name,
            "roll_number": row.student.roll_number,
        }
        if row.student
        else None,
    }


@router.get("/career/jobs")
def list_jobs(
    db: DbSession,
    user: CurrentUser,
    include_closed: bool = False,
    limit: int = Query(default=100, le=300),
):
    """Open placement postings, soonest deadline first.

    Two doors, deliberately: the student board reads with CAREER_READ, and
    the placement desk lists with CAREER_MANAGE - a teacher who publishes
    postings must be able to list them without holding the student board.
    """
    held = user.permission_keys()
    if CAREER_READ not in held and CAREER_MANAGE not in held:
        raise PermissionDeniedError("Your role does not allow this action.")
    stmt = select(JobPosting).where(JobPosting.campus_id == user.campus_id)
    if not include_closed:
        stmt = stmt.where(JobPosting.state == JobState.OPEN.value)
    rows = list(db.scalars(stmt.order_by(JobPosting.deadline.is_(None), JobPosting.deadline).limit(limit)).all())
    return {"jobs": [_job_brief(j) for j in rows], "count": len(rows)}


@router.post("/career/jobs", status_code=201)
def create_job(payload: JobIn, db: DbSession, user: CurrentUser):
    """Publish a placement or internship posting."""
    assert_permission(user, CAREER_MANAGE)
    deadline = None
    if payload.deadline:
        try:
            deadline = date_type.fromisoformat(payload.deadline)
        except ValueError:
            raise ValidationError("The deadline must look like YYYY-MM-DD.") from None
    job = JobPosting(
        campus_id=user.campus_id,
        company=payload.company,
        role=payload.role,
        kind=payload.kind,
        state=payload.state,
        description=payload.description,
        location=payload.location,
        eligibility=payload.eligibility,
        package_lpa=payload.package_lpa,
        apply_url=payload.apply_url,
        deadline=deadline,
        created_by_user_id=user.id,
    )
    db.add(job)
    db.flush()
    db.refresh(job)
    return {"job": _job_brief(job)}


@router.post("/career/jobs/{job_id}/apply", status_code=201)
def apply_to_job(job_id: int, payload: ApplyIn, db: DbSession, user: CurrentUser):
    """Apply to a posting. One application per student per posting."""
    assert_permission(user, CAREER_APPLY)
    job = db.get(JobPosting, job_id)
    if job is None or job.campus_id != user.campus_id:
        raise ValidationError("Unknown posting.")
    if job.state != JobState.OPEN.value:
        raise ValidationError("This posting is not open for applications.")
    today = date_type.today()
    if job.deadline and job.deadline < today:
        raise ValidationError("The application deadline has passed.")

    student = linked_student(db, user)
    if student is None:
        raise ValidationError("Only a student account can apply.")

    existing = db.scalar(
        select(JobApplication).where(
            JobApplication.posting_id == job.id, JobApplication.student_id == student.id
        )
    )
    if existing is not None and existing.state != ApplicationState.WITHDRAWN.value:
        raise ValidationError("You have already applied to this posting.")

    if existing is not None:
        existing.state = ApplicationState.APPLIED.value
        existing.resume_url = payload.resume_url
        existing.cover_note = payload.cover_note
        existing.applied_at = clock.now()
        row = existing
    else:
        row = JobApplication(
            campus_id=user.campus_id,
            posting_id=job.id,
            student_id=student.id,
            state=ApplicationState.APPLIED.value,
            resume_url=payload.resume_url,
            cover_note=payload.cover_note,
            applied_at=clock.now(),
        )
        db.add(row)
    db.flush()
    return {"application": _application_brief(row)}


@router.get("/career/applications/me")
def my_applications(db: DbSession, user: CurrentUser):
    """The applications the signed-in student has made."""
    assert_permission(user, CAREER_READ)
    student = linked_student(db, user)
    if student is None:
        return {"student": None, "applications": []}
    rows = list(
        db.scalars(
            select(JobApplication)
            .where(JobApplication.student_id == student.id)
            .order_by(JobApplication.id.desc())
        ).all()
    )
    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "applications": [_application_brief(r) for r in rows],
    }


@router.get("/career/jobs/{job_id}/applications")
def job_applications(job_id: int, db: DbSession, user: CurrentUser):
    """The applicant list for a posting, for the placement cell."""
    assert_permission(user, CAREER_MANAGE)
    job = db.get(JobPosting, job_id)
    if job is None or job.campus_id != user.campus_id:
        raise ValidationError("Unknown posting.")
    db.refresh(job)
    return {
        "job": _job_brief(job),
        "applications": [_application_brief(a) for a in job.applications],
    }


@router.post("/career/applications/{application_id}/stage")
def move_application(application_id: int, payload: StageIn, db: DbSession, user: CurrentUser):
    """Move an application to the next stage of the pipeline."""
    assert_permission(user, CAREER_MANAGE)
    row = db.get(JobApplication, application_id)
    if row is None or row.campus_id != user.campus_id:
        raise ValidationError("Unknown application.")
    row.state = payload.state
    if payload.note:
        row.note = payload.note
    db.flush()
    return {"application": _application_brief(row)}


__all__ = ["router"]
