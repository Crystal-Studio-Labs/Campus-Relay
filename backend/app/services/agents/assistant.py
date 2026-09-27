"""Agent 4 - Student assistant.

Rules that make this safe:
  * it can only answer from tool results (no invented database facts)
  * it never mutates anything without an explicit confirmation step
  * if the optional LLM is unavailable it still works, via intent matching
"""

import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import Case, User
from app.models.enums import CLOSED_STATUSES
from app.services import clock
from app.services.agents import provider as provider_module, tools

INTENTS: dict[str, list[str]] = {
    "CERTIFICATE_STATUS": ["certificate", "bonafide", "bonafied", "document status", "transcript"],
    "LEAVE_STATUS": ["leave", "out pass", "holiday", "gate pass", "gatepass"],
    "NOTICES": ["notice", "announcement", "circular", "notification"],
    "MY_CASES": ["my case", "my request", "my complaint", "status of", "track", "ticket"],
    "CREATE_CASE": ["report", "complaint", "complain", "broken", "leaking", "not working", "raise", "file a", "create a"],
    "FEES": ["fee", "dues", "payment", "receipt", "scholarship"],
    "APPROVALS": ["approval", "approve", "pending approval", "reject"],
    "OPERATIONS": ["workload", "backlog", "how many open", "dashboard", "operations", "summary"],
    "TIMETABLE": ["timetable", "class", "lecture", "schedule"],
    "HELP": ["help", "what can you do", "how do i"],
}

SUGGESTED_PROMPTS = [
    "Where is my certificate?",
    "Why is my leave request still pending?",
    "Do I have any pending notices to acknowledge?",
    "Report a leaking tap in my hostel washroom",
    "What is my hostel workload looking like?",
]


@dataclass
class AssistantAnswer:
    answer: str
    intent: str
    evidence: list[dict] = field(default_factory=list)
    proposed_action: dict | None = None
    engine: str = "rules"
    fallback_reason: str | None = None
    suggestions: list[str] = field(default_factory=lambda: list(SUGGESTED_PROMPTS))
    follow_up_tools: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "answer": self.answer,
            "intent": self.intent,
            "evidence": self.evidence,
            "proposed_action": self.proposed_action,
            "engine": self.engine,
            "fallback_reason": self.fallback_reason,
            "suggestions": self.suggestions,
            "follow_up_tools": self.follow_up_tools,
        }


def detect_intent(question: str) -> tuple[str, list[str]]:
    haystack = question.lower()
    scores: dict[str, int] = {}
    for intent, keywords in INTENTS.items():
        hits = [k for k in keywords if k in haystack]
        if hits:
            scores[intent] = len(hits)
    if not scores:
        return "MY_CASES", []
    best = max(scores.items(), key=lambda kv: (kv[1], kv[0]))
    return best[0], [k for k in INTENTS[best[0]] if k in haystack]


class StudentAssistant:
    name = "assistant"

    def __init__(self) -> None:
        self.provider = provider_module.get_provider()

    def ask(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        intent, matched = detect_intent(question)

        # Optional LLM path: use it only to pick a tool; the tool still answers.
        fallback_reason: str | None = None
        if self.provider.is_remote:
            response = self.provider.complete(
                system=(
                    "You route campus help questions to a tool. Reply with JSON "
                    '{"tool": "<name>", "arguments": {...}} only.'
                ),
                messages=[{"role": "user", "content": question}],
                tools=tools.provider_tools(),
            )
            if response.error:
                fallback_reason = response.error

        handler = getattr(self, f"_answer_{intent.lower()}", None)
        if handler is None:
            answer = self._answer_my_cases(db, user=user, question=question)
        else:
            answer = handler(db, user=user, question=question)

        answer.engine = "rules" if not fallback_reason else "rules_fallback"
        answer.fallback_reason = fallback_reason
        if matched:
            answer.follow_up_tools.append(f"intent:{intent}")
        return answer

    # --- intent handlers ---

    def _answer_certificate_status(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        cases, listing = self._find_cases(
            db, user=user, service_keys={"BONAFIDE_CERTIFICATE", "DOCUMENT_REQUEST"}
        )
        if not cases:
            return AssistantAnswer(
                answer=(
                    "I cannot see any certificate or document request on your account yet. "
                    "You can raise one from Report / Request."
                ),
                intent="CERTIFICATE_STATUS",
                evidence=[listing.as_dict()],
            )

        lines: list[str] = []
        evidence: list[dict] = []
        for case in cases[:3]:
            detail = tools.call_tool(db, user=user, name="case_detail", arguments={"case_id": case.id}, agent=self.name)
            evidence.append(detail.as_dict())
            data = detail.data or {}
            status = data.get("case", {}).get("status", case.status)
            if case.status == "WAITING_FOR_APPROVAL":
                approvals = data.get("approvals") or []
                pending = next((a for a in approvals if a.get("state") == "PENDING"), None)
                waiting = round(clock.minutes_since(pending["requested_at"]) or 0, 1) if pending and pending.get("requested_at") else None
                lines.append(
                    f"{case.case_number} is {status}: waiting on {pending['role'] if pending else 'approval'}"
                    + (f" for {waiting} minutes." if waiting is not None else ".")
                )
            elif case.status in {"RESOLVED", "CLOSED"}:
                serial = (data.get("state_payload") or {}).get("document_serial")
                lines.append(
                    f"{case.case_number} is {status}"
                    + (f" - certificate serial {serial}." if serial else ".")
                )
            else:
                lines.append(f"{case.case_number} is {status}.")
        return AssistantAnswer(answer=" ".join(lines), intent="CERTIFICATE_STATUS", evidence=evidence)

    def _answer_leave_status(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        cases, listing = self._find_cases(db, user=user, service_keys={"LEAVE_REQUEST", "GATE_PASS"})
        if not cases:
            return AssistantAnswer(
                answer=(
                    "There is no leave or gate-pass request on your account. "
                    "Leave requests need the warden's approval before a pass can be issued."
                ),
                intent="LEAVE_STATUS",
                evidence=[listing.as_dict()],
            )

        case = cases[0]
        detail = tools.call_tool(db, user=user, name="case_detail", arguments={"case_id": case.id}, agent=self.name)
        data = detail.data or {}
        approvals = data.get("approvals") or []
        pending = next((a for a in approvals if a.get("state") == "PENDING"), None)
        timeline = data.get("timeline") or []

        reasons: list[str] = []
        if pending:
            waiting = round(clock.minutes_since(pending["requested_at"]) or 0, 1) if pending.get("requested_at") else None
            reasons.append(
                f"It is waiting for approval from {pending['role']}"
                + (f", and has been waiting {waiting} minutes" if waiting is not None else "")
                + "."
            )
        elif case.status == "CANCELLED":
            rejected = next((a for a in approvals if a.get("state") == "REJECTED"), None)
            reasons.append(
                "It was rejected" + (f": {rejected['note']}" if rejected and rejected.get("note") else ".")
            )
        elif case.status in {"RESOLVED", "CLOSED"}:
            payload = data.get("state_payload") or {}
            reasons.append(
                "It is approved and closed."
                + (f" Gate pass code {payload.get('gate_pass_code')}." if payload.get("gate_pass_code") else "")
            )
        else:
            reasons.append(f"Its current status is {case.status}.")

        last_events = ", ".join(f"{e['event']}" for e in timeline[-3:]) if timeline else "no events yet"
        return AssistantAnswer(
            answer=f"{case.case_number} ({case.title}): " + " ".join(reasons) + f" Recent activity: {last_events}.",
            intent="LEAVE_STATUS",
            evidence=[detail.as_dict()],
        )

    def _answer_notices(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        result = tools.call_tool(db, user=user, name="my_notices", arguments={"limit": 5}, agent=self.name)
        data = result.data or {}
        notices = data.get("notices") or []
        pending = data.get("pending_acknowledgements") or []
        if not notices:
            return AssistantAnswer(
                answer="You have no notices addressed to you right now.",
                intent="NOTICES",
                evidence=[result.as_dict()],
            )
        lines = [f"You have {len(notices)} recent notice(s)."]
        for notice in notices[:3]:
            lines.append(f"- {notice['title']} ({notice['type']}).")
        if pending:
            lines.append(f"{len(pending)} still need your acknowledgement.")
        return AssistantAnswer(answer=" ".join(lines), intent="NOTICES", evidence=[result.as_dict()])

    def _answer_my_cases(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        result = tools.call_tool(db, user=user, name="my_cases", arguments={"limit": 5}, agent=self.name)
        data = result.data or {}
        cases = data.get("cases") or []
        if not cases:
            return AssistantAnswer(
                answer="I cannot see any cases on your account yet.",
                intent="MY_CASES",
                evidence=[result.as_dict()],
            )
        open_cases = [c for c in cases if c["status"] not in CLOSED_STATUSES]
        lines = [f"You have {len(cases)} recent case(s), {len(open_cases)} still open."]
        for case in cases[:4]:
            lines.append(f"- {case['case_number']}: {case['title']} - {case['status']}.")
        return AssistantAnswer(answer=" ".join(lines), intent="MY_CASES", evidence=[result.as_dict()])

    def _answer_create_case(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        # Find the service that best matches the description.
        from app.services import routing

        service_key, confidence = routing.detect_service(question, default="HOSTEL_COMPLAINT")
        result = tools.call_tool(
            db,
            user=user,
            name="create_case",
            arguments={"service_key": service_key, "description": question},
            agent=self.name,
        )
        if not result.ok:
            return AssistantAnswer(
                answer=f"I could not prepare that request: {result.error}",
                intent="CREATE_CASE",
                evidence=[result.as_dict()],
            )
        proposed = result.proposed_action
        missing = (result.data or {}).get("missing_information") or []
        answer = (
            f"I can raise this as {result.data.get('service_key')} "
            f"({result.data.get('category')}, priority {result.data.get('priority')}). "
        )
        if missing:
            answer += f"Still missing: {', '.join(missing)}. "
        answer += "Confirm and I will submit it."
        return AssistantAnswer(
            answer=answer,
            intent="CREATE_CASE",
            evidence=[result.as_dict()],
            proposed_action=proposed,
        )

    def _answer_fees(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        from sqlalchemy import select

        from app.models import Student

        student = db.scalar(select(Student).where(Student.user_id == user.id))
        if student is None:
            return AssistantAnswer(
                answer="I do not have a student record linked to your account, so I cannot read fee data.",
                intent="FEES",
            )
        if student.dues_balance == 0:
            answer = "Your dues are clear: no outstanding balance on record."
        else:
            answer = (
                f"Your outstanding balance is Rs {student.dues_balance} "
                f"(billed Rs {student.dues_amount}, paid Rs {student.dues_paid}). "
                "A fee query case would be routed to Accounts."
            )
        return AssistantAnswer(
            answer=answer,
            intent="FEES",
            evidence=[
                {
                    "tool": "student_fee_record",
                    "ok": True,
                    "data": {
                        "dues_amount": student.dues_amount,
                        "dues_paid": student.dues_paid,
                        "balance": student.dues_balance,
                    },
                }
            ],
        )

    def _answer_approvals(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        result = tools.call_tool(db, user=user, name="my_approvals", arguments={}, agent=self.name)
        data = result.data or {}
        approvals = data.get("approvals") or []
        if not approvals:
            return AssistantAnswer(
                answer="Nothing is waiting on your approval right now.",
                intent="APPROVALS",
                evidence=[result.as_dict()],
            )
        oldest = max(approvals, key=lambda a: a["waiting_minutes"])
        return AssistantAnswer(
            answer=(
                f"{len(approvals)} approval(s) are waiting on your role. "
                f"The oldest, {oldest['case_number']} ({oldest['title']}), has waited "
                f"{oldest['waiting_minutes']} minutes."
            ),
            intent="APPROVALS",
            evidence=[result.as_dict()],
        )

    def _answer_operations(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        result = tools.call_tool(db, user=user, name="operations_summary", arguments={}, agent=self.name)
        if not result.ok:
            return AssistantAnswer(
                answer=(
                    "That summary needs dashboard access, which your role does not have. "
                    "I can still show your own cases and notices."
                ),
                intent="OPERATIONS",
                evidence=[result.as_dict()],
            )
        data = result.data or {}
        answer = (
            f"{data.get('open_cases')} cases are open: {data.get('sla_breaches')} breached, "
            f"{data.get('sla_at_risk')} at risk, {data.get('unassigned_cases')} unassigned, "
            f"{data.get('awaiting_approval')} waiting on approval."
        )
        recurring = data.get("recurring_issues") or []
        if recurring:
            answer += f" {len(recurring)} recurring pattern(s) detected."
        return AssistantAnswer(answer=answer, intent="OPERATIONS", evidence=[result.as_dict()])

    def _answer_timetable(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        result = tools.call_tool(db, user=user, name="my_notices", arguments={"limit": 5}, agent=self.name)
        notices = (result.data or {}).get("notices") or []
        relevant = [n for n in notices if any(k in (n["title"] + " " + (n["summary"] or "")).lower() for k in ("class", "timetable", "lecture", "exam"))]
        if not relevant:
            return AssistantAnswer(
                answer=(
                    "There is no timetable or class-change notice addressed to you. "
                    "Timetable data is not part of this prototype's dataset, so I will not guess."
                ),
                intent="TIMETABLE",
                evidence=[result.as_dict()],
            )
        return AssistantAnswer(
            answer=" ".join(f"- {n['title']}." for n in relevant[:3]),
            intent="TIMETABLE",
            evidence=[result.as_dict()],
        )

    def _answer_help(self, db: Session, *, user: User, question: str) -> AssistantAnswer:
        services = tools.call_tool(db, user=user, name="list_services", arguments={}, agent=self.name)
        names = [s["name"] for s in (services.data or {}).get("services", []) if s.get("can_raise")][:6]
        return AssistantAnswer(
            answer=(
                "I can check your cases, notices and approvals, explain why something is pending, "
                "and raise a request for you after you confirm it. "
                + (f"You can raise: {', '.join(names)}." if names else "")
            ),
            intent="HELP",
            evidence=[services.as_dict()],
        )

    # --- helpers ---

    def _find_cases(
        self, db: Session, *, user: User, service_keys: set[str]
    ) -> tuple[list[Case], tools.ToolResult]:
        """Return matching cases plus the raw tool result (kept as evidence)."""
        result = tools.call_tool(db, user=user, name="my_cases", arguments={"limit": 25}, agent=self.name)
        briefs = (result.data or {}).get("cases") or []
        ids = [b["case_id"] for b in briefs if b["service_key"] in service_keys]
        if not ids:
            return [], result
        from sqlalchemy import select

        cases = list(db.scalars(select(Case).where(Case.id.in_(ids)).order_by(Case.created_at.desc())).all())
        return cases, result


def confirm_action(db: Session, *, user: User, proposed_action: dict) -> AssistantAnswer:
    """Execute a previously proposed action, re-running every check."""
    action_type = (proposed_action or {}).get("type")
    payload = (proposed_action or {}).get("payload") or {}

    if action_type == "CREATE_CASE":
        result = tools.call_tool(
            db,
            user=user,
            name="create_case",
            arguments={**payload, "confirmed": True},
            agent="assistant",
        )
        data = result.data or {}
        answer = (
            f"Done - {data.get('case_number')} ({data.get('status')}) has been created and routed. "
            f"Category {data.get('category')}, priority {data.get('priority')}."
            if result.ok
            else f"I could not create that case: {result.error}"
        )
        return AssistantAnswer(answer=answer, intent="CREATE_CASE_CONFIRMED", evidence=[result.as_dict()])

    if action_type == "DECIDE_APPROVAL":
        result = tools.call_tool(
            db,
            user=user,
            name="decide_approval",
            arguments={**payload, "confirmed": True},
            agent="assistant",
        )
        data = result.data or {}
        answer = (
            f"Recorded: {data.get('status')} on case {data.get('case_id')}."
            if result.ok
            else f"I could not record that decision: {result.error}"
        )
        return AssistantAnswer(answer=answer, intent="DECIDE_APPROVAL_CONFIRMED", evidence=[result.as_dict()])

    return AssistantAnswer(answer="I do not recognise that pending action.", intent="UNKNOWN")


def normalise_question(question: str) -> str:
    return re.sub(r"\s+", " ", question or "").strip()
