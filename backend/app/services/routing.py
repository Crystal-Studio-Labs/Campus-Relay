"""Deterministic routing intelligence.

This module is the rules-based core of the Intake/Routing agents: it works with
no LLM and no network, which is exactly what the brief requires as the AI
fallback path. The agents call into the same functions, so classifications are
consistent whichever path produced them.
"""

import re
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Asset, Case, Department, Location, Service, Staff
from app.models.enums import CaseStatus, Priority, ServiceCategory
from app.services import clock

# --- Taxonomy -------------------------------------------------------------

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "PLUMBING": ["tap", "leak", "leaking", "pipe", "flush", "toilet", "drain", "faucet", "geyser", "bathroom", "washroom", "water supply"],
    "ELECTRICAL": ["light", "bulb", "fan", "switch", "socket", "power", "wiring", "fuse", "sparking", "shock", "electricity", "tube light"],
    "CARPENTRY": ["door", "lock", "window", "almirah", "cupboard", "bed", "cot", "bench", "handle", "hinge", "chair"],
    "CIVIL": ["wall", "ceiling", "seepage", "paint", "crack", "plaster", "roof", "floor tile"],
    "HOUSEKEEPING": ["clean", "cleaning", "garbage", "dustbin", "sweep", "pest", "mosquito", "cockroach", "dirty", "stink", "smell"],
    "WATER_COOLER": ["water cooler", "cooler", "ro purifier", "purifier", "drinking water"],
    "INTERNET": ["wifi", "wi-fi", "network", "internet", "router", "lan"],
    "FURNITURE": ["furniture", "table", "desk"],
    "MESS": ["mess", "food", "menu", "meal", "canteen", "breakfast", "lunch", "dinner", "tasteless", "undercooked"],
    "ACADEMIC": ["class", "lecture", "exam", "timetable", "faculty", "teacher", "subject", "marks", "result"],
    "FINANCE": ["fee", "fees", "dues", "payment", "receipt", "challan", "scholarship", "refund"],
}

SAFETY_KEYWORDS = [
    "fire", "smoke", "spark", "sparking", "shock", "gas leak", "flood", "flooding",
    "overflowing", "overflow", "collapsed", "broken glass", "emergency", "unsafe",
    "live wire", "lift stuck", "burst", "burst pipe", "pipe burst", "sewage",
    "water all over", "short circuit", "no water supply",
]
URGENCY_KEYWORDS = ["urgent", "immediately", "asap", "emergency", "today", "right now", "critical"]

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}

# Matches "for nine days", "for 9 days", "since last week", "for two months".
# Word numbers matter: the brief's own example says "leaking for nine days".
DURATION_PATTERN = re.compile(
    r"(?:for|since|last)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*"
    r"(day|days|week|weeks|month|months|hour|hours)"
)
ROOM_PATTERN = re.compile(r"\b(?:room|rm)?\s*[-#]?\s*(\d{2,4})\b", re.IGNORECASE)

SERVICE_HINTS: dict[str, list[str]] = {
    "HOSTEL_COMPLAINT": ["leak", "tap", "fan", "light", "broken", "dirty", "washroom", "hostel", "room", "cooler"],
    "MESS_COMPLAINT": ["mess", "food", "menu", "meal", "canteen"],
    "BONAFIDE_CERTIFICATE": ["bonafide", "certificate", "bonafied"],
    "LEAVE_REQUEST": ["leave", "holiday", "going home", "absent"],
    "GATE_PASS": ["gate pass", "gatepass", "out pass", "permission to go"],
    "FEE_QUERY": ["fee", "dues", "payment", "receipt", "scholarship"],
    "ROOM_CHANGE": ["room change", "change room", "shift room", "roommate"],
    "ACADEMIC_QUERY": ["marks", "result", "attendance", "exam form", "subject"],
    "DOCUMENT_REQUEST": ["document", "transcript", "migration", "duplicate marksheet"],
    "FACILITY_REQUEST": ["projector", "classroom", "lab", "library", "auditorium", "sports"],
    "LOST_ITEM": ["lost", "misplaced", "missing", "stolen"],
    "VISITOR_REQUEST": ["visitor", "guest", "parent visit"],
}

DEPARTMENT_HINTS: dict[str, list[str]] = {
    "MAINT-PLUMBING": ["plumbing", "water", "tap", "leak", "pipe"],
    "MAINT-ELECTRICAL": ["electrical", "electric", "power"],
    "MAINT-CIVIL": ["civil", "building"],
    "HOUSEKEEPING": ["housekeeping", "sanitation", "cleaning"],
    "HOSTEL": ["hostel", "warden"],
    "MESS": ["mess", "canteen", "catering"],
    "ACADEMIC": ["academic", "academics"],
    "EXAM": ["examination", "exam"],
    "ACCOUNTS": ["accounts", "finance", "fee"],
    "IT": ["it", "network", "wifi"],
    "SECURITY": ["security", "gate"],
    "LIBRARY": ["library"],
}


@dataclass
class IntakeResult:
    service_key: str
    category: str
    subcategory: str | None
    priority: str
    title: str
    summary: str
    location_hint: str | None = None
    asset_hint: str | None = None
    age_days: int | None = None
    missing_information: list[str] = field(default_factory=list)
    signals: list[str] = field(default_factory=list)
    confidence: float = 0.0
    engine: str = "rules"


@dataclass
class RoutingRecommendation:
    department_id: int | None
    department_name: str | None
    staff_id: int | None
    staff_name: str | None
    sla_minutes: int
    priority: str
    explanation: list[str] = field(default_factory=list)
    engine: str = "rules"


def _normalise(text: str | None) -> str:
    return (text or "").lower()


def detect_category(text: str, service_key: str | None = None) -> tuple[str, list[str]]:
    haystack = _normalise(text)
    scores: dict[str, int] = {}
    hits: list[str] = []
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            if keyword in haystack:
                score += 1
                hits.append(keyword)
        if score:
            scores[category] = score

    if service_key == "MESS_COMPLAINT":
        scores["MESS"] = scores.get("MESS", 0) + 3
    if not scores:
        return "GENERAL", hits
    best = max(scores.items(), key=lambda kv: (kv[1], kv[0]))
    return best[0], hits


def detect_service(text: str, default: str = "HOSTEL_COMPLAINT") -> tuple[str, float]:
    haystack = _normalise(text)
    scores: dict[str, int] = {}
    for key, keywords in SERVICE_HINTS.items():
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score:
            scores[key] = score
    if not scores:
        return default, 0.35
    best_key, best_score = max(scores.items(), key=lambda kv: (kv[1], kv[0]))
    confidence = min(0.55 + 0.12 * best_score, 0.95)
    return best_key, confidence


def detect_priority(text: str, *, default: str = Priority.NORMAL.value) -> tuple[str, list[str]]:
    haystack = _normalise(text)
    signals: list[str] = []
    priority = default

    for keyword in SAFETY_KEYWORDS:
        if keyword in haystack:
            signals.append(f"safety:{keyword}")
            return Priority.CRITICAL.value, signals

    for keyword in URGENCY_KEYWORDS:
        if keyword in haystack:
            signals.append(f"urgency:{keyword}")
            priority = Priority.HIGH.value

    match = DURATION_PATTERN.search(haystack)
    if match:
        count = _duration_count(match.group(1))
        unit = match.group(2)
        days = count * (7 if unit.startswith("week") else 30 if unit.startswith("month") else 1)
        signals.append(f"unresolved_duration:{count}{unit}")
        if days >= 7:
            priority = Priority.HIGH.value
        elif days >= 3 and priority == Priority.NORMAL.value:
            priority = Priority.HIGH.value if days >= 5 else priority

    if "no water" in haystack or "not working" in haystack and priority == Priority.NORMAL.value:
        priority = Priority.HIGH.value if "no water" in haystack else priority

    return priority, signals


def _duration_count(raw: str) -> int:
    if raw.isdigit():
        return int(raw)
    return NUMBER_WORDS.get(raw, 1)


def extract_location_hint(text: str) -> str | None:
    match = ROOM_PATTERN.search(text or "")
    if match:
        return match.group(1)
    return None


def classify(
    text: str,
    *,
    service_key: str | None = None,
    title: str | None = None,
    location: Location | None = None,
) -> IntakeResult:
    """Deterministic classification used by the Intake agent's fallback path."""
    combined = f"{title or ''} {text or ''}".strip()
    if service_key is None:
        service_key, confidence = detect_service(combined)
    else:
        confidence = 0.9

    category, hits = detect_category(combined, service_key)
    priority, signals = detect_priority(combined)

    missing: list[str] = []
    if not location and not extract_location_hint(combined):
        if service_key in {"HOSTEL_COMPLAINT", "FACILITY_REQUEST", "MESS_COMPLAINT"}:
            missing.append("location")
    if len((text or "").strip()) < 12:
        missing.append("description")

    summary = (text or "").strip().replace("\n", " ")
    if len(summary) > 160:
        summary = summary[:157] + "..."

    duration = DURATION_PATTERN.search(_normalise(combined))
    age_days = None
    if duration:
        count = _duration_count(duration.group(1))
        unit = duration.group(2)
        age_days = count * (7 if unit.startswith("week") else 30 if unit.startswith("month") else 1)

    return IntakeResult(
        service_key=service_key,
        category=category,
        subcategory=hits[0].upper() if hits else None,
        priority=priority,
        title=(title or summary[:80] or service_key.replace("_", " ").title()),
        summary=summary,
        location_hint=extract_location_hint(combined),
        age_days=age_days,
        missing_information=missing,
        signals=signals + [f"keyword:{h}" for h in hits[:4]],
        confidence=round(confidence, 2),
    )


# --- Routing --------------------------------------------------------------


def recommend_department(
    db: Session, *, campus_id: int, service: Service | None, category: str, location: Location | None
) -> tuple[Department | None, list[str]]:
    explanation: list[str] = []
    if service and service.department_id:
        dept = db.get(Department, service.department_id)
        if dept:
            explanation.append(f"Service catalog pins {service.key} to {dept.name}")
            return dept, explanation

    # Location's owning department wins next (e.g. a lab belongs to IT).
    if location and location.department_id:
        dept = db.get(Department, location.department_id)
        if dept:
            explanation.append(f"Location {location.code} is owned by {dept.name}")
            return dept, explanation

    candidates = list(
        db.scalars(select(Department).where(Department.campus_id == campus_id)).all()
    )
    tokens = {
        "PLUMBING": ["plumb"],
        "ELECTRICAL": ["elect"],
        "CARPENTRY": ["carpent", "civil"],
        "CIVIL": ["civil", "maint"],
        "HOUSEKEEPING": ["housekeep", "sanit"],
        "WATER_COOLER": ["plumb", "maint"],
        "INTERNET": ["it", "network"],
        "MESS": ["mess", "cater"],
        "ACADEMIC": ["academic"],
        "FINANCE": ["account", "finance"],
    }
    wanted = tokens.get(category, [])
    for dept in candidates:
        haystack = f"{dept.name} {dept.code}".lower()
        if any(token in haystack for token in wanted):
            explanation.append(f"Category {category} maps to {dept.name} by keyword")
            return dept, explanation

    if candidates:
        explanation.append("No specific match; falling back to the general maintenance desk")
        return candidates[0], explanation
    return None, explanation


def staff_workload(db: Session, *, campus_id: int) -> list[dict]:
    """Open-case load per staff member - the basis for workload-balancing."""
    open_statuses = tuple(
        s.value
        for s in CaseStatus
        if s
        not in {
            CaseStatus.CLOSED,
            CaseStatus.CANCELLED,
            CaseStatus.RESOLVED,
            CaseStatus.VERIFICATION_REQUIRED,
        }
    )
    rows = db.execute(
        select(
            Staff.id,
            Staff.department_id,
            Staff.workload_capacity,
            func.count(Case.id).label("open_cases"),
        )
        .join(Case, Case.assigned_staff_id == Staff.id, isouter=True)
        .where(Staff.campus_id == campus_id, Case.status.in_(open_statuses) | Case.id.is_(None))
        .group_by(Staff.id, Staff.department_id, Staff.workload_capacity)
    ).all()

    from app.models import User

    result: list[dict] = []
    for staff_id, department_id, capacity, open_cases in rows:
        staff = db.get(Staff, staff_id)
        if staff is None or staff.user is None or not staff.user.is_active:
            continue
        result.append(
            {
                "staff_id": staff_id,
                "name": staff.user.full_name,
                "department_id": department_id,
                "open_cases": int(open_cases or 0),
                "capacity": capacity,
                "utilisation": round((open_cases or 0) / capacity, 2) if capacity else 0.0,
                "is_available": staff.is_available,
            }
        )
    return result


def recommend_staff(
    db: Session, *, campus_id: int, department_id: int | None, category: str | None = None
) -> tuple[Staff | None, list[str]]:
    """Least-loaded available staff member in the target department."""
    explanation: list[str] = []
    stmt = select(Staff).where(Staff.campus_id == campus_id, Staff.is_available.is_(True))
    if department_id:
        stmt = stmt.where(Staff.department_id == department_id)
    candidates = list(db.scalars(stmt).all())
    if not candidates:
        explanation.append("No staff available in the target department")
        return None, explanation

    if category:
        skilled = [
            s for s in candidates if any(category.lower() in str(skill).lower() for skill in (s.skills or []))
        ]
        if skilled:
            candidates = skilled
            explanation.append(f"Filtered to staff skilled in {category}")

    workload = {row["staff_id"]: row["open_cases"] for row in staff_workload(db, campus_id=campus_id)}
    chosen = min(candidates, key=lambda s: (workload.get(s.id, 0), s.id))
    explanation.append(
        f"Chose {chosen.user.full_name if chosen.user else chosen.id} with "
        f"{workload.get(chosen.id, 0)} open case(s) - lowest current load"
    )
    return chosen, explanation


def recommend_routing(
    db: Session,
    *,
    campus_id: int,
    service: Service | None,
    category: str,
    priority: str,
    location: Location | None,
    service_key: str,
) -> RoutingRecommendation:
    from app.services import sla as sla_service

    dept, dept_notes = recommend_department(
        db, campus_id=campus_id, service=service, category=category, location=location
    )
    staff_member, staff_notes = recommend_staff(
        db, campus_id=campus_id, department_id=dept.id if dept else None, category=category
    )
    minutes = sla_service.resolve_target_minutes(
        db, campus_id=campus_id, service_key=service_key, priority=priority
    )
    return RoutingRecommendation(
        department_id=dept.id if dept else None,
        department_name=dept.name if dept else None,
        staff_id=staff_member.id if staff_member else None,
        staff_name=staff_member.user.full_name if staff_member and staff_member.user else None,
        sla_minutes=minutes,
        priority=priority,
        explanation=dept_notes + staff_notes + [f"SLA target {minutes} minutes for {priority}"],
    )


# --- Duplicate / recurrence intelligence ----------------------------------


def find_duplicate(
    db: Session,
    *,
    campus_id: int,
    service_key: str,
    category: str,
    location_id: int | None,
    window_hours: int = 48,
) -> Case | None:
    """Heuristic duplicate detection: same service + category + location, recent.

    Deterministic fallback for embedding-based similarity; deliberately
    conservative so it never blocks a legitimate new report.
    """
    since = clock.now() - timedelta(hours=window_hours)
    stmt = (
        select(Case)
        .where(
            Case.campus_id == campus_id,
            Case.service_key == service_key,
            Case.category == category,
            Case.created_at >= since,
            Case.status.notin_((CaseStatus.CLOSED.value, CaseStatus.CANCELLED.value)),
        )
        .order_by(Case.created_at.desc())
    )
    if location_id is not None:
        stmt = stmt.where(Case.location_id == location_id)
    return db.scalar(stmt)


def duplicate_group_key(*, service_key: str, category: str, location_id: int | None, asset_id: int | None) -> str:
    scope = location_id if location_id is not None else asset_id
    return f"{service_key}:{category}:{scope if scope is not None else 'campus'}"


def recurring_issues(db: Session, *, campus_id: int, window_days: int = 30, minimum: int = 3) -> list[dict]:
    """Assets/locations with repeated cases inside a window.

    Reports observed counts only - no predictive accuracy claims.
    """
    since = clock.now() - timedelta(days=window_days)
    issues: list[dict] = []

    asset_rows = db.execute(
        select(Case.asset_id, func.count(Case.id))
        .where(Case.campus_id == campus_id, Case.created_at >= since, Case.asset_id.is_not(None))
        .group_by(Case.asset_id)
        .having(func.count(Case.id) >= minimum)
    ).all()
    for asset_id, count in asset_rows:
        asset = db.get(Asset, asset_id)
        cases = list(
            db.scalars(
                select(Case)
                .where(Case.campus_id == campus_id, Case.asset_id == asset_id, Case.created_at >= since)
                .order_by(Case.created_at.desc())
            ).all()
        )
        issues.append(
            {
                "scope": "ASSET",
                "asset_id": asset_id,
                "asset_code": asset.code if asset else None,
                "label": asset.name if asset else f"Asset {asset_id}",
                "case_count": int(count),
                "case_ids": [c.id for c in cases],
                "case_numbers": [c.case_number for c in cases],
                "window_days": window_days,
                "last_incident": cases[0].created_at if cases else None,
                "average_resolution_minutes": _average_resolution(cases),
                "category": cases[0].category if cases else None,
            }
        )

    location_rows = db.execute(
        select(Case.location_id, Case.category, func.count(Case.id))
        .where(Case.campus_id == campus_id, Case.created_at >= since, Case.location_id.is_not(None))
        .group_by(Case.location_id, Case.category)
        .having(func.count(Case.id) >= minimum)
    ).all()
    for location_id, category, count in location_rows:
        location = db.get(Location, location_id)
        cases = list(
            db.scalars(
                select(Case)
                .where(
                    Case.campus_id == campus_id,
                    Case.location_id == location_id,
                    Case.category == category,
                    Case.created_at >= since,
                )
                .order_by(Case.created_at.desc())
            ).all()
        )
        issues.append(
            {
                "scope": "LOCATION",
                "location_id": location_id,
                "location_code": location.code if location else None,
                "label": f"{location.name if location else location_id} - {category}",
                "case_count": int(count),
                "case_ids": [c.id for c in cases],
                "case_numbers": [c.case_number for c in cases],
                "window_days": window_days,
                "last_incident": cases[0].created_at if cases else None,
                "average_resolution_minutes": _average_resolution(cases),
                "category": category,
            }
        )

    issues.sort(key=lambda i: i["case_count"], reverse=True)
    return issues


def _average_resolution(cases: list[Case]) -> float | None:
    durations = [
        (clock.ensure_aware(c.resolved_at) - clock.ensure_aware(c.created_at)).total_seconds() / 60.0
        for c in cases
        if c.resolved_at and c.created_at
    ]
    if not durations:
        return None
    return round(sum(durations) / len(durations), 1)
