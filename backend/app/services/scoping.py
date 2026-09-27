"""Data scope rules.

Permissions answer "may this role do X". Scope answers "on which rows".
Both are enforced server-side; nothing here trusts a client-supplied campus id.
"""

from sqlalchemy import and_, or_, select

from app.core.errors import PermissionDeniedError
from app.models import Case, Staff, Student, User
from app.models.enums import RoleKey, ServiceCategory

# Services whose cases security staff legitimately need to see.
SECURITY_SERVICE_KEYS = {"GATE_PASS", "VISITOR_REQUEST", "LOST_ITEM"}

# Services a hostel warden owns.
WARDEN_SERVICE_CATEGORIES = {ServiceCategory.HOSTEL.value}
WARDEN_SERVICE_KEYS = {"LEAVE_REQUEST", "GATE_PASS", "HOSTEL_COMPLAINT", "MESS_COMPLAINT", "ROOM_CHANGE"}


def _student_of(db, user: User) -> Student | None:
    return db.scalar(select(Student).where(Student.user_id == user.id))


def _staff_of(db, user: User) -> Staff | None:
    return db.scalar(select(Staff).where(Staff.user_id == user.id))


def student_id_for(db, user: User) -> int | None:
    student = _student_of(db, user)
    return student.id if student else None


def case_scope_condition(db, user: User):
    """Return a SQLAlchemy predicate restricting `cases` rows for this user.

    A user with CASE_READ_ALL sees the whole campus; everyone else gets a
    narrower predicate. Returns None when the role may read nothing.
    """
    role = user.role_key
    campus = Case.campus_id == user.campus_id

    if role in {RoleKey.SUPER_ADMIN.value, RoleKey.ADMIN.value}:
        return campus

    if role == RoleKey.HELPDESK_OPERATOR.value:
        # Front desk needs status visibility for walk-in follow-ups.
        return campus

    if role == RoleKey.WARDEN.value:
        student = _student_of(db, user)
        warden_hostel_ids: list[int] = []
        if student and student.hostel_id:
            warden_hostel_ids.append(student.hostel_id)
        # Hostels this user is warden of.
        from app.models import Hostel

        warden_hostel_ids += list(
            db.scalars(select(Hostel.id).where(Hostel.warden_user_id == user.id)).all()
        )
        hostel_student_ids = select(Student.id).where(Student.hostel_id.in_(warden_hostel_ids)) if warden_hostel_ids else None
        predicates = [
            Case.service_key.in_(WARDEN_SERVICE_KEYS),
            Case.category.in_(WARDEN_SERVICE_CATEGORIES),
        ]
        if hostel_student_ids is not None:
            predicates.append(Case.requester_student_id.in_(hostel_student_ids))
        return and_(campus, or_(*predicates))

    if role in {RoleKey.DEPARTMENT_HEAD.value, RoleKey.STAFF.value}:
        staff = _staff_of(db, user)
        predicates = [Case.assigned_staff_id == (staff.id if staff else -1)]
        if staff and staff.department_id:
            predicates.append(Case.department_id == staff.department_id)
        return and_(campus, or_(*predicates))

    if role == RoleKey.SECURITY.value:
        return and_(campus, Case.service_key.in_(SECURITY_SERVICE_KEYS))

    if role == RoleKey.STUDENT.value:
        sid = student_id_for(db, user)
        predicates = [Case.requester_id == user.id]
        if sid is not None:
            predicates.append(Case.requester_student_id == sid)
        return and_(campus, or_(*predicates))

    return None


def can_view_case(db, user: User, case: Case) -> bool:
    if case.campus_id != user.campus_id:
        return False
    condition = case_scope_condition(db, user)
    if condition is None:
        return False
    stmt = select(Case.id).where(Case.id == case.id, condition)
    return db.scalar(stmt) is not None


def assert_can_view_case(db, user: User, case: Case) -> None:
    if not can_view_case(db, user, case):
        raise PermissionDeniedError("You cannot view this case.")


def default_channel_for_role(role_key: str) -> str:
    from app.models.enums import SourceChannel

    if role_key in {RoleKey.STUDENT.value, RoleKey.STAFF.value, RoleKey.SECURITY.value}:
        return SourceChannel.PWA.value
    if role_key == RoleKey.HELPDESK_OPERATOR.value:
        return SourceChannel.ASSISTED_DESK.value
    return SourceChannel.WEB_DESKTOP.value
