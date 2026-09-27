"""Authentication and RBAC: who you are, and what you may do."""

from tests.conftest import auth


def test_health_is_public(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_succeeds_for_a_demo_account(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "student@campusrelay.demo", "password": "Campus@2026"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["profile"]["role"] == "STUDENT"


def test_login_rejects_a_wrong_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "student@campusrelay.demo", "password": "not-the-password"},
    )
    assert response.status_code == 401


def test_unauthenticated_request_is_rejected(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_permissions(client, student_token):
    response = client.get("/api/v1/auth/me", headers=auth(student_token))
    assert response.status_code == 200
    permissions = set(response.json()["permissions"])
    assert "case:create" in permissions
    # A student must not hold administrative permissions.
    assert "dashboard:view" not in permissions
    assert "user:manage" not in permissions


def test_student_cannot_reach_the_admin_dashboard(client, student_token):
    response = client.get("/api/v1/admin/dashboard", headers=auth(student_token))
    assert response.status_code == 403


def test_student_cannot_list_all_users(client, student_token):
    response = client.get("/api/v1/admin/users", headers=auth(student_token))
    assert response.status_code == 403


def test_admin_can_reach_the_dashboard(client, admin_token):
    response = client.get("/api/v1/admin/dashboard", headers=auth(admin_token))
    assert response.status_code == 200


def test_technician_cannot_manage_users(client, technician_token):
    response = client.get("/api/v1/admin/users", headers=auth(technician_token))
    assert response.status_code == 403


def test_security_holds_gate_permissions_only(client, security_token):
    me = client.get("/api/v1/auth/me", headers=auth(security_token)).json()
    permissions = set(me["permissions"])
    assert "gate:verify" in permissions
    assert "user:manage" not in permissions
    assert "analytics:read" not in permissions


def test_data_import_requires_the_permission(client, student_token):
    response = client.get("/api/v1/admin/data/entities", headers=auth(student_token))
    assert response.status_code == 403
