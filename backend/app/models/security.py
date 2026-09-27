"""Gate operations and generated documents (certificates, passes)."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import DocumentKind, GateDirection, GatePassState, SourceChannel


class GatePass(Base, SurrogateIdMixin, TimestampMixin):
    """Issued against an approved leave case. Verifiable by security at the gate."""

    __tablename__ = "gate_passes"
    __table_args__ = (
        UniqueConstraint("pass_code", name="uq_gate_pass_code"),
        enum_check("state", GatePassState),
        Index("ix_gate_passes_campus_state", "campus_id", "state", "valid_to"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    pass_code: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default=GatePassState.ISSUED.value)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(160))
    reason: Mapped[str | None] = mapped_column(Text)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
    issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(240))
    qr_payload: Mapped[str | None] = mapped_column(String(160))

    student: Mapped["Student"] = relationship(lazy="joined")  # noqa: F821


class GateLog(Base, SurrogateIdMixin, TimestampMixin):
    """Append-only gate movement record. Written even when the gate device is offline."""

    __tablename__ = "gate_logs"
    __table_args__ = (
        enum_check("direction", GateDirection, "ck_gate_logs_direction"),
        Index("ix_gate_logs_campus_time", "campus_id", "occurred_at"),
        Index("ix_gate_logs_student", "student_id", "occurred_at"),
        UniqueConstraint("client_ref", name="uq_gate_logs_client_ref"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gate_pass_id: Mapped[int | None] = mapped_column(ForeignKey("gate_passes.id", ondelete="SET NULL"))
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id", ondelete="SET NULL"))
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
    gate_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    logged_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    device_id: Mapped[str | None] = mapped_column(String(80))
    source_channel: Mapped[str] = mapped_column(
        String(24), nullable=False, default=SourceChannel.PWA.value
    )
    offline_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    client_ref: Mapped[str | None] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(String(240))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class Document(Base, SurrogateIdMixin, TimestampMixin):
    """A generated, verifiable institutional document (e.g. bonafide certificate)."""

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("serial_no", name="uq_documents_serial"),
        UniqueConstraint("verification_code", name="uq_documents_verification_code"),
        enum_check("kind", DocumentKind, "ck_documents_kind"),
        Index("ix_documents_case", "case_id", "created_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default=DocumentKind.BONAFIDE_CERTIFICATE.value)
    serial_no: Mapped[str] = mapped_column(String(32), nullable=False)
    verification_code: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(400), nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )
    generated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoke_reason: Mapped[str | None] = mapped_column(String(240))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    student: Mapped["Student | None"] = relationship(lazy="joined")  # noqa: F821
