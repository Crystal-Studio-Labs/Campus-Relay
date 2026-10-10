"""Academic endpoints: subjects and attendance.

Attendance is scoped, not merely permissioned. A student reads only their own
rows; a teacher reads and writes only the subjects they own; an administrator
sees the institution. The subject ownership check is enforced here,
server-side, on every write.
"""

from datetime import date as date_type
from datetime import time as time_type

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.permissions import (
    ATTENDANCE_MANAGE,
    ATTENDANCE_MARK,
    ATTENDANCE_READ,
    MARKS_ENTRY,
    MARKS_MANAGE,
    MARKS_READ,
    TIMETABLE_MANAGE,
    TIMETABLE_READ,
)
from app.models import AttendanceRecord, Mark, Student, Subject, TimetableSlot
from app.models.enums import AttendanceStatus, RoleKey

router = APIRouter(tags=["academics"])


class AttendanceMark(BaseModel):
    student_id: int
    status: str = Field(pattern="^(PRESENT|ABSENT|LATE|EXCUSED)$")


class AttendanceMarkRequest(BaseModel):
    subject_id: int
    on_date: date_type
    slot: str = Field(default="P1", min_length=1, max_length=12)
    records: list[AttendanceMark]


def _linked_student(db, user) -> Student | None:
    """The student profile the signed-in account owns."""
    return db.scalar(select(Student).where(Student.user_id == user.id))


def _subject_brief(subject: Subject) -> dict:
    return {
        "id": subject.id,
        "code": subject.code,
        "name": subject.name,
        "credits": subject.credits,
        "semester": subject.semester,
        "branch_id": subject.branch_id,
        "year_id": subject.year_id,
        "branch": subject.branch.name if subject.branch else None,
        "year": subject.year.name if subject.year else None,
        "faculty_user_id": subject.faculty_user_id,
    }


def _attendance_summary(db, student_id: int) -> dict:
    """Overall and per-subject attendance for one student."""
    rows = db.execute(
        select(
            AttendanceRecord.subject_id,
            AttendanceRecord.status,
            func.count(AttendanceRecord.id),
        )
        .where(AttendanceRecord.student_id == student_id)
        .group_by(AttendanceRecord.subject_id, AttendanceRecord.status)
    ).all()

    subjects = {
        s.id: s
        for s in db.scalars(
            select(Subject).where(Subject.id.in_({r[0] for r in rows} or {-1}))
        ).all()
    }

    per_subject: dict[int, dict] = {}
    total = 0
    present = 0
    for subject_id, status, count in rows:
        bucket = per_subject.setdefault(
            subject_id,
            {
                "subject_id": subject_id,
                "subject": _subject_brief(subjects[subject_id]) if subject_id in subjects else None,
                "present": 0,
                "absent": 0,
                "late": 0,
                "excused": 0,
                "total": 0,
            },
        )
        bucket[status.lower()] += count
        bucket["total"] += count
        total += count
        # Late still counts as attended; excused is neither rewarded nor penalised.
        if status in (AttendanceStatus.PRESENT.value, AttendanceStatus.LATE.value):
            present += count

    return {
        "total": total,
        "present": present,
        "absent": total - present,
        "percentage": round(present * 100 / total, 1) if total else None,
        "per_subject": sorted(per_subject.values(), key=lambda b: b["subject_id"]),
    }


@router.get("/subjects")
def subjects(db: DbSession, user: CurrentUser):
    assert_permission(user, ATTENDANCE_READ)
    stmt = select(Subject).where(Subject.campus_id == user.campus_id, Subject.is_active.is_(True))

    if user.role_key == RoleKey.TEACHER.value:
        stmt = stmt.where(Subject.faculty_user_id == user.id)
    elif user.role_key == RoleKey.STUDENT.value:
        student = _linked_student(db, user)
        if student is None:
            return {"subjects": []}
        stmt = stmt.where(Subject.branch_id == student.branch_id, Subject.year_id == student.year_id)

    rows = db.scalars(stmt.order_by(Subject.semester, Subject.code)).all()
    return {"subjects": [_subject_brief(s) for s in rows]}


@router.get("/attendance/me")
def my_attendance(db: DbSession, user: CurrentUser, subject_id: int | None = None, limit: int = Query(default=60, le=300)):
    """Attendance for the signed-in student."""
    assert_permission(user, ATTENDANCE_READ)
    student = _linked_student(db, user)
    if student is None:
        return {
            "student": None,
            "summary": {"total": 0, "present": 0, "absent": 0, "percentage": None, "per_subject": []},
            "records": [],
        }
    summary = _attendance_summary(db, student.id)

    record_stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == student.id)
        .order_by(AttendanceRecord.on_date.desc(), AttendanceRecord.slot)
        .limit(limit)
    )
    if subject_id is not None:
        record_stmt = record_stmt.where(AttendanceRecord.subject_id == subject_id)
    records = db.scalars(record_stmt).all()

    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "summary": summary,
        "records": [
            {
                "id": r.id,
                "on_date": r.on_date.isoformat(),
                "slot": r.slot,
                "status": r.status,
                "subject": _subject_brief(r.subject) if r.subject else None,
                "note": r.note,
            }
            for r in records
        ],
    }


@router.get("/attendance/subject/{subject_id}")
def subject_attendance(db: DbSession, user: CurrentUser, subject_id: int, on_date: date_type | None = None):
    """The roster for a subject on a date, for the teacher who owns it."""
    assert_permission(user, ATTENDANCE_MARK)
    subject = db.get(Subject, subject_id)
    if subject is None or subject.campus_id != user.campus_id:
        raise ValidationError("Unknown subject.")
    if not _may_mark(user, subject):
        raise PermissionDeniedError("You do not teach this subject.")

    roster = db.scalars(
        select(Student)
        .where(
            Student.campus_id == user.campus_id,
            Student.branch_id == subject.branch_id,
            Student.year_id == subject.year_id,
        )
        .order_by(Student.roll_number)
    ).all()

    marked: dict[int, str] = {}
    if on_date is not None:
        marked = {
            r.student_id: r.status
            for r in db.scalars(
                select(AttendanceRecord).where(
                    AttendanceRecord.subject_id == subject_id, AttendanceRecord.on_date == on_date
                )
            ).all()
        }

    return {
        "subject": _subject_brief(subject),
        "on_date": on_date.isoformat() if on_date else None,
        "roster": [
            {
                "student_id": s.id,
                "full_name": s.full_name,
                "roll_number": s.roll_number,
                "status": marked.get(s.id),
            }
            for s in roster
        ],
    }


@router.post("/attendance/mark", status_code=201)
def mark_attendance(payload: AttendanceMarkRequest, db: DbSession, user: CurrentUser):
    """Record attendance for a subject. Re-marking the same day/slot updates it."""
    assert_permission(user, ATTENDANCE_MARK)
    subject = db.get(Subject, payload.subject_id)
    if subject is None or subject.campus_id != user.campus_id:
        raise ValidationError("Unknown subject.")
    if not _may_mark(user, subject):
        raise PermissionDeniedError("You do not teach this subject.")
    if not payload.records:
        raise ValidationError("No attendance rows were supplied.")

    valid_ids = set(
        db.scalars(
            select(Student.id).where(
                Student.campus_id == user.campus_id,
                Student.branch_id == subject.branch_id,
                Student.year_id == subject.year_id,
            )
        ).all()
    )

    existing = {
        (r.student_id): r
        for r in db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.subject_id == subject.id,
                AttendanceRecord.on_date == payload.on_date,
                AttendanceRecord.slot == payload.slot,
            )
        ).all()
    }

    saved = 0
    for row in payload.records:
        if row.student_id not in valid_ids:
            raise ValidationError(f"Student {row.student_id} is not enrolled in this subject.")
        record = existing.get(row.student_id)
        if record is None:
            record = AttendanceRecord(
                campus_id=user.campus_id,
                subject_id=subject.id,
                student_id=row.student_id,
                on_date=payload.on_date,
                slot=payload.slot,
                status=row.status,
                marked_by_user_id=user.id,
            )
            db.add(record)
        else:
            record.status = row.status
            record.marked_by_user_id = user.id
        saved += 1

    db.flush()
    return {"saved": saved, "subject_id": subject.id, "on_date": payload.on_date.isoformat(), "slot": payload.slot}


def _may_mark(user, subject: Subject) -> bool:
    """Teachers may mark only their own subjects; management may mark any."""
    if user.role_key == RoleKey.MANAGEMENT.value:
        return True
    return subject.faculty_user_id == user.id


# --- Marks ----------------------------------------------------------------


class MarkEntry(BaseModel):
    student_id: int
    obtained_marks: int = Field(ge=0)
    max_marks: int = Field(default=100, ge=1)


class MarkEntryRequest(BaseModel):
    subject_id: int
    assessment: str = Field(min_length=1, max_length=60)
    term: str = Field(default="CURRENT", max_length=24)
    marks: list[MarkEntry]


def _marks_summary(db, student_id: int) -> dict:
    """Overall and per-subject totals for one student."""
    rows = db.scalars(select(Mark).where(Mark.student_id == student_id)).all()
    per_subject: dict[int, dict] = {}
    obtained_total = 0
    max_total = 0
    for mark in rows:
        bucket = per_subject.setdefault(
            mark.subject_id,
            {
                "subject_id": mark.subject_id,
                "subject": _subject_brief(mark.subject) if mark.subject else None,
                "obtained": 0,
                "max": 0,
                "assessments": 0,
            },
        )
        bucket["obtained"] += mark.obtained_marks
        bucket["max"] += mark.max_marks
        bucket["assessments"] += 1
        obtained_total += mark.obtained_marks
        max_total += mark.max_marks

    for bucket in per_subject.values():
        bucket["percentage"] = round(bucket["obtained"] * 100 / bucket["max"], 1) if bucket["max"] else None

    return {
        "obtained": obtained_total,
        "max": max_total,
        "percentage": round(obtained_total * 100 / max_total, 1) if max_total else None,
        "per_subject": sorted(per_subject.values(), key=lambda b: b["subject_id"]),
    }


@router.get("/marks/me")
def my_marks(db: DbSession, user: CurrentUser, subject_id: int | None = None, limit: int = Query(default=120, le=400)):
    """Marks for the signed-in student."""
    assert_permission(user, MARKS_READ)
    student = _linked_student(db, user)
    if student is None:
        return {
            "student": None,
            "summary": {"obtained": 0, "max": 0, "percentage": None, "per_subject": []},
            "marks": [],
        }

    stmt = (
        select(Mark)
        .where(Mark.student_id == student.id)
        .order_by(Mark.term.desc(), Mark.assessment)
        .limit(limit)
    )
    if subject_id is not None:
        stmt = stmt.where(Mark.subject_id == subject_id)
    rows = db.scalars(stmt).all()

    return {
        "student": {"id": student.id, "full_name": student.full_name, "roll_number": student.roll_number},
        "summary": _marks_summary(db, student.id),
        "marks": [
            {
                "id": m.id,
                "assessment": m.assessment,
                "term": m.term,
                "obtained_marks": m.obtained_marks,
                "max_marks": m.max_marks,
                "subject": _subject_brief(m.subject) if m.subject else None,
            }
            for m in rows
        ],
    }


@router.get("/marks/subject/{subject_id}")
def subject_marks(db: DbSession, user: CurrentUser, subject_id: int, assessment: str | None = None, term: str = "CURRENT"):
    """The class list with marks for one assessment.

    Two doors, deliberately different: a teacher reads a subject they teach
    (MARKS_ENTRY), and management reads any subject on their campus as
    oversight (MARKS_MANAGE). Management only ever reads here - writing stays
    behind MARKS_ENTRY, so the office that audits the register cannot also
    hold the pen. See ROLE_PERMISSIONS.
    """
    subject = db.get(Subject, subject_id)
    if subject is None or subject.campus_id != user.campus_id:
        raise ValidationError("Unknown subject.")
    held = user.permission_keys()
    if MARKS_MANAGE not in held:
        assert_permission(user, MARKS_ENTRY)
        if not _may_mark(user, subject):
            raise PermissionDeniedError("You do not teach this subject.")

    roster = db.scalars(
        select(Student)
        .where(
            Student.campus_id == user.campus_id,
            Student.branch_id == subject.branch_id,
            Student.year_id == subject.year_id,
        )
        .order_by(Student.roll_number)
    ).all()

    entered: dict[int, dict] = {}
    if assessment:
        for mark in db.scalars(
            select(Mark).where(Mark.subject_id == subject_id, Mark.assessment == assessment, Mark.term == term)
        ).all():
            entered[mark.student_id] = {"obtained_marks": mark.obtained_marks, "max_marks": mark.max_marks}

    return {
        "subject": _subject_brief(subject),
        "assessment": assessment,
        "term": term,
        "roster": [
            {
                "student_id": s.id,
                "full_name": s.full_name,
                "roll_number": s.roll_number,
                "obtained_marks": entered.get(s.id, {}).get("obtained_marks"),
                "max_marks": entered.get(s.id, {}).get("max_marks"),
            }
            for s in roster
        ],
    }


@router.post("/marks", status_code=201)
def enter_marks(payload: MarkEntryRequest, db: DbSession, user: CurrentUser):
    """Record marks for one assessment. Re-entry updates the existing rows."""
    assert_permission(user, MARKS_ENTRY)
    subject = db.get(Subject, payload.subject_id)
    if subject is None or subject.campus_id != user.campus_id:
        raise ValidationError("Unknown subject.")
    if not _may_mark(user, subject):
        raise PermissionDeniedError("You do not teach this subject.")
    if not payload.marks:
        raise ValidationError("No marks were supplied.")

    valid_ids = set(
        db.scalars(
            select(Student.id).where(
                Student.campus_id == user.campus_id,
                Student.branch_id == subject.branch_id,
                Student.year_id == subject.year_id,
            )
        ).all()
    )
    existing = {
        m.student_id: m
        for m in db.scalars(
            select(Mark).where(
                Mark.subject_id == subject.id,
                Mark.assessment == payload.assessment,
                Mark.term == payload.term,
            )
        ).all()
    }

    saved = 0
    for row in payload.marks:
        if row.student_id not in valid_ids:
            raise ValidationError(f"Student {row.student_id} is not enrolled in this subject.")
        if row.obtained_marks > row.max_marks:
            raise ValidationError("A score cannot exceed the maximum.")
        mark = existing.get(row.student_id)
        if mark is None:
            mark = Mark(
                campus_id=user.campus_id,
                subject_id=subject.id,
                student_id=row.student_id,
                assessment=payload.assessment,
                term=payload.term,
                max_marks=row.max_marks,
                obtained_marks=row.obtained_marks,
                entered_by_user_id=user.id,
            )
            db.add(mark)
        else:
            mark.obtained_marks = row.obtained_marks
            mark.max_marks = row.max_marks
            mark.entered_by_user_id = user.id
        saved += 1

    db.flush()
    return {"saved": saved, "subject_id": subject.id, "assessment": payload.assessment, "term": payload.term}


# --- Timetable ------------------------------------------------------------

WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]


class SlotRequest(BaseModel):
    subject_id: int
    day: str = Field(pattern="^(MON|TUE|WED|THU|FRI|SAT|SUN)$")
    start_time: str = Field(pattern="^\\d{2}:\\d{2}$")
    end_time: str = Field(pattern="^\\d{2}:\\d{2}$")
    room: str | None = Field(default=None, max_length=48)


def _slot_brief(slot: TimetableSlot) -> dict:
    return {
        "id": slot.id,
        "day": slot.day,
        "start_time": slot.start_time.strftime("%H:%M"),
        "end_time": slot.end_time.strftime("%H:%M"),
        "room": slot.room,
        "subject": _subject_brief(slot.subject) if slot.subject else None,
    }


def _slots_for_subject_ids(db, subject_ids: set[int]) -> list[TimetableSlot]:
    if not subject_ids:
        return []
    return list(
        db.scalars(
            select(TimetableSlot)
            .where(TimetableSlot.subject_id.in_(subject_ids))
            .order_by(TimetableSlot.start_time)
        ).all()
    )


@router.get("/timetable/me")
def my_timetable(db: DbSession, user: CurrentUser):
    """The weekly timetable for the signed-in student."""
    assert_permission(user, TIMETABLE_READ)
    student = _linked_student(db, user)
    if student is None:
        return {"days": WEEKDAYS, "slots": []}
    subject_ids = set(
        db.scalars(
            select(Subject.id).where(
                Subject.campus_id == user.campus_id,
                Subject.branch_id == student.branch_id,
                Subject.year_id == student.year_id,
            )
        ).all()
    )
    return {"days": WEEKDAYS, "slots": [_slot_brief(s) for s in _slots_for_subject_ids(db, subject_ids)]}


@router.get("/timetable/mine")
def teaching_timetable(db: DbSession, user: CurrentUser):
    """The weekly teaching timetable for the signed-in teacher."""
    assert_permission(user, TIMETABLE_READ)
    if user.role_key == RoleKey.MANAGEMENT.value:
        subject_ids = set(db.scalars(select(Subject.id).where(Subject.campus_id == user.campus_id)).all())
    else:
        subject_ids = set(
            db.scalars(select(Subject.id).where(Subject.faculty_user_id == user.id)).all()
        )
    return {"days": WEEKDAYS, "slots": [_slot_brief(s) for s in _slots_for_subject_ids(db, subject_ids)]}


@router.post("/timetable", status_code=201)
def add_slot(payload: SlotRequest, db: DbSession, user: CurrentUser):
    """Add a weekly period. A teacher may add periods only to their own subject."""
    assert_permission(user, TIMETABLE_MANAGE)
    subject = db.get(Subject, payload.subject_id)
    if subject is None or subject.campus_id != user.campus_id:
        raise ValidationError("Unknown subject.")
    if not _may_mark(user, subject):
        raise PermissionDeniedError("You do not teach this subject.")
    try:
        start = time_type.fromisoformat(payload.start_time)
        end = time_type.fromisoformat(payload.end_time)
    except ValueError:
        raise ValidationError("Times must look like HH:MM.") from None
    if end <= start:
        raise ValidationError("A period must end after it starts.")

    slot = TimetableSlot(
        campus_id=user.campus_id,
        subject_id=subject.id,
        day=payload.day,
        start_time=start,
        end_time=end,
        room=payload.room,
    )
    db.add(slot)
    db.flush()
    return {"slot": _slot_brief(slot)}
