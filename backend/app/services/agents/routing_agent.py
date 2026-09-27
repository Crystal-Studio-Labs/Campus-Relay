"""Agent 2 - Routing.

Recommends department, assignee and SLA for a case, and explains why. Uses the
same deterministic engine the Case Engine uses when auto-routing, so the agent
can never recommend something the engine would not do.
"""

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import Case, User
from app.services import routing


@dataclass
class RoutingExplanation:
    department: str | None
    department_id: int | None
    staff: str | None
    staff_id: int | None
    sla_minutes: int
    priority: str
    reasoning: list[str] = field(default_factory=list)
    alternatives: list[dict] = field(default_factory=list)
    engine: str = "rules"

    def as_dict(self) -> dict:
        return {
            "department": self.department,
            "department_id": self.department_id,
            "recommended_assignee": self.staff,
            "recommended_assignee_id": self.staff_id,
            "sla_minutes": self.sla_minutes,
            "priority": self.priority,
            "reasoning": self.reasoning,
            "alternatives": self.alternatives,
            "engine": self.engine,
            "disclaimer": "Recommendation only. Assignment remains a human decision.",
        }


class RoutingAgent:
    name = "routing"

    def explain(self, db: Session, *, user: User, case: Case) -> RoutingExplanation:
        recommendation = routing.recommend_routing(
            db,
            campus_id=user.campus_id,
            service=case.service,
            category=case.category,
            priority=case.priority,
            location=case.location if hasattr(case, "location") else None,
            service_key=case.service_key,
        )

        workload = sorted(
            routing.staff_workload(db, campus_id=user.campus_id),
            key=lambda row: row["open_cases"],
        )
        alternatives = [
            {
                "staff_id": row["staff_id"],
                "name": row["name"],
                "open_cases": row["open_cases"],
                "utilisation": row["utilisation"],
            }
            for row in workload[:5]
        ]

        reasoning = list(recommendation.explanation)
        if recommendation.staff_name:
            reasoning.append(
                f"{recommendation.staff_name} was chosen because they carry the fewest open cases "
                "in the target department at the time of this recommendation."
            )
        else:
            reasoning.append(
                "No available staff matched, so this case needs manual assignment."
            )
        reasoning.append(
            f"Target of {recommendation.sla_minutes} minutes comes from the SLA rule for "
            f"{case.service_key} / {case.priority}."
        )

        return RoutingExplanation(
            department=recommendation.department_name,
            department_id=recommendation.department_id,
            staff=recommendation.staff_name,
            staff_id=recommendation.staff_id,
            sla_minutes=recommendation.sla_minutes,
            priority=case.priority,
            reasoning=reasoning,
            alternatives=alternatives,
        )

    def preview(
        self, db: Session, *, user: User, service_key: str, description: str, priority: str | None = None
    ) -> RoutingExplanation:
        from app.services import case_engine

        service = case_engine.service_by_key(db, campus_id=user.campus_id, key=service_key)
        intake = routing.classify(description, service_key=service.key)
        resolved_priority = priority or intake.priority
        recommendation = routing.recommend_routing(
            db,
            campus_id=user.campus_id,
            service=service,
            category=intake.category,
            priority=resolved_priority,
            location=None,
            service_key=service.key,
        )
        return RoutingExplanation(
            department=recommendation.department_name,
            department_id=recommendation.department_id,
            staff=recommendation.staff_name,
            staff_id=recommendation.staff_id,
            sla_minutes=recommendation.sla_minutes,
            priority=resolved_priority,
            reasoning=recommendation.explanation
            + [
                f"Classified as {intake.category} with confidence {intake.confidence}.",
                "Deterministic rules engine - no model call required.",
            ],
        )
