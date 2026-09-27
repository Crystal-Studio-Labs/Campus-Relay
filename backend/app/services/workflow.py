"""Workflow engine.

A workflow is configuration: an ordered list of steps, each with a responsible
role, an optional SLA and a transition map. The case engine asks this module
"what comes next", so adding a campus service means adding a workflow row, not
writing a new endpoint.

Transition targets are either another step `key`, or a reserved token starting
with "@" that maps directly to a case status.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Case, Workflow, WorkflowStep
from app.models.enums import CaseStatus, WorkflowStepType

# Reserved transition targets.
TOKEN_CLOSED = "@CLOSED"
TOKEN_CANCELLED = "@CANCELLED"
TOKEN_REOPENED = "@REOPENED"
TOKEN_RESOLVED = "@RESOLVED"
TOKEN_VERIFICATION = "@VERIFICATION_REQUIRED"
TOKEN_WAITING_FOR_USER = "@WAITING_FOR_USER"
TOKEN_ESCALATED = "@ESCALATED"
TOKEN_ROUTED = "@ROUTED"
TOKEN_ASSIGNED = "@ASSIGNED"
TOKEN_IN_PROGRESS = "@IN_PROGRESS"

STATUS_TOKENS: dict[str, str] = {
    TOKEN_CLOSED: CaseStatus.CLOSED.value,
    TOKEN_CANCELLED: CaseStatus.CANCELLED.value,
    TOKEN_REOPENED: CaseStatus.REOPENED.value,
    TOKEN_RESOLVED: CaseStatus.RESOLVED.value,
    TOKEN_VERIFICATION: CaseStatus.VERIFICATION_REQUIRED.value,
    TOKEN_WAITING_FOR_USER: CaseStatus.WAITING_FOR_USER.value,
    TOKEN_ESCALATED: CaseStatus.ESCALATED.value,
    TOKEN_ROUTED: CaseStatus.ROUTED.value,
    TOKEN_ASSIGNED: CaseStatus.ASSIGNED.value,
    TOKEN_IN_PROGRESS: CaseStatus.IN_PROGRESS.value,
}


def status_for_step(step: WorkflowStep) -> str:
    """The case status a case is in while it waits at this step."""
    mapping = {
        WorkflowStepType.APPROVAL.value: CaseStatus.WAITING_FOR_APPROVAL.value,
        WorkflowStepType.ASSIGNMENT.value: CaseStatus.ROUTED.value,
        WorkflowStepType.ACTION.value: CaseStatus.IN_PROGRESS.value,
        WorkflowStepType.RESOLUTION.value: CaseStatus.IN_PROGRESS.value,
        WorkflowStepType.VERIFICATION.value: CaseStatus.VERIFICATION_REQUIRED.value,
        WorkflowStepType.NOTIFICATION.value: CaseStatus.RESOLVED.value,
    }
    return mapping.get(step.step_type, CaseStatus.IN_PROGRESS.value)


@dataclass
class StepAdvance:
    """Outcome of leaving a step."""

    next_step: WorkflowStep | None
    next_status: str | None
    token: str | None = None

    @property
    def is_terminal_token(self) -> bool:
        return self.token is not None


class WorkflowRunner:
    def __init__(self, db: Session, case: Case):
        self.db = db
        self.case = case

    @property
    def workflow(self) -> Workflow | None:
        if self.case.service and self.case.service.workflow:
            return self.case.service.workflow
        return None

    @property
    def steps(self) -> list[WorkflowStep]:
        workflow = self.workflow
        return list(workflow.steps) if workflow else []

    def step(self, key: str | None) -> WorkflowStep | None:
        if not key:
            return None
        for step in self.steps:
            if step.key == key:
                return step
        return None

    @property
    def current_step(self) -> WorkflowStep | None:
        return self.step(self.case.current_step_key)

    def start(self) -> WorkflowStep | None:
        return self.steps[0] if self.steps else None

    def advance(self, decision: str) -> StepAdvance:
        """Move past the current step using `decision` (approve/reject/resolve/...)."""
        step = self.current_step
        if step is None:
            return StepAdvance(next_step=None, next_status=None)

        transitions = step.transitions or {}
        target = transitions.get(decision) or transitions.get("default")
        if target is None:
            return StepAdvance(next_step=None, next_status=None)

        if target.startswith("@"):
            return StepAdvance(next_step=None, next_status=STATUS_TOKENS.get(target), token=target)

        next_step = self.step(target)
        if next_step is None:
            return StepAdvance(next_step=None, next_status=None)

        following_transitions = next_step.transitions or {}
        # A step whose only transition continues the chain is walked immediately
        # (e.g. ASSIGNMENT -> ACTION auto-start).
        return StepAdvance(
            next_step=next_step,
            next_status=status_for_step(next_step),
            token=None if following_transitions else None,
        )

    def resolve_status_token(self, token: str | None) -> str | None:
        if not token:
            return None
        return STATUS_TOKENS.get(token)

    def is_auto_step(self, step: WorkflowStep) -> bool:
        """NOTIFICATION and ACTION steps with no approval semantics run inline."""
        return step.step_type in {WorkflowStepType.NOTIFICATION.value}

    def steps_summary(self) -> list[dict]:
        return [
            {
                "key": step.key,
                "name": step.name,
                "type": step.step_type,
                "responsible_role": step.responsible_role,
                "sla_minutes": step.sla_minutes,
                "requires_note": step.requires_note,
                "transitions": step.transitions or {},
                "instructions": step.instructions,
                "is_current": step.key == self.case.current_step_key,
            }
            for step in self.steps
        ]


def workflow_for_service(db: Session, service_id: int | None) -> Workflow | None:
    if not service_id:
        return None
    from app.models import Service

    service = db.get(Service, service_id)
    return service.workflow if service else None


def step_index(steps: list[WorkflowStep], key: str | None) -> int:
    for index, step in enumerate(steps):
        if step.key == key:
            return index
    return -1


def next_step_in_order(db: Session, *, workflow_id: int, current_key: str | None) -> WorkflowStep | None:
    steps = list(
        db.scalars(
            select(WorkflowStep)
            .where(WorkflowStep.workflow_id == workflow_id)
            .order_by(WorkflowStep.order_index)
        ).all()
    )
    index = step_index(steps, current_key)
    if index == -1:
        return steps[0] if steps else None
    return steps[index + 1] if index + 1 < len(steps) else None
