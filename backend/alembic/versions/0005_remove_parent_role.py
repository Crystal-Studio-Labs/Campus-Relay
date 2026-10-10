"""retire the PARENT role entirely

The demo ships three roles - STUDENT, TEACHER and MANAGEMENT - so the parent /
guardian role is removed rather than left dormant. Its read-only view of a
linked student is what ``students.guardian_user_id`` existed to serve; with the
role gone the link is dead weight and the column goes with it.

Two things must change together. Four CHECK constraints enumerate the role
values (the roles table plus every column that names a responsible party), so
all four are dropped and rebuilt around the surviving three-value set. And the
``guardian_user_id`` column - a second FK from students to users that only ever
existed so a parent login could resolve its ward - is dropped. It is guarded
with IF EXISTS because it was a model-only column: databases provisioned purely
from earlier migrations never carried it, while a database touched by
``create_all`` would.

Parent accounts are deleted outright. Every FK that points at users is either
CASCADE or SET NULL, so the rows they raised survive with the requester cleared
rather than dangling. The role row is deleted last, once nothing references it.

Revision ID: 0005_remove_parent_role
Revises: 0004_management_role
Create Date: 2026-10-09

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_remove_parent_role"
down_revision: Union[str, None] = "0004_management_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RETIRED_KEY = "PARENT"

_OLD_SET = "'STUDENT', 'TEACHER', 'PARENT', 'MANAGEMENT'"
_NEW_SET = "'STUDENT', 'TEACHER', 'MANAGEMENT'"

# table, constraint, column - every place a role key is written down.
ROLE_CONSTRAINTS = (
    ("roles", "ck_roles_key", "key"),
    ("workflow_steps", "ck_workflow_steps_role", "responsible_role"),
    ("sla_rules", "ck_sla_rules_escalate_role", "escalate_to_role"),
    ("case_approvals", "ck_case_approvals_role", "approver_role"),
)


def _drop_constraints() -> None:
    for table, constraint, _ in ROLE_CONSTRAINTS:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint};")


def _add_constraints(values: str) -> None:
    for table, constraint, column in ROLE_CONSTRAINTS:
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {constraint} CHECK ({column} IN ({values}));"
        )


def upgrade() -> None:
    _drop_constraints()

    # The ward link only ever served a parent login. It may be absent on a
    # database built purely from migrations, so it goes conditionally.
    op.execute("ALTER TABLE students DROP COLUMN IF EXISTS guardian_user_id;")

    # Rows already on file that name a retired role are repointed to the student
    # the parent effectively acted for, before the narrow constraint goes on.
    for table, _, column in ROLE_CONSTRAINTS:
        if table == "roles":
            continue
        op.execute(f"UPDATE {table} SET {column} = 'STUDENT' WHERE {column} = '{RETIRED_KEY}';")

    # Parent accounts are deleted. Cases and requests they raised keep their
    # history with the requester link nulled by the FK's SET NULL / CASCADE.
    op.execute(
        """
        DELETE FROM users
        WHERE role_id IN (SELECT id FROM roles WHERE key = '{key}');
        """.format(key=RETIRED_KEY)
    )
    op.execute("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key = '{key}');".format(key=RETIRED_KEY))
    op.execute("DELETE FROM roles WHERE key = '{key}';".format(key=RETIRED_KEY))

    _add_constraints(_NEW_SET)


# The permission set the parent role held before it was retired. Recorded here
# rather than imported, because app code no longer defines a PARENT entry - a
# downgrade has to reconstruct it from history, not from the current model.
PARENT_PERMISSIONS = (
    "ACTIVITY_READ",
    "ATTENDANCE_READ",
    "CASE_COMMENT",
    "CASE_CREATE",
    "CASE_READ_OWN",
    "CAREER_READ",
    "CLEARANCE_READ",
    "CLEARANCE_REQUEST",
    "FEEDBACK_READ",
    "FEEDBACK_SUBMIT",
    "FEES_READ",
    "LEAVE_READ",
    "LEAVE_REQUEST",
    "LIBRARY_READ",
    "MARKS_READ",
    "NOTICE_READ",
    "NOTICE_SHARE",
    "NOTIFICATION_PREFERENCE_MANAGE",
    "NOTIFICATION_READ",
    "SYNC_SUBMIT",
    "TIMETABLE_READ",
)


def downgrade() -> None:
    """Reinstate the parent role and its ward link.

    Only the role row, its permissions and the column come back. Which accounts
    were parents is not recoverable once deleted, so an operator who downgrades
    has to recreate them and relink each ward by hand.
    """
    _drop_constraints()

    op.execute(
        """
        INSERT INTO roles (key, name, description, is_system)
        SELECT 'PARENT', 'Parent', 'Read-only view of their ward', true
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE key = 'PARENT');
        """
    )
    for permission_key in PARENT_PERMISSIONS:
        op.execute(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id FROM roles r, permissions p
            WHERE r.key = 'PARENT' AND p.key = '{permission_key}'
            ON CONFLICT DO NOTHING;
            """.format(permission_key=permission_key)
        )

    op.execute(
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_user_id INTEGER "
        "REFERENCES users(id) ON DELETE SET NULL;"
    )

    _add_constraints(_OLD_SET)
