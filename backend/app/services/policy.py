"""Policy engine.

Policies are data (the `policies` table), evaluated server-side before a state
change is allowed to commit. The engine never trusts client-supplied facts:
callers pass a `facts` dict resolved from the database, and clauses may only
reference keys the engine knows how to resolve.

Condition shape
---------------
{
  "all": [
    {"field": "state_payload.leave_start", "op": "required"},
    {"field": "state_payload.leave_end",   "op": "gte_field",
     "other": "state_payload.leave_start", "message": "..."},
    {"fact": "dues_clear", "op": "eq", "value": true}
  ]
}
`all` requires every clause; `any` requires at least one.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import PolicyViolationError
from app.models import Policy
from app.models.enums import PolicyEffect
from app.services import clock


@dataclass
class ClauseResult:
    ok: bool
    field: str
    op: str
    message: str
    actual: Any = None


@dataclass
class PolicyDecision:
    allowed: bool
    failures: list[ClauseResult] = field(default_factory=list)
    evaluated: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def raise_if_denied(self) -> None:
        if not self.allowed:
            raise PolicyViolationError(
                self.failures[0].message if self.failures else "Policy check failed",
                details={
                    "violations": [
                        {"field": f.field, "op": f.op, "message": f.message, "actual": _safe(f.actual)}
                        for f in self.failures
                    ]
                },
            )


def _safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _resolve(context: dict, path: str) -> tuple[bool, Any]:
    current: Any = context
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return False, None
    return True, current


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return clock.ensure_aware(value).date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return None
    return None


def _fail(message: str, field_path: str, op: str, actual: Any = None) -> ClauseResult:
    return ClauseResult(ok=False, field=field_path, op=op, message=message, actual=actual)


def evaluate_clause(clause: dict, context: dict) -> ClauseResult:
    op = clause.get("op", "truthy")
    message = clause.get("message") or f"Policy check failed ({op} on {clause.get('field') or clause.get('fact')})"

    if "fact" in clause:
        source = context.get("facts", {})
        path = clause["fact"]
        found, value = _resolve(source, path)
    else:
        path = clause.get("field", "")
        found, value = _resolve(context, path)

    if op == "required":
        return (
            ClauseResult(True, path, op, message, value)
            if found and value not in (None, "", [], {})
            else _fail(message, path, op, value)
        )
    if op == "truthy":
        return ClauseResult(True, path, op, message, value) if value else _fail(message, path, op, value)
    if op == "falsy":
        return ClauseResult(True, path, op, message, value) if not value else _fail(message, path, op, value)
    if not found:
        return _fail(message, path, op, value)

    if op == "eq":
        return ClauseResult(value == clause.get("value"), path, op, message, value) if value == clause.get("value") else _fail(message, path, op, value)
    if op == "ne":
        return ClauseResult(True, path, op, message, value) if value != clause.get("value") else _fail(message, path, op, value)
    if op in {"gte", "lte", "gt", "lt"}:
        threshold = clause.get("value")
        a = _as_date(value) if isinstance(threshold, str) and "-" in str(threshold) else value
        b = _as_date(threshold) if a is not None and isinstance(a, date) else threshold
        try:
            comparisons = {
                "gte": a >= b,  # type: ignore[operator]
                "lte": a <= b,  # type: ignore[operator]
                "gt": a > b,  # type: ignore[operator]
                "lt": a < b,  # type: ignore[operator]
            }
        except TypeError:
            return _fail(message, path, op, value)
        return ClauseResult(True, path, op, message, value) if comparisons[op] else _fail(message, path, op, value)
    if op in {"gte_field", "lte_field"}:
        _, other = _resolve(context, clause.get("other", ""))
        a, b = _as_date(value), _as_date(other)
        if a is None or b is None:
            return _fail(message, path, op, value)
        ok = a >= b if op == "gte_field" else a <= b
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "date_gte_today":
        a = _as_date(value)
        ok = a is not None and a >= clock.now().date()
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "date_lte_today":
        a = _as_date(value)
        ok = a is not None and a <= clock.now().date()
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "within_days":
        a = _as_date(value)
        today = clock.now().date()
        limit = int(clause.get("value", 30))
        ok = a is not None and 0 <= (a - today).days <= limit
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "max_span_days":
        end = _as_date(value)
        if "other" in clause:
            _, start_raw = _resolve(context, clause["other"])
        else:
            start_raw = context.get("state_payload", {}).get("leave_start")
        start = _as_date(start_raw)
        if start is None or end is None:
            return _fail(message, path, op, value)
        ok = 0 <= (end - start).days <= int(clause.get("value", 30))
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "in":
        ok = value in (clause.get("value") or [])
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "not_in":
        ok = value not in (clause.get("value") or [])
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "min_length":
        ok = isinstance(value, (str, list)) and len(value) >= int(clause.get("value", 1))
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)
    if op == "lte_number":
        try:
            ok = float(value) <= float(clause.get("value", 0))
        except (TypeError, ValueError):
            return _fail(message, path, op, value)
        return ClauseResult(True, path, op, message, value) if ok else _fail(message, path, op, value)

    return _fail(f"Unsupported policy operator '{op}'", path, op, value)


def evaluate_group(conditions: dict, context: dict) -> list[ClauseResult]:
    results: list[ClauseResult] = []
    if isinstance(conditions.get("all"), list):
        for clause in conditions["all"]:
            results.append(evaluate_clause(clause, context))
    if isinstance(conditions.get("any"), list):
        clause_results = [evaluate_clause(clause, context) for clause in conditions["any"]]
        if clause_results and not any(r.ok for r in clause_results):
            results.extend(clause_results)
    return results


def applicable_policies(db: Session, *, campus_id: int, service_key: str | None) -> list[Policy]:
    stmt = select(Policy).where(
        Policy.campus_id == campus_id,
        Policy.is_active.is_(True),
    )
    policies = list(db.scalars(stmt.order_by(Policy.evaluation_order)).all())
    relevant = []
    for policy in policies:
        if policy.service_key is None or service_key is None or policy.service_key == service_key:
            relevant.append(policy)
    if service_key is not None:
        relevant = [p for p in relevant if p.service_key is None or p.service_key == service_key]
    return relevant


def evaluate(
    db: Session,
    *,
    campus_id: int,
    service_key: str | None,
    context: dict,
) -> PolicyDecision:
    """Evaluate every applicable policy for a service.

    DENY policies fail closed. REQUIRE policies must be satisfied (they express
    preconditions such as "an approved leave must exist"). ALLOW policies are
    informational and only surfaced as notes.
    """
    decision = PolicyDecision(allowed=True, evaluated=[])
    merged_context = {"facts": {}, **context}

    for policy in applicable_policies(db, campus_id=campus_id, service_key=service_key):
        decision.evaluated.append(policy.key)
        clause_results = evaluate_group(policy.conditions or {}, merged_context)
        failures = [r for r in clause_results if not r.ok]

        if policy.effect == PolicyEffect.ALLOW.value:
            decision.notes.append(policy.message)
            continue

        if failures:
            for failure in failures:
                if not failure.message or failure.message.startswith("Policy check failed ("):
                    failure.message = policy.message
            if policy.effect == PolicyEffect.DENY.value:
                decision.allowed = False
                decision.failures.extend(failures)
            elif policy.effect == PolicyEffect.REQUIRE.value:
                decision.allowed = False
                decision.failures.extend(failures)
    return decision


def evaluate_or_raise(db: Session, *, campus_id: int, service_key: str | None, context: dict) -> PolicyDecision:
    decision = evaluate(db, campus_id=campus_id, service_key=service_key, context=context)
    decision.raise_if_denied()
    return decision


def build_facts(db: Session, *, case=None, requester=None, state_payload: dict | None = None) -> dict:
    """Resolve database-backed facts that policies are allowed to reference."""
    from app.models import Case, CaseApproval, GatePass, Student

    facts: dict[str, Any] = {}
    payload = state_payload or (case.state_payload if case else {}) or {}

    student = None
    if requester is not None:
        student = db.scalar(select(Student).where(Student.user_id == requester.id))
    if student is None and case is not None and case.requester_student_id:
        student = db.get(Student, case.requester_student_id)

    if student is not None:
        facts["dues_balance"] = student.dues_balance
        facts["dues_clear"] = student.dues_balance == 0
        facts["is_hosteller"] = student.is_hosteller
        facts["has_branch"] = student.branch_id is not None
        facts["has_year"] = student.year_id is not None
        facts["enrolment_complete"] = student.branch_id is not None and student.year_id is not None
        facts["has_smartphone"] = student.has_smartphone
        facts["student_id"] = student.id

    if case is not None:
        approved = db.scalar(
            select(CaseApproval).where(
                CaseApproval.case_id == case.id, CaseApproval.state == "APPROVED"
            )
        )
        facts["case_approved"] = approved is not None
        facts["case_status"] = case.status
        facts["case_open"] = case.status not in {"CLOSED", "CANCELLED"}

        approved_leave = db.scalar(
            select(Case).where(
                Case.requester_id == case.requester_id,
                Case.service_key == "LEAVE_REQUEST",
                Case.status.in_(("RESOLVED", "CLOSED")),
                Case.id != case.id,
            )
        )
        facts["approved_leave_exists"] = approved_leave is not None
        if approved_leave is not None and isinstance(approved_leave.state_payload, dict):
            facts["approved_leave_start"] = approved_leave.state_payload.get("leave_start")
            facts["approved_leave_end"] = approved_leave.state_payload.get("leave_end")

        if case.assigned_staff_id:
            facts["assigned_staff_id"] = case.assigned_staff_id
        facts["has_department"] = case.department_id is not None
        facts["has_asset"] = case.asset_id is not None
        facts["has_location"] = case.location_id is not None

    facts["leave_start"] = payload.get("leave_start")
    facts["leave_end"] = payload.get("leave_end")
    facts["pass_issued"] = db is not None and _gate_pass_exists(db, case)
    return facts


def _gate_pass_exists(db: Session, case) -> bool:
    from app.models import GatePass

    if case is None:
        return False
    return (
        db.scalar(select(GatePass.id).where(GatePass.case_id == case.id)) is not None
    )
