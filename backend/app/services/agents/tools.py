"""The tool layer.

An agent never touches the database. It may only call a named tool, and every
tool:

  1. declares the permissions it requires,
  2. re-checks them against the acting user,
  3. applies the same service layer and policies the HTTP API uses,
  4. is recorded in the audit trail.

That is the whole point of the architecture:
    USER -> AGENT -> TOOL -> AUTHORIZATION -> POLICY -> SERVICE -> DB -> AUDIT
"""

from dataclasses import dataclass, field
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import PermissionDeniedError
from app.core.permissions import (
    ANALYTICS_READ,
    CASE_CREATE,
    CASE_READ_OWN,
    CASE_READ_SCOPE,
)
from app.models import Case, Notice, NoticeRecipient, Service, User
from app.models.enums import AuditEventType, OPEN_STATUSES
from app.services import analytics, audit, case_engine, clock, routing
from app.services import scoping
from app.services.agents import provider as provider_module


@dataclass
class ToolResult:
    tool: str
    ok: bool
    data: Any = None
    error: str | None = None
    requires_confirmation: bool = False
    proposed_action: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "tool": self.tool,
            "ok": self.ok,
            "data": self.data,
            "error": self.error,
            "requires_confirmation": self.requires_confirmation,
            "proposed_action": self.proposed_action,
        }


@dataclass
class Tool:
    name: str
    description: str
    permissions: tuple[str, ...]
    handler: Callable[..., Any]
    parameters: dict
    mutating: bool = False


def _case_brief(case: Case) -> dict:
    return {
        "case_id": case.id,
        "case_number": case.case_number,
        "title": case.title,
        "service_key": case.service_key,
        "status": case.status,
        "priority": case.priority,
        "sla_state": case.sla_state,
        "due_at": case.due_at,
        "assigned_to": case.assigned_staff.user.full_name
        if case.assigned_staff
        else None,
        "department_id": case.department_id,
        "created_at": case.created_at,
        "resolved_at": case.resolved_at,
        "current_step": case.current_step_key,
        "reopen_count": case.reopen_count,
    }


# --- Read tools -----------------------------------------------------------


def tool_my_cases(db: Session, user: User, status: str | None = None, limit: int = 20) -> dict:
    condition = scoping.case_scope_condition(db, user)
    if condition is None:
        return {"cases": [], "note": "This role has no case visibility."}
    stmt = select(Case).where(condition).order_by(Case.created_at.desc()).limit(min(limit, 50))
    if status:
        stmt = stmt.where(Case.status == status)
    cases = db.scalars(stmt).all()
    return {"count": len(cases), "cases": [_case_brief(c) for c in cases]}


def tool_case_detail(db: Session, user: User, case_id: int) -> dict:
    case = case_engine.case_or_404(db, int(case_id))
    scoping.assert_can_view_case(db, user, case)
    from app.models import CaseApproval, CaseEvent

    events = db.scalars(
        select(CaseEvent)
        .where(CaseEvent.case_id == case.id)
        .order_by(CaseEvent.created_at.asc())
        .limit(50)
    ).all()
    approvals = db.scalars(
        select(CaseApproval).where(CaseApproval.case_id == case.id).order_by(CaseApproval.sequence)
    ).all()
    return {
        "case": _case_brief(case),
        "description": case.description,
        "resolution_note": case.resolution_note,
        "verification_state": case.verification_state,
        "state_payload": case.state_payload,
        "timeline": [
            {
                "at": e.created_at,
                "event": e.event_type,
                "from": e.from_status,
                "to": e.to_status,
                "actor_role": e.actor_role,
            }
            for e in events
        ],
        "approvals": [
            {
                "step": a.step_key,
                "role": a.approver_role,
                "state": a.state,
                "requested_at": a.requested_at,
                "decided_at": a.decided_at,
                "note": a.decision_note,
            }
            for a in approvals
        ],
    }


def tool_case_timeline(db: Session, user: User, case_id: int) -> dict:
    detail = tool_case_detail(db, user, case_id)
    return {"case_number": detail["case"]["case_number"], "timeline": detail["timeline"]}


def tool_my_notices(db: Session, user: User, limit: int = 10) -> dict:
    from app.services import notices as notice_service

    rows = db.scalars(
        select(Notice)
        .join(NoticeRecipient, NoticeRecipient.notice_id == Notice.id)
        .where(NoticeRecipient.user_id == user.id)
        .order_by(Notice.publish_at.desc())
        .limit(min(limit, 25))
    ).all()
    return {
        "count": len(rows),
        "pending_acknowledgements": notice_service.pending_acknowledgements(
            db, campus_id=user.campus_id, user=user
        ),
        "notices": [
            {
                "notice_id": n.id,
                "title": n.title,
                "type": n.notice_type,
                "published_at": n.publish_at,
                "requires_action": n.required_action,
                "summary": n.summary,
            }
            for n in rows
        ],
    }


def tool_list_services(db: Session, user: User) -> dict:
    services = db.scalars(
        select(Service)
        .where(Service.campus_id == user.campus_id, Service.is_active.is_(True))
        .order_by(Service.sort_order)
    ).all()
    return {
        "services": [
            {
                "key": s.key,
                "name": s.name,
                "category": s.category,
                "default_priority": s.default_priority,
                "required_fields": [
                    f.get("name") for f in (s.form_schema or []) if f.get("required")
                ],
                "can_raise": (not s.allowed_requester_roles)
                or user.role_key in set(s.allowed_requester_roles),
            }
            for s in services
        ]
    }


def tool_my_approvals(db: Session, user: User) -> dict:
    from app.models import CaseApproval

    rows = db.scalars(
        select(CaseApproval)
        .where(
            CaseApproval.campus_id == user.campus_id,
            CaseApproval.state == "PENDING",
            CaseApproval.approver_role == user.role_key,
        )
        .order_by(CaseApproval.requested_at.asc())
    ).all()
    result = []
    for approval in rows:
        case = db.get(Case, approval.case_id)
        if case is None:
            continue
        result.append(
            {
                "case_id": case.id,
                "case_number": case.case_number,
                "title": case.title,
                "priority": case.priority,
                "requested_at": approval.requested_at,
                "waiting_minutes": round(clock.minutes_since(approval.requested_at) or 0, 1),
                "state_payload": case.state_payload,
            }
        )
    return {"pending": len(result), "approvals": result}


def tool_operations_summary(db: Session, user: User) -> dict:
    if ANALYTICS_READ not in user.permission_keys() and "case:read_all" not in user.permission_keys():
        raise PermissionDeniedError("The operations summary needs dashboard access.")
    summary = analytics.dashboard(db, campus_id=user.campus_id)
    return {
        "open_cases": summary["open_cases"],
        "unassigned_cases": summary["unassigned_cases"],
        "sla_breaches": summary["sla_breaches"],
        "sla_at_risk": summary["sla_at_risk"],
        "awaiting_approval": summary["awaiting_approval"],
        "awaiting_verification": summary["awaiting_verification"],
        "average_resolution_minutes": summary["average_resolution_minutes"],
        "ageing": summary["ageing"],
        "recurring_issues": summary["recurring_issues"][:5],
        "staff_workload": summary["staff_workload"],
        "by_department": summary["by_department"],
    }


def tool_staff_workload(db: Session, user: User) -> dict:
    if "analytics:read" not in user.permission_keys():
        raise PermissionDeniedError("Workload data needs analytics access.")
    return {"staff": analytics.staff_workload_detail(db, campus_id=user.campus_id)}


def tool_explain_routing(db: Session, user: User, service_key: str, text: str) -> dict:
    service = case_engine.service_by_key(db, campus_id=user.campus_id, key=service_key)
    intake = routing.classify(text, service_key=service.key)
    recommendation = routing.recommend_routing(
        db,
        campus_id=user.campus_id,
        service=service,
        category=intake.category,
        priority=intake.priority,
        location=None,
        service_key=service.key,
    )
    return {
        "service_key": service.key,
        "classified_category": intake.category,
        "priority": intake.priority,
        "recommended_department": recommendation.department_name,
        "recommended_staff": recommendation.staff_name,
        "sla_minutes": recommendation.sla_minutes,
        "explanation": recommendation.explanation,
        "confidence": intake.confidence,
    }


# --- Mutating tools -------------------------------------------------------


def tool_create_case(
    db: Session,
    user: User,
    service_key: str,
    description: str,
    location_code: str | None = None,
    title: str | None = None,
    state_payload: dict | None = None,
    priority: str | None = None,
    confirmed: bool = False,
) -> ToolResult:
    """Mutating tool. Requires explicit confirmation before it commits."""
    # Pre-classify so the user is shown exactly what would be created.
    preview = routing.classify(description, service_key=service_key, title=title)
    if not confirmed:
        return ToolResult(
            tool="create_case",
            ok=True,
            data={
                "service_key": service_key,
                "title": title or preview.title,
                "category": preview.category,
                "priority": priority or preview.priority,
                "missing_information": preview.missing_information,
                "location_code": location_code,
            },
            requires_confirmation=True,
            proposed_action={
                "type": "CREATE_CASE",
                "payload": {
                    "service_key": service_key,
                    "description": description,
                    "title": title or preview.title,
                    "location_code": location_code,
                    "state_payload": state_payload or {},
                    "priority": priority or preview.priority,
                },
            },
        )

    draft = case_engine.CaseDraft(
        service_key=service_key,
        description=description,
        title=title,
        priority=priority,
        location_code=location_code,
        state_payload=state_payload or {},
        source_channel="AGENT",
    )
    result = case_engine.create_case(db, actor=user, draft=draft)
    return ToolResult(
        tool="create_case",
        ok=True,
        data={
            "case_id": result.case.id,
            "case_number": result.case.case_number,
            "status": result.case.status,
            "duplicate_of": result.duplicate_of.case_number if result.duplicate_of else None,
            "routing": result.routing_explanation,
            "category": result.intake.get("category"),
            "priority": result.intake.get("priority"),
        },
    )


def tool_add_comment(db: Session, user: User, case_id: int, body: str) -> dict:
    case = case_engine.case_or_404(db, int(case_id))
    scoping.assert_can_view_case(db, user, case)
    comment = case_engine.add_comment(db, case=case, actor=user, body=body, source_channel="AGENT")
    return {"comment_id": comment.id, "case_number": case.case_number, "status": case.status}


def tool_request_approval_decision(
    db: Session,
    user: User,
    case_id: int,
    approve: bool,
    note: str | None = None,
    confirmed: bool = False,
) -> ToolResult:
    case = case_engine.case_or_404(db, int(case_id))
    if not confirmed:
        return ToolResult(
            tool="decide_approval",
            ok=True,
            data={
                "case_number": case.case_number,
                "title": case.title,
                "decision": "APPROVE" if approve else "REJECT",
                "role_required": [a.approver_role for a in case.required_approvals or []],
            },
            requires_confirmation=True,
            proposed_action={
                "type": "DECIDE_APPROVAL",
                "payload": {"case_id": case.id, "approve": approve, "note": note},
            },
        )
    case_engine.decide_approval(db, case=case, actor=user, approve=approve, note=note)
    return ToolResult(
        tool="decide_approval",
        ok=True,
        data={"case_id": case.id, "status": case.status, "approve": approve},
    )


TOOLS: dict[str, Tool] = {
    "my_cases": Tool(
        name="my_cases",
        description="List the campus cases visible to the current user (optionally filtered by status).",
        permissions=(CASE_READ_OWN,),
        handler=tool_my_cases,
        parameters={
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Optional case status filter"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    ),
    "case_detail": Tool(
        name="case_detail",
        description="Full detail, timeline and approvals for one case.",
        permissions=(CASE_READ_OWN,),
        handler=tool_case_detail,
        parameters={
            "type": "object",
            "properties": {"case_id": {"type": "integer"}},
            "required": ["case_id"],
        },
    ),
    "case_timeline": Tool(
        name="case_timeline",
        description="Chronological events for one case.",
        permissions=(CASE_READ_OWN,),
        handler=tool_case_timeline,
        parameters={
            "type": "object",
            "properties": {"case_id": {"type": "integer"}},
            "required": ["case_id"],
        },
    ),
    "my_notices": Tool(
        name="my_notices",
        description="Notices addressed to the current user, plus outstanding acknowledgements.",
        permissions=(),
        handler=tool_my_notices,
        parameters={"type": "object", "properties": {"limit": {"type": "integer", "default": 10}}},
    ),
    "list_services": Tool(
        name="list_services",
        description="The campus service catalog with required fields.",
        permissions=(),
        handler=tool_list_services,
        parameters={"type": "object", "properties": {}},
    ),
    "my_approvals": Tool(
        name="my_approvals",
        description="Approvals waiting on the current user's role, with how long they have waited.",
        permissions=(),
        handler=tool_my_approvals,
        parameters={"type": "object", "properties": {}},
    ),
    "operations_summary": Tool(
        name="operations_summary",
        description="Operational snapshot: backlog, SLA risk, ageing, workload, recurring issues.",
        permissions=(ANALYTICS_READ,),
        handler=tool_operations_summary,
        parameters={"type": "object", "properties": {}},
    ),
    "staff_workload": Tool(
        name="staff_workload",
        description="Open-case load per staff member with utilisation.",
        permissions=(ANALYTICS_READ,),
        handler=tool_staff_workload,
        parameters={"type": "object", "properties": {}},
    ),
    "explain_routing": Tool(
        name="explain_routing",
        description="Show how a request would be classified, routed and scheduled.",
        permissions=(CASE_READ_SCOPE,),
        handler=tool_explain_routing,
        parameters={
            "type": "object",
            "properties": {
                "service_key": {"type": "string"},
                "text": {"type": "string"},
            },
            "required": ["service_key", "text"],
        },
    ),
    "create_case": Tool(
        name="create_case",
        description="Raise a campus case. Always asks for confirmation first.",
        permissions=(CASE_CREATE,),
        handler=tool_create_case,
        parameters={
            "type": "object",
            "properties": {
                "service_key": {"type": "string"},
                "description": {"type": "string"},
                "location_code": {"type": "string"},
                "title": {"type": "string"},
                "priority": {"type": "string"},
                "state_payload": {"type": "object"},
                "confirmed": {"type": "boolean", "default": False},
            },
            "required": ["service_key", "description"],
        },
        mutating=True,
    ),
    "add_case_comment": Tool(
        name="add_case_comment",
        description="Add a public comment to a case the user can see.",
        permissions=(CASE_READ_OWN,),
        handler=tool_add_comment,
        parameters={
            "type": "object",
            "properties": {"case_id": {"type": "integer"}, "body": {"type": "string"}},
            "required": ["case_id", "body"],
        },
        mutating=True,
    ),
    "decide_approval": Tool(
        name="decide_approval",
        description="Approve or reject a pending case approval. Always asks for confirmation first.",
        permissions=("approval:decide",),
        handler=tool_request_approval_decision,
        parameters={
            "type": "object",
            "properties": {
                "case_id": {"type": "integer"},
                "approve": {"type": "boolean"},
                "note": {"type": "string"},
                "confirmed": {"type": "boolean", "default": False},
            },
            "required": ["case_id", "approve"],
        },
        mutating=True,
    ),
}


def tool_schemas(names: list[str] | None = None) -> list[dict]:
    """OpenAI-style function schemas for the optional LLM provider."""
    selected = [TOOLS[n] for n in (names or TOOLS.keys()) if n in TOOLS]
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        }
        for tool in selected
    ]


def call_tool(
    db: Session,
    *,
    user: User,
    name: str,
    arguments: dict[str, Any] | None = None,
    agent: str = "assistant",
) -> ToolResult:
    """Authorize, execute and audit one tool call."""
    tool = TOOLS.get(name)
    if tool is None:
        return ToolResult(tool=name, ok=False, error="Unknown tool.")

    held = user.permission_keys()
    missing = [p for p in tool.permissions if p not in held]
    if missing:
        audit.record_audit(
            db,
            event_type=AuditEventType.AUTH_DENIED.value,
            campus_id=user.campus_id,
            actor=user,
            entity_type="AGENT_TOOL",
            entity_id=name,
            payload={"agent": agent, "missing_permissions": missing},
        )
        return ToolResult(
            tool=name,
            ok=False,
            error="Your role does not allow this tool.",
            data={"missing_permissions": missing},
        )

    try:
        result = tool.handler(db, user, **(arguments or {}))
    except PermissionDeniedError as exc:
        return ToolResult(tool=name, ok=False, error=exc.message)
    except Exception as exc:  # noqa: BLE001 - surface a safe message to the agent
        from app.core.errors import AppError

        if isinstance(exc, AppError):
            return ToolResult(tool=name, ok=False, error=exc.message)
        return ToolResult(tool=name, ok=False, error=f"Tool failed: {type(exc).__name__}")

    if isinstance(result, ToolResult):
        result.tool = name
        payload = result.data if not result.requires_confirmation else result.data
    else:
        result = ToolResult(tool=name, ok=True, data=result)
        payload = result.data

    audit.record_audit(
        db,
        event_type=AuditEventType.AGENT_ACTION.value if tool.mutating else AuditEventType.AGENT_QUERY.value,
        campus_id=user.campus_id,
        actor=user,
        actor_kind="AGENT",
        entity_type="AGENT_TOOL",
        entity_id=name,
        payload={
            "agent": agent,
            "tool": name,
            "mutating": tool.mutating,
            "ok": result.ok,
            "requires_confirmation": result.requires_confirmation,
            "arguments": {k: _safe_arg(v) for k, v in (arguments or {}).items()},
            "summary": _summarise_payload(payload),
        },
    )
    return result


def _safe_arg(value: Any) -> Any:
    if isinstance(value, str):
        return value[:200]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return "<object>"


def _summarise_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        if "cases" in payload:
            return {"case_count": len(payload.get("cases") or [])}
        if "notices" in payload:
            return {"notice_count": len(payload.get("notices") or [])}
        return {k: payload[k] for k in list(payload)[:6] if isinstance(payload[k], (str, int, float, bool))}
    return str(payload)[:120]


def provider_tools() -> list[dict]:
    return tool_schemas()


def agent_provider_status() -> dict:
    return provider_module.provider_status()
