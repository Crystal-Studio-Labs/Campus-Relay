"""Communication layer: notices (targeted broadcast) and notifications (per-user)."""

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
from app.models.enums import (
    DeliveryState,
    NotificationCategory,
    NotificationChannel,
    NotificationState,
    NoticeActionType,
    NoticeStatus,
    NoticeTargetType,
    NoticeType,
    Priority,
    SourceChannel,
)


class Notice(Base, SurrogateIdMixin, TimestampMixin):
    """An announcement with an explicit audience, lifecycle and action tracking."""

    __tablename__ = "notices"
    __table_args__ = (
        enum_check("notice_type", NoticeType, "ck_notices_type"),
        enum_check("status", NoticeStatus, "ck_notices_status"),
        enum_check("priority", Priority, "ck_notices_priority"),
        enum_check("required_action", NoticeActionType, "ck_notices_required_action"),
        Index("ix_notices_campus_status", "campus_id", "status", "publish_at"),
        UniqueConstraint("share_token", name="uq_notices_share_token"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(String(300))
    notice_type: Mapped[str] = mapped_column(String(16), nullable=False, default=NoticeType.NORMAL.value)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=NoticeStatus.DRAFT.value)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default=Priority.NORMAL.value)
    category: Mapped[str] = mapped_column(String(48), nullable=False, default="GENERAL")

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    publish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    acknowledgement_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    required_action: Mapped[str | None] = mapped_column(String(24))
    required_action_label: Mapped[str | None] = mapped_column(String(80))

    attachment_path: Mapped[str | None] = mapped_column(String(400))
    attachment_name: Mapped[str | None] = mapped_column(String(240))
    image_path: Mapped[str | None] = mapped_column(String(400))

    # Sharing: opaque token, public view exposes only notice content - never student data.
    share_token: Mapped[str | None] = mapped_column(String(64))
    share_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    audience_summary: Mapped[str | None] = mapped_column(String(240))

    created_by: Mapped["User | None"] = relationship(lazy="joined")  # noqa: F821
    targets: Mapped[list["NoticeTarget"]] = relationship(
        back_populates="notice", cascade="all, delete-orphan", lazy="selectin"
    )


class NoticeTarget(Base, SurrogateIdMixin, TimestampMixin):
    """Audience selector. One notice can carry many selectors (ANDed for scoping)."""

    __tablename__ = "notice_targets"
    __table_args__ = (
        enum_check("target_type", NoticeTargetType, "ck_notice_targets_type"),
        Index("ix_notice_targets_notice", "notice_id"),
        Index("ix_notice_targets_lookup", "target_type", "target_id"),
        UniqueConstraint(
            "notice_id", "target_type", "target_id", name="uq_notice_target_unique"
        ),
    )

    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[int | None] = mapped_column(Integer)
    target_value: Mapped[str | None] = mapped_column(String(64))
    include: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    label: Mapped[str | None] = mapped_column(String(120))

    notice: Mapped[Notice] = relationship(back_populates="targets")


class NoticeRecipient(Base, SurrogateIdMixin, TimestampMixin):
    """Materialised delivery outcome per user: the basis for read/action analytics."""

    __tablename__ = "notice_reads"
    __table_args__ = (
        UniqueConstraint("notice_id", "user_id", name="uq_notice_read_user"),
        Index("ix_notice_reads_user", "user_id", "created_at"),
        Index("ix_notice_reads_notice_state", "notice_id", "state"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default=NotificationState.SENT.value)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False, default=SourceChannel.PWA.value)
    device_id: Mapped[str | None] = mapped_column(String(80))
    offline_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notice: Mapped[Notice] = relationship()


class NoticeAction(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "notice_actions"
    __table_args__ = (
        enum_check("action_type", NoticeActionType, "ck_notice_actions_type"),
        UniqueConstraint("notice_id", "user_id", "action_type", name="uq_notice_action_unique"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(24), nullable=False)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )


class NoticeShare(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "notice_shares"
    __table_args__ = (UniqueConstraint("token", name="uq_notice_share_token"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), nullable=False)
    shared_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(24), nullable=False, default="COPY_LINK")
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base, SurrogateIdMixin, TimestampMixin):
    """Per-user notification. Separate from notices: this is about *your* stuff."""

    __tablename__ = "notifications"
    __table_args__ = (
        enum_check("category", NotificationCategory, "ck_notifications_category"),
        enum_check("state", NotificationState, "ck_notifications_state"),
        enum_check("priority", Priority, "ck_notifications_priority"),
        Index("ix_notifications_user_state", "user_id", "state", "created_at"),
        Index("ix_notifications_user_category", "user_id", "category", "created_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(String(600), nullable=False, default="")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default=Priority.NORMAL.value)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=NotificationState.SENT.value)
    action_label: Mapped[str | None] = mapped_column(String(80))
    action_type: Mapped[str | None] = mapped_column(String(40))
    action_target: Mapped[str | None] = mapped_column(String(120))

    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="SET NULL"))
    notice_id: Mapped[int | None] = mapped_column(ForeignKey("notices.id", ondelete="SET NULL"))
    dedupe_key: Mapped[str | None] = mapped_column(String(120), index=True)

    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actioned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class NotificationEvent(Base, SurrogateIdMixin):
    """Delivery/read/action attempts per channel - the basis for delivery tracking."""

    __tablename__ = "notification_events"
    __table_args__ = (
        enum_check("channel", NotificationChannel, "ck_notification_events_channel"),
        enum_check("state", NotificationState, "ck_notification_events_state"),
        Index("ix_notification_events_notification", "notification_id", "created_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False, default=NotificationChannel.IN_APP.value)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="in_app")
    detail: Mapped[str | None] = mapped_column(String(400))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )


class NotificationPreference(Base, SurrogateIdMixin, TimestampMixin):
    """User-controlled channel preference per category.

    Categories marked institutional-critical in the notification service ignore
    the opt-out and always deliver in-app (and record that they did).
    """

    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_notification_pref_user_category"),
        enum_check("category", NotificationCategory, "ck_notification_prefs_category"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    push: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    telegram: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class NotificationDelivery(Base, SurrogateIdMixin, TimestampMixin):
    """Outbox row for one optional-channel delivery attempt.

    The provider call is deliberately *not* made inside the request transaction:
    a slow or hanging provider must never add latency to filing a case. The
    service enqueues a row here, and the delivery worker drains it with retry and
    backoff, recording the true outcome as an append-only ``NotificationEvent``.

    This table is mutable by design (attempts, next attempt, last error), which
    is why the outbox is separate from the append-only event log.
    """

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        enum_check("channel", NotificationChannel, "ck_notification_deliveries_channel"),
        enum_check("state", DeliveryState, "ck_notification_deliveries_state"),
        Index("ix_notification_deliveries_due", "state", "next_attempt_at"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=DeliveryState.QUEUED.value)
    # The resolved address (Telegram chat id, WhatsApp number, push endpoint).
    # Stored so a later attempt uses the same destination the user opted in with.
    target: Mapped[str | None] = mapped_column(String(120))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(400))
    provider: Mapped[str | None] = mapped_column(String(32))
