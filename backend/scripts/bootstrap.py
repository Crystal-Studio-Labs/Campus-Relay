"""Idempotent first-run bootstrap for containerised and hosted deployments.

`python -m app.seed.seed_data` is deliberately destructive: it truncates the
campus tables and rebuilds thirty days of history. That is the right behaviour
for a demo reset, and the wrong behaviour on every container restart.

This script is the safe counterpart. It seeds the demo campus *only when the
database has no users yet*, so it can run unconditionally in a start command:

    alembic upgrade head && python -m scripts.bootstrap && uvicorn ...

A college that has already imported its own people sees "skipping seed" and
nothing is touched. To force a rebuild, use the admin reset endpoint or run the
seed module directly.
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import User
from app.seed.seed_data import reset_and_seed


def main() -> None:
    with SessionLocal() as session:
        existing = int(session.scalar(select(func.count(User.id))) or 0)

    if existing:
        print(f"Bootstrap: {existing} user(s) already present - skipping demo seed.")
        return

    summary = reset_and_seed()
    print("Bootstrap: no data found, seeded the demo campus.")
    for key, value in summary.items():
        if key != "demo_accounts":
            print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
