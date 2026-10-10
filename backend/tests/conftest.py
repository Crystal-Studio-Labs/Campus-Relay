"""Test fixtures.

The suite runs against a real PostgreSQL database (the seeded demo campus),
because the interesting behaviour - triggers, constraints, scoping - lives in
the database and in the services, not in mocks.

Every test runs inside a transaction that is rolled back at the end, so the
suite is repeatable and never leaves the demo data changed. The API's `get_db`
dependency is overridden to hand routes that same transactional session.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import engine, get_db
from app.main import app

# The notification delivery worker must not run during tests: it would race the
# assertions by draining the outbox on its own thread. Tests drive
# `process_due_deliveries` explicitly instead.
settings.delivery_worker_enabled = False

# Tests run the API the way a production deployment runs it, with two
# exceptions. The delivery worker is off (above), and the in-process rate
# limiter is off, because the suite makes far more requests per minute from one
# client than a single person ever would - throttling it would measure the
# suite's speed rather than the product. The limiter itself is covered by
# tests/test_security.py, which turns it back on deliberately.
settings.app_env = "test"

DEMO_PASSWORD = "Campus@2026"


@pytest.fixture(scope="session")
def connection():
    conn = engine.connect()
    trans = conn.begin()
    try:
        yield conn
    finally:
        trans.rollback()
        conn.close()


@pytest.fixture()
def db(connection: Connection) -> Session:
    """A session that joins an outer transaction by savepoint, so a route calling
    `commit()` releases its own savepoint instead of ending the transaction the
    fixture rolls back.

    The savepoint opened below is load-bearing. In ``create_savepoint`` join mode
    the session's ``commit()`` *releases* its savepoint, which absorbs the work
    into the enclosing transaction. Without a savepoint of our own around it, a
    test's committed rows would survive into the next test in the same process
    (they only vanished when the session-scoped connection finally rolled back).
    Holding our own savepoint means one rollback at teardown undoes everything
    the test did, committed or not.
    """
    savepoint = connection.begin_nested()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        if savepoint.is_active:
            savepoint.rollback()


@pytest.fixture()
def client(db: Session) -> TestClient:
    def override_get_db():
        # Mirror the real dependency: commit after a successful request so that
        # changes are flushed and visible to the next request in the same test.
        # The outer transaction in `connection` is still rolled back at the end.
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _login(client: TestClient, email: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def student_token(client: TestClient) -> str:
    return _login(client, "student@campusrelay.demo")


@pytest.fixture()
def admin_token(client: TestClient) -> str:
    return _login(client, "admin@campusrelay.demo")


@pytest.fixture()
def teacher_token(client: TestClient) -> str:
    return _login(client, "teacher@campusrelay.demo")
