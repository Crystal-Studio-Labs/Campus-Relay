"""Configuration catalog: services, locations/QR, workflows, policies, SLA rules."""

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.serializers import case_brief, location_brief, service_brief
from app.core.errors import NotFoundError
from app.core.permissions import ANALYTICS_READ, CONFIG_MANAGE
from app.api.deps import assert_permission
from app.models import Case, Location, Policy, Service, SlaRule, Workflow

router = APIRouter(tags=["catalog"])


@router.get("/services")
def list_services(db: DbSession, user: CurrentUser):
    services = db.scalars(
        select(Service)
        .where(Service.campus_id == user.campus_id, Service.is_active.is_(True))
        .order_by(Service.sort_order, Service.name)
    ).all()
    payload = []
    for service in services:
        item = service_brief(service)
        item["can_raise"] = (
            not item["allowed_requester_roles"] or user.role_key in set(item["allowed_requester_roles"])
        )
        payload.append(item)
    return {"services": payload}


@router.get("/locations")
def list_locations(
    db: DbSession,
    user: CurrentUser,
    kind: str | None = None,
    q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, le=200),
):
    stmt = select(Location).where(Location.campus_id == user.campus_id, Location.is_active.is_(True))
    if kind:
        stmt = stmt.where(Location.kind == kind)
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(Location.name.ilike(pattern) | Location.code.ilike(pattern))
    locations = db.scalars(stmt.order_by(Location.name).limit(limit)).all()
    return {"locations": [location_brief(location) for location in locations]}


@router.get("/locations/{code}")
def resolve_qr(db: DbSession, user: CurrentUser, code: str):
    """Resolve a scanned QR code into context for a pre-filled report.

    The QR payload carries no personal data: it is an operational place id.
    """
    location = db.scalar(
        select(Location).where(Location.campus_id == user.campus_id, Location.code == code)
    )
    if location is None:
        raise NotFoundError("That QR code is not recognised on this campus.")

    recent = db.scalars(
        select(Case)
        .where(Case.campus_id == user.campus_id, Case.location_id == location.id)
        .order_by(Case.created_at.desc())
        .limit(5)
    ).all()

    from app.models import Asset

    asset_rows = db.scalars(
        select(Asset).where(Asset.campus_id == user.campus_id, Asset.location_id == location.id).limit(20)
    ).all()

    return {
        "location": location_brief(location),
        "suggested_services": _suggest_services(location.kind),
        "recent_cases_at_location": [case_brief(db, case) for case in recent],
        "assets_here": [
            {"id": a.id, "code": a.code, "name": a.name, "state": a.state} for a in asset_rows
        ],
        "privacy_note": "QR codes contain only the location identifier, never student data.",
    }


def _suggest_services(kind: str) -> list[str]:
    mapping = {
        "HOSTEL_ROOM": ["HOSTEL_COMPLAINT", "ROOM_CHANGE", "MESS_COMPLAINT"],
        "WASHROOM": ["HOSTEL_COMPLAINT", "FACILITY_REQUEST"],
        "WATER_COOLER": ["FACILITY_REQUEST", "HOSTEL_COMPLAINT"],
        "CORRIDOR": ["FACILITY_REQUEST", "HOSTEL_COMPLAINT"],
        "CLASSROOM": ["FACILITY_REQUEST", "ACADEMIC_QUERY"],
        "LAB": ["FACILITY_REQUEST", "ACADEMIC_QUERY"],
        "LIBRARY": ["FACILITY_REQUEST", "ACADEMIC_QUERY"],
        "MESS": ["MESS_COMPLAINT", "FACILITY_REQUEST"],
        "GATE": ["GATE_PASS", "VISITOR_REQUEST"],
        "OFFICE": ["FEE_QUERY", "DOCUMENT_REQUEST", "BONAFIDE_CERTIFICATE"],
        "EQUIPMENT": ["FACILITY_REQUEST"],
    }
    return mapping.get(kind, ["HOSTEL_COMPLAINT", "FACILITY_REQUEST"])


@router.get("/workflows")
def list_workflows(db: DbSession, user: CurrentUser):
    assert_permission(user, CONFIG_MANAGE)
    workflows = db.scalars(
        select(Workflow).where(Workflow.campus_id == user.campus_id).order_by(Workflow.name)
    ).all()
    return {
        "workflows": [
            {
                "id": wf.id,
                "key": wf.key,
                "name": wf.name,
                "description": wf.description,
                "initial_state": wf.initial_state,
                "is_active": wf.is_active,
                "steps": [
                    {
                        "key": step.key,
                        "name": step.name,
                        "type": step.step_type,
                        "responsible_role": step.responsible_role,
                        "sla_minutes": step.sla_minutes,
                        "requires_note": step.requires_note,
                        "transitions": step.transitions or {},
                        "required_fields": step.required_fields or [],
                    }
                    for step in wf.steps
                ],
            }
            for wf in workflows
        ]
    }


@router.get("/policies")
def list_policies(db: DbSession, user: CurrentUser):
    assert_permission(user, CONFIG_MANAGE)
    policies = db.scalars(
        select(Policy).where(Policy.campus_id == user.campus_id).order_by(Policy.evaluation_order)
    ).all()
    return {
        "policies": [
            {
                "id": p.id,
                "key": p.key,
                "name": p.name,
                "description": p.description,
                "service_key": p.service_key,
                "effect": p.effect,
                "evaluation_order": p.evaluation_order,
                "conditions": p.conditions,
                "message": p.message,
                "is_active": p.is_active,
            }
            for p in policies
        ]
    }


@router.get("/sla-rules")
def list_sla_rules(db: DbSession, user: CurrentUser):
    assert_permission(user, ANALYTICS_READ)
    rules = db.scalars(
        select(SlaRule).where(SlaRule.campus_id == user.campus_id).order_by(SlaRule.service_key, SlaRule.priority)
    ).all()
    return {
        "rules": [
            {
                "id": r.id,
                "service_key": r.service_key,
                "priority": r.priority,
                "target_minutes": r.target_minutes,
                "at_risk_ratio": r.at_risk_ratio,
                "escalate_to_role": r.escalate_to_role,
                "is_active": r.is_active,
            }
            for r in rules
        ],
        "note": "DEMO VALUES unless replaced by institution-provided targets.",
    }


@router.get("/catalog/context")
def app_context(db: DbSession, user: CurrentUser):
    """One call the client uses at boot: profile, catalog, targets, channels.

    Keeps the mobile first paint to a single request on a weak connection.
    """
    from app.services.agents import provider_status

    services = db.scalars(
        select(Service)
        .where(Service.campus_id == user.campus_id, Service.is_active.is_(True))
        .order_by(Service.sort_order)
    ).all()
    return {
        "campus": {"id": user.campus_id, "name": user.campus.name if user.campus else None},
        "role": user.role_key,
        "permissions": sorted(user.permission_keys()),
        "services": [
            {**service_brief(s), "can_raise": (not s.allowed_requester_roles) or user.role_key in set(s.allowed_requester_roles)}
            for s in services
        ],
        "channels": ["IN_APP", "PWA_PUSH_OPTIONAL"],
        "agents": provider_status(),
        "languages": ["en", "or"],
    }
