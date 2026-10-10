"""feedback requests: the office asking people for their feedback

Feedback is one-way - people tell the institution, the institution reads and
answers - so the only way an institution gets more of it is to ask. This adds
the ask as data rather than a broadcast:

1. ``feedback_requests`` names what the office wants to hear about, which group
   is being asked (role keys, comma-separated), and when an answer is due.
2. ``feedback.request_id`` links a reply back to the prompt it answers, so the
   office can see how many of the people it asked actually replied. Nullable and
   ON DELETE SET NULL: dropping the prompt must never drop the feedback.
3. The management role loses ``feedback:submit`` and gains ``feedback:request``.
   Permissions are rows (``permissions``, ``role_permissions``), not just the
   constants in ``app.core.permissions``, so editing the constant alone would
   leave every existing deployment still able to rate its own users.

Revision ID: 0006_feedback_requests
Revises: 0005_remove_parent_role
Create Date: 2026-10-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_feedback_requests"
down_revision: Union[str, None] = "0005_remove_parent_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GRANTED_KEY = "feedback:request"
GRANTED_CATEGORY = "services"
GRANTED_DESCRIPTION = "Ask teachers and students for their feedback"
REVOKED_KEY = "feedback:submit"
OFFICE_ROLE = "MANAGEMENT"


def _grant_to_office(permission_key: str, category: str, description: str) -> None:
    op.execute(
        f"""
        INSERT INTO permissions (key, category, description)
        SELECT '{permission_key}', '{category}', '{description}'
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = '{permission_key}');
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.key = '{OFFICE_ROLE}' AND p.key = '{permission_key}'
        ON CONFLICT DO NOTHING;
        """
    )


def upgrade() -> None:
    _grant_to_office(GRANTED_KEY, GRANTED_CATEGORY, GRANTED_DESCRIPTION)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE key = '{REVOKED_KEY}')
          AND role_id IN (SELECT id FROM roles WHERE key = '{OFFICE_ROLE}');
        """
    )

    op.create_table(
        "feedback_requests",
        sa.Column("campus_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(length=40), nullable=False),
        sa.Column("due_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("state IN ('OPEN', 'CLOSED')", name="ck_feedback_requests_state"),
        sa.ForeignKeyConstraint(["campus_id"], ["campuses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_feedback_requests_campus_id"), "feedback_requests", ["campus_id"], unique=False
    )
    op.create_index("ix_feedback_requests_state", "feedback_requests", ["state"], unique=False)

    op.add_column("feedback", sa.Column("request_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_feedback_request_id"), "feedback", ["request_id"], unique=False)
    op.create_foreign_key(
        "fk_feedback_request_id",
        "feedback",
        "feedback_requests",
        ["request_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    _grant_to_office(REVOKED_KEY, GRANTED_CATEGORY, "Submit feedback about the campus")
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE key = '{GRANTED_KEY}')
          AND role_id IN (SELECT id FROM roles WHERE key = '{OFFICE_ROLE}');
        """
    )

    op.drop_constraint("fk_feedback_request_id", "feedback", type_="foreignkey")
    op.drop_index(op.f("ix_feedback_request_id"), table_name="feedback")
    op.drop_column("feedback", "request_id")

    op.drop_index("ix_feedback_requests_state", table_name="feedback_requests")
    op.drop_index(op.f("ix_feedback_requests_campus_id"), table_name="feedback_requests")
    op.drop_table("feedback_requests")
