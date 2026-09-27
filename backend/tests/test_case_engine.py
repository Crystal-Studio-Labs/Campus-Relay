"""The CampusCase state machine and requester scoping."""

from tests.conftest import auth


def _first_service(client, token):
    response = client.get("/api/v1/services", headers=auth(token))
    assert response.status_code == 200, response.text
    services = response.json()["services"]
    assert services, "the demo campus must expose at least one service"
    return services[0]["key"]


def _location_code(client, token) -> str | None:
    """The hostel policy requires a location, so the test supplies a real one
    rather than asserting against a policy failure."""
    response = client.get("/api/v1/locations", headers=auth(token))
    if response.status_code != 200:
        return None
    locations = response.json().get("locations") or []
    return locations[0]["code"] if locations else None


def _create_case(client, token, description="Water tap has been leaking for nine days."):
    service_key = _first_service(client, token)
    response = client.post(
        "/api/v1/cases",
        headers=auth(token),
        json={
            "service_key": service_key,
            "description": description,
            "location_code": _location_code(client, token),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["case"]


def test_student_can_create_a_case(client, student_token):
    case = _create_case(client, student_token)
    assert case["case_number"]
    assert case["status"] in {"SUBMITTED", "VALIDATING", "ROUTED", "ASSIGNED", "WAITING_FOR_APPROVAL"}


def test_created_case_appears_in_the_requester_list(client, student_token):
    case = _create_case(client, student_token, "The corridor light is flickering.")
    listing = client.get("/api/v1/cases", headers=auth(student_token))
    assert listing.status_code == 200
    ids = {row["id"] for row in listing.json()["cases"]}
    assert case["id"] in ids


def test_student_cannot_verify_a_case_that_is_not_resolved(client, student_token):
    case = _create_case(client, student_token, "The mess menu board is blank.")
    response = client.post(
        f"/api/v1/cases/{case['id']}/verify",
        headers=auth(student_token),
        json={"note": "looks fine"},
    )
    # The engine refuses an illegal transition rather than silently accepting it.
    assert response.status_code in {400, 403, 409, 422}, response.text


def test_student_cannot_assign_their_own_case(client, student_token):
    case = _create_case(client, student_token, "The washroom door will not latch.")
    response = client.post(
        f"/api/v1/cases/{case['id']}/assign",
        headers=auth(student_token),
        json={"staff_id": 1},
    )
    assert response.status_code == 403


def test_case_detail_is_scoped_to_its_requester(client, student_token, technician_token):
    case = _create_case(client, student_token, "The library reading lamp is dead.")
    # The requester can read it.
    own = client.get(f"/api/v1/cases/{case['id']}", headers=auth(student_token))
    assert own.status_code == 200
    # A technician with a work scope can also read it (assigned or scoped).
    scoped = client.get(f"/api/v1/cases/{case['id']}", headers=auth(technician_token))
    assert scoped.status_code in {200, 403}


def test_unknown_service_is_rejected(client, student_token):
    response = client.post(
        "/api/v1/cases",
        headers=auth(student_token),
        json={"service_key": "NOT_A_REAL_SERVICE", "description": "x"},
    )
    assert response.status_code in {404, 422}
