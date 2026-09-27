"""Agent 1 - Intake.

Turns natural language into structured intake data: service, category, urgency,
location hint, missing information and a possible duplicate.

Same shape whether the answer came from the deterministic classifier or from an
optional LLM, so downstream code never needs to care which path ran.
"""

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import User
from app.services import case_engine, routing
from app.services.agents import provider as provider_module

SYSTEM_PROMPT = """You are the intake classifier for a campus operations platform.
Classify the request into the service catalog and return STRICT JSON with keys:
service_key, category, priority (LOW|NORMAL|HIGH|CRITICAL), title, summary,
location_hint, missing_information (array).
Never invent facts that are not in the request. If unsure, prefer HOSTEL_COMPLAINT
and NORMAL priority."""


@dataclass
class IntakeAnalysis:
    service_key: str
    category: str
    priority: str
    title: str
    summary: str
    location_hint: str | None
    missing_information: list[str] = field(default_factory=list)
    possible_duplicate: dict | None = None
    confidence: float = 0.0
    engine: str = "rules"
    fallback_reason: str | None = None
    signals: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "service_key": self.service_key,
            "category": self.category,
            "priority": self.priority,
            "title": self.title,
            "summary": self.summary,
            "location_hint": self.location_hint,
            "missing_information": self.missing_information,
            "possible_duplicate": self.possible_duplicate,
            "confidence": self.confidence,
            "engine": self.engine,
            "fallback_reason": self.fallback_reason,
            "signals": self.signals,
        }


class IntakeAgent:
    name = "intake"

    def __init__(self) -> None:
        self.provider = provider_module.get_provider()

    def analyze(
        self,
        db: Session,
        *,
        user: User,
        text: str,
        service_key: str | None = None,
        location_code: str | None = None,
    ) -> IntakeAnalysis:
        fallback_reason: str | None = None
        result: dict | None = None

        if self.provider.is_remote:
            response = self.provider.complete(
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": text}],
            )
            if response.error:
                fallback_reason = response.error
            elif response.text:
                import json

                try:
                    parsed = json.loads(_extract_json(response.text))
                    result = self.validate(parsed, text)
                except ValueError as exc:
                    fallback_reason = f"unusable_model_output: {exc.__class__.__name__}"

        if result is None:
            classified = routing.classify(text, service_key=service_key, title=None)
            result = {
                "service_key": classified.service_key,
                "category": classified.category,
                "priority": classified.priority,
                "title": classified.title,
                "summary": classified.summary,
                "location_hint": classified.location_hint,
                "missing_information": list(classified.missing_information),
                "confidence": classified.confidence,
                "signals": classified.signals,
            }
            engine = "rules" if not fallback_reason else "rules_fallback"
        else:
            engine = "llm"
            result.setdefault("signals", ["llm_classification"])

        location = None
        if location_code:
            try:
                location = case_engine.resolve_location(
                    db, campus_id=user.campus_id, location_id=None, location_code=location_code
                )
            except Exception:  # noqa: BLE001 - an unknown QR is not a classification failure
                location = None

        duplicate = None
        if result["service_key"] in {"HOSTEL_COMPLAINT", "FACILITY_REQUEST", "MESS_COMPLAINT"}:
            match = routing.find_duplicate(
                db,
                campus_id=user.campus_id,
                service_key=result["service_key"],
                category=result["category"],
                location_id=location.id if location else None,
            )
            if match is not None:
                duplicate = {
                    "case_id": match.id,
                    "case_number": match.case_number,
                    "status": match.status,
                    "created_at": match.created_at,
                    "title": match.title,
                }

        # The catalog decides the authoritative service list.
        try:
            case_engine.service_by_key(db, campus_id=user.campus_id, key=result["service_key"])
        except Exception:  # noqa: BLE001 - unknown service falls back to the hostel desk
            result["service_key"] = "HOSTEL_COMPLAINT"
            result["signals"] = list(result.get("signals") or []) + ["service_fallback"]

        return IntakeAnalysis(
            service_key=result["service_key"],
            category=result["category"],
            priority=result["priority"],
            title=result["title"],
            summary=result["summary"],
            location_hint=result.get("location_hint"),
            missing_information=list(result.get("missing_information") or []),
            possible_duplicate=duplicate,
            confidence=float(result.get("confidence", 0.4)),
            engine=engine,
            fallback_reason=fallback_reason,
            signals=list(result.get("signals") or []),
        )

    @staticmethod
    def validate(payload: dict, original_text: str) -> dict:
        """Reject model output that does not match the expected contract."""
        required = ["service_key", "category", "priority", "title"]
        missing = [key for key in required if not payload.get(key)]
        if missing:
            raise ValueError(f"missing keys: {missing}")

        priority = str(payload["priority"]).upper()
        if priority not in {"LOW", "NORMAL", "HIGH", "CRITICAL"}:
            raise ValueError("invalid priority")

        title = str(payload["title"])[:200]
        if not title.strip():
            raise ValueError("empty title")

        return {
            "service_key": str(payload["service_key"]).upper(),
            "category": str(payload["category"]).upper(),
            "priority": priority,
            "title": title,
            "summary": str(payload.get("summary") or original_text)[:400],
            "location_hint": payload.get("location_hint"),
            "missing_information": list(payload.get("missing_information") or []),
            "confidence": float(payload.get("confidence", 0.7)),
        }


def _extract_json(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return cleaned[start : end + 1]
