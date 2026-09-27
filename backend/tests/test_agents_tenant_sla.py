"""Agent authorisation, requester scoping, and SLA computation."""

from tests.conftest import _login, auth


def _service_key(client, token):
    return client.get("/api/v1/services", headers=auth(token)).json()["services"][0]["key"]


def _location_code(client, token):
    locations = client.get("/api/v1/locations", headers=auth(token)).json().get("locations") or []
    return locations[0]["code"] if locations else None


def _create_case(client, token, description="A persistent leak under the washbasin."):
    response = client.post(
        "/api/v1/cases",
        headers=auth(token),
        json={
            "service_key": _service_key(client, token),
            "description": description,
            "location_code": _location_code(client, token),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["case"]


# --- SLA ------------------------------------------------------------------


def test_a_new_case_gets_an_sla_due_time_and_state(client, student_token):
    case = _create_case(client, student_token, "The corridor tubelight keeps flickering badly.")
    assert case.get("due_at"), "a routed case must have an SLA due time"
    assert case.get("sla_state") in {"ON_TIME", "AT_RISK", "BREACHED", "NO_SLA", "MET", "MISSED"}


def test_admin_dashboard_reports_sla_compliance(client, admin_token):
    dashboard = client.get("/api/v1/admin/dashboard", headers=auth(admin_token))
    assert dashboard.status_code == 200, dashboard.text
    assert "sla_compliance" in dashboard.json()


# --- Agents ---------------------------------------------------------------


def test_agents_status_requires_authentication(client):
    assert client.get("/api/v1/agents/status").status_code == 401


def test_student_cannot_use_the_operations_agent(client, student_token):
    response = client.get("/api/v1/agents/operations/briefing", headers=auth(student_token))
    assert response.status_code == 403


def test_admin_can_request_the_operations_briefing(client, admin_token):
    response = client.get("/api/v1/agents/operations/briefing", headers=auth(admin_token))
    assert response.status_code == 200, response.text


def test_agent_capabilities_are_described(client, admin_token):
    response = client.get("/api/v1/agents/capabilities", headers=auth(admin_token))
    assert response.status_code == 200
    assert response.json()


# --- Tenant / requester scoping ------------------------------------------


def test_a_student_cannot_read_another_students_case(client, student_token):
    other_token = _login(client, "student2@campusrelay.demo")
    other_case = _create_case(client, other_token, "Day-scholar: the bus gate is congested.")

    response = client.get(f"/api/v1/cases/{other_case['id']}", headers=auth(student_token))
    # Refused outright rather than returning an empty body, so the UI can say why.
    assert response.status_code in {403, 404}, response.text


def test_health_lists_no_private_data(client):
    body = client.get("/api/v1/health").json()
    assert set(body.keys()) == {"status", "service", "env"}
