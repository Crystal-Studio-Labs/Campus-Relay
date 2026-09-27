"""external messaging channels + notification delivery outbox

Three related changes, all in service of the same goal - honest, non-blocking
outbound messaging:

1. ``notification_events.channel`` gains TELEGRAM and WHATSAPP, so a real
   delivered/read/action event can be recorded per external channel.
2. ``notification_deliveries`` is the outbox: a mutable row per attempt, drained
   by the background worker with retry and backoff. Delivery is async so a slow
   provider can never delay filing a case.
3. ``notification_preferences`` gains a per-channel opt-in, and ``users`` gains
   the addresses those channels need.

Revision ID: 0003_external_channels
Revises: 0002_append_only
Create Date: 2026-09-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_external_channels"
down_revision: Union[str, None] = "0002_append_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_CHANNELS = "'IN_APP', 'PUSH'"
_NEW_CHANNELS = "'IN_APP', 'PUSH', 'TELEGRAM', 'WHATSAPP'"


def upgrade() -> None:
    # 1. Where a user can be reached on an external channel.
    op.add_column("users", sa.Column("telegram_chat_id", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("whatsapp_number", sa.String(length=24), nullable=True))

    # 2. Per-channel opt-in, defaulting on so nothing silently stops arriving.
    op.add_column(
        "notification_preferences",
        sa.Column("telegram", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "notification_preferences",
        sa.Column("whatsapp", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    # 3. Widen the event channel check to include the new channels.
    op.drop_constraint("ck_notification_events_channel", "notification_events", type_="check")
    op.create_check_constraint(
        "ck_notification_events_channel", "notification_events", f"channel IN ({_NEW_CHANNELS})"
    )

    # 4. The outbox.
    op.create_table(
        "notification_deliveries",
        sa.Column("campus_id", sa.Integer(), nullable=False),
        sa.Column("notification_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("target", sa.String(length=120), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(length=400), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"channel IN ({_NEW_CHANNELS})", name="ck_notification_deliveries_channel"),
        sa.CheckConstraint(
            "state IN ('QUEUED', 'DELIVERED', 'FAILED', 'CANCELLED')",
            name="ck_notification_deliveries_state",
        ),
        sa.ForeignKeyConstraint(["campus_id"], ["campuses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_deliveries_campus_id"), "notification_deliveries", ["campus_id"], unique=False
    )
    op.create_index(
        op.f("ix_notification_deliveries_notification_id"),
        "notification_deliveries",
        ["notification_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_due",
        "notification_deliveries",
        ["state", "next_attempt_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_deliveries_due", table_name="notification_deliveries")
    op.drop_index(op.f("ix_notification_deliveries_notification_id"), table_name="notification_deliveries")
    op.drop_index(op.f("ix_notification_deliveries_campus_id"), table_name="notification_deliveries")
    op.drop_table("notification_deliveries")

    op.drop_constraint("ck_notification_events_channel", "notification_events", type_="check")
    op.create_check_constraint(
        "ck_notification_events_channel", "notification_events", f"channel IN ({_OLD_CHANNELS})"
    )

    op.drop_column("notification_preferences", "whatsapp")
    op.drop_column("notification_preferences", "telegram")
    op.drop_column("users", "whatsapp_number")
    op.drop_column("users", "telegram_chat_id")
