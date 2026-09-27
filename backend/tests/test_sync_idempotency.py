"""Idempotency and the sync surface.

The core promise of offline capture is that replaying the same operation never
creates a second record. These tests assert that against the real API.
"""

from tests.conftest import auth


def _service_key(client, token):
    return client.get("/api/v1/services", headers=auth(token)).json()["services"][0]["key"]


def _location_code(client, token) -> str | None:
    locations = client.get("/api/v1/locations", headers=auth(token)).json().get("locations") or []
    return locations[0]["code"] if locations else None


def test_replaying_the_same_client_ref_does_not_duplicate_a_case(client, student_token):
    service_key = _service_key(client, student_token)
    payload = {
        "service_key": service_key,
        "description": "Filed offline with a stable client reference.",
        "location_code": _location_code(client, student_token),
        "client_ref": "op-test-replay-0001",
    }

    first = client.post("/api/v1/cases", headers=auth(student_token), json=payload)
    assert first.status_code == 201, first.text

    # A retry carries the same key — the classic flaky-connection replay.
    second = client.post("/api/v1/cases", headers=auth(student_token), json=payload)
    assert second.status_code in {200, 201}, second.text

    assert first.json()["case"]["id"] == second.json()["case"]["id"]
    assert first.json()["case"]["case_number"] == second.json()["case"]["case_number"]
    assert second.json()["created"] is False


def test_two_different_client_refs_create_two_cases(client, student_token):
    service_key = _service_key(client, student_token)
    base = {
        "service_key": service_key,
        "description": "Two distinct offline complaints.",
        "location_code": _location_code(client, student_token),
    }

    one = client.post("/api/v1/cases", headers=auth(student_token), json={**base, "client_ref": "op-a"})
    two = client.post("/api/v1/cases", headers=auth(student_token), json={**base, "client_ref": "op-b"})
    assert one.status_code == 201 and two.status_code == 201
    assert one.json()["case"]["id"] != two.json()["case"]["id"]


def test_replayed_sync_operation_is_idempotent(client, student_token):
    operation = {
        "idempotency_key": "op-sync-replay-9001",
        "operation": "CASE_CREATE",
        "payload": {
            "service_key": _service_key(client, student_token),
            "description": "Queued offline, then replayed twice by the outbox.",
            "location_code": _location_code(client, student_token),
        },
    }
    body = {"device_uid": "test-device", "operations": [operation]}

    first = client.post("/api/v1/sync/push", headers=auth(student_token), json=body)
    assert first.status_code == 200, first.text
    first_result = first.json()["results"][0]
    assert first_result["status"] == "SYNCED"

    second = client.post("/api/v1/sync/push", headers=auth(student_token), json=body)
    assert second.status_code == 200
    second_result = second.json()["results"][0]
    assert second_result["status"] == "SYNCED"
    assert second_result["server_id"] == first_result["server_id"]


def test_stale_client_state_is_reported_as_conflict(client, student_token):
    """A mutation queued against state the server has since moved past must be
    reported as a conflict, not silently applied."""
    service_key = _service_key(client, student_token)
    created = client.post(
        "/api/v1/cases",
        headers=auth(student_token),
        json={
            "service_key": service_key,
            "description": "A conflict test case, queued against a stale snapshot.",
            "location_code": _location_code(client, student_token),
        },
    )
    case_id = created.json()["case"]["id"]

    pushed = client.post(
        "/api/v1/sync/push",
        headers=auth(student_token),
        json={
            "device_uid": "test-device",
            "operations": [
                {
                    "idempotency_key": "op-sync-conflict-9002",
                    "operation": "CASE_VERIFY",
                    "payload": {"case_id": case_id, "accepted": True},
                    # The client believed the case was already resolved; it is not.
                    "client_base": {"status": "RESOLVED"},
                }
            ],
        },
    )
    assert pushed.status_code == 200, pushed.text
    result = pushed.json()["results"][0]
    assert result["status"] == "CONFLICT"
    assert result["conflicts"]


def test_sync_health_requires_authentication(client):
    assert client.get("/api/v1/sync/health").status_code == 401


def test_sync_health_is_available_to_an_authenticated_client(client, student_token):
    response = client.get("/api/v1/sync/health", headers=auth(student_token))
    assert response.status_code == 200
