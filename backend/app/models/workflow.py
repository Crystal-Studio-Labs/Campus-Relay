"""Configuration as data: service catalog, workflows, policies, SLA rules.

Adding a new campus service should mean configuring a workflow row, not writing
a new application. These tables are that configuration.
"""

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Float,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import (
    PolicyEffect,
    Priority,
    RoleKey,
    ServiceCategory,
    WorkflowStepType,
)


class Workflow(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "workflows"
    __table_args__ = (UniqueConstraint("campus_id", "key", name="uq_workflow_campus_key"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    initial_state: Mapped[str] = mapped_column(String(32), nullable=False, default="SUBMITTED")
    allowed_states: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    steps: Mapped[list["WorkflowStep"]] = relationship(
        back_populates="workflow",
        order_by="WorkflowStep.order_index",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkflowStep(Base, SurrogateIdMixin, TimestampMixin):
    """One step of a workflow: approval, assignment, resolution, verification."""

    __tablename__ = "workflow_steps"
    __table_args__ = (
        UniqueConstraint("workflow_id", "key", name="uq_workflow_step_key"),
        enum_check("step_type", WorkflowStepType),
        enum_check("responsible_role", RoleKey, "ck_workflow_steps_role"),
    )

    workflow_id: Mapped[int] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    key: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    step_type: Mapped[str] = mapped_column(String(24), nullable=False)
    responsible_role: Mapped[str | None] = mapped_column(String(32))
    sla_minutes: Mapped[int | None] = mapped_column(Integer)
    requires_note: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    # {"approve": "<next step key or CANCELLED>", "reject": "...", "submit": "..."}
    transitions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Structured data a step needs from the requester (e.g. leave dates).
    required_fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    workflow: Mapped[Workflow] = relationship(back_populates="steps")


class Service(Base, SurrogateIdMixin, TimestampMixin):
    """A requestable campus service, bound to a workflow."""

    __tablename__ = "services"
    __table_args__ = (
        UniqueConstraint("campus_id", "key", name="uq_service_campus_key"),
        enum_check("category", ServiceCategory),
        enum_check("default_priority", Priority, "ck_services_priority"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workflow_id: Mapped[int | None] = mapped_column(ForeignKey("workflows.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    key: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(24), nullable=False, default=ServiceCategory.OTHER.value)
    icon: Mapped[str] = mapped_column(String(32), nullable=False, default="file")
    default_priority: Mapped[str] = mapped_column(String(16), nullable=False, default=Priority.NORMAL.value)
    default_sla_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=1440)
    allowed_requester_roles: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=lambda: ["STUDENT"]
    )
    # Dynamic form definition rendered by the client. Configuration, not data.
    form_schema: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    requires_attachment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_anonymous_location: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    workflow: Mapped[Workflow | None] = relationship(lazy="joined")
    department: Mapped["Department | None"] = relationship(lazy="joined")  # noqa: F821


class Policy(Base, SurrogateIdMixin, TimestampMixin):
    """Declarative rule evaluated server-side before state changes commit."""

    __tablename__ = "policies"
    __table_args__ = (
        UniqueConstraint("campus_id", "key", name="uq_policy_campus_key"),
        enum_check("effect", PolicyEffect),
        Index("ix_policies_campus_service", "campus_id", "service_key"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    service_key: Mapped[str | None] = mapped_column(String(48))
    effect: Mapped[str] = mapped_column(String(16), nullable=False, default=PolicyEffect.REQUIRE.value)
    evaluation_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    # {"all": [{"field": "leave_start", "op": "gte_today"}]}
    conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    message: Mapped[str] = mapped_column(String(300), nullable=False, default="Policy check failed")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SlaRule(Base, SurrogateIdMixin, TimestampMixin):
    """Target resolution time per service/priority. Demo values, configurable."""

    __tablename__ = "sla_rules"
    __table_args__ = (
        UniqueConstraint("campus_id", "service_key", "priority", name="uq_sla_rule_scope"),
        enum_check("priority", Priority, "ck_sla_rules_priority"),
        enum_check("escalate_to_role", RoleKey, "ck_sla_rules_escalate_role"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_key: Mapped[str | None] = mapped_column(String(48))
    priority: Mapped[str] = mapped_column(String(16), nullable=False)
    target_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    at_risk_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.75)
    escalate_to_role: Mapped[str] = mapped_column(
        String(32), nullable=False, default=RoleKey.DEPARTMENT_HEAD.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
