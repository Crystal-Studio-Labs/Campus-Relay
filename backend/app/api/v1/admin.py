"""Administrator API: the operational command centre."""

import io

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.api.serializers import case_brief, location_brief, service_brief, student_profile, user_brief, user_profile
from app.api.v1.schemas import PolicyRequest, SlaRuleRequest, UserCreateRequest, UserUpdateRequest
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.permissions import (
    ANALYTICS_READ,
    AUDIT_READ,
    CONFIG_MANAGE,
    DASHBOARD_VIEW,
    DEMO_RESET,
    DATA_EXPORT,
    DATA_IMPORT,
    SERVICE_CATALOG_MANAGE,
    USER_MANAGE,
)
from app.core.security import hash_password, new_code
from app.models import (
    Asset,
    AuditLog,
    Block,
    Branch,
    Campus,
    Case,
    Department,
    Document,
    Hostel,
    Location,
    Policy,
    Role,
    Room,
    Service,
    SlaRule,
    Staff,
    Student,
    User,
    Workflow,
    AcademicYear,
    Batch,
)
from app.models.enums import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    AuditEventType,
    CaseStatus,
    RoleKey,
    SlaState,
)
from app.services import analytics, audit, clock, data_transfer, documents, routing
from app.services import notices as notice_service
from app.services import sla as sla_service
from app.services.agents import OperationsAgent

router = APIRouter(tags=["admin"])

operations_agent = OperationsAgent()


# --- Command centre -------------------------------------------------------


@router.get("/admin/dashboard")
def dashboard(db: DbSession, user: CurrentUser, with_agent: bool = False):
    assert_permission(user, DASHBOARD_VIEW)
    payload = analytics.dashboard(db, campus_id=user.campus_id)
    if with_agent:
        payload["agent_briefing"] = operations_agent.briefing(db, user=user).as_dict()
    return payload


@router.get("/admin/cases")
def case_queue(
    db: DbSession,
    user: CurrentUser,
    status: str | None = None,
    department_id: int | None = None,
    priority: str | None = None,
    sla_state: str | None = None,
    unassigned: bool = False,
    unassigned_first: bool = True,
    q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Dense queue view for the desktop command centre."""
    assert_permission(user, DASHBOARD_VIEW)
    stmt = select(Case).where(Case.campus_id == user.campus_id)
    if status:
        stmt = stmt.where(Case.status == status)
    else:
        stmt = stmt.where(Case.status.in_(tuple(OPEN_STATUSES)))
    if department_id:
        stmt = stmt.where(Case.department_id == department_id)
    if priority:
        stmt = stmt.where(Case.priority == priority)
    if sla_state:
        stmt = stmt.where(Case.sla_state == sla_state)
    if unassigned:
        stmt = stmt.where(Case.assigned_staff_id.is_(None))
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Case.title).like(pattern),
                func.lower(Case.case_number).like(pattern),
                func.lower(Case.description).like(pattern),
            )
        )

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    ordering = Case.created_at.asc() if not unassigned_first else Case.assigned_staff_id.is_(None).desc()
    rows = db.scalars(stmt.order_by(ordering, Case.created_at.asc()).limit(limit).offset(offset)).all()

    from app.services.sla import evaluate_state

    now = clock.now()
    for case in rows:
        case.sla_state = evaluate_state(case, now=now)
    return {"total": total, "cases": [case_brief(db, case) for case in rows]}


@router.get("/admin/aging")
def aging(db: DbSession, user: CurrentUser):
    assert_permission(user, DASHBOARD_VIEW)
    buckets = analytics.ageing_buckets(db, campus_id=user.campus_id)
    oldest = db.scalars(
        select(Case)
        .where(Case.campus_id == user.campus_id, Case.status.notin_(tuple(CLOSED_STATUSES)))
        .order_by(Case.created_at.asc())
        .limit(15)
    ).all()
    return {
        "buckets": buckets,
        "oldest_open": [case_brief(db, case) for case in oldest],
    }


@router.get("/admin/recurring-issues")
def recurring_issues(db: DbSession, user: CurrentUser, window_days: int = Query(default=30, ge=1, le=365)):
    assert_permission(user, DASHBOARD_VIEW)
    issues = routing.recurring_issues(db, campus_id=user.campus_id, window_days=window_days)
    return {
        "window_days": window_days,
        "detected": len(issues),
        "issues": [
            {
                **issue,
                "last_incident": issue["last_incident"],
                "cases": [case_brief(db, case) for case in _cases_for_ids(db, issue["case_ids"])],
            }
            for issue in issues
        ],
        "method": "Deterministic: 3+ cases on the same asset, or same location+category, inside the window.",
    }


def _cases_for_ids(db, ids: list[int]) -> list[Case]:
    if not ids:
        return []
    return list(db.scalars(select(Case).where(Case.id.in_(ids)).order_by(Case.created_at.desc())).all())


@router.get("/admin/resolution-times")
def resolution_times(db: DbSession, user: CurrentUser, days: int = Query(default=30, ge=1, le=365)):
    assert_permission(user, ANALYTICS_READ)
    return {
        "window_days": days,
        "by_service": analytics.resolution_time_by_service(db, campus_id=user.campus_id, days=days),
        "sla": analytics.sla_compliance(db, campus_id=user.campus_id, days=days),
    }


@router.get("/admin/analytics")
def analytics_bundle(db: DbSession, user: CurrentUser, days: int = Query(default=30, ge=1, le=365)):
    assert_permission(user, ANALYTICS_READ)
    return {
        "volume": analytics.volume_over_time(db, campus_id=user.campus_id, days=min(days, 60)),
        "by_category": analytics.cases_by_category(db, campus_id=user.campus_id, days=days),
        "by_department": analytics.cases_by_department(db, campus_id=user.campus_id),
        "by_status": analytics.cases_by_status(db, campus_id=user.campus_id),
        "resolution_time": analytics.resolution_time_by_service(db, campus_id=user.campus_id, days=days),
        "sla_compliance": analytics.sla_compliance(db, campus_id=user.campus_id, days=days),
        "location_hotspots": analytics.location_hotspots(db, campus_id=user.campus_id, days=days),
        "staff_workload": analytics.staff_workload_detail(db, campus_id=user.campus_id),
        "notices": analytics.notice_effectiveness(db, campus_id=user.campus_id, days=days),
    }


@router.get("/admin/staff")
def staff_list(db: DbSession, user: CurrentUser):
    assert_permission(user, DASHBOARD_VIEW)
    return {"staff": analytics.staff_workload_detail(db, campus_id=user.campus_id)}


@router.get("/admin/departments")
def departments(db: DbSession, user: CurrentUser):
    assert_permission(user, DASHBOARD_VIEW)
    rows = db.scalars(
        select(Department).where(Department.campus_id == user.campus_id).order_by(Department.name)
    ).all()
    return {
        "departments": [
            {
                "id": d.id,
                "name": d.name,
                "code": d.code,
                "kind": d.kind,
                "sla_multiplier": d.sla_multiplier,
                "head_user_id": d.head_user_id,
                "open_cases": int(
                    db.scalar(
                        select(func.count(Case.id)).where(
                            Case.department_id == d.id, Case.status.in_(tuple(OPEN_STATUSES))
                        )
                    )
                    or 0
                ),
                "staff_count": int(
                    db.scalar(select(func.count(Staff.id)).where(Staff.department_id == d.id)) or 0
                ),
            }
            for d in rows
        ]
    }


# --- Infrastructure records ----------------------------------------------


@router.get("/admin/hostels")
def hostels(db: DbSession, user: CurrentUser):
    assert_permission(user, DASHBOARD_VIEW)
    rows = db.scalars(select(Hostel).where(Hostel.campus_id == user.campus_id).order_by(Hostel.name)).all()
    payload = []
    for hostel in rows:
        blocks = db.scalars(select(Block).where(Block.hostel_id == hostel.id)).all()
        occupants = int(
            db.scalar(
                select(func.count(Student.id)).where(
                    Student.hostel_id == hostel.id, Student.is_hosteller.is_(True)
                )
            )
            or 0
        )
        open_cases = int(
            db.scalar(
                select(func.count(Case.id)).where(
                    Case.campus_id == user.campus_id,
                    Case.status.in_(tuple(OPEN_STATUSES)),
                    Case.requester_student_id.in_(
                        select(Student.id).where(Student.hostel_id == hostel.id)
                    ),
                )
            )
            or 0
        )
        payload.append(
            {
                "id": hostel.id,
                "name": hostel.name,
                "code": hostel.code,
                "gender": hostel.gender,
                "warden_user_id": hostel.warden_user_id,
                "blocks": [{"id": b.id, "name": b.name, "code": b.code} for b in blocks],
                "hostellers": occupants,
                "open_cases": open_cases,
            }
        )
    return {"hostels": payload}


@router.get("/admin/rooms")
def rooms(db: DbSession, user: CurrentUser, hostel_id: int | None = None, limit: int = Query(default=100, le=500)):
    assert_permission(user, DASHBOARD_VIEW)
    stmt = select(Room).where(Room.campus_id == user.campus_id)
    if hostel_id:
        stmt = stmt.where(Room.hostel_id == hostel_id)
    rows = db.scalars(stmt.order_by(Room.hostel_id, Room.number).limit(limit)).all()
    return {
        "rooms": [
            {
                "id": r.id,
                "number": r.number,
                "hostel_id": r.hostel_id,
                "block_id": r.block_id,
                "floor": r.floor,
                "capacity": r.capacity,
                "occupant_count": r.occupant_count,
                "open_cases": int(
                    db.scalar(
                        select(func.count(Case.id)).where(
                            Case.status.in_(tuple(OPEN_STATUSES)),
                            Case.requester_student_id.in_(select(Student.id).where(Student.room_id == r.id)),
                        )
                    )
                    or 0
                ),
            }
            for r in rows
        ]
    }


@router.get("/admin/locations")
def locations(db: DbSession, user: CurrentUser, kind: str | None = None, limit: int = Query(default=200, le=500)):
    assert_permission(user, DASHBOARD_VIEW)
    stmt = select(Location).where(Location.campus_id == user.campus_id)
    if kind:
        stmt = stmt.where(Location.kind == kind)
    rows = db.scalars(stmt.order_by(Location.name).limit(limit)).all()
    return {
        "locations": [
            {
                **location_brief(location),
                "case_count": int(
                    db.scalar(select(func.count(Case.id)).where(Case.location_id == location.id)) or 0
                ),
                "open_case_count": int(
                    db.scalar(
                        select(func.count(Case.id)).where(
                            Case.location_id == location.id, Case.status.in_(tuple(OPEN_STATUSES))
                        )
                    )
                    or 0
                ),
                "qr_payload": location.code,
            }
            for location in rows
        ]
    }


@router.get("/admin/assets")
def assets(db: DbSession, user: CurrentUser, q: str | None = None, limit: int = Query(default=100, le=300)):
    assert_permission(user, DASHBOARD_VIEW)
    stmt = select(Asset).where(Asset.campus_id == user.campus_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Asset.code.ilike(pattern), Asset.name.ilike(pattern)))
    rows = db.scalars(stmt.order_by(Asset.code).limit(limit)).all()
    payload = []
    for asset in rows:
        cases = db.scalars(
            select(Case).where(Case.asset_id == asset.id).order_by(Case.created_at.desc()).limit(10)
        ).all()
        resolved = [c for c in cases if c.resolved_at]
        avg = (
            round(
                sum(
                    (clock.ensure_aware(c.resolved_at) - clock.ensure_aware(c.created_at)).total_seconds() / 60
                    for c in resolved
                )
                / len(resolved),
                1,
            )
            if resolved
            else None
        )
        payload.append(
            {
                "id": asset.id,
                "code": asset.code,
                "name": asset.name,
                "category": asset.category,
                "state": asset.state,
                "location": location_brief(asset.location),
                "incident_count": len(cases),
                "last_incident": cases[0].created_at if cases else None,
                "average_resolution_minutes": avg,
                "recent_case_numbers": [c.case_number for c in cases],
                "open_case_count": sum(1 for c in cases if c.status not in CLOSED_STATUSES),
            }
        )
    return {"assets": payload}


@router.get("/admin/audit")
def audit_log(
    db: DbSession,
    user: CurrentUser,
    event_type: str | None = None,
    case_id: int | None = None,
    entity_type: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    assert_permission(user, AUDIT_READ)
    stmt = select(AuditLog).where(AuditLog.campus_id == user.campus_id)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
    if case_id:
        stmt = stmt.where(AuditLog.case_id == case_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).all()
    return {
        "total": total,
        "entries": [
            {
                "id": entry.id,
                "event_type": entry.event_type,
                "at": entry.created_at,
                "actor_id": entry.actor_id,
                "actor_role": entry.actor_role,
                "actor_kind": entry.actor_kind,
                "case_id": entry.case_id,
                "entity_type": entry.entity_type,
                "entity_id": entry.entity_id,
                "source_channel": entry.source_channel,
                "device_id": entry.device_id,
                "idempotency_key": entry.idempotency_key,
                "payload": entry.payload,
            }
            for entry in rows
        ],
        "immutability_note": "Audit rows are append-only; the database rejects updates and deletes.",
    }


@router.get("/admin/audit/case/{case_id}")
def case_audit(case_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, AUDIT_READ)
    entries = db.scalars(
        select(AuditLog).where(AuditLog.case_id == case_id).order_by(AuditLog.created_at.asc())
    ).all()
    return {
        "case_id": case_id,
        "entries": [
            {
                "event_type": e.event_type,
                "at": e.created_at,
                "actor_role": e.actor_role,
                "actor_kind": e.actor_kind,
                "payload": e.payload,
            }
            for e in entries
        ],
    }


# --- People ---------------------------------------------------------------


@router.get("/admin/users")
def users(
    db: DbSession,
    user: CurrentUser,
    role: str | None = None,
    q: str | None = None,
    limit: int = Query(default=100, le=300),
):
    assert_permission(user, USER_MANAGE)
    stmt = select(User).where(User.campus_id == user.campus_id)
    if role:
        stmt = stmt.join(Role, Role.id == User.role_id).where(Role.key == role)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    rows = db.scalars(stmt.order_by(User.full_name).limit(limit)).all()
    return {"users": [user_brief(u) | {"is_active": u.is_active} for u in rows]}


@router.post("/admin/users", status_code=201)
def create_user(payload: UserCreateRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, USER_MANAGE)
    role = db.scalar(select(Role).where(Role.key == payload.role))
    if role is None:
        raise ValidationError("Unknown role.")
    email = payload.email.strip().lower()
    if db.scalar(select(User.id).where(User.campus_id == user.campus_id, User.email == email)):
        raise ConflictError("A user with that email already exists on this campus.")

    created = User(
        campus_id=user.campus_id,
        role_id=role.id,
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        language=payload.language,
        must_change_password=True,
    )
    db.add(created)
    db.flush()

    if role.key in {RoleKey.STAFF.value, RoleKey.DEPARTMENT_HEAD.value}:
        db.add(
            Staff(
                campus_id=user.campus_id,
                user_id=created.id,
                department_id=payload.department_id,
                designation=payload.staff_designation or "Technician",
                skills=payload.skills or [],
                employee_code=new_code(6),
            )
        )
    if role.key == RoleKey.STUDENT.value:
        roll = payload.student_roll_number or f"TMP{created.id}"
        if db.scalar(
            select(Student.id).where(Student.campus_id == user.campus_id, Student.roll_number == roll)
        ):
            raise ConflictError("A student with that roll number already exists.")
        db.add(
            Student(
                campus_id=user.campus_id,
                user_id=created.id,
                roll_number=roll,
                full_name=payload.full_name,
                branch_id=payload.branch_id,
                year_id=payload.year_id,
                batch_id=payload.batch_id,
                hostel_id=payload.hostel_id,
                is_hosteller=payload.hostel_id is not None,
            )
        )

    audit.record_audit(
        db,
        event_type="USER_CREATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="USER",
        entity_id=created.id,
        payload={"role": role.key, "email_present": True},
    )
    return user_profile(db, created)


@router.patch("/admin/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, USER_MANAGE)
    target = db.get(User, user_id)
    if target is None or target.campus_id != user.campus_id:
        raise NotFoundError("User not found.")
    if payload.role:
        role = db.scalar(select(Role).where(Role.key == payload.role))
        if role is None:
            raise ValidationError("Unknown role.")
        target.role_id = role.id
    for field in ("full_name", "phone", "language", "is_active"):
        value = getattr(payload, field)
        if value is not None:
            setattr(target, field, value)
    audit.record_audit(
        db,
        event_type="USER_UPDATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="USER",
        entity_id=target.id,
        payload={"changes": payload.model_dump(exclude_none=True)},
    )
    return user_profile(db, target)


@router.post("/admin/users/{user_id}/reset-password")
def reset_password(user_id: int, db: DbSession, user: CurrentUser, new_password: str = Query(min_length=8)):
    assert_permission(user, USER_MANAGE)
    target = db.get(User, user_id)
    if target is None or target.campus_id != user.campus_id:
        raise NotFoundError("User not found.")
    target.password_hash = hash_password(new_password)
    target.must_change_password = True
    audit.record_audit(
        db,
        event_type="USER_PASSWORD_RESET",
        campus_id=user.campus_id,
        actor=user,
        entity_type="USER",
        entity_id=target.id,
        payload={},
    )
    return {"updated": True, "must_change_password": True}


@router.get("/admin/students")
def students(
    db: DbSession,
    user: CurrentUser,
    hostel_id: int | None = None,
    branch_id: int | None = None,
    q: str | None = None,
    limit: int = Query(default=100, le=500),
):
    assert_permission(user, DASHBOARD_VIEW)
    stmt = select(Student).where(Student.campus_id == user.campus_id)
    if hostel_id:
        stmt = stmt.where(Student.hostel_id == hostel_id)
    if branch_id:
        stmt = stmt.where(Student.branch_id == branch_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Student.full_name.ilike(pattern), Student.roll_number.ilike(pattern)))
    rows = db.scalars(stmt.order_by(Student.roll_number).limit(limit)).all()
    return {"students": [student_profile(s) | {"has_app_account": s.user_id is not None} for s in rows]}


# --- Documents ------------------------------------------------------------


@router.get("/admin/documents")
def generated_documents(db: DbSession, user: CurrentUser, limit: int = Query(default=50, le=200)):
    assert_permission(user, DASHBOARD_VIEW)
    rows = documents.list_documents(db, campus_id=user.campus_id, limit=limit)
    return {
        "documents": [
            {
                "id": d.id,
                "kind": d.kind,
                "title": d.title,
                "serial_no": d.serial_no,
                "verification_code": d.verification_code,
                "issued_at": d.issued_at,
                "case_id": d.case_id,
                "student": d.student.full_name if d.student else None,
                "sha256": d.sha256,
                "download_url": f"/api/v1/documents/{d.id}/download",
            }
            for d in rows
        ]
    }


# --- Configuration --------------------------------------------------------


@router.get("/admin/services")
def admin_services(db: DbSession, user: CurrentUser):
    assert_permission(user, SERVICE_CATALOG_MANAGE)
    rows = db.scalars(
        select(Service).where(Service.campus_id == user.campus_id).order_by(Service.sort_order)
    ).all()
    return {"services": [service_brief(s) for s in rows]}


@router.post("/admin/sla-rules", status_code=201)
def upsert_sla_rule(payload: SlaRuleRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, CONFIG_MANAGE)
    rule = db.scalar(
        select(SlaRule).where(
            SlaRule.campus_id == user.campus_id,
            SlaRule.service_key.is_(payload.service_key) if payload.service_key is None else SlaRule.service_key == payload.service_key,
            SlaRule.priority == payload.priority,
        )
    )
    if rule is None:
        rule = SlaRule(campus_id=user.campus_id, service_key=payload.service_key, priority=payload.priority)
        db.add(rule)
    rule.target_minutes = payload.target_minutes
    rule.at_risk_ratio = payload.at_risk_ratio
    rule.escalate_to_role = payload.escalate_to_role
    rule.is_active = payload.is_active
    audit.record_audit(
        db,
        event_type="SLA_RULE_UPDATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="SLA_RULE",
        entity_id=rule.id,
        payload=payload.model_dump(),
    )
    return {"id": rule.id, "service_key": rule.service_key, "priority": rule.priority, "target_minutes": rule.target_minutes}


@router.post("/admin/policies", status_code=201)
def upsert_policy(payload: PolicyRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, CONFIG_MANAGE)
    policy = db.scalar(select(Policy).where(Policy.campus_id == user.campus_id, Policy.key == payload.key))
    if policy is None:
        policy = Policy(campus_id=user.campus_id, key=payload.key, name=payload.name)
        db.add(policy)
    policy.name = payload.name
    policy.description = payload.description
    policy.service_key = payload.service_key
    policy.effect = payload.effect
    policy.evaluation_order = payload.evaluation_order
    policy.conditions = payload.conditions
    policy.message = payload.message
    policy.is_active = payload.is_active
    audit.record_audit(
        db,
        event_type="POLICY_UPDATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="POLICY",
        entity_id=policy.id,
        payload=payload.model_dump(),
    )
    return {"id": policy.id, "key": policy.key, "effect": policy.effect}


# --- Operational maintenance --------------------------------------------


@router.post("/admin/sla/sweep")
def sweep_sla(db: DbSession, user: CurrentUser):
    """Recompute SLA state, raise breach events and alert the right people."""
    assert_permission(user, DASHBOARD_VIEW)
    result = sla_service.sweep_campus(db, campus_id=user.campus_id, actor=user)
    result["refreshed"] = analytics.refresh_sla_states(db, campus_id=user.campus_id)
    return result


@router.post("/admin/notices/expire")
def expire_notices(db: DbSession, user: CurrentUser):
    assert_permission(CONFIG_MANAGE)
    return notice_service.expire_due_notices(db, campus_id=user.campus_id)


@router.post("/admin/demo/time-travel")
def time_travel(db: DbSession, user: CurrentUser, minutes: int = Query(ge=1, le=100000)):
    """DEMO TOOL: advance the perceived clock so SLA ageing can be demonstrated
    without waiting hours. Affects this server process only."""
    assert_permission(user, DEMO_RESET)
    from datetime import timedelta

    from app.services import clock as clock_service

    clock_service.set_offset(clock_service.current_offset() + timedelta(minutes=minutes))
    audit.record_audit(
        db,
        event_type="DEMO_CLOCK_SHIFT",
        campus_id=user.campus_id,
        actor=user,
        entity_type="SYSTEM",
        entity_id="clock",
        payload={"minutes": minutes, "total_offset_minutes": clock_service.current_offset().total_seconds() / 60},
    )
    return {
        "offset_minutes": clock_service.current_offset().total_seconds() / 60,
        "perceived_now": clock_service.now(),
    }


@router.post("/admin/demo/time-reset")
def time_reset(db: DbSession, user: CurrentUser):
    assert_permission(user, DEMO_RESET)
    from app.services import clock as clock_service

    clock_service.reset()
    return {"offset_minutes": 0, "perceived_now": clock_service.now()}


@router.get("/admin/config/summary")
def config_summary(db: DbSession, user: CurrentUser):
    assert_permission(user, CONFIG_MANAGE)
    campus = db.get(Campus, user.campus_id)
    return {
        "campus": {"id": campus.id, "name": campus.name, "code": campus.code} if campus else None,
        "counts": {
            "users": int(db.scalar(select(func.count(User.id)).where(User.campus_id == user.campus_id)) or 0),
            "students": int(db.scalar(select(func.count(Student.id)).where(Student.campus_id == user.campus_id)) or 0),
            "staff": int(db.scalar(select(func.count(Staff.id)).where(Staff.campus_id == user.campus_id)) or 0),
            "departments": int(db.scalar(select(func.count(Department.id)).where(Department.campus_id == user.campus_id)) or 0),
            "hostels": int(db.scalar(select(func.count(Hostel.id)).where(Hostel.campus_id == user.campus_id)) or 0),
            "rooms": int(db.scalar(select(func.count(Room.id)).where(Room.campus_id == user.campus_id)) or 0),
            "locations": int(db.scalar(select(func.count(Location.id)).where(Location.campus_id == user.campus_id)) or 0),
            "assets": int(db.scalar(select(func.count(Asset.id)).where(Asset.campus_id == user.campus_id)) or 0),
            "services": int(db.scalar(select(func.count(Service.id)).where(Service.campus_id == user.campus_id)) or 0),
            "workflows": int(db.scalar(select(func.count(Workflow.id)).where(Workflow.campus_id == user.campus_id)) or 0),
            "policies": int(db.scalar(select(func.count(Policy.id)).where(Policy.campus_id == user.campus_id)) or 0),
            "sla_rules": int(db.scalar(select(func.count(SlaRule.id)).where(SlaRule.campus_id == user.campus_id)) or 0),
            "cases": int(db.scalar(select(func.count(Case.id)).where(Case.campus_id == user.campus_id)) or 0),
            "documents": int(db.scalar(select(func.count(Document.id)).where(Document.campus_id == user.campus_id)) or 0),
        },
        "reference_data": {
            "branches": [
                {"id": b.id, "name": b.name, "code": b.code}
                for b in db.scalars(select(Branch).where(Branch.campus_id == user.campus_id)).all()
            ],
            "years": [
                {"id": y.id, "name": y.name, "ordinal": y.ordinal}
                for y in db.scalars(select(AcademicYear).where(AcademicYear.campus_id == user.campus_id)).all()
            ],
            "batches": [
                {"id": b.id, "name": b.name}
                for b in db.scalars(select(Batch).where(Batch.campus_id == user.campus_id)).all()
            ],
            "roles": [
                {"key": r.key, "name": r.name}
                for r in db.scalars(select(Role).order_by(Role.id)).all()
            ],
        },
    }


# --- Data onboarding: CSV import and export -------------------------------


def _known_or_404(entity: str) -> None:
    if not data_transfer.known_entity(entity):
        raise NotFoundError(f"Unknown data set '{entity}'.")


@router.get("/admin/data/entities")
def data_entities(user: CurrentUser):
    """What can be imported/exported, in dependency order, with templates."""
    assert_permission(user, DATA_IMPORT)
    return {
        "entities": [
            {
                "name": spec.name,
                "columns": spec.columns,
                "required": spec.required,
                "note": spec.template_note,
                "dependency_order": index,
            }
            for index, spec in enumerate(data_transfer.ENTITIES.values(), start=1)
        ]
    }


@router.get("/admin/data/template/{entity}.csv")
def data_template(entity: str, user: CurrentUser):
    """A filled-in example a college can replace with its own rows."""
    _known_or_404(entity)
    assert_permission(user, DATA_IMPORT)
    return Response(
        content=data_transfer.template_csv(entity),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{entity}-template.csv"'},
    )


@router.get("/admin/data/export/{entity}.csv")
def data_export(entity: str, db: DbSession, user: CurrentUser):
    """Export the campus's current rows in the import template's shape."""
    _known_or_404(entity)
    assert_permission(user, DATA_EXPORT)
    body = data_transfer.export_csv(db, user.campus_id, entity)
    audit.record_audit(
        db,
        event_type=AuditEventType.DATA_EXPORT.value,
        campus_id=user.campus_id,
        actor=user,
        entity_type="DATA_EXPORT",
        payload={"entity": entity},
    )
    db.commit()
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{entity}.csv"'},
    )


@router.get("/admin/data/onboarding-pack")
def onboarding_pack(db: DbSession, user: CurrentUser):
    """A single zip a college downloads to start onboarding.

    Contains: the CSV templates, a README with the import order, and a minimal
    institution.json skeleton to edit. Everything a college needs to describe
    itself, in one file.
    """
    assert_permission(user, DATA_IMPORT)

    import json
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in data_transfer.ENTITIES:
            bundle.writestr(f"templates/{name}.csv", data_transfer.template_csv(name))

        order = "\n".join(
            f"{index}. templates/{spec.name}.csv   (required: {', '.join(spec.required)})"
            for index, spec in enumerate(data_transfer.ENTITIES.values(), start=1)
        )
        bundle.writestr(
            "README.md",
            "# Campus Relay - campus onboarding pack\n\n"
            "Import the CSV files from the administrator's **Institution setup** screen\n"
            "(or POST them to /api/v1/admin/data/import/<entity>). Import in this order,\n"
            "because later files reference earlier ones:\n\n"
            f"{order}\n\n"
            "Passwords for imported staff and students default to `Campus@2026` and\n"
            "they are asked to change it. Rows the server rejects are listed with their\n"
            "line number; nothing is dropped silently.\n\n"
            "Edit `institution.json` to set your name, monogram, city, colours and\n"
            "crest, then paste it into config/institution.json (or use the onboarding\n"
            "wizard) and press *Reload from disk*.\n",
        )

        from app.core.institution import institution

        current = institution()
        skeleton = {
            "schema_version": 1,
            "identity": {
                "name": "",
                "short_name": "",
                "monogram": "",
                "code": "",
                "kind": "Institute of Technology",
                "city": "",
                "region": "",
                "support_email": "",
                "support_phone": "",
            },
            "appearance": {
                "skin": current["appearance"]["skin"],
                "default_theme": "device",
                "accent": None,
                "crest_url": "",
                "direction": "ltr",
            },
        }
        bundle.writestr("institution.json", json.dumps(skeleton, indent=2) + "\n")

    audit.record_audit(
        db,
        event_type=AuditEventType.DATA_EXPORT.value,
        campus_id=user.campus_id,
        actor=user,
        entity_type="DATA_EXPORT",
        payload={"kind": "onboarding_pack"},
    )
    db.commit()
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="campus-relay-onboarding-pack.zip"'},
    )


@router.post("/admin/data/import/{entity}", status_code=201)
async def data_import(entity: str, db: DbSession, user: CurrentUser, file: UploadFile = File(...)):
    """Import a CSV, reporting per-row failures rather than failing silently."""
    _known_or_404(entity)
    assert_permission(user, DATA_IMPORT)
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise ValidationError("That CSV is larger than 2 MB; split it and import in parts.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValidationError("The file must be UTF-8 encoded CSV.") from None

    result = data_transfer.import_csv(db, user.campus_id, entity, text)
    if result["imported"] == 0 and result["failed"] == 0 and not result["errors"]:
        raise ValidationError("The file contained no data rows.")

    audit.record_audit(
        db,
        event_type=AuditEventType.DATA_IMPORT.value,
        campus_id=user.campus_id,
        actor=user,
        entity_type="DATA_IMPORT",
        payload={"entity": entity, "imported": result["imported"], "failed": result["failed"]},
    )
    db.commit()
    return result
