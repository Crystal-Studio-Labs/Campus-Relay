"""Append-only enforcement for audit/event tables.

The audit trail is the product's evidence layer: it must not be silently
overwritten. These ORM listeners raise on UPDATE/DELETE. The same guarantee is
also expressed as database triggers in the initial migration, so a rogue SQL
session cannot rewrite history either.
"""

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.case import AuditLog, CaseEvent
from app.models.comms import NotificationEvent
from app.models.security import GateLog

IMMUTABLE_MODELS = (AuditLog, CaseEvent, NotificationEvent, GateLog)


class ImmutableRecordError(RuntimeError):
    """Raised when code tries to modify an append-only record."""


def _guard_update(mapper, connection, target):  # noqa: ARG001
    raise ImmutableRecordError(
        f"{type(target).__name__} is append-only and cannot be modified after insert"
    )


def _guard_delete(mapper, connection, target):  # noqa: ARG001
    raise ImmutableRecordError(
        f"{type(target).__name__} is append-only and cannot be deleted"
    )


def register_immutability_guards() -> None:
    for model in IMMUTABLE_MODELS:
        event.listen(model, "before_update", _guard_update, propagate=True)
        event.listen(model, "before_delete", _guard_delete, propagate=True)


@event.listens_for(Session, "before_flush")
def _reject_dirty_immutable(session: Session, flush_context, instances):  # noqa: ARG001
    """Belt and braces: catch bulk updates that bypass object-level events."""
    for obj in session.dirty:
        if isinstance(obj, IMMUTABLE_MODELS):
            raise ImmutableRecordError(
                f"{type(obj).__name__} is append-only and cannot be modified after insert"
            )
    for obj in session.deleted:
        if isinstance(obj, IMMUTABLE_MODELS):
            raise ImmutableRecordError(
                f"{type(obj).__name__} is append-only and cannot be deleted"
            )
