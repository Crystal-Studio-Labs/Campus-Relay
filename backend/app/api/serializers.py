"""Response serialisers.

One place decides how a domain object looks over the wire, so the mobile,
desktop, kiosk and agent surfaces cannot drift apart.

Privacy rule: kiosk and security payloads are produced by the same helpers but
with `audience` set, and personal data is trimmed rather than hidden client-side.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Asset,
    Case,
    CaseApproval,
    CaseEvent,
    Department,
    Document,
    GatePass,
    Location,
    Notice,
    NoticeRecipient,
    Notification,
    Service,
    Staff,
    Student,
    User,
)
from app.services import clock
from app.services.sla import evaluate_state


def user_brief(user: User | None) -> dict | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role_key,
        "language": user.language,
        "phone": user.phone,
    }


def user_profile(db: Session, user: User) -> dict:
    payload = user_brief(user)
    payload["campus"] = {"id": user.campus_id, "name": user.campus.name if user.campus else None}
    payload["permissions"] = sorted(user.permission_keys())
    payload["must_change_password"] = user.must_change_password

    student = db.scalar(select(Student).where(Student.user_id == user.id))
    if student is not None:
        payload["student"] = student_profile(student)
    staff = db.scalar(select(Staff).where(Staff.user_id == user.id))
    if staff is not None:
        payload["staff"] = {
            "id": staff.id,
            "designation": staff.designation,
            "department_id": staff.department_id,
            "department": staff.department.name if staff.department else None,
            "open_cases": open_case_count(db, staff.id),
            "workload_capacity": staff.workload_capacity,
        }
    return payload


def student_profile(student: Student) -> dict:
    return {
        "id": student.id,
        "roll_number": student.roll_number,
        "full_name": student.full_name,
        "branch": student.branch.name if student.branch else None,
        "branch_id": student.branch_id,
        "year": student.year.name if student.year else None,
        "year_id": student.year_id,
        "batch": student.batch.name if student.batch else None,
        "batch_id": student.batch_id,
        "hostel": student.hostel.name if student.hostel else None,
        "hostel_id": student.hostel_id,
        "room": student.room.number if student.room else None,
        "room_id": student.room_id,
        "is_hosteller": student.is_hosteller,
        "has_smartphone": student.has_smartphone,
        "dues_amount": student.dues_amount,
        "dues_paid": student.dues_paid,
        "dues_balance": student.dues_balance,
        "guardian_phone": student.guardian_phone,
    }


def open_case_count(db: Session, staff_id: int) -> int:
    from app.models.enums import OPEN_STATUSES

    return int(
        db.scalar(
            select(func.count(Case.id)).where(
                Case.assigned_staff_id == staff_id,
                Case.status.in_(tuple(OPEN_STATUSES)),
            )
        )
        or 0
    )


def location_brief(location: Location | None) -> dict | None:
    if location is None:
        return None
    return {
        "id": location.id,
        "code": location.code,
        "name": location.name,
        "kind": location.kind,
        "building": location.building,
        "hostel": location.hostel.name if location.hostel else None,
        "room": location.room.number if location.room else None,
        "department_id": location.department_id,
    }


def asset_brief(asset: Asset | None) -> dict | None:
    if asset is None:
        return None
    return {
        "id": asset.id,
        "code": asset.code,
        "name": asset.name,
        "category": asset.category,
        "state": asset.state,
        "location_id": asset.location_id,
        "location": location_brief(asset.location),
    }


def case_brief(db: Session, case: Case, *, audience: str = "full") -> dict:
    """Compact case card used by every queue/list view."""
    payload = {
        "id": case.id,
        "case_number": case.case_number,
        "title": case.title,
        "service_key": case.service_key,
        "service_name": case.service.name if case.service else case.service_key,
        "category": case.category,
        "subcategory": case.subcategory,
        "priority": case.priority,
        "status": case.status,
        "sla_state": case.sla_state,
        "due_at": case.due_at,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "last_activity_at": case.last_activity_at,
        "resolved_at": case.resolved_at,
        "closed_at": case.closed_at,
        "age_minutes": round(case.age_minutes, 1),
        "escalation_level": case.escalation_level,
        "reopen_count": case.reopen_count,
        "verification_state": case.verification_state,
        "source_channel": case.source_channel,
        "language": case.language,
        "location": location_brief(case.location) if hasattr(case, "location") else None,
        "department_id": case.department_id,
        "assigned_staff_id": case.assigned_staff_id,
        "current_step_key": case.current_step_key,
        "dedupe_state": case.dedupe_state,
        "parent_case_id": case.parent_case_id,
        "client_ref": case.client_ref,
        "captured_offline_at": case.captured_offline_at,
    }
    if audience in {"full", "staff"}:
        payload["requester"] = user_brief(case.requester)
        payload["requester_role"] = case.requester_role
        payload["requester_student"] = (
            {
                "id": case.requester_student.id,
                "full_name": case.requester_student.full_name,
                "roll_number": case.requester_student.roll_number,
                "hostel": case.requester_student.hostel.name if case.requester_student.hostel else None,
                "room": case.requester_student.room.number if case.requester_student.room else None,
            }
            if case.requester_student
            else None
        )
    return payload


def case_detail(db: Session, case: Case, *, audience: str = "full", include_internal: bool = True) -> dict:
    payload = case_brief(db, case, audience=audience)
    payload["description"] = case.description
    payload["resolution_note"] = case.resolution_note
    payload["state_payload"] = case.state_payload or {}
    payload["sla_minutes"] = case.sla_minutes
    payload["first_response_at"] = case.first_response_at
    payload["breached_at"] = case.breached_at
    payload["required_approvals"] = case.required_approvals or []
    payload["duplicate_group_id"] = case.duplicate_group_id
    payload["dedupe_score"] = case.dedupe_score
    payload["asset"] = asset_brief(case.asset) if hasattr(case, "asset") else None
    payload["department"] = (
        db.get(Department, case.department_id).name if case.department_id else None
    )
    payload["assigned_staff"] = (
        {
            "id": case.assigned_staff.id,
            "name": case.assigned_staff.user.full_name if case.assigned_staff.user else None,
            "designation": case.assigned_staff.designation,
            "department": case.assigned_staff.department.name
            if case.assigned_staff.department
            else None,
        }
        if case.assigned_staff
        else None
    )
    payload["timeline"] = case_timeline(db, case)
    payload["comments"] = case_comments(db, case, include_internal=include_internal)
    payload["attachments"] = case_attachments(db, case)
    payload["approvals"] = case_approvals(db, case)
    payload["workflow_steps"] = workflow_progress(db, case)
    payload["gate_pass"] = gate_pass_brief(db, case)
    payload["document"] = document_brief(db, case)
    return payload


def case_timeline(db: Session, case: Case) -> list[dict]:
    events = db.scalars(
        select(CaseEvent).where(CaseEvent.case_id == case.id).order_by(CaseEvent.created_at.asc())
    ).all()
    return [
        {
            "id": event.id,
            "event_type": event.event_type,
            "at": event.created_at,
            "from_status": event.from_status,
            "to_status": event.to_status,
            "step_key": event.step_key,
            "actor_role": event.actor_role,
            "actor_kind": event.actor_kind,
            "actor_name": event.actor.full_name if event.actor else None,
            "source_channel": event.source_channel,
            "payload": event.payload or {},
        }
        for event in events
    ]


def case_comments(db: Session, case: Case, *, include_internal: bool = True) -> list[dict]:
    from app.models import CaseComment

    stmt = select(CaseComment).where(CaseComment.case_id == case.id)
    if not include_internal:
        stmt = stmt.where(CaseComment.visibility == "PUBLIC")
    comments = db.scalars(stmt.order_by(CaseComment.created_at.asc())).all()
    return [
        {
            "id": c.id,
            "body": c.body,
            "visibility": c.visibility,
            "author_id": c.author_id,
            "author_name": c.author.full_name if c.author else "System",
            "author_role": c.author_role,
            "created_at": c.created_at,
            "source_channel": c.source_channel,
        }
        for c in comments
    ]


def case_attachments(db: Session, case: Case) -> list[dict]:
    from app.models import CaseAttachment

    rows = db.scalars(
        select(CaseAttachment).where(CaseAttachment.case_id == case.id).order_by(CaseAttachment.created_at.asc())
    ).all()
    return [
        {
            "id": a.id,
            "filename": a.filename,
            "kind": a.kind,
            "content_type": a.content_type,
            "size_bytes": a.size_bytes,
            "uploaded_by_id": a.uploaded_by_id,
            "created_at": a.created_at,
            "sha256": a.sha256,
            "url": f"/api/v1/cases/{case.id}/attachments/{a.id}",
            "note": a.note,
        }
        for a in rows
    ]


def case_approvals(db: Session, case: Case) -> list[dict]:
    rows = db.scalars(
        select(CaseApproval).where(CaseApproval.case_id == case.id).order_by(CaseApproval.sequence)
    ).all()
    return [
        {
            "id": a.id,
            "step_key": a.step_key,
            "approver_role": a.approver_role,
            "state": a.state,
            "requested_at": a.requested_at,
            "decided_at": a.decided_at,
            "decided_by": a.approver_id,
            "note": a.decision_note,
            "waiting_minutes": round(clock.minutes_since(a.requested_at) or 0, 1)
            if a.state == "PENDING"
            else None,
        }
        for a in rows
    ]


def workflow_progress(db: Session, case: Case) -> list[dict]:
    from app.services.workflow import WorkflowRunner

    runner = WorkflowRunner(db, case)
    return runner.steps_summary()


def gate_pass_brief(db: Session, case: Case) -> dict | None:
    gate_pass = db.scalar(select(GatePass).where(GatePass.case_id == case.id))
    if gate_pass is None:
        return None
    now = clock.now()
    return {
        "id": gate_pass.id,
        "pass_code": gate_pass.pass_code,
        "state": gate_pass.state,
        "valid_from": gate_pass.valid_from,
        "valid_to": gate_pass.valid_to,
        "destination": gate_pass.destination,
        "qr_payload": gate_pass.qr_payload,
        "is_currently_valid": clock.ensure_aware(gate_pass.valid_from)
        <= now
        <= clock.ensure_aware(gate_pass.valid_to),
    }


def document_brief(db: Session, case: Case) -> dict | None:
    document = db.scalar(select(Document).where(Document.case_id == case.id, Document.is_revoked.is_(False)))
    if document is None:
        return None
    return {
        "id": document.id,
        "kind": document.kind,
        "title": document.title,
        "serial_no": document.serial_no,
        "verification_code": document.verification_code,
        "issued_at": document.issued_at,
        "sha256": document.sha256,
        "download_url": f"/api/v1/documents/{document.id}/download",
    }


def service_brief(service: Service) -> dict:
    return {
        "id": service.id,
        "key": service.key,
        "name": service.name,
        "description": service.description,
        "category": service.category,
        "icon": service.icon,
        "default_priority": service.default_priority,
        "default_sla_minutes": service.default_sla_minutes,
        "allowed_requester_roles": service.allowed_requester_roles or [],
        "form_schema": service.form_schema or [],
        "requires_attachment": service.requires_attachment,
        "department_id": service.department_id,
        "workflow_id": service.workflow_id,
        "sort_order": service.sort_order,
        "is_active": service.is_active,
    }


def notice_brief(db: Session, notice: Notice, *, user: User | None = None) -> dict:
    payload = {
        "id": notice.id,
        "title": notice.title,
        "content": notice.content,
        "summary": notice.summary,
        "notice_type": notice.notice_type,
        "status": notice.status,
        "priority": notice.priority,
        "category": notice.category,
        "publish_at": notice.publish_at,
        "expires_at": notice.expires_at,
        "published_at": notice.published_at,
        "is_pinned": notice.is_pinned,
        "acknowledgement_required": notice.acknowledgement_required,
        "required_action": notice.required_action,
        "required_action_label": notice.required_action_label,
        "audience_summary": notice.audience_summary,
        "share_enabled": notice.share_enabled,
        "share_token": notice.share_token if notice.share_enabled else None,
        "attachment_name": notice.attachment_name,
        "has_attachment": bool(notice.attachment_path),
        "has_image": bool(notice.image_path),
        "created_by": notice.created_by.full_name if notice.created_by else None,
        "created_at": notice.created_at,
        "targets": [
            {"target_type": t.target_type, "target_id": t.target_id, "label": t.label}
            for t in notice.targets
        ],
    }
    if user is not None:
        recipient = db.scalar(
            select(NoticeRecipient).where(
                NoticeRecipient.notice_id == notice.id, NoticeRecipient.user_id == user.id
            )
        )
        payload["my_state"] = {
            "delivered_at": recipient.delivered_at if recipient else None,
            "read_at": recipient.read_at if recipient else None,
            "acknowledged_at": recipient.acknowledged_at if recipient else None,
            "action_completed_at": recipient.action_completed_at if recipient else None,
            "needs_acknowledgement": bool(
                notice.acknowledgement_required and recipient and recipient.acknowledged_at is None
            ),
        }
    return payload


def notification_brief(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "category": notification.category,
        "title": notification.title,
        "body": notification.body,
        "priority": notification.priority,
        "state": notification.state,
        "action_label": notification.action_label,
        "action_type": notification.action_type,
        "action_target": notification.action_target,
        "case_id": notification.case_id,
        "notice_id": notification.notice_id,
        "created_at": notification.created_at,
        "delivered_at": notification.delivered_at,
        "read_at": notification.read_at,
        "actioned_at": notification.actioned_at,
        "is_read": notification.read_at is not None,
    }


def case_metrics(rows: list[Case]) -> dict:
    """Small aggregate block the UI can show without a second request."""
    now = clock.now()
    breached = sum(1 for c in rows if evaluate_state(c, now=now) == "BREACHED")
    return {"count": len(rows), "breached": breached}
