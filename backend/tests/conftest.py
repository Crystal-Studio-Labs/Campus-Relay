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
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import engine, get_db
from app.main import app

# The notification delivery worker must not run during tests: it would race the
# assertions by draining the outbox on its own thread. Tests drive
# `process_due_deliveries` explicitly instead.
settings.delivery_worker_enabled = False

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
def db(connection: Session) -> Session:
    """A session that joins the outer transaction by savepoint, so that a
    service calling `commit()` releases a savepoint instead of ending the
    transaction the fixture will roll back."""
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.rollback()
        session.close()


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
def technician_token(client: TestClient) -> str:
    return _login(client, "technician@campusrelay.demo")


@pytest.fixture()
def security_token(client: TestClient) -> str:
    return _login(client, "security@campusrelay.demo")
