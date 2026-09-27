"""Agent API.

All four agents are reached through the tool layer, which enforces permission,
policy and state server-side. An agent can be wrong; it cannot exceed its
authority.
"""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.api.serializers import case_brief
from app.api.v1.schemas import AssistantConfirmRequest, AssistantRequest, IntakeRequest
from app.core.permissions import AGENT_OPERATE
from app.services import case_engine, scoping
from app.services.agents import (
    OperationsAgent,
    RoutingAgent,
    StudentAssistant,
    confirm_action,
    provider_status,
    recurring_summary,
)
from app.services.agents.intake import IntakeAgent

router = APIRouter(tags=["agents"])

intake_agent = IntakeAgent()
operations_agent = OperationsAgent()
routing_agent = RoutingAgent()
assistant = StudentAssistant()


@router.get("/agents/status")
def status(db: DbSession, user: CurrentUser):
    """Which intelligence path is live, and what it will not do."""
    payload = provider_status()
    payload["guardrails"] = [
        "Agents cannot execute SQL or write to the database directly.",
        "Every agent action passes permission, policy and workflow checks in the service layer.",
        "Mutating suggestions require explicit confirmation before they are applied.",
        "Every tool call is written to the audit trail with the acting user and role.",
        "When no model is configured, deterministic engines answer instead - workflows never depend on AI.",
    ]
    return payload


@router.post("/agents/intake")
def intake(payload: IntakeRequest, db: DbSession, user: CurrentUser):
    """Agent 1: classify free text into a structured intake record."""
    assert_permission(user, AGENT_OPERATE)
    analysis = intake_agent.analyze(
        db, user=user, text=payload.text, service_key=payload.service_key, location_code=payload.location_code
    )
    return analysis.as_dict()


@router.get("/agents/routing/{case_id}")
def routing_explanation(case_id: int, db: DbSession, user: CurrentUser):
    """Agent 2: explain the department/assignee/SLA recommendation for a case."""
    assert_permission(user, AGENT_OPERATE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    return routing_agent.explain(db, user=user, case=case).as_dict()


@router.post("/agents/routing/preview")
def routing_preview(payload: IntakeRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, AGENT_OPERATE)
    service_key = payload.service_key or "HOSTEL_COMPLAINT"
    return routing_agent.preview(
        db, user=user, service_key=service_key, description=payload.text
    ).as_dict()


@router.get("/agents/operations/briefing")
def operations_briefing(db: DbSession, user: CurrentUser):
    """Agent 3: admin-facing briefing with recommendations clearly marked."""
    assert_permission(user, AGENT_OPERATE)
    return operations_agent.briefing(db, user=user).as_dict()


@router.get("/agents/operations/recurring")
def recurring(db: DbSession, user: CurrentUser, window_days: int = 30):
    assert_permission(user, AGENT_OPERATE)
    return recurring_summary(db, campus_id=user.campus_id, window_days=window_days)


@router.post("/agents/assistant/ask")
def ask(payload: AssistantRequest, db: DbSession, user: CurrentUser):
    """Agent 4: tool-backed answers. Actions return a proposal, not a write."""
    answer = assistant.ask(db, user=user, question=payload.question)
    return answer.as_dict()


@router.post("/agents/assistant/confirm")
def confirm(payload: AssistantConfirmRequest, db: DbSession, user: CurrentUser):
    """Apply a previously proposed agent action after the user confirms it."""
    answer = confirm_action(db, user=user, proposed_action=payload.proposed_action)
    return answer.as_dict()


@router.get("/agents/capabilities")
def capabilities(db: DbSession, user: CurrentUser):
    """What the assistant can do *for this user*, based on their permissions."""
    assert_permission(user, AGENT_OPERATE)
    from app.services.agents import tools

    held = user.permission_keys()
    available = []
    for name, tool in tools.TOOLS.items():
        if all(permission in held for permission in tool.permissions):
            available.append(
                {
                    "name": name,
                    "description": tool.description,
                    "mutating": tool.mutating,
                    "requires_confirmation": tool.mutating,
                }
            )
    return {"tools": available, "blocked": sorted(set(tools.TOOLS) - {t["name"] for t in available})}


@router.get("/agents/case-summary/{case_id}")
def case_summary(case_id: int, db: DbSession, user: CurrentUser):
    """Short, factual summary of one case for a handover or an admin glance."""
    assert_permission(user, AGENT_OPERATE)
    case = case_engine.case_or_404(db, case_id)
    scoping.assert_can_view_case(db, user, case)
    briefing = operations_agent.briefing(db, user=user)
    del briefing
    from app.services import clock

    return {
        "case": case_brief(db, case, audience="staff"),
        "summary": (
            f"{case.case_number} - {case.title}. Status {case.status}, priority {case.priority}, "
            f"SLA {case.sla_state}"
            + (f", due {case.due_at.isoformat()}" if case.due_at else "")
            + f". Open for {round(case.age_minutes)} minutes with {case.reopen_count} reopen(s)."
        ),
        "age_minutes": round(case.age_minutes, 1),
        "minutes_until_due": round(clock.minutes_until(case.due_at) or 0, 1) if case.due_at else None,
    }
