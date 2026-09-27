"""Agent 3 - Operations (admin-facing).

Produces:
  * a plain-language summary of what is pending
  * SLA breaches and at-risk work
  * recurring-problem detection
  * workload concentration
  * recommended escalations, clearly labelled as recommendations

Every finding carries the numbers it was derived from, so an administrator can
check the claim instead of trusting it.
"""

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Case, Department, User
from app.models.enums import CLOSED_STATUSES, SlaState
from app.services import analytics, clock, routing


@dataclass
class Finding:
    kind: str
    headline: str
    detail: str
    evidence: dict = field(default_factory=dict)
    severity: str = "INFO"


@dataclass
class Briefing:
    summary: str
    findings: list[Finding] = field(default_factory=list)
    recommendations: list[dict] = field(default_factory=list)
    engine: str = "rules"

    def as_dict(self) -> dict:
        return {
            "summary": self.summary,
            "findings": [
                {
                    "kind": f.kind,
                    "headline": f.headline,
                    "detail": f.detail,
                    "evidence": f.evidence,
                    "severity": f.severity,
                }
                for f in self.findings
            ],
            "recommendations": self.recommendations,
            "engine": self.engine,
            "generated_at": clock.now(),
            "disclaimer": (
                "Recommendations are generated from current database state and are marked "
                "as suggestions. No automated action is taken without a human decision."
            ),
        }


class OperationsAgent:
    name = "operations"

    def briefing(self, db: Session, *, user: User) -> Briefing:
        campus_id = user.campus_id
        dashboard = analytics.dashboard(db, campus_id=campus_id)
        findings: list[Finding] = []
        recommendations: list[dict] = []

        # --- Pending work ---
        findings.append(
            Finding(
                kind="BACKLOG",
                headline=f"{dashboard['open_cases']} open cases",
                detail=(
                    f"{dashboard['new_today']} raised today, {dashboard['in_progress']} in progress, "
                    f"{dashboard['unassigned_cases']} still unassigned, "
                    f"{dashboard['awaiting_approval']} waiting on approval."
                ),
                evidence={
                    "open_cases": dashboard["open_cases"],
                    "new_today": dashboard["new_today"],
                    "in_progress": dashboard["in_progress"],
                    "unassigned": dashboard["unassigned_cases"],
                    "awaiting_approval": dashboard["awaiting_approval"],
                },
                severity="WARN" if dashboard["unassigned_cases"] else "INFO",
            )
        )

        if dashboard["unassigned_cases"]:
            unassigned = db.scalars(
                select(Case)
                .where(
                    Case.campus_id == campus_id,
                    Case.assigned_staff_id.is_(None),
                    Case.status.notin_(tuple(CLOSED_STATUSES)),
                )
                .order_by(Case.created_at.asc())
                .limit(10)
            ).all()
            recommendations.append(
                {
                    "type": "RECOMMENDATION",
                    "action": "ASSIGN",
                    "title": f"Assign {len(unassigned)} unassigned case(s)",
                    "reason": "Unassigned cases cannot progress and will breach their target.",
                    "case_ids": [c.id for c in unassigned],
                    "case_numbers": [c.case_number for c in unassigned],
                }
            )

        # --- SLA ---
        if dashboard["sla_breaches"]:
            breached = db.scalars(
                select(Case)
                .where(
                    Case.campus_id == campus_id,
                    Case.sla_state == SlaState.BREACHED.value,
                    Case.status.notin_(tuple(CLOSED_STATUSES)),
                )
                .order_by(Case.due_at.asc())
                .limit(10)
            ).all()
            findings.append(
                Finding(
                    kind="SLA_BREACH",
                    headline=f"{dashboard['sla_breaches']} case(s) past their target",
                    detail="Oldest breaches: " + ", ".join(c.case_number for c in breached[:5]),
                    evidence={
                        "breached": dashboard["sla_breaches"],
                        "at_risk": dashboard["sla_at_risk"],
                        "case_numbers": [c.case_number for c in breached],
                    },
                    severity="CRITICAL",
                )
            )
            recommendations.append(
                {
                    "type": "RECOMMENDATION",
                    "action": "ESCALATE",
                    "title": f"Escalate {len(breached)} breached case(s)",
                    "reason": "These cases have passed their SLA target and need a decision now.",
                    "case_ids": [c.id for c in breached],
                    "case_numbers": [c.case_number for c in breached],
                }
            )

        if dashboard["awaiting_verification"]:
            findings.append(
                Finding(
                    kind="VERIFICATION",
                    headline=f"{dashboard['awaiting_verification']} case(s) awaiting requester verification",
                    detail="Work is done but the requester has not confirmed yet.",
                    evidence={"awaiting_verification": dashboard["awaiting_verification"]},
                    severity="INFO",
                )
            )

        # --- Ageing ---
        oldest = max(
            (b for b in dashboard["ageing"] if b["label"] == "> 3d"), key=lambda b: b["count"], default=None
        )
        if oldest and oldest["count"]:
            findings.append(
                Finding(
                    kind="AGEING",
                    headline=f"{oldest['count']} case(s) open longer than 3 days",
                    detail="Ageing buckets: "
                    + ", ".join(f"{b['label']}: {b['count']}" for b in dashboard["ageing"]),
                    evidence={"ageing": dashboard["ageing"]},
                    severity="WARN",
                )
            )

        # --- Recurring issues ---
        recurring = dashboard["recurring_issues"]
        for issue in recurring[:3]:
            findings.append(
                Finding(
                    kind="RECURRING",
                    headline=f"Recurring issue at {issue['label']}",
                    detail=(
                        f"{issue['case_count']} cases in the last {issue['window_days']} days "
                        f"({', '.join(issue['case_numbers'][:5])})."
                    ),
                    evidence={
                        "scope": issue["scope"],
                        "case_count": issue["case_count"],
                        "case_ids": issue["case_ids"],
                        "average_resolution_minutes": issue["average_resolution_minutes"],
                    },
                    severity="WARN",
                )
            )
            if issue["case_count"] >= 4:
                recommendations.append(
                    {
                        "type": "RECOMMENDATION",
                        "action": "ROOT_CAUSE",
                        "title": f"Investigate recurring failures at {issue['label']}",
                        "reason": (
                            f"{issue['case_count']} separate reports in {issue['window_days']} days "
                            "suggest a repair that keeps failing rather than isolated incidents."
                        ),
                        "case_ids": issue["case_ids"],
                        "case_numbers": issue["case_numbers"],
                    }
                )

        # --- Workload concentration ---
        workload = [row for row in dashboard["staff_workload"] if row["open_cases"] > 0]
        if workload:
            total = sum(row["open_cases"] for row in workload)
            heaviest = max(workload, key=lambda r: r["open_cases"])
            share = heaviest["open_cases"] / total if total else 0
            findings.append(
                Finding(
                    kind="WORKLOAD",
                    headline=f"{heaviest['name']} carries {heaviest['open_cases']} of {total} active cases",
                    detail=f"{round(share * 100)}% of active work sits with one person.",
                    evidence={
                        "staff": [
                            {
                                "name": row["name"],
                                "open_cases": row["open_cases"],
                                "utilisation": row["utilisation"],
                            }
                            for row in sorted(workload, key=lambda r: -r["open_cases"])[:5]
                        ]
                    },
                    severity="WARN" if share >= 0.4 else "INFO",
                )
            )
            if share >= 0.4 and len(workload) > 1:
                recommendations.append(
                    {
                        "type": "RECOMMENDATION",
                        "action": "REBALANCE",
                        "title": f"Rebalance work away from {heaviest['name']}",
                        "reason": (
                            f"{round(share * 100)}% of active cases sit with one staff member while "
                            f"{len(workload) - 1} others have capacity."
                        ),
                        "staff_id": heaviest["staff_id"],
                        "evidence": {
                            "open_cases": heaviest["open_cases"],
                            "total_active": total,
                        },
                    }
                )

        # --- Department pressure ---
        pressure = [d for d in dashboard["by_department"] if d["open_cases"]]
        pressure.sort(key=lambda d: -d["open_cases"])
        if pressure:
            findings.append(
                Finding(
                    kind="DEPARTMENT",
                    headline=f"Highest open load: {pressure[0]['name']}",
                    detail=", ".join(f"{d['name']}: {d['open_cases']} open" for d in pressure[:5]),
                    evidence={"departments": pressure[:5]},
                    severity="INFO",
                )
            )

        avg = dashboard["average_resolution_minutes"]
        summary = (
            f"{dashboard['open_cases']} cases are open. "
            f"{dashboard['sla_breaches']} have breached their target and {dashboard['sla_at_risk']} are at risk. "
            f"{dashboard['awaiting_approval']} await approval and {dashboard['unassigned_cases']} are unassigned. "
            + (f"Average resolution time is {avg} minutes. " if avg else "No cases have been resolved yet. ")
            + f"{len(recurring)} recurring pattern(s) detected in the last 30 days."
        )

        return Briefing(
            summary=summary,
            findings=findings,
            recommendations=recommendations,
            engine="rules",
        )


def recurring_summary(db: Session, *, campus_id: int, window_days: int = 30) -> dict:
    issues = routing.recurring_issues(db, campus_id=campus_id, window_days=window_days, minimum=3)
    return {
        "window_days": window_days,
        "detected": len(issues),
        "issues": [
            {
                "label": issue["label"],
                "scope": issue["scope"],
                "case_count": issue["case_count"],
                "case_numbers": issue["case_numbers"],
                "average_resolution_minutes": issue["average_resolution_minutes"],
                "last_incident": issue["last_incident"],
                "category": issue["category"],
            }
            for issue in issues
        ],
        "method": (
            "Same asset or same location+category with 3 or more cases in the window. "
            "Deterministic counts only - no predictive claim is made."
        ),
    }
