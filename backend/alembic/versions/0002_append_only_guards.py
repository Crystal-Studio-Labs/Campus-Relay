"""append-only guards for audit and event tables

The audit trail is the product's evidence layer. The ORM already refuses to
update these rows (app/models/immutability.py), but that only protects code
paths that go through the ORM. These triggers make the guarantee a property of
the database itself, so an ad-hoc SQL session cannot rewrite history either.

Revision ID: 0002_append_only
Revises: 0001_initial
Create Date: 2026-09-20

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_append_only"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APPEND_ONLY_TABLES = ("case_events", "audit_logs", "notification_events", "gate_logs")

FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION campus_relay_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'Campus Relay append-only guard: % on %.% is not permitted',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation',
              HINT = 'Audit and event records are immutable. Insert a new record instead.';
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    op.execute(FUNCTION_SQL)
    for table in APPEND_ONLY_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION campus_relay_block_mutation();
            """
        )


def downgrade() -> None:
    for table in APPEND_ONLY_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_append_only ON {table};")
    op.execute("DROP FUNCTION IF EXISTS campus_relay_block_mutation();")
