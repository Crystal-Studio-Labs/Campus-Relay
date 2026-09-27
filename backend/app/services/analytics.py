"""Administrator analytics.

Every number here is computed from rows in Postgres. Nothing is estimated,
sampled or invented: if there is no data, the value is zero or null and the UI
is expected to say so.
"""

from datetime import timedelta

from sqlalchemy import case as sql_case, func, select
from sqlalchemy.orm import Session

from app.models import (
    Case,
    Department,
    Location,
    Notice,
    NoticeRecipient,
    Staff,
    Workflow,
)
from app.models.enums import (
    CLOSED_STATUSES,
    CaseStatus,
    NotificationState,
    Priority,
    SlaState,
    VerificationState,
)
from app.services import clock, routing
from app.services.sla import evaluate_state

AGE_BUCKETS: list[tuple[str, int, int | None]] = [
    ("< 4h", 0, 240),
    ("4-24h", 240, 1440),
    ("1-3d", 1440, 4320),
    ("> 3d", 4320, None),
]


def _count(db: Session, *conditions) -> int:
    return int(db.scalar(select(func.count(Case.id)).where(*conditions)) or 0)


def dashboard(db: Session, *, campus_id: int) -> dict:
    now = clock.now()
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    open_count = _count(
        db,
        Case.campus_id == campus_id,
        Case.status.notin_(tuple(CLOSED_STATUSES)),
    )
    new_today = _count(db, Case.campus_id == campus_id, Case.created_at >= start_of_today)
    breached = _count(
        db,
        Case.campus_id == campus_id,
        Case.sla_state == SlaState.BREACHED.value,
        Case.status.notin_(tuple(CLOSED_STATUSES)),
    )
    at_risk = _count(
        db,
        Case.campus_id == campus_id,
        Case.sla_state == SlaState.AT_RISK.value,
        Case.status.notin_(tuple(CLOSED_STATUSES)),
    )
    awaiting_approval = _count(
        db,
        Case.campus_id == campus_id,
        Case.status == CaseStatus.WAITING_FOR_APPROVAL.value,
    )
    in_progress = _count(
        db, Case.campus_id == campus_id, Case.status == CaseStatus.IN_PROGRESS.value
    )
    resolved_today = _count(
        db,
        Case.campus_id == campus_id,
        Case.resolved_at.is_not(None),
        Case.resolved_at >= start_of_today,
    )
    reopened = _count(db, Case.campus_id == campus_id, Case.reopen_count > 0)
    unassigned = _count(
        db,
        Case.campus_id == campus_id,
        Case.assigned_staff_id.is_(None),
        Case.status.notin_(tuple(CLOSED_STATUSES)),
    )
    awaiting_verification = _count(
        db,
        Case.campus_id == campus_id,
        Case.verification_state == VerificationState.PENDING.value,
        Case.status == CaseStatus.VERIFICATION_REQUIRED.value,
    )

    avg_resolution = db.scalar(
        select(
            func.avg(
                func.extract("epoch", Case.resolved_at - Case.created_at) / 60.0
            )
        ).where(Case.campus_id == campus_id, Case.resolved_at.is_not(None))
    )

    recurring = routing.recurring_issues(db, campus_id=campus_id, window_days=30, minimum=3)

    return {
        "generated_at": now,
        "open_cases": open_count,
        "new_today": new_today,
        "sla_breaches": breached,
        "sla_at_risk": at_risk,
        "awaiting_approval": awaiting_approval,
        "awaiting_verification": awaiting_verification,
        "in_progress": in_progress,
        "resolved_today": resolved_today,
        "reopened_cases": reopened,
        "unassigned_cases": unassigned,
        "average_resolution_minutes": round(float(avg_resolution), 1) if avg_resolution else None,
        "recurring_issue_count": len(recurring),
        "recurring_issues": recurring[:10],
        "by_status": cases_by_status(db, campus_id=campus_id),
        "by_category": cases_by_category(db, campus_id=campus_id),
        "by_department": cases_by_department(db, campus_id=campus_id),
        "ageing": ageing_buckets(db, campus_id=campus_id),
        "staff_workload": routing.staff_workload(db, campus_id=campus_id),
        "sla_compliance": sla_compliance(db, campus_id=campus_id, days=30),
    }


def cases_by_status(db: Session, *, campus_id: int) -> list[dict]:
    rows = db.execute(
        select(Case.status, func.count(Case.id))
        .where(Case.campus_id == campus_id)
        .group_by(Case.status)
        .order_by(func.count(Case.id).desc())
    ).all()
    return [{"key": status, "count": int(count)} for status, count in rows]


def cases_by_category(db: Session, *, campus_id: int, days: int = 30) -> list[dict]:
    since = clock.now() - timedelta(days=days)
    rows = db.execute(
        select(Case.category, Case.service_key, func.count(Case.id))
        .where(Case.campus_id == campus_id, Case.created_at >= since)
        .group_by(Case.category, Case.service_key)
        .order_by(func.count(Case.id).desc())
    ).all()
    return [
        {"category": category, "service_key": service_key, "count": int(count)}
        for category, service_key, count in rows
    ]


def cases_by_department(db: Session, *, campus_id: int) -> list[dict]:
    rows = db.execute(
        select(
            Department.id,
            Department.name,
            func.count(Case.id),
            func.sum(
                sql_case((Case.status.notin_(tuple(CLOSED_STATUSES)), 1), else_=0)
            ),
        )
        .join(Case, Case.department_id == Department.id, isouter=True)
        .where(Department.campus_id == campus_id)
        .group_by(Department.id, Department.name)
        .order_by(func.count(Case.id).desc())
    ).all()
    return [
        {
            "department_id": dept_id,
            "name": name,
            "total_cases": int(total or 0),
            "open_cases": int(open_count or 0),
        }
        for dept_id, name, total, open_count in rows
    ]


def ageing_buckets(db: Session, *, campus_id: int) -> list[dict]:
    """Complaint ageing: how long the currently open work has been open."""
    now = clock.now()
    cases = db.scalars(
        select(Case).where(
            Case.campus_id == campus_id,
            Case.status.notin_(tuple(CLOSED_STATUSES)),
        )
    ).all()

    buckets = {label: 0 for label, _, _ in AGE_BUCKETS}
    for item in cases:
        created = clock.ensure_aware(item.created_at)
        if created is None:
            continue
        minutes = (now - created).total_seconds() / 60.0
        for label, low, high in AGE_BUCKETS:
            if minutes >= low and (high is None or minutes < high):
                buckets[label] += 1
                break
    return [{"label": label, "count": buckets[label]} for label, _, _ in AGE_BUCKETS]


def sla_compliance(db: Session, *, campus_id: int, days: int = 30) -> dict:
    since = clock.now() - timedelta(days=days)
    total = int(
        db.scalar(
            select(func.count(Case.id)).where(Case.campus_id == campus_id, Case.created_at >= since)
        )
        or 0
    )
    met = int(
        db.scalar(
            select(func.count(Case.id)).where(
                Case.campus_id == campus_id,
                Case.created_at >= since,
                Case.sla_state == SlaState.MET.value,
            )
        )
        or 0
    )
    missed = int(
        db.scalar(
            select(func.count(Case.id)).where(
                Case.campus_id == campus_id,
                Case.created_at >= since,
                Case.sla_state == SlaState.MISSED.value,
            )
        )
        or 0
    )
    breached_open = int(
        db.scalar(
            select(func.count(Case.id)).where(
                Case.campus_id == campus_id,
                Case.created_at >= since,
                Case.sla_state == SlaState.BREACHED.value,
            )
        )
        or 0
    )
    resolved = met + missed
    return {
        "window_days": days,
        "cases": total,
        "resolved_within_target": met,
        "resolved_after_target": missed,
        "open_past_target": breached_open,
        "compliance_rate": round(met / resolved, 3) if resolved else None,
    }


def volume_over_time(db: Session, *, campus_id: int, days: int = 14) -> list[dict]:
    since = clock.now() - timedelta(days=days)
    rows = db.execute(
        select(
            func.date_trunc("day", Case.created_at).label("day"),
            func.count(Case.id),
            func.sum(sql_case((Case.resolved_at.is_not(None), 1), else_=0)),
        )
        .where(Case.campus_id == campus_id, Case.created_at >= since)
        .group_by("day")
        .order_by("day")
    ).all()
    return [
        {
            "day": day.date().isoformat() if hasattr(day, "date") else str(day),
            "created": int(created),
            "resolved": int(resolved or 0),
        }
        for day, created, resolved in rows
    ]


def resolution_time_by_service(db: Session, *, campus_id: int, days: int = 30) -> list[dict]:
    since = clock.now() - timedelta(days=days)
    rows = db.execute(
        select(
            Case.service_key,
            func.avg(func.extract("epoch", Case.resolved_at - Case.created_at) / 60.0),
            func.count(Case.id),
        )
        .where(
            Case.campus_id == campus_id,
            Case.resolved_at.is_not(None),
            Case.created_at >= since,
        )
        .group_by(Case.service_key)
        .order_by(func.count(Case.id).desc())
    ).all()
    return [
        {
            "service_key": service_key,
            "average_minutes": round(float(avg or 0), 1),
            "resolved_cases": int(count),
        }
        for service_key, avg, count in rows
    ]


def location_hotspots(db: Session, *, campus_id: int, days: int = 30, limit: int = 10) -> list[dict]:
    since = clock.now() - timedelta(days=days)
    rows = db.execute(
        select(Location.id, Location.code, Location.name, func.count(Case.id))
        .join(Case, Case.location_id == Location.id)
        .where(Case.campus_id == campus_id, Case.created_at >= since)
        .group_by(Location.id, Location.code, Location.name)
        .order_by(func.count(Case.id).desc())
        .limit(limit)
    ).all()
    return [
        {"location_id": loc_id, "code": code, "name": name, "case_count": int(count)}
        for loc_id, code, name, count in rows
    ]


def staff_workload_detail(db: Session, *, campus_id: int) -> list[dict]:
    rows = routing.staff_workload(db, campus_id=campus_id)
    for row in rows:
        staff = db.get(Staff, row["staff_id"])
        row["designation"] = staff.designation if staff else None
        department = db.get(Department, row["department_id"]) if row["department_id"] else None
        row["department"] = department.name if department else None
        overdue = db.scalar(
            select(func.count(Case.id)).where(
                Case.assigned_staff_id == row["staff_id"],
                Case.status.notin_(tuple(CLOSED_STATUSES)),
                Case.sla_state.in_((SlaState.BREACHED.value, SlaState.AT_RISK.value)),
            )
        )
        row["at_risk_or_breached"] = int(overdue or 0)
    return rows


def notice_effectiveness(db: Session, *, campus_id: int, days: int = 30) -> dict:
    since = clock.now() - timedelta(days=days)
    notices = db.scalars(
        select(Notice).where(Notice.campus_id == campus_id, Notice.created_at >= since)
    ).all()
    per_notice = []
    total_sent = total_read = total_ack = total_actioned = 0
    for notice in notices:
        row = db.execute(
            select(
                func.count(NoticeRecipient.id),
                func.sum(sql_case((NoticeRecipient.read_at.is_not(None), 1), else_=0)),
                func.sum(sql_case((NoticeRecipient.acknowledged_at.is_not(None), 1), else_=0)),
                func.sum(sql_case((NoticeRecipient.action_completed_at.is_not(None), 1), else_=0)),
            ).where(NoticeRecipient.notice_id == notice.id)
        ).one()
        sent, read, ack, actioned = (int(x or 0) for x in row)
        total_sent += sent
        total_read += read
        total_ack += ack
        total_actioned += actioned
        per_notice.append(
            {
                "notice_id": notice.id,
                "title": notice.title,
                "type": notice.notice_type,
                "sent": sent,
                "read": read,
                "acknowledged": ack,
                "actioned": actioned,
                "read_rate": round(read / sent, 3) if sent else 0.0,
                "action_rate": round(actioned / sent, 3) if sent else 0.0,
            }
        )
    per_notice.sort(key=lambda r: (-r["sent"], -r["notice_id"]))
    return {
        "window_days": days,
        "notices": len(notices),
        "sent": total_sent,
        "read": total_read,
        "acknowledged": total_ack,
        "actioned": total_actioned,
        "read_rate": round(total_read / total_sent, 3) if total_sent else None,
        "action_rate": round(total_actioned / total_sent, 3) if total_sent else None,
        "per_notice": per_notice[:20],
    }


def refresh_sla_states(db: Session, *, campus_id: int) -> dict:
    """Recompute SLA state for open cases without writing spurious events."""
    cases = db.scalars(
        select(Case).where(
            Case.campus_id == campus_id,
            Case.status.notin_(tuple(CLOSED_STATUSES)),
        )
    ).all()
    changed = 0
    now = clock.now()
    for item in cases:
        new_state = evaluate_state(item, now=now)
        if item.sla_state != new_state:
            item.sla_state = new_state
            changed += 1
    return {"checked": len(cases), "changed": changed}


def workflow_catalog(db: Session, *, campus_id: int) -> list[dict]:
    workflows = db.scalars(
        select(Workflow).where(Workflow.campus_id == campus_id).order_by(Workflow.name)
    ).all()
    return [
        {
            "id": wf.id,
            "key": wf.key,
            "name": wf.name,
            "description": wf.description,
            "is_active": wf.is_active,
            "steps": [
                {
                    "key": step.key,
                    "name": step.name,
                    "type": step.step_type,
                    "responsible_role": step.responsible_role,
                    "sla_minutes": step.sla_minutes,
                    "transitions": step.transitions or {},
                    "requires_note": step.requires_note,
                }
                for step in wf.steps
            ],
        }
        for wf in workflows
    ]
