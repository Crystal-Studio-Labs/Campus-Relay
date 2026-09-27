"""The CampusCase state machine.

Declared once, used by the case engine, the API, the tests and the docs.
Invalid transitions are rejected server-side (see app/services/case_engine.py).
"""

from app.models.enums import CaseStatus as S

# from_status -> set of allowed to_status
CASE_TRANSITIONS: dict[str, set[str]] = {
    S.DRAFT.value: {S.SUBMITTED.value, S.CANCELLED.value},
    S.SUBMITTED.value: {
        S.VALIDATING.value,
        S.ROUTED.value,
        S.WAITING_FOR_APPROVAL.value,
        S.CANCELLED.value,
    },
    S.VALIDATING.value: {
        S.ROUTED.value,
        S.WAITING_FOR_USER.value,
        S.CANCELLED.value,
    },
    S.ROUTED.value: {
        S.ASSIGNED.value,
        S.WAITING_FOR_APPROVAL.value,
        # A workflow may move straight from routing into work (e.g. a quick query
        # or a certificate that is issued without a dispatch step).
        S.IN_PROGRESS.value,
        S.RESOLVED.value,
        S.ESCALATED.value,
        S.CANCELLED.value,
    },
    S.ASSIGNED.value: {
        S.IN_PROGRESS.value,
        S.ESCALATED.value,
        S.WAITING_FOR_USER.value,
        S.CANCELLED.value,
    },
    S.IN_PROGRESS.value: {
        S.RESOLVED.value,
        S.WAITING_FOR_USER.value,
        S.WAITING_FOR_APPROVAL.value,
        S.ESCALATED.value,
        S.CANCELLED.value,
    },
    S.WAITING_FOR_USER.value: {
        S.IN_PROGRESS.value,
        S.VALIDATING.value,
        S.CANCELLED.value,
    },
    S.WAITING_FOR_APPROVAL.value: {
        # Approval granted -> continue the workflow (route, assign or resolve).
        S.ROUTED.value,
        S.ASSIGNED.value,
        S.IN_PROGRESS.value,
        S.RESOLVED.value,
        S.CANCELLED.value,
        S.ESCALATED.value,
    },
    S.ESCALATED.value: {
        S.ASSIGNED.value,
        S.IN_PROGRESS.value,
        S.RESOLVED.value,
        S.CANCELLED.value,
    },
    S.RESOLVED.value: {
        S.VERIFICATION_REQUIRED.value,
        S.CLOSED.value,
        S.REOPENED.value,
    },
    S.VERIFICATION_REQUIRED.value: {
        S.CLOSED.value,
        S.REOPENED.value,
    },
    S.CLOSED.value: {S.REOPENED.value},
    S.REOPENED.value: {
        S.ROUTED.value,
        S.ASSIGNED.value,
        S.IN_PROGRESS.value,
        S.CANCELLED.value,
    },
    S.CANCELLED.value: set(),
}

# Statuses that end the workflow.
TERMINAL_STATUSES: set[str] = {S.CLOSED.value, S.CANCELLED.value}

# Statuses from which a requester-facing "reopen" is meaningful.
REOPENABLE_STATUSES: set[str] = {
    S.RESOLVED.value,
    S.VERIFICATION_REQUIRED.value,
    S.CLOSED.value,
}


def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in CASE_TRANSITIONS.get(from_status, set())


def allowed_transitions(from_status: str) -> list[str]:
    return sorted(CASE_TRANSITIONS.get(from_status, set()))
