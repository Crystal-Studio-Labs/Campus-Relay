"""Security gate API.

Designed for a phone held in one hand at a gate: few fields, fast response,
explicit accept/refuse reasons.
"""

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, RequestContext, assert_permission
from app.api.serializers import case_brief
from app.api.v1.schemas import GateMovementRequest, GateVerifyRequest
from app.core.errors import NotFoundError
from app.core.permissions import GATE_LOG_READ, GATE_OPERATE, GATE_VERIFY
from app.models import GateLog, GatePass
from app.services import case_engine, clock, gate

router = APIRouter(tags=["gate"])


@router.post("/gate/verify")
def verify(payload: GateVerifyRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, GATE_VERIFY)
    result = case_engine.verify_gate_pass(db, campus_id=user.campus_id, pass_code=payload.pass_code)
    if result.get("case", {}).get("id"):
        case = case_engine.case_or_404(db, result["case"]["id"])
        result["case"]["url"] = f"/admin/cases/{case.id}"
        result["case"]["timeline_summary"] = case_brief(db, case, audience="staff")
    return result


@router.post("/gate/movements", status_code=201)
def record_movement(payload: GateMovementRequest, db: DbSession, user: CurrentUser, context: RequestContext):
    assert_permission(user, GATE_OPERATE)
    log = gate.record_movement(
        db,
        actor=user,
        direction=payload.direction,
        pass_code=payload.pass_code,
        student_id=payload.student_id,
        gate_location_id=payload.gate_location_id,
        occurred_at=payload.occurred_at,
        source_channel=context.source_channel,
        device_uid=context.device_uid,
        client_ref=payload.client_ref or context.idempotency_key,
        note=payload.note,
        offline_captured_at=payload.offline_captured_at,
    )
    return {
        "id": log.id,
        "direction": log.direction,
        "occurred_at": log.occurred_at,
        "offline_captured_at": log.offline_captured_at,
        "case_id": log.case_id,
    }


@router.get("/gate/passes")
def active_passes(db: DbSession, user: CurrentUser, limit: int = Query(default=50, le=200)):
    assert_permission(user, GATE_LOG_READ)
    return {"passes": gate.active_passes(db, campus_id=user.campus_id, limit=limit)}


@router.get("/gate/logs")
def gate_logs(db: DbSession, user: CurrentUser, limit: int = Query(default=50, le=200)):
    assert_permission(user, GATE_LOG_READ)
    return {"logs": gate.recent_logs(db, campus_id=user.campus_id, limit=limit)}


@router.post("/gate/passes/{pass_id}/revoke")
def revoke(pass_id: int, db: DbSession, user: CurrentUser, reason: str = "Revoked at gate"):
    assert_permission(user, GATE_OPERATE)
    gate_pass = db.get(GatePass, pass_id)
    if gate_pass is None or gate_pass.campus_id != user.campus_id:
        raise NotFoundError("Gate pass not found.")
    gate.revoke_pass(db, gate_pass=gate_pass, actor=user, reason=reason)
    return {"pass_code": gate_pass.pass_code, "state": gate_pass.state}


@router.get("/gate/summary")
def gate_summary(db: DbSession, user: CurrentUser):
    """Live figure the security desk watches: who is out right now."""
    from sqlalchemy import func, select

    from app.models import Student

    campus_id = user.campus_id
    passes = gate.active_passes(db, campus_id=campus_id, limit=200)
    currently_out: list[dict] = []
    for item in passes:
        last = db.scalar(
            select(GateLog)
            .where(GateLog.gate_pass_id == item["id"])
            .order_by(GateLog.occurred_at.desc())
        )
        if last is not None and last.direction == "EXIT":
            currently_out.append({**item, "last_movement": last.occurred_at})

    today = clock.now().replace(hour=0, minute=0, second=0, microsecond=0)
    entries_today = int(
        db.scalar(
            select(func.count(GateLog.id)).where(
                GateLog.campus_id == campus_id,
                GateLog.direction == "ENTRY",
                GateLog.occurred_at >= today,
            )
        )
        or 0
    )
    exits_today = int(
        db.scalar(
            select(func.count(GateLog.id)).where(
                GateLog.campus_id == campus_id,
                GateLog.direction == "EXIT",
                GateLog.occurred_at >= today,
            )
        )
        or 0
    )
    hostellers = int(
        db.scalar(select(func.count(Student.id)).where(Student.campus_id == campus_id, Student.is_hosteller.is_(True)))
        or 0
    )
    return {
        "currently_out": currently_out,
        "currently_out_count": len(currently_out),
        "entries_today": entries_today,
        "exits_today": exits_today,
        "hostellers_on_record": hostellers,
        "active_passes": len(passes),
    }
