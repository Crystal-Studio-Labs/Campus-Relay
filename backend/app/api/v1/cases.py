"""Case API.

Every mutating route goes through the case engine, which re-checks permission,
policy, workflow state and tenancy before anything commits.
"""

import hashlib
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.api.deps import (
    ClientContext,
    CurrentUser,
    DbSession,
    RequestContext,
    assert_permission,
)
from app.api.serializers import case_brief, case_detail, user_brief
from app.api.v1.schemas import (
    AssignRequest,
    CancelRequest,
    CaseCreateRequest,
    CommentRequest,
    DecisionRequest,
    EscalateRequest,
    ReopenRequest,
    ResolveRequest,
    VerifyRequest,
)
from app.core.config import settings
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.core.permissions import (
    CASE_ASSIGN,
    CASE_CANCEL,
    CASE_COMMENT,
    CASE_COMMENT_INTERNAL,
    CASE_CREATE,
    CASE_CREATE_ON_BEHALF,
    CASE_ESCALATE,
    CASE_READ_ALL,
    CASE_READ_SCOPE,
    CASE_REOPEN,
    CASE_RESOLVE,
    CASE_UPDATE_STATUS,
    CASE_VERIFY,
    APPROVAL_DECIDE,
)
from app.models import Case, CaseApproval, CaseAttachment
from app.models.enums import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    AuditEventType,
    CaseStatus,
    Priority,
    RoleKey,
    SlaState,
)
from app.services import case_engine, clock, documents, scoping
from app.services.documents import media_root
from app.services.sla import evaluate_state
from app.services.workflow import WorkflowRunner

router = APIRouter(tags=["cases"])


@router.post("/cases", status_code=201)
def create_case(
    payload: CaseCreateRequest,
    db: DbSession,
    user: CurrentUser,
    context: RequestContext,
):
    if payload.on_behalf_student_id is not None:
        assert_permission(user, CASE_CREATE_ON_BEHALF)
    else:
        assert_permission(user, CASE_CREATE)

    draft = case_engine.CaseDraft(
        service_key=payload.service_key,
        description=payload.description,
        title=payload.title,
        category=payload.category,
        subcategory=payload.subcategory,
        priority=payload.priority,
        location_id=payload.location_id,
        location_code=payload.location_code,
        asset_id=payload.asset_id,
        state_payload=payload.state_payload,
        source_channel=context.source_channel,
        language=payload.language,
        client_ref=payload.client_ref or context.idempotency_key,
        captured_offline_at=payload.captured_offline_at,
        device_uid=context.device_uid,
        on_behalf_student_id=payload.on_behalf_student_id,
    )
    result = case_engine.create_case(db, actor=user, draft=draft)
    return {
        "created": result.created,
        "case": case_detail(db, result.case, audience="full"),
        "intake": result.intake,
        "routing_explanation": result.routing_explanation,
        "possible_duplicate_of": result.duplicate_of.case_number if result.duplicate_of else None,
    }


@router.get("/cases")
def list_cases(
    db: DbSession,
    user: CurrentUser,
    status: str | None = None,
    service_key: str | None = None,
    department_id: int | None = None,
    assigned_to_me: bool = False,
    mine: bool = False,
    priority: str | None = None,
    sla_state: str | None = None,
    location_id: int | None = None,
    q: str | None = Query(default=None, max_length=80),
    open_only: bool = False,
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="recent", pattern="^(recent|oldest|priority|due)$"),
):
    condition = scoping.case_scope_condition(db, user)
    if condition is None:
        raise PermissionDeniedError("Your role has no case visibility.")

    stmt = select(Case).where(condition)
    if status:
        stmt = stmt.where(Case.status == status)
    if open_only:
        stmt = stmt.where(Case.status.in_(tuple(OPEN_STATUSES)))
    if service_key:
        stmt = stmt.where(Case.service_key == service_key)
    if department_id:
        stmt = stmt.where(Case.department_id == department_id)
    if priority:
        stmt = stmt.where(Case.priority == priority)
    if sla_state:
        stmt = stmt.where(Case.sla_state == sla_state)
    if location_id:
        stmt = stmt.where(Case.location_id == location_id)
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Case.title).like(pattern),
                func.lower(Case.case_number).like(pattern),
                func.lower(Case.description).like(pattern),
            )
        )
    if assigned_to_me:
        stmt = stmt.where(Case.assigned_staff_id == scoping_staff_id(db, user))
    if mine:
        stmt = stmt.where(Case.requester_id == user.id)

    ordering = {
        "recent": Case.created_at.desc(),
        "oldest": Case.created_at.asc(),
        "priority": Case.priority.desc(),
        "due": Case.due_at.asc().nullslast(),
    }[sort]

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(stmt.order_by(ordering).limit(limit).offset(offset)).all()

    # SLA state is time-dependent: recompute for display without persisting.
    now = clock.now()
    for case in rows:
        case.sla_state = evaluate_state(case, now=now)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "cases": [case_brief(db, case) for case in rows],
    }


def scoping_staff_id(db, user) -> int:
    from app.models import Staff

    staff = db.scalar(select(Staff).where(Staff.user_id == user.id))
    return staff.id if staff else -1


@router.get("/cases/{case_id}")
def get_case(db: DbSession, user: CurrentUser, case_id: int):
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    include_internal = CASE_COMMENT_INTERNAL in user.permission_keys()
    return case_detail(db, case, include_internal=include_internal)


@router.post("/cases/{case_id}/comments", status_code=201)
def add_comment(
    case_id: int, payload: CommentRequest, db: DbSession, user: CurrentUser, context: RequestContext
):
    assert_permission(user, CASE_COMMENT)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    comment = case_engine.add_comment(
        db,
        case=case,
        actor=user,
        body=payload.body,
        visibility=payload.visibility,
        client_ref=payload.client_ref,
        source_channel=context.source_channel,
    )
    return {"id": comment.id, "created_at": comment.created_at}


@router.post("/cases/{case_id}/attachments", status_code=201)
async def upload_attachment(
    case_id: int,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    kind: Annotated[str, Form()] = "EVIDENCE",
    note: Annotated[str | None, Form()] = None,
):
    assert_permission(user, CASE_COMMENT)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise ValidationError(
            f"Attachments are limited to {settings.max_upload_bytes // (1024 * 1024)} MB."
        )
    if not content:
        raise ValidationError("The uploaded file is empty.")

    digest = hashlib.sha256(content).hexdigest()
    safe_name = Path(file.filename or "upload.bin").name
    relative = Path("attachments") / str(case.campus_id) / str(case.id) / f"{digest[:12]}-{safe_name}"
    destination = media_root() / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    attachment = case_engine.add_attachment(
        db,
        case=case,
        actor=user,
        filename=safe_name,
        storage_path=str(relative).replace("\\", "/"),
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        sha256=digest,
        kind=kind,
        note=note,
    )
    return {"id": attachment.id, "sha256": digest, "size_bytes": len(content)}


@router.get("/cases/{case_id}/attachments/{attachment_id}")
def download_attachment(db: DbSession, user: CurrentUser, case_id: int, attachment_id: int):
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    attachment = db.get(CaseAttachment, attachment_id)
    if attachment is None or attachment.case_id != case.id:
        raise NotFoundError("Attachment not found.")
    path = Path(media_root()) / attachment.storage_path
    if not path.exists():
        raise NotFoundError("The stored file is missing.")
    return FileResponse(path, media_type=attachment.content_type, filename=attachment.filename)


# --- Workflow actions -----------------------------------------------------


@router.post("/cases/{case_id}/assign")
def assign(case_id: int, payload: AssignRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, CASE_ASSIGN)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    result = case_engine.assign_case(db, case=case, actor=user, staff_id=payload.staff_id, reason=payload.reason)
    return {**result, "case": case_brief(db, case)}


@router.post("/cases/{case_id}/start")
def start(case_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, CASE_UPDATE_STATUS)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    case_engine.start_work(db, case=case, actor=user)
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/resolve")
def resolve(
    case_id: int, payload: ResolveRequest, db: DbSession, user: CurrentUser, context: RequestContext
):
    assert_permission(user, CASE_RESOLVE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    case_engine.resolve_case(
        db,
        case=case,
        actor=user,
        note=payload.note,
        evidence_note=payload.evidence_note,
        source_channel=context.source_channel,
        device_uid=context.device_uid,
    )
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/verify")
def verify(
    case_id: int, payload: VerifyRequest, db: DbSession, user: CurrentUser, context: RequestContext
):
    assert_permission(user, CASE_VERIFY)
    case = case_engine.case_or_404(db, case_id)
    if case.requester_id not in {None, user.id} and CASE_VERIFY not in user.permission_keys():
        raise PermissionDeniedError("Only the requester can verify this case.")
    case_engine.verify_resolution(
        db, case=case, actor=user, accepted=payload.accepted, note=payload.note, source_channel=context.source_channel
    )
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/reopen")
def reopen(
    case_id: int, payload: ReopenRequest, db: DbSession, user: CurrentUser, context: RequestContext
):
    assert_permission(user, CASE_REOPEN)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    case_engine.reopen_case(db, case=case, actor=user, reason=payload.reason, source_channel=context.source_channel)
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/cancel")
def cancel(case_id: int, payload: CancelRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, CASE_CANCEL)
    case = case_engine.case_or_404(db, case_id)
    if case.requester_id != user.id and CASE_READ_ALL not in user.permission_keys():
        raise PermissionDeniedError("Only the requester or an administrator can cancel this case.")
    case_engine.cancel_case(db, case=case, actor=user, reason=payload.reason)
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/escalate")
def escalate(case_id: int, payload: EscalateRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, CASE_ESCALATE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    case_engine.escalate_case(
        db, case=case, actor=user, reason=payload.reason, escalate_to_role=payload.escalate_to_role
    )
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/approval")
def decide(case_id: int, payload: DecisionRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, APPROVAL_DECIDE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    case_engine.decide_approval(db, case=case, actor=user, approve=payload.approve, note=payload.note)
    return {"case": case_brief(db, case)}


@router.post("/cases/{case_id}/gate-pass")
def issue_pass(case_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, APPROVAL_DECIDE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    gate_pass = case_engine.issue_gate_pass(db, case=case, actor=user)
    return {
        "pass_code": gate_pass.pass_code,
        "valid_from": gate_pass.valid_from,
        "valid_to": gate_pass.valid_to,
        "qr_payload": gate_pass.qr_payload,
    }


@router.post("/cases/{case_id}/certificate")
def issue_certificate(case_id: int, db: DbSession, user: CurrentUser):
    """Generate the bonafide PDF for an approved certificate case."""
    assert_permission(user, APPROVAL_DECIDE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    if case.status not in {
        CaseStatus.IN_PROGRESS.value,
        CaseStatus.ASSIGNED.value,
        CaseStatus.RESOLVED.value,
        CaseStatus.ROUTED.value,
        CaseStatus.ESCALATED.value,
    }:
        raise ValidationError(
            "A certificate can only be generated once the request is approved and in progress."
        )
    document = documents.generate_bonafide(
        db,
        case=case,
        actor=user,
        campus_name=_campus_name(db, case),
    )
    return {
        "document_id": document.id,
        "serial_no": document.serial_no,
        "verification_code": document.verification_code,
        "download_url": f"/api/v1/documents/{document.id}/download",
    }


def _campus_name(db, case: Case) -> str:
    from app.models import Campus

    campus = db.get(Campus, case.campus_id)
    return campus.name if campus else "Campus"


@router.get("/cases/{case_id}/timeline")
def timeline(db: DbSession, user: CurrentUser, case_id: int):
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    return case_detail(db, case)["timeline"]


@router.get("/cases/{case_id}/workflow")
def workflow_state(db: DbSession, user: CurrentUser, case_id: int):
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    runner = WorkflowRunner(db, case)
    return {
        "workflow": runner.workflow.name if runner.workflow else None,
        "current_step": case.current_step_key,
        "status": case.status,
        "steps": runner.steps_summary(),
        "approvals": case_detail(db, case)["approvals"],
    }


@router.get("/approvals")
def my_approvals(db: DbSession, user: CurrentUser):
    """Approval queue for the signed-in approver role."""
    assert_permission(user, APPROVAL_DECIDE)
    rows = db.scalars(
        select(CaseApproval)
        .where(
            CaseApproval.campus_id == user.campus_id,
            CaseApproval.state == "PENDING",
            CaseApproval.approver_role.in_((user.role_key, RoleKey.ADMIN.value, RoleKey.SUPER_ADMIN.value)),
        )
        .order_by(CaseApproval.requested_at.asc())
    ).all()
    payload = []
    for approval in rows:
        case = db.get(Case, approval.case_id)
        if case is None:
            continue
        payload.append(
            {
                "approval_id": approval.id,
                "step_key": approval.step_key,
                "approver_role": approval.approver_role,
                "requested_at": approval.requested_at,
                "waiting_minutes": round(clock.minutes_since(approval.requested_at) or 0, 1),
                "case": case_brief(db, case),
                "state_payload": case.state_payload,
                "requester": user_brief(case.requester),
            }
        )
    return {"pending": len(payload), "approvals": payload}


@router.get("/my/overview")
def my_overview(db: DbSession, user: CurrentUser):
    """Home screen payload: what needs *me* right now."""
    from app.models import Notification, Notice

    condition = scoping.case_scope_condition(db, user)
    open_cases = []
    if condition is not None:
        open_cases = db.scalars(
            select(Case)
            .where(condition, Case.status.notin_(tuple(CLOSED_STATUSES)))
            .order_by(Case.created_at.desc())
            .limit(10)
        ).all()

    unread_notifications = int(
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id, Notification.read_at.is_(None)
            )
        )
        or 0
    )
    my_cases_total = int(
        db.scalar(
            select(func.count(Case.id)).where(Case.requester_id == user.id)
        )
        or 0
    )
    urgent_notice_count = int(
        db.scalar(
            select(func.count(func.distinct(Notice.id)))
            .select_from(Notice)
            .where(Notice.campus_id == user.campus_id, Notice.notice_type.in_(("URGENT", "EMERGENCY")))
        )
        or 0
    )

    from app.services import notices as notice_service

    pending_acks = notice_service.pending_acknowledgements(db, campus_id=user.campus_id, user=user)

    now = clock.now()
    for case in open_cases:
        case.sla_state = evaluate_state(case, now=now)

    return {
        "profile": {
            "name": user.full_name,
            "role": user.role_key,
            "language": user.language,
        },
        "counts": {
            "open_cases": len(open_cases),
            "my_cases_total": my_cases_total,
            "unread_notifications": unread_notifications,
            "pending_acknowledgements": len(pending_acks),
            "urgent_notices": urgent_notice_count,
            "assigned_to_me": scoping_staff_id(db, user)
            if user.role_key in {RoleKey.STAFF.value, RoleKey.DEPARTMENT_HEAD.value}
            else None,
        },
        "cases": [case_brief(db, case) for case in open_cases],
        "pending_acknowledgements": pending_acks[:5],
        "needs_attention": _needs_attention(db, user, open_cases),
    }


def _needs_attention(db, user, open_cases) -> list[dict]:
    items: list[dict] = []
    for case in open_cases:
        if case.status == CaseStatus.VERIFICATION_REQUIRED.value and case.requester_id == user.id:
            items.append(
                {
                    "kind": "VERIFY",
                    "case_id": case.id,
                    "case_number": case.case_number,
                    "label": "Waiting for your verification",
                }
            )
        elif case.sla_state in {SlaState.BREACHED.value, SlaState.AT_RISK.value} and case.assigned_staff_id:
            items.append(
                {
                    "kind": "SLA",
                    "case_id": case.id,
                    "case_number": case.case_number,
                    "label": f"SLA {case.sla_state.lower().replace('_', ' ')}",
                }
            )
    return items[:6]
