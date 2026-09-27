"""The CampusCase aggregate.

Every campus request - complaint, certificate, leave, gate pass, query - is a
row in `cases`. Service-specific differences live in `state_payload` and in the
workflow configuration, never in parallel tables.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check, utcnow
from app.models.enums import (
    ActorKind,
    ApprovalState,
    AuditEventType,
    CaseStatus,
    DedupeState,
    Priority,
    RoleKey,
    SlaState,
    SourceChannel,
    VerificationState,
)


class Case(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "cases"
    __table_args__ = (
        UniqueConstraint("campus_id", "case_number", name="uq_case_campus_number"),
        enum_check("status", CaseStatus),
        enum_check("priority", Priority, "ck_cases_priority"),
        enum_check("source_channel", SourceChannel, "ck_cases_source_channel"),
        enum_check("sla_state", SlaState, "ck_cases_sla_state"),
        enum_check("verification_state", VerificationState, "ck_cases_verification_state"),
        enum_check("dedupe_state", DedupeState, "ck_cases_dedupe_state"),
        Index("ix_cases_queue", "campus_id", "status", "priority"),
        Index("ix_cases_dept_queue", "campus_id", "department_id", "status"),
        Index("ix_cases_assignee", "assigned_staff_id", "status"),
        Index("ix_cases_due", "campus_id", "due_at"),
        Index("ix_cases_requester", "requester_id", "created_at"),
        Index("ix_cases_service", "campus_id", "service_key", "created_at"),
        Index("ix_cases_asset", "asset_id", "created_at"),
        Index("ix_cases_location", "location_id", "created_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_number: Mapped[str] = mapped_column(String(24), nullable=False)

    requester_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    requester_role: Mapped[str] = mapped_column(String(32), nullable=False, default="STUDENT")
    # Set when a helpdesk/kiosk operator files on behalf of a student without a device.
    requester_student_id: Mapped[int | None] = mapped_column(
        ForeignKey("students.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"))
    service_key: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False, default="GENERAL")
    subcategory: Mapped[str | None] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    assigned_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )

    priority: Mapped[str] = mapped_column(String(16), nullable=False, default=Priority.NORMAL.value)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=CaseStatus.SUBMITTED.value)
    current_step_key: Mapped[str | None] = mapped_column(String(48))
    source_channel: Mapped[str] = mapped_column(
        String(24), nullable=False, default=SourceChannel.PWA.value
    )
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")

    # SLA
    sla_minutes: Mapped[int | None] = mapped_column(Integer)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sla_state: Mapped[str] = mapped_column(String(16), nullable=False, default=SlaState.NO_SLA.value)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    breached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    at_risk_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalation_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Workflow / approval state
    required_approvals: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    state_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Verification + lifecycle
    verification_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default=VerificationState.NOT_REQUIRED.value
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
    reopen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Duplicate / recurrence intelligence
    parent_case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    duplicate_group_id: Mapped[str | None] = mapped_column(String(64), index=True)
    dedupe_state: Mapped[str] = mapped_column(String(16), nullable=False, default=DedupeState.NONE.value)
    dedupe_score: Mapped[float | None] = mapped_column(Float)

    # Offline origin
    client_ref: Mapped[str | None] = mapped_column(String(80), index=True)
    captured_offline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    service: Mapped["Service | None"] = relationship(lazy="joined")  # noqa: F821
    requester: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[requester_id], lazy="joined"
    )
    requester_student: Mapped["Student | None"] = relationship(  # noqa: F821
        foreign_keys=[requester_student_id], lazy="joined"
    )
    assigned_staff: Mapped["Staff | None"] = relationship(lazy="joined")  # noqa: F821
    location: Mapped["Location | None"] = relationship(lazy="joined")  # noqa: F821
    asset: Mapped["Asset | None"] = relationship(lazy="joined")  # noqa: F821
    department: Mapped["Department | None"] = relationship(lazy="joined")  # noqa: F821

    @property
    def is_open(self) -> bool:
        from app.models.enums import OPEN_STATUSES

        return self.status in OPEN_STATUSES

    @property
    def age_minutes(self) -> float:
        end = self.resolved_at or utcnow()
        created = self.created_at
        if created is None:
            return 0.0
        if created.tzinfo is None:
            created = created.replace(tzinfo=end.tzinfo)
        return max((end - created).total_seconds() / 60.0, 0.0)


class CaseEvent(Base, SurrogateIdMixin):
    """Immutable case timeline. Append-only: enforced in app.models.immutability."""

    __tablename__ = "case_events"
    __table_args__ = (
        Index("ix_case_events_case", "case_id", "created_at"),
        UniqueConstraint("idempotency_key", "case_id", name="uq_case_event_idempotency"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[str | None] = mapped_column(String(32))
    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False, default=ActorKind.USER.value)
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str | None] = mapped_column(String(32))
    step_key: Mapped[str | None] = mapped_column(String(48))
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False, default=SourceChannel.PWA.value)
    device_id: Mapped[str | None] = mapped_column(String(80))
    idempotency_key: Mapped[str | None] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    actor: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821


class CaseAssignment(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "case_assignments"
    __table_args__ = (Index("ix_case_assignments_case", "case_id", "is_active"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    assigned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assignment_type: Mapped[str] = mapped_column(String(24), nullable=False, default="MANUAL")
    reason: Mapped[str | None] = mapped_column(String(240))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    staff: Mapped["Staff | None"] = relationship(lazy="joined")  # noqa: F821


class CaseApproval(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "case_approvals"
    __table_args__ = (
        enum_check("state", ApprovalState),
        enum_check("approver_role", RoleKey, "ck_case_approvals_role"),
        Index("ix_case_approvals_pending", "campus_id", "state", "created_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    step_key: Mapped[str] = mapped_column(String(48), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approver_role: Mapped[str] = mapped_column(String(32), nullable=False)
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=ApprovalState.PENDING.value)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)

    case: Mapped[Case] = relationship()


class CaseComment(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "case_comments"
    __table_args__ = (
        Index("ix_case_comments_case", "case_id", "created_at"),
        UniqueConstraint("case_id", "client_ref", name="uq_case_comment_client_ref"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_role: Mapped[str | None] = mapped_column(String(32))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="PUBLIC")
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False, default=SourceChannel.PWA.value)
    client_ref: Mapped[str | None] = mapped_column(String(80))

    author: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821


class CaseAttachment(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "case_attachments"
    __table_args__ = (Index("ix_case_attachments_case", "case_id", "created_at"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="EVIDENCE")
    filename: Mapped[str] = mapped_column(String(240), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False, default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_path: Mapped[str] = mapped_column(String(400), nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(240))
    client_ref: Mapped[str | None] = mapped_column(String(80))


class AuditLog(Base, SurrogateIdMixin):
    """Global append-only audit stream. Never updated, never deleted."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        enum_check("actor_kind", ActorKind, "ck_audit_logs_actor_kind"),
        Index("ix_audit_logs_campus_time", "campus_id", "created_at"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_case", "case_id", "created_at"),
        Index("ix_audit_logs_type", "event_type", "created_at"),
        UniqueConstraint("idempotency_key", name="uq_audit_logs_idempotency"),
    )

    campus_id: Mapped[int | None] = mapped_column(ForeignKey("campuses.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[str | None] = mapped_column(String(32))
    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False, default=ActorKind.USER.value)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, default="CASE")
    entity_id: Mapped[str | None] = mapped_column(String(64))
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False, default=SourceChannel.PWA.value)
    device_id: Mapped[str | None] = mapped_column(String(80))
    idempotency_key: Mapped[str | None] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )


# Convenience alias so engines can reference the event catalogue type-safely.
CaseEventType = AuditEventType

__all__ = [
    "Case",
    "CaseEvent",
    "CaseEventType",
    "CaseAssignment",
    "CaseApproval",
    "CaseComment",
    "CaseAttachment",
    "AuditLog",
]
