"""Server side of the offline outbox.

The client queues mutations in IndexedDB and replays them here. Every replay
carries a client-generated idempotency key, so a retried request after a flaky
hostel network can never create a second case.
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import SourceChannel, SyncOperationType, SyncStatus


class SyncOperation(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "sync_operations"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_sync_operations_idempotency"),
        enum_check("operation", SyncOperationType, "ck_sync_operations_operation"),
        enum_check("status", SyncStatus, "ck_sync_operations_status"),
        Index("ix_sync_operations_user_device", "user_id", "device_id", "created_at"),
        Index("ix_sync_operations_status", "status", "updated_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(80))
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    operation: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, default="CASE")
    entity_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=SyncStatus.QUEUED.value)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_channel: Mapped[str] = mapped_column(
        String(24), nullable=False, default=SourceChannel.PWA.value
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Snapshot of what the client believed when it queued the mutation.
    client_base: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    response: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_error: Mapped[str | None] = mapped_column(Text)
    captured_offline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
