"""Bring the database to head, however it was set up.

The table shape is owned by SQLAlchemy and evolved by Alembic, but a database
can arrive in three states, and a start command has to survive all of them:

1. **Managed** - ``alembic_version`` exists. Replay any pending migration with
   ``upgrade head``.
2. **Built outside Alembic** - the tables exist (a Supabase deployment set up by
   pasting ``supabase/schema.sql`` into the SQL Editor, or an old
   ``create_all``) but there is no ``alembic_version`` row. Stamp the head
   revision without touching data, so ``upgrade`` sees the database as current.
   A plain ``alembic upgrade head`` would instead replay 0001 and fail with
   "relation already exists".
3. **Empty** - nothing exists yet. The migrations predate several models, so
   replaying them would leave the database missing tables the API needs. Build
   the schema from the models instead (the same metadata that generates
   ``supabase/schema.sql``), add the append-only guards migration 0002
   introduces, and stamp head.

This is the safe entrypoint for a start command:

    python -m scripts.migrate && python -m scripts.bootstrap && uvicorn ...

Whatever the branch, it reconciles bookkeeping and never drops data.
"""

from __future__ import annotations

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect

from app.core.db import engine
from app.models import Base

# A table the schema always has. Its presence means the schema exists even when
# SQLAlchemy never wrote an alembic_version row.
SENTINEL_TABLE = "roles"

# The append-only guards from migration 0002 / supabase/schema.sql, applied when
# this script builds the schema itself.
_BLOCK_FN = """
create or replace function campus_relay_block_mutation() returns trigger as $$
begin
    raise exception
        'Campus Relay append-only guard: % on %.% is not permitted',
        tg_op, tg_table_schema, tg_table_name
        using errcode = 'restrict_violation',
              hint = 'Audit and event records are immutable. Insert a new record instead.';
end;
$$ language plpgsql
"""

_BLOCK_TRIGGERS = """
do $$
declare
    t text;
begin
    foreach t in array array['case_events', 'audit_logs', 'notification_events', 'gate_logs']
    loop
        execute format('drop trigger if exists trg_%1$s_append_only on %1$s', t);
        execute format(
            'create trigger trg_%1$s_append_only before update or delete on %1$s
             for each row execute function campus_relay_block_mutation()', t);
    end loop;
end;
$$
"""


def _create_from_models() -> None:
    with engine.begin() as connection:
        Base.metadata.create_all(connection)
        # Use the raw DBAPI cursor with no parameters: the guard function's
        # message contains '%', which psycopg would otherwise read as a
        # placeholder marker when SQLAlchemy executes the statement.
        cursor = connection.connection.cursor()
        try:
            cursor.execute(_BLOCK_FN)
            cursor.execute(_BLOCK_TRIGGERS)
        finally:
            cursor.close()


def main() -> None:
    config = Config("alembic.ini")
    head = ScriptDirectory.from_config(config).get_current_head()

    tables = set(inspect(engine).get_table_names())

    if "alembic_version" not in tables:
        if SENTINEL_TABLE in tables:
            print(
                "Migrate: schema present without alembic_version "
                f"(built by supabase/schema.sql?) - stamping {head}."
            )
            command.stamp(config, head)
        else:
            print("Migrate: empty database - creating the schema from the models.")
            _create_from_models()
            command.stamp(config, head)

    command.upgrade(config, head)
    print(f"Migrate: database is at {head}.")


if __name__ == "__main__":
    main()
