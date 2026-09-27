"""The Campus Case Engine.

One engine drives every campus request:

    REQUEST -> CASE -> POLICY -> WORKFLOW -> APPROVAL -> SLA -> ASSIGNMENT
            -> NOTIFICATION -> RESOLUTION -> VERIFICATION -> AUDIT

Nothing here is service-specific. Service differences come from the service
catalog (form schema, workflow, department, SLA) and the policy table, so a new
campus service is configuration rather than a new application.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import (
    ConflictError,
    InvalidTransitionError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.models import (
    AcademicYear,
    Asset,
    Batch,
    Branch,
    Case,
    CaseApproval,
    CaseAssignment,
    CaseAttachment,
    CaseComment,
    GatePass,
    Hostel,
    Location,
    Room,
    Service,
    Staff,
    Student,
    User,
)
from app.models.enums import (
    ApprovalState,
    AuditEventType,
    CaseStatus,
    DedupeState,
    GatePassState,
    LocationKind,
    NotificationCategory,
    Priority,
    RoleKey,
    ServiceCategory,
    SlaState,
    SourceChannel,
    VerificationState,
)
from app.models.enums_map import can_transition
from app.services import audit, clock, notifications, policy, routing, sla as sla_service
from app.services.workflow import (
    TOKEN_CLOSED,
    TOKEN_REOPENED,
    STATUS_TOKENS,
    WorkflowRunner,
    status_for_step,
)


@dataclass
class CaseDraft:
    """Everything a caller can say about a new case."""

    service_key: str
    description: str = ""
    title: str | None = None
    category: str | None = None
    subcategory: str | None = None
    priority: str | None = None
    location_id: int | None = None
    location_code: str | None = None
    asset_id: int | None = None
    state_payload: dict = field(default_factory=dict)
    source_channel: str = SourceChannel.PWA.value
    language: str = "en"
    client_ref: str | None = None
    captured_offline_at: datetime | None = None
    device_uid: str | None = None
    on_behalf_student_id: int | None = None
    requester_role_override: str | None = None


@dataclass
class CaseResult:
    case: Case
    created: bool
    duplicate_of: Case | None = None
    routing_explanation: list[str] = field(default_factory=list)
    intake: dict = field(default_factory=dict)


# --- Lookups --------------------------------------------------------------


def service_by_key(db: Session, *, campus_id: int, key: str) -> Service:
    service = db.scalar(
        select(Service).where(
            Service.campus_id == campus_id, Service.key == key, Service.is_active.is_(True)
        )
    )
    if service is None:
        raise NotFoundError(f"Unknown or disabled service '{key}'.")
    return service


def resolve_location(
    db: Session, *, campus_id: int, location_id: int | None, location_code: str | None
) -> Location | None:
    if location_id is not None:
        location = db.get(Location, location_id)
        if location is None or location.campus_id != campus_id:
            raise NotFoundError("That location does not exist on this campus.")
        return location
    if location_code:
        location = db.scalar(
            select(Location).where(
                Location.campus_id == campus_id, Location.code == location_code
            )
        )
        if location is None:
            raise NotFoundError("That QR code is not recognised on this campus.")
        if not location.is_active:
            raise ValidationError("That location is no longer in service.")
        return location
    return None


def next_case_number(db: Session, *, campus_id: int, case_id: int, year: int) -> str:
    return f"CR-{year}-{case_id:05d}"


def _validate_form(
    service: Service,
    state_payload: dict,
    *,
    description: str = "",
    has_location: bool = False,
) -> None:
    """Reject submissions missing required catalog fields.

    Most catalog fields live in `state_payload`, but `description` and
    `location_id` are first-class columns, so they are validated from the case
    itself rather than duplicated into the payload.
    """
    special = {
        "description": bool((description or "").strip()),
        "location_id": has_location,
        "location_code": has_location,
    }
    missing: list[str] = []
    for definition in service.form_schema or []:
        name = definition.get("name")
        if not name or not definition.get("required"):
            continue
        if name in special:
            satisfied = special[name]
        else:
            satisfied = state_payload.get(name) not in (None, "", [])
        if not satisfied:
            missing.append(definition.get("label") or name)
    if missing:
        raise ValidationError(
            "Some required details are missing.",
            details={"missing_fields": missing},
        )


def _requester_student(db: Session, user: User | None, student_id: int | None) -> Student | None:
    if student_id is not None:
        student = db.get(Student, student_id)
        if student is None:
            raise NotFoundError("Student record not found.")
        return student
    if user is None:
        return None
    return db.scalar(select(Student).where(Student.user_id == user.id))


def _build_facts_context(
    db: Session,
    *,
    case: Case | None,
    requester: User | None,
    payload: dict,
    actor: User | None,
    description: str = "",
    has_location: bool = False,
) -> dict:
    """Assemble the fact bundle policies are allowed to reference.

    Facts are resolved here, server-side. A client cannot assert them.
    """
    facts = policy.build_facts(db, case=case, requester=requester, state_payload=payload)
    facts["has_location"] = has_location or bool(case and case.location_id)
    facts["description_length"] = len((description or "").strip())
    return {
        "facts": facts,
        "state_payload": payload or {},
        "description": description or (case.description if case else ""),
        "actor": {
            "id": actor.id if actor else None,
            "role": actor.role_key if actor else None,
        },
        "requester": {
            "id": requester.id if requester else None,
            "role": requester.role_key if requester else None,
        },
    }


# --- Creation -------------------------------------------------------------


def create_case(db: Session, *, actor: User, draft: CaseDraft) -> CaseResult:
    """Create a campus case, route it, and start its workflow.

    Idempotent when `client_ref` is supplied: replaying a queued offline
    submission returns the original case instead of creating a second one.
    """
    if draft.client_ref:
        existing = db.scalar(
            select(Case).where(
                Case.campus_id == actor.campus_id, Case.client_ref == draft.client_ref
            )
        )
        if existing is not None:
            return CaseResult(case=existing, created=False)

    service = service_by_key(db, campus_id=actor.campus_id, key=draft.service_key)

    # Who may raise this service?
    allowed_roles = set(service.allowed_requester_roles or [])
    acting_on_behalf = draft.on_behalf_student_id is not None
    if acting_on_behalf:
        allowed_roles = allowed_roles | {RoleKey.HELPDESK_OPERATOR.value, RoleKey.ADMIN.value, RoleKey.SUPER_ADMIN.value, RoleKey.WARDEN.value}
    if allowed_roles and actor.role_key not in allowed_roles:
        raise PermissionDeniedError(
            "Your role cannot raise this type of request.",
            details={"service": service.key},
        )

    requester = actor
    requester_student = _requester_student(db, actor, draft.on_behalf_student_id)
    if acting_on_behalf and requester_student and requester_student.user_id:
        requester = db.get(User, requester_student.user_id) or actor

    location = resolve_location(
        db, campus_id=actor.campus_id, location_id=draft.location_id, location_code=draft.location_code
    )
    asset = db.get(Asset, draft.asset_id) if draft.asset_id else None
    if asset and asset.campus_id != actor.campus_id:
        raise NotFoundError("That asset does not exist on this campus.")

    _validate_form(
        service,
        draft.state_payload,
        description=draft.description,
        has_location=location is not None,
    )

    # --- Classification (deterministic rules; the Intake agent reuses this) ---
    intake = routing.classify(
        draft.description,
        service_key=service.key,
        title=draft.title,
        location=location,
    )

    complaint_like = service.category in {
        ServiceCategory.HOSTEL.value,
        ServiceCategory.FACILITY.value,
        ServiceCategory.MESS.value,
    }
    category = draft.category or (intake.category if complaint_like else service.category)
    subcategory = draft.subcategory or (intake.subcategory if complaint_like else None)
    priority = draft.priority or intake.priority
    if priority not in {p.value for p in Priority}:
        raise ValidationError("Unknown priority.")

    # --- Policy gate (server-side, before anything is written) ---
    context = _build_facts_context(
        db,
        case=None,
        requester=requester,
        payload=draft.state_payload,
        actor=actor,
        description=draft.description,
        has_location=location is not None,
    )
    decision = policy.evaluate(
        db, campus_id=actor.campus_id, service_key=service.key, context=context
    )
    decision.raise_if_denied()

    # --- Duplicate detection ---
    duplicate: Case | None = None
    if complaint_like:
        duplicate = routing.find_duplicate(
            db,
            campus_id=actor.campus_id,
            service_key=service.key,
            category=category,
            location_id=location.id if location else None,
        )
    group_key = routing.duplicate_group_key(
        service_key=service.key,
        category=category,
        location_id=location.id if location else None,
        asset_id=asset.id if asset else None,
    )

    now = clock.now()
    case = Case(
        campus_id=actor.campus_id,
        case_number="PENDING",
        requester_id=requester.id if requester else None,
        requester_role=draft.requester_role_override or (requester.role_key if requester else RoleKey.STUDENT.value),
        requester_student_id=requester_student.id if requester_student else None,
        created_by_id=actor.id,
        service_id=service.id,
        service_key=service.key,
        category=category,
        subcategory=subcategory,
        title=(draft.title or intake.title)[:200],
        description=draft.description,
        location_id=location.id if location else None,
        asset_id=asset.id if asset else None,
        department_id=service.department_id,
        priority=priority,
        status=CaseStatus.SUBMITTED.value,
        source_channel=draft.source_channel,
        language=draft.language,
        state_payload=draft.state_payload or {},
        duplicate_group_id=group_key,
        dedupe_state=DedupeState.SUSPECTED.value if duplicate else DedupeState.NONE.value,
        parent_case_id=duplicate.id if duplicate else None,
        dedupe_score=0.75 if duplicate else None,
        client_ref=draft.client_ref,
        captured_offline_at=draft.captured_offline_at,
        last_activity_at=now,
    )
    db.add(case)
    db.flush()
    case.case_number = next_case_number(
        db, campus_id=actor.campus_id, case_id=case.id, year=now.year
    )

    sla_service.apply_sla(db, case, from_time=now)

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.CASE_CREATED.value,
        actor=actor,
        to_status=case.status,
        source_channel=draft.source_channel,
        device_uid=draft.device_uid,
        idempotency_key=f"create:{draft.client_ref}" if draft.client_ref else None,
        payload={
            "service_key": service.key,
            "title": case.title,
            "priority": case.priority,
            "source_channel": draft.source_channel,
            "captured_offline_at": draft.captured_offline_at.isoformat()
            if draft.captured_offline_at
            else None,
            "on_behalf_of": requester_student.id if acting_on_behalf and requester_student else None,
        },
    )
    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.CASE_CLASSIFIED.value,
        actor=actor,
        actor_kind="SYSTEM",
        payload={
            "engine": intake.engine,
            "category": category,
            "priority": priority,
            "confidence": intake.confidence,
            "signals": intake.signals,
            "missing_information": intake.missing_information,
            "policies_evaluated": decision.evaluated,
        },
    )

    if duplicate is not None:
        notifications.create_notification(
            db,
            user=requester,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"Possible duplicate of {duplicate.case_number}",
            body="A similar recent report exists at this location. Staff can merge them.",
            action_label="View original",
            action_type="OPEN_CASE",
            action_target=f"/cases/{duplicate.id}",
            case_id=case.id,
        )

    # --- Routing ---
    recommendation = routing.recommend_routing(
        db,
        campus_id=actor.campus_id,
        service=service,
        category=category,
        priority=priority,
        location=location,
        service_key=service.key,
    )
    case.department_id = recommendation.department_id or case.department_id
    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.CASE_ROUTED.value,
        actor_kind="SYSTEM",
        actor=actor,
        to_status=case.status,
        payload={
            "engine": recommendation.engine,
            "department_id": recommendation.department_id,
            "department_name": recommendation.department_name,
            "sla_minutes": recommendation.sla_minutes,
            "explanation": recommendation.explanation,
        },
    )

    # --- Workflow entry ---
    _transition(db, case, CaseStatus.VALIDATING.value, actor=actor, actor_kind="SYSTEM")
    _transition(db, case, CaseStatus.ROUTED.value, actor=actor, actor_kind="SYSTEM")
    runner = WorkflowRunner(db, case)
    first_step = runner.start()
    if first_step is None:
        # No workflow configured: fall back to direct assignment.
        if recommendation.staff_id:
            _assign(db, case, actor=actor, staff_id=recommendation.staff_id, reason="Auto-routed (no workflow configured)", assignment_type="AUTO")
        else:
            _notify_department(db, case=case)
    else:
        _enter_step(db, case, first_step, actor=actor)

    db.flush()
    notifications.create_notification(
        db,
        user=requester,
        category=NotificationCategory.CASE_UPDATE.value,
        title=f"{case.case_number} received",
        body=f"We logged your {service.name.lower()} request and it is now with "
        f"{recommendation.department_name or 'the campus desk'}.",
        action_label="Track case",
        action_type="OPEN_CASE",
        action_target=f"/cases/{case.id}",
        case_id=case.id,
        source_channel=draft.source_channel,
        device_uid=draft.device_uid,
    )

    return CaseResult(
        case=case,
        created=True,
        duplicate_of=duplicate,
        routing_explanation=recommendation.explanation,
        intake={
            "category": category,
            "subcategory": subcategory,
            "priority": priority,
            "confidence": intake.confidence,
            "signals": intake.signals,
            "missing_information": intake.missing_information,
            "age_days": intake.age_days,
        },
    )


# --- Workflow plumbing ----------------------------------------------------


def _transition(
    db: Session,
    case: Case,
    to_status: str,
    *,
    actor: User | None = None,
    actor_kind: str = "USER",
    event_type: str = AuditEventType.STATUS_CHANGED.value,
    payload: dict | None = None,
    source_channel: str | None = None,
    device_uid: str | None = None,
    idempotency_key: str | None = None,
    allow_same: bool = False,
) -> None:
    from_status = case.status
    if from_status == to_status and allow_same:
        return
    if not can_transition(from_status, to_status):
        raise InvalidTransitionError(
            f"Cannot move a case from {from_status} to {to_status}.",
            details={"from": from_status, "to": to_status},
        )

    case.status = to_status
    case.last_activity_at = clock.now()

    if to_status == CaseStatus.IN_PROGRESS.value and case.first_response_at is None:
        case.first_response_at = clock.now()
    if to_status == CaseStatus.RESOLVED.value and case.resolved_at is None:
        case.resolved_at = clock.now()
        case.sla_state = sla_service.evaluate_state(case)
    if to_status in {CaseStatus.CLOSED.value, CaseStatus.CANCELLED.value}:
        case.closed_at = case.closed_at or clock.now()
        if to_status == CaseStatus.CLOSED.value:
            case.sla_state = sla_service.evaluate_state(case)
    if to_status == CaseStatus.REOPENED.value:
        case.reopen_count += 1
        case.resolved_at = None
        case.closed_at = None
        case.escalation_level = max(case.escalation_level, 1)
    if to_status == CaseStatus.ESCALATED.value:
        case.escalation_level += 1

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=event_type,
        actor=actor,
        actor_kind=actor_kind,
        from_status=from_status,
        to_status=to_status,
        step_key=case.current_step_key,
        source_channel=source_channel or SourceChannel.PWA.value,
        device_uid=device_uid,
        idempotency_key=idempotency_key,
        payload=payload,
    )


def _enter_step(db: Session, case: Case, step, *, actor: User | None = None, hops: int = 0) -> None:
    """Park a case at a workflow step, performing the step's side effects."""
    if hops > 5:
        raise ConflictError("Workflow contains a loop and cannot be advanced.")

    case.current_step_key = step.key
    target_status = status_for_step(step)

    # An APPROVAL step needs someone to actually decide, so we park there.
    if step.step_type == "APPROVAL":
        _transition(db, case, target_status, actor=actor, actor_kind="SYSTEM")
        _open_approval(db, case, step)
        return

    # Assignment steps resolve the assignee immediately, then park the case on the
    # step that actually does the work - so "resolve" is interpreted against the
    # right step rather than re-entering the assignment.
    if step.step_type == "ASSIGNMENT":
        _transition(
            db, case, CaseStatus.ROUTED.value, actor=actor, actor_kind="SYSTEM", allow_same=True
        )
        if case.assigned_staff_id is None:
            staff_member, notes = routing.recommend_staff(
                db, campus_id=case.campus_id, department_id=case.department_id, category=case.category
            )
            if staff_member is not None:
                _assign(
                    db,
                    case,
                    actor=actor,
                    staff_id=staff_member.id,
                    reason="; ".join(notes) or "Auto-assigned by workflow",
                    assignment_type="AUTO",
                )

        advance = WorkflowRunner(db, case).advance("assign")
        if advance.next_step is not None:
            if advance.next_step.step_type in {"APPROVAL", "VERIFICATION", "NOTIFICATION"}:
                _enter_step(db, case, advance.next_step, actor=actor, hops=hops + 1)
            else:
                # Work is queued: the case stays ASSIGNED until someone starts it.
                case.current_step_key = advance.next_step.key
        elif advance.next_status in {
            CaseStatus.RESOLVED.value,
            CaseStatus.CLOSED.value,
            CaseStatus.ESCALATED.value,
        } and can_transition(case.status, advance.next_status):
            _transition(db, case, advance.next_status, actor=actor, actor_kind="SYSTEM")
        return

    if step.step_type == "VERIFICATION":
        case.verification_state = VerificationState.PENDING.value
        _transition(db, case, CaseStatus.VERIFICATION_REQUIRED.value, actor=actor, actor_kind="SYSTEM")
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"Please verify {case.case_number}",
            body=f"{case.title} was marked resolved. Confirm the fix or reopen it.",
            action_label="Verify",
            action_type="VERIFY_CASE",
            include_staff=False,
            dedupe_suffix=f"verify-request-{case.reopen_count}",
        )
        return

    if step.step_type == "NOTIFICATION":
        _transition(db, case, CaseStatus.RESOLVED.value, actor=actor, actor_kind="SYSTEM")
        advance = WorkflowRunner(db, case).advance("complete")
        if advance.token == TOKEN_CLOSED or advance.next_status == CaseStatus.CLOSED.value:
            _transition(db, case, CaseStatus.CLOSED.value, actor=actor, actor_kind="SYSTEM")
        elif advance.next_step is not None:
            _enter_step(db, case, advance.next_step, actor=actor, hops=hops + 1)
        return

    # ACTION / RESOLUTION: work is happening now. A workflow with no assignment
    # step still needs an owner, so route one before the work starts.
    if case.assigned_staff_id is None and case.department_id is not None:
        staff_member, notes = routing.recommend_staff(
            db, campus_id=case.campus_id, department_id=case.department_id, category=case.category
        )
        if staff_member is not None:
            _assign(
                db,
                case,
                actor=actor,
                staff_id=staff_member.id,
                reason="; ".join(notes) or "Auto-assigned by workflow",
                assignment_type="AUTO",
            )

    _transition(db, case, target_status, actor=actor, actor_kind="SYSTEM", allow_same=True)
    if step.step_type == "RESOLUTION":
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"{case.case_number} is in progress",
            body=f"{case.title} has been picked up and work has started.",
            include_requester=True,
            dedupe_suffix=f"in-progress-{case.reopen_count}",
        )


def _open_approval(db: Session, case: Case, step) -> None:
    existing = db.scalar(
        select(CaseApproval).where(
            CaseApproval.case_id == case.id,
            CaseApproval.step_key == step.key,
            CaseApproval.state == ApprovalState.PENDING.value,
        )
    )
    if existing is not None:
        return

    approvals = list(case.required_approvals or [])
    if step.key not in approvals:
        approvals.append(step.key)
        case.required_approvals = approvals

    approval = CaseApproval(
        campus_id=case.campus_id,
        case_id=case.id,
        step_key=step.key,
        sequence=len(approvals),
        approver_role=step.responsible_role or RoleKey.ADMIN.value,
        state=ApprovalState.PENDING.value,
        requested_at=clock.now(),
    )
    db.add(approval)

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.APPROVAL_REQUESTED.value,
        actor_kind="SYSTEM",
        to_status=case.status,
        step_key=step.key,
        payload={"approver_role": approval.approver_role},
    )

    for user in notifications.users_with_role(db, campus_id=case.campus_id, role_key=approval.approver_role):
        notifications.create_notification(
            db,
            user=user,
            category=NotificationCategory.APPROVAL.value,
            title=f"Approval needed: {case.case_number}",
            body=case.title,
            priority=Priority.HIGH.value if case.priority in {Priority.HIGH.value, Priority.CRITICAL.value} else Priority.NORMAL.value,
            action_label="Review",
            action_type="OPEN_CASE",
            action_target=f"/admin/approvals/{case.id}",
            case_id=case.id,
            dedupe_key=f"approval-request:{case.id}:{step.key}:{user.id}",
        )


def _notify_department(db: Session, *, case: Case) -> None:
    notifications.notify_admins(
        db,
        campus_id=case.campus_id,
        category=NotificationCategory.CASE_UPDATE.value,
        title=f"Unassigned case {case.case_number}",
        body=f"{case.title} has no assignee yet.",
        action_target=f"/admin/cases/{case.id}",
        dedupe_key=f"unassigned:{case.id}",
    )


def _assign(
    db: Session,
    case: Case,
    *,
    actor: User | None,
    staff_id: int,
    reason: str | None = None,
    assignment_type: str = "MANUAL",
) -> CaseAssignment | None:
    staff = db.get(Staff, staff_id)
    if staff is None or staff.campus_id != case.campus_id:
        raise NotFoundError("That staff member does not exist on this campus.")

    if case.assigned_staff_id == staff_id and case.status == CaseStatus.ASSIGNED.value:
        return None

    for active in db.scalars(
        select(CaseAssignment).where(
            CaseAssignment.case_id == case.id, CaseAssignment.is_active.is_(True)
        )
    ).all():
        active.is_active = False
        active.unassigned_at = clock.now()

    assignment = CaseAssignment(
        campus_id=case.campus_id,
        case_id=case.id,
        staff_id=staff_id,
        assigned_by_id=actor.id if actor else None,
        assignment_type=assignment_type,
        reason=reason,
        is_active=True,
    )
    db.add(assignment)
    case.assigned_staff_id = staff_id

    if can_transition(case.status, CaseStatus.ASSIGNED.value):
        _transition(
            db,
            case,
            CaseStatus.ASSIGNED.value,
            actor=actor,
            actor_kind="USER" if actor else "SYSTEM",
            event_type=AuditEventType.CASE_ASSIGNED.value,
            payload={
                "staff_id": staff_id,
                "staff_name": staff.user.full_name if staff.user else None,
                "assignment_type": assignment_type,
                "reason": reason,
            },
        )
    else:
        audit.record_case_event(
            db,
            case_id=case.id,
            campus_id=case.campus_id,
            event_type=AuditEventType.CASE_ASSIGNED.value,
            actor=actor,
            actor_kind="USER" if actor else "SYSTEM",
            to_status=case.status,
            step_key=case.current_step_key,
            payload={
                "staff_id": staff_id,
                "staff_name": staff.user.full_name if staff.user else None,
                "assignment_type": assignment_type,
                "reason": reason,
                "status_unchanged": True,
            },
        )

    if staff.user is not None:
        notifications.create_notification(
            db,
            user=staff.user,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"New assignment: {case.case_number}",
            body=case.title,
            priority=Priority.HIGH.value if case.priority in {Priority.HIGH.value, Priority.CRITICAL.value} else Priority.NORMAL.value,
            action_label="Open task",
            action_type="OPEN_CASE",
            action_target=f"/staff/cases/{case.id}",
            case_id=case.id,
            dedupe_key=f"assignment:{case.id}:{staff_id}:{case.reopen_count}",
        )
    return assignment


# --- Public operations ----------------------------------------------------


def assign_case(
    db: Session, *, case: Case, actor: User, staff_id: int, reason: str | None = None
) -> dict:
    assignment = _assign(db, case, actor=actor, staff_id=staff_id, reason=reason, assignment_type="MANUAL")
    return {"assigned": assignment is not None, "staff_id": staff_id}


def decide_approval(
    db: Session,
    *,
    case: Case,
    actor: User,
    approve: bool,
    note: str | None = None,
) -> Case:
    approval = db.scalar(
        select(CaseApproval)
        .where(CaseApproval.case_id == case.id, CaseApproval.state == ApprovalState.PENDING.value)
        .order_by(CaseApproval.sequence)
    )
    if approval is None:
        raise ConflictError("This case has no pending approval.")

    if actor.role_key not in {approval.approver_role, RoleKey.ADMIN.value, RoleKey.SUPER_ADMIN.value}:
        raise PermissionDeniedError(
            "This approval is not assigned to your role.",
            details={"required_role": approval.approver_role},
        )

    approval.state = ApprovalState.APPROVED.value if approve else ApprovalState.REJECTED.value
    approval.approver_id = actor.id
    approval.decided_at = clock.now()
    approval.decision_note = note

    runner = WorkflowRunner(db, case)
    advance = runner.advance("approve" if approve else "reject")

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.APPROVED.value if approve else AuditEventType.REJECTED.value,
        actor=actor,
        step_key=approval.step_key,
        payload={"note": note, "next": advance.token or (advance.next_step.key if advance.next_step else None)},
    )

    if not approve:
        _transition(
            db,
            case,
            CaseStatus.CANCELLED.value,
            actor=actor,
            payload={"reason": note or "Rejected by approver"},
        )
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"{case.case_number} was rejected",
            body=note or "The request was not approved.",
            include_staff=False,
            dedupe_suffix=f"rejected-{approval.step_key}",
        )
        return case

    if advance.next_status:
        target = advance.next_status
        if target == STATUS_TOKENS.get(TOKEN_CLOSED):
            _transition(db, case, CaseStatus.RESOLVED.value, actor=actor)
            _transition(db, case, CaseStatus.CLOSED.value, actor=actor)
        elif can_transition(case.status, target):
            _transition(db, case, target, actor=actor)
        else:
            _transition(db, case, CaseStatus.ROUTED.value, actor=actor)
    elif advance.next_step is not None:
        _enter_step(db, case, advance.next_step, actor=actor)
    else:
        _transition(db, case, CaseStatus.ROUTED.value, actor=actor)

    notifications.notify_case_stakeholders(
        db,
        case=case,
        category=NotificationCategory.APPROVAL.value,
        title=f"{case.case_number} approved",
        body=note or "Your request was approved.",
        dedupe_suffix=f"approved-{approval.step_key}",
    )
    db.flush()
    return case


def start_work(db: Session, *, case: Case, actor: User, note: str | None = None) -> Case:
    if case.status == CaseStatus.ASSIGNED.value:
        _transition(db, case, CaseStatus.IN_PROGRESS.value, actor=actor, payload={"note": note})
    elif case.status == CaseStatus.IN_PROGRESS.value:
        return case
    elif can_transition(case.status, CaseStatus.IN_PROGRESS.value):
        _transition(db, case, CaseStatus.IN_PROGRESS.value, actor=actor, payload={"note": note})
    else:
        raise InvalidTransitionError(
            f"Cannot start work on a case in status {case.status}.",
            details={"from": case.status},
        )
    return case


def add_comment(
    db: Session,
    *,
    case: Case,
    actor: User,
    body: str,
    visibility: str = "PUBLIC",
    client_ref: str | None = None,
    source_channel: str = SourceChannel.PWA.value,
) -> CaseComment:
    if not body or not body.strip():
        raise ValidationError("Comment cannot be empty.")

    if client_ref:
        existing = db.scalar(
            select(CaseComment).where(
                CaseComment.case_id == case.id, CaseComment.client_ref == client_ref
            )
        )
        if existing is not None:
            return existing

    if visibility == "INTERNAL" and "case:comment_internal" not in actor.permission_keys():
        raise PermissionDeniedError("Your role cannot post internal notes.")

    comment = CaseComment(
        campus_id=case.campus_id,
        case_id=case.id,
        author_id=actor.id,
        author_role=actor.role_key,
        body=body.strip(),
        visibility=visibility,
        source_channel=source_channel,
        client_ref=client_ref,
    )
    db.add(comment)
    case.last_activity_at = clock.now()

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.COMMENT_ADDED.value,
        actor=actor,
        source_channel=source_channel,
        idempotency_key=f"comment:{client_ref}" if client_ref else None,
        payload={"visibility": visibility, "preview": body.strip()[:120]},
    )

    if visibility == "PUBLIC" and case.requester_id and case.requester_id != actor.id:
        notifications.create_notification(
            db,
            user=case.requester,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"New comment on {case.case_number}",
            body=body.strip()[:160],
            action_label="View case",
            action_type="OPEN_CASE",
            action_target=f"/cases/{case.id}",
            case_id=case.id,
        )
    return comment


def add_attachment(
    db: Session,
    *,
    case: Case,
    actor: User,
    filename: str,
    storage_path: str,
    content_type: str,
    size_bytes: int,
    sha256: str | None,
    kind: str = "EVIDENCE",
    note: str | None = None,
    client_ref: str | None = None,
) -> CaseAttachment:
    attachment = CaseAttachment(
        campus_id=case.campus_id,
        case_id=case.id,
        uploaded_by_id=actor.id,
        kind=kind,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        storage_path=storage_path,
        sha256=sha256,
        note=note,
        client_ref=client_ref,
    )
    db.add(attachment)
    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.EVIDENCE_ATTACHED.value,
        actor=actor,
        payload={"filename": filename, "kind": kind, "size_bytes": size_bytes, "sha256": sha256},
    )
    return attachment


def resolve_case(
    db: Session,
    *,
    case: Case,
    actor: User,
    note: str | None = None,
    evidence_note: str | None = None,
    source_channel: str = SourceChannel.PWA.value,
    device_uid: str | None = None,
) -> Case:
    if case.status not in {
        CaseStatus.IN_PROGRESS.value,
        CaseStatus.ASSIGNED.value,
        CaseStatus.ESCALATED.value,
    }:
        raise InvalidTransitionError(
            f"A case in status {case.status} cannot be resolved.",
            details={"from": case.status},
        )

    case.resolution_note = note or evidence_note or case.resolution_note
    _transition(
        db,
        case,
        CaseStatus.RESOLVED.value,
        actor=actor,
        event_type=AuditEventType.RESOLVED.value,
        payload={"note": case.resolution_note},
        source_channel=source_channel,
        device_uid=device_uid,
    )

    runner = WorkflowRunner(db, case)
    advance = runner.advance("resolve")

    if advance.next_step is not None:
        _enter_step(db, case, advance.next_step, actor=actor)
    elif advance.next_status and can_transition(case.status, advance.next_status):
        _transition(db, case, advance.next_status, actor=actor, actor_kind="SYSTEM")
    else:
        case.verification_state = VerificationState.PENDING.value
        _transition(db, case, CaseStatus.VERIFICATION_REQUIRED.value, actor=actor, actor_kind="SYSTEM")
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"Please verify {case.case_number}",
            body=f"{case.title} was marked resolved. Confirm the fix or reopen it.",
            action_label="Verify",
            action_type="VERIFY_CASE",
            include_staff=False,
            dedupe_suffix=f"verify-request-{case.reopen_count}",
        )
    db.flush()
    return case


def verify_resolution(
    db: Session,
    *,
    case: Case,
    actor: User,
    accepted: bool,
    note: str | None = None,
    source_channel: str = SourceChannel.PWA.value,
) -> Case:
    if case.status not in {
        CaseStatus.VERIFICATION_REQUIRED.value,
        CaseStatus.RESOLVED.value,
    }:
        raise ConflictError("This case is not awaiting verification.")

    if accepted:
        case.verification_state = VerificationState.VERIFIED.value
        _transition(
            db,
            case,
            CaseStatus.CLOSED.value,
            actor=actor,
            event_type=AuditEventType.VERIFIED.value,
            payload={"note": note},
            source_channel=source_channel,
        )
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"{case.case_number} closed",
            body="Thanks for confirming. The case is now closed.",
            include_requester=True,
            include_staff=True,
            dedupe_suffix=f"closed-{case.reopen_count}",
        )
    else:
        case.verification_state = VerificationState.DISPUTED.value
        _transition(
            db,
            case,
            CaseStatus.REOPENED.value,
            actor=actor,
            event_type=AuditEventType.REOPENED.value,
            payload={"note": note or "Requester disputed the resolution"},
            source_channel=source_channel,
        )
        notifications.notify_case_stakeholders(
            db,
            case=case,
            category=NotificationCategory.CASE_UPDATE.value,
            title=f"{case.case_number} reopened",
            body=note or "The requester did not accept the resolution.",
            priority=Priority.HIGH.value,
            include_requester=False,
            dedupe_suffix=f"reopened-{case.reopen_count}",
        )
    db.flush()
    return case


def reopen_case(db: Session, *, case: Case, actor: User, reason: str, source_channel: str = SourceChannel.PWA.value) -> Case:
    if case.status in {CaseStatus.CLOSED.value, CaseStatus.RESOLVED.value, CaseStatus.VERIFICATION_REQUIRED.value}:
        case.verification_state = VerificationState.DISPUTED.value
        _transition(
            db,
            case,
            CaseStatus.REOPENED.value,
            actor=actor,
            event_type=AuditEventType.REOPENED.value,
            payload={"reason": reason},
            source_channel=source_channel,
        )
    elif can_transition(case.status, CaseStatus.REOPENED.value):
        _transition(db, case, CaseStatus.REOPENED.value, actor=actor, payload={"reason": reason})
    else:
        raise InvalidTransitionError("This case cannot be reopened from its current status.")

    runner = WorkflowRunner(db, case)
    target_step = None
    for step in runner.steps:
        if step.step_type in {"RESOLUTION", "ACTION"}:
            target_step = step
    if target_step is not None:
        _enter_step(db, case, target_step, actor=actor)
    notifications.notify_case_stakeholders(
        db,
        case=case,
        category=NotificationCategory.CASE_UPDATE.value,
        title=f"{case.case_number} reopened",
        body=reason,
        priority=Priority.HIGH.value,
        include_requester=False,
        dedupe_suffix=f"reopen-{case.reopen_count}",
    )
    db.flush()
    return case


def cancel_case(db: Session, *, case: Case, actor: User, reason: str | None = None) -> Case:
    if not can_transition(case.status, CaseStatus.CANCELLED.value):
        raise InvalidTransitionError("This case can no longer be cancelled.")
    _transition(
        db,
        case,
        CaseStatus.CANCELLED.value,
        actor=actor,
        payload={"reason": reason},
    )
    notifications.notify_case_stakeholders(
        db,
        case=case,
        category=NotificationCategory.CASE_UPDATE.value,
        title=f"{case.case_number} cancelled",
        body=reason or "The case was cancelled.",
        dedupe_suffix="cancelled",
    )
    return case


def escalate_case(
    db: Session, *, case: Case, actor: User, reason: str, escalate_to_role: str | None = None
) -> Case:
    target_role = escalate_to_role or RoleKey.DEPARTMENT_HEAD.value
    if can_transition(case.status, CaseStatus.ESCALATED.value):
        _transition(
            db,
            case,
            CaseStatus.ESCALATED.value,
            actor=actor,
            event_type=AuditEventType.CASE_ESCALATED.value,
            payload={"reason": reason, "escalated_to": target_role},
        )
    else:
        audit.record_case_event(
            db,
            case_id=case.id,
            campus_id=case.campus_id,
            event_type=AuditEventType.CASE_ESCALATED.value,
            actor=actor,
            to_status=case.status,
            payload={"reason": reason, "escalated_to": target_role, "status_unchanged": True},
        )
        case.escalation_level += 1

    case.priority = (
        Priority.CRITICAL.value
        if case.priority == Priority.HIGH.value
        else Priority.HIGH.value
        if case.priority == Priority.NORMAL.value
        else case.priority
    )

    for user in notifications.users_with_role(db, campus_id=case.campus_id, role_key=target_role):
        notifications.create_notification(
            db,
            user=user,
            category=NotificationCategory.SLA_ALERT.value,
            title=f"Escalated: {case.case_number}",
            body=reason,
            priority=Priority.HIGH.value,
            action_label="Open case",
            action_type="OPEN_CASE",
            action_target=f"/admin/cases/{case.id}",
            case_id=case.id,
            dedupe_key=f"escalated:{case.id}:{case.escalation_level}:{user.id}",
        )
    db.flush()
    return case


# --- Gate passes (Workflow C tail) ----------------------------------------


def issue_gate_pass(
    db: Session,
    *,
    case: Case,
    actor: User,
    valid_from: datetime | None = None,
    valid_to: datetime | None = None,
    destination: str | None = None,
) -> GatePass:
    """Issue a verifiable pass for an approved leave case."""
    existing = db.scalar(select(GatePass).where(GatePass.case_id == case.id))
    if existing is not None and existing.state != GatePassState.REVOKED.value:
        return existing

    payload = case.state_payload or {}
    start = clock.ensure_aware(valid_from) or _payload_date(payload.get("leave_start")) or clock.now()
    end = (
        clock.ensure_aware(valid_to)
        or _payload_date(payload.get("leave_end"))
        or (start + timedelta(days=1))
    )
    if end <= start:
        raise ValidationError("Gate pass end must be after its start.")

    student_id = case.requester_student_id
    if student_id is None and case.requester_id:
        student = db.scalar(select(Student).where(Student.user_id == case.requester_id))
        student_id = student.id if student else None
    if student_id is None:
        raise ValidationError("A gate pass needs a student record.")

    code = _unique_pass_code(db)
    gate_pass = GatePass(
        campus_id=case.campus_id,
        case_id=case.id,
        student_id=student_id,
        pass_code=code,
        state=GatePassState.ISSUED.value,
        valid_from=start,
        valid_to=end,
        destination=destination or payload.get("destination"),
        reason=payload.get("reason") or case.title,
        issued_by_id=actor.id,
        qr_payload=f"CR-PASS:{code}",
    )
    db.add(gate_pass)
    case.state_payload = {**payload, "gate_pass_code": code, "pass_valid_from": start.isoformat(), "pass_valid_to": end.isoformat()}

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.DOCUMENT_GENERATED.value,
        actor=actor,
        step_key=case.current_step_key,
        payload={"document": "GATE_PASS", "pass_code": code, "valid_from": start.isoformat(), "valid_to": end.isoformat()},
    )

    # The workflow step that issues the pass is now complete.
    runner = WorkflowRunner(db, case)
    advance = runner.advance("issue")
    if advance.next_status and can_transition(case.status, advance.next_status):
        _transition(db, case, advance.next_status, actor=actor, actor_kind="SYSTEM")

    notifications.notify_case_stakeholders(
        db,
        case=case,
        category=NotificationCategory.GATE_PASS.value,
        title=f"Gate pass ready: {code}",
        body=f"Valid {start.date().isoformat()} to {end.date().isoformat()}.",
        action_label="View pass",
        action_type="OPEN_GATE_PASS",
        action_target=f"/cases/{case.id}",
        include_requester=True,
        include_staff=False,
        dedupe_suffix="gate-pass-issued",
    )
    return gate_pass


def _payload_date(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return clock.ensure_aware(value)
    try:
        return clock.ensure_aware(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except ValueError:
        return None


def _unique_pass_code(db: Session) -> str:
    from app.core.security import new_code

    for _ in range(10):
        code = new_code(8)
        if db.scalar(select(GatePass.id).where(GatePass.pass_code == code)) is None:
            return code
    raise ConflictError("Could not allocate a unique pass code; please retry.")


def verify_gate_pass(db: Session, *, campus_id: int, pass_code: str) -> dict:
    """Security-facing verification. Read-only: never mutates without a scan action."""
    normalised = (pass_code or "").strip().upper().replace("CR-PASS:", "")
    gate_pass = db.scalar(
        select(GatePass).where(GatePass.campus_id == campus_id, GatePass.pass_code == normalised)
    )
    if gate_pass is None:
        return {"valid": False, "reason": "PASS_NOT_FOUND", "message": "No such pass code on this campus."}

    now = clock.now()
    student = db.get(Student, gate_pass.student_id)
    case = db.get(Case, gate_pass.case_id)
    valid = (
        gate_pass.state in {GatePassState.ISSUED.value, GatePassState.PARTIALLY_USED.value}
        and clock.ensure_aware(gate_pass.valid_from) <= now <= clock.ensure_aware(gate_pass.valid_to)
        and case is not None
        and case.status not in {CaseStatus.CANCELLED.value}
    )
    reason = None
    if gate_pass.state == GatePassState.REVOKED.value:
        reason = "PASS_REVOKED"
    elif gate_pass.state == GatePassState.EXPIRED.value:
        reason = "PASS_EXPIRED"
    elif now < clock.ensure_aware(gate_pass.valid_from):
        reason = "PASS_NOT_YET_VALID"
    elif now > clock.ensure_aware(gate_pass.valid_to):
        reason = "PASS_WINDOW_CLOSED"
    elif case is not None and case.status == CaseStatus.CANCELLED.value:
        reason = "UNDERLYING_CASE_CANCELLED"

    return {
        "valid": valid,
        "reason": reason,
        "pass": {
            "code": gate_pass.pass_code,
            "state": gate_pass.state,
            "valid_from": gate_pass.valid_from,
            "valid_to": gate_pass.valid_to,
            "destination": gate_pass.destination,
        },
        "student": {
            "id": student.id if student else None,
            "name": student.full_name if student else None,
            "roll_number": student.roll_number if student else None,
            "room": (student.room.number if student and student.room else None),
            "hostel": (student.hostel.name if student and student.hostel else None),
        },
        "case": {
            "id": case.id if case else None,
            "case_number": case.case_number if case else None,
            "status": case.status if case else None,
        },
    }


# --- Read helpers ---------------------------------------------------------


def case_or_404(db: Session, case_id: int) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise NotFoundError("Case not found.")
    return case


def open_case_count_for_staff(db: Session, *, staff_id: int) -> int:
    return int(
        db.scalar(
            select(func.count(Case.id)).where(
                Case.assigned_staff_id == staff_id,
                Case.status.in_(
                    (
                        CaseStatus.ASSIGNED.value,
                        CaseStatus.IN_PROGRESS.value,
                        CaseStatus.ESCALATED.value,
                        CaseStatus.REOPENED.value,
                        CaseStatus.WAITING_FOR_USER.value,
                    )
                ),
            )
        )
        or 0
    )
