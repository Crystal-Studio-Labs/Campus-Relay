"""SLA engine: target times, ageing, at-risk and breach detection.

Targets are configuration (`sla_rules`). The values shipped in the seed are
explicitly DEMO values, matching the brief's example (NORMAL 24h, HIGH 8h,
CRITICAL 2h) and are meant to be replaced with institution-provided numbers.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Case, SlaRule, User
from app.models.enums import AuditEventType, Priority, RoleKey, SlaState
from app.services import clock

DEMO_DEFAULTS: dict[str, int] = {
    Priority.LOW.value: 4320,  # 72h
    Priority.NORMAL.value: 1440,  # 24h
    Priority.HIGH.value: 480,  # 8h
    Priority.CRITICAL.value: 120,  # 2h
    Priority.URGENT.value: 60,  # 1h
}

SERVICE_FALLBACK_MINUTES: dict[str, int] = {
    "HOSTEL_COMPLAINT": 1440,
    "MESS_COMPLAINT": 720,
    "BONAFIDE_CERTIFICATE": 2880,
    "LEAVE_REQUEST": 720,
    "GATE_PASS": 240,
    "FEE_QUERY": 1440,
    "ROOM_CHANGE": 2880,
    "ACADEMIC_QUERY": 1440,
    "DOCUMENT_REQUEST": 2880,
    "FACILITY_REQUEST": 1440,
    "LOST_ITEM": 1440,
    "VISITOR_REQUEST": 240,
}


def resolve_target_minutes(
    db: Session, *, campus_id: int, service_key: str, priority: str
) -> int:
    """Most specific matching rule wins: service+priority > priority > defaults."""
    from app.models import Service

    rule = db.scalar(
        select(SlaRule).where(
            SlaRule.campus_id == campus_id,
            SlaRule.service_key == service_key,
            SlaRule.priority == priority,
            SlaRule.is_active.is_(True),
        )
    )
    if rule:
        minutes = rule.target_minutes
    else:
        rule = db.scalar(
            select(SlaRule).where(
                SlaRule.campus_id == campus_id,
                SlaRule.service_key.is_(None),
                SlaRule.priority == priority,
                SlaRule.is_active.is_(True),
            )
        )
        minutes = rule.target_minutes if rule else DEMO_DEFAULTS.get(priority, 1440)

    # Per-department multiplier lets an understaffed department be given slack
    # without inventing a second SLA table.
    service = db.scalar(
        select(Service).where(Service.campus_id == campus_id, Service.key == service_key)
    )
    if service and service.department_id:
        from app.models import Department

        dept = db.get(Department, service.department_id)
        if dept and dept.sla_multiplier and dept.sla_multiplier != 1.0:
            minutes = int(minutes * dept.sla_multiplier)

    return minutes


def apply_sla(db: Session, case: Case, *, from_time=None) -> Case:
    """Stamp due_at and initial sla_state on a case."""
    start = clock.ensure_aware(from_time) or clock.now()
    minutes = case.sla_minutes or resolve_target_minutes(
        db, campus_id=case.campus_id, service_key=case.service_key, priority=case.priority
    )
    case.sla_minutes = minutes
    case.due_at = start + timedelta(minutes=minutes)
    case.sla_state = evaluate_state(case, now=start)
    return case


def evaluate_state(case: Case, *, now=None) -> str:
    now = clock.ensure_aware(now) or clock.now()
    due = clock.ensure_aware(case.due_at)
    if due is None:
        return SlaState.NO_SLA.value
    if case.status in {"RESOLVED", "VERIFICATION_REQUIRED", "CLOSED"}:
        resolved = clock.ensure_aware(case.resolved_at) or now
        return SlaState.MET.value if resolved <= due else SlaState.MISSED.value
    if case.status == "CANCELLED":
        return SlaState.NO_SLA.value

    remaining = (due - now).total_seconds() / 60.0
    if remaining <= 0:
        return SlaState.BREACHED.value
    target = case.sla_minutes or 1440
    if remaining <= max(target * 0.25, 5):
        return SlaState.AT_RISK.value
    return SlaState.ON_TIME.value


def refresh_case_sla(db: Session, case: Case, *, now=None) -> Case:
    new_state = evaluate_state(case, now=now)
    case.sla_state = new_state
    return case


def sweep_campus(db: Session, *, campus_id: int, actor: User | None = None) -> dict:
    """Recompute SLA state for open cases and report transitions.

    Called by the dashboard endpoint and the demo tooling. Returns counts so the
    UI can show what changed rather than inventing numbers.
    """
    from app.models.enums import OPEN_STATUSES
    from app.services import notifications as notification_service

    now = clock.now()
    cases = list(
        db.scalars(
            select(Case).where(
                Case.campus_id == campus_id,
                Case.status.in_(tuple(OPEN_STATUSES)),
                Case.due_at.is_not(None),
            )
        ).all()
    )

    breached: list[Case] = []
    at_risk: list[Case] = []

    for case in cases:
        previous = case.sla_state
        current = evaluate_state(case, now=now)
        if current == previous:
            continue
        case.sla_state = current
        if current == SlaState.BREACHED.value:
            case.breached_at = case.breached_at or now
            breached.append(case)
        elif current == SlaState.AT_RISK.value and previous != SlaState.BREACHED.value:
            case.at_risk_notified_at = case.at_risk_notified_at or now
            at_risk.append(case)

    for case in breached:
        _raise_breach(db, case)
    for case in at_risk:
        _raise_at_risk(db, case, actor=actor)

    return {"checked": len(cases), "breached": len(breached), "at_risk": len(at_risk)}


def _raise_breach(db: Session, case: Case) -> None:
    from app.services import audit

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.SLA_BREACHED.value,
        actor_role=RoleKey.ADMIN.value,
        payload={"due_at": case.due_at.isoformat() if case.due_at else None},
    )
    case.escalation_level = max(case.escalation_level, 1)


def _raise_at_risk(db: Session, case: Case, *, actor: User | None = None) -> None:
    from app.services import audit, notifications as notification_service

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.SLA_AT_RISK.value,
        actor=actor,
        payload={"due_at": case.due_at.isoformat() if case.due_at else None},
    )
    notification_service.notify_case_stakeholders(
        db,
        case=case,
        category="SLA_ALERT",
        title=f"SLA at risk: {case.case_number}",
        body=f"{case.title} is approaching its resolution target.",
        priority=Priority.HIGH.value,
        dedupe_key=f"sla-at-risk:{case.id}",
    )
