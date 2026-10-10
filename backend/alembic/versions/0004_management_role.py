"""merge Administrator and Management (warden) into one MANAGEMENT role

Running the campus day to day and running the deployment are the same job, so
they are the same credential: ``ADMIN`` and ``WARDEN`` collapse into
``MANAGEMENT``. Accounts are *not* merged or deleted - a person keeps their
login and their name; only the role they hold changes, so a warden and a
registrar remain two accounts on one role.

Four CHECK constraints enumerate the role values (the roles table plus every
column that names a responsible party), so all four are dropped before the
merge and rebuilt around the surviving value set afterwards. Rebuilding them
from the model would be wrong here: this migration has to run against the set
the database is actually carrying.

Revision ID: 0004_management_role
Revises: 0003_external_channels
Create Date: 2026-10-09

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_management_role"
down_revision: Union[str, None] = "0003_external_channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SURVIVING_KEY = "MANAGEMENT"
RETIRED_KEYS = ("WARDEN", "ADMIN")

_OLD_SET = "'STUDENT', 'TEACHER', 'PARENT', 'WARDEN', 'ADMIN'"
_NEW_SET = "'STUDENT', 'TEACHER', 'PARENT', 'MANAGEMENT'"

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

    # One row. Management's permissions are the union of the two sets, which is
    # exactly what the administrator set already was - the warden set was a
    # strict subset of it.
    op.execute(
        f"""
        INSERT INTO roles (key, name, description, is_system)
        SELECT '{SURVIVING_KEY}',
               'Management',
               'Runs the institution: hostels, fees, certificates, leave, the gate, '
               'announcements, accounts and configuration',
               true
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE key = '{SURVIVING_KEY}');
        """
    )

    # Move permissions across, then clear them off the rows that are going away.
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT survivor.id, rp.permission_id
        FROM role_permissions rp
        JOIN roles retired ON retired.id = rp.role_id
        CROSS JOIN roles survivor
        WHERE retired.key IN ('{RETIRED_KEYS[0]}', '{RETIRED_KEYS[1]}')
          AND survivor.key = '{SURVIVING_KEY}'
        ON CONFLICT DO NOTHING;
        """
    )
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id FROM roles WHERE key IN ('{RETIRED_KEYS[0]}', '{RETIRED_KEYS[1]}')
        );
        """
    )

    # Every account keeps its identity, and picks up the surviving role.
    op.execute(
        f"""
        UPDATE users
        SET role_id = (SELECT id FROM roles WHERE key = '{SURVIVING_KEY}')
        WHERE role_id IN (
            SELECT id FROM roles WHERE key IN ('{RETIRED_KEYS[0]}', '{RETIRED_KEYS[1]}')
        );
        """
    )
    op.execute(
        f"DELETE FROM roles WHERE key IN ('{RETIRED_KEYS[0]}', '{RETIRED_KEYS[1]}');"
    )

    # Rows already on file that name a retired role keep working, so they are
    # repointed before the narrow constraint goes on rather than after.
    for table, _, column in ROLE_CONSTRAINTS:
        if table == "roles":
            continue
        op.execute(f"UPDATE {table} SET {column} = '{SURVIVING_KEY}' WHERE {column} IN ('{RETIRED_KEYS[0]}', '{RETIRED_KEYS[1]}');")

    _add_constraints(_NEW_SET)


def downgrade() -> None:
    """Split management back into an administrator and a warden.

    Only the role rows and the constraints come back. Which account was which is
    not recoverable from the merged row, so the two new role sets carry the
    permissions the split roles hold today and no account is moved: an operator
    who downgrades has to assign the warden role again.
    """
    from app.core.permissions import ROLE_PERMISSIONS

    _drop_constraints()

    for key, name, description in (
        ("ADMIN", "Administrator", "Institution-wide management"),
        ("WARDEN", "Management", "Day-to-day operations across the campus"),
    ):
        op.execute(
            f"""
            INSERT INTO roles (key, name, description, is_system)
            SELECT '{key}', '{name}', '{description}', true
            WHERE NOT EXISTS (SELECT 1 FROM roles WHERE key = '{key}');
            """
        )
        for permission_key in sorted(ROLE_PERMISSIONS.get(key, set())):
            op.execute(
                f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM roles r, permissions p
                WHERE r.key = '{key}' AND p.key = '{permission_key}'
                ON CONFLICT DO NOTHING;
                """
            )

    op.execute("DELETE FROM roles WHERE key = 'MANAGEMENT';")
    _add_constraints(_OLD_SET)
