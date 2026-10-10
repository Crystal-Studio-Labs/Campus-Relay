"""Clearance: raising a request, reading your own, and who may decide."""

from tests.conftest import auth


def test_student_raises_and_lists_their_clearance(client, student_token):
    created = client.post(
        "/api/v1/clearance",
        headers=auth(student_token),
        json={"kind": "NO_DUES", "purpose": "Library clearance for the new term"},
    )
    assert created.status_code == 201, created.text
    row = created.json()["request"]
    assert row["state"] == "PENDING"
    assert row["student"]["roll_number"]

    listing = client.get("/api/v1/clearance/me", headers=auth(student_token))
    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["student"] is not None
    assert any(r["id"] == row["id"] for r in body["requests"])


def test_student_cannot_read_or_decide_the_campus_queue(client, student_token):
    listing = client.get("/api/v1/clearance", headers=auth(student_token))
    assert listing.status_code == 403

    decide = client.post(
        "/api/v1/clearance/1/decide",
        headers=auth(student_token),
        json={"state": "APPROVED"},
    )
    assert decide.status_code == 403


def test_admin_decides_once_and_a_second_decision_is_refused(client, admin_token):
    listing = client.get("/api/v1/clearance?state=PENDING", headers=auth(admin_token))
    assert listing.status_code == 200, listing.text
    rows = listing.json()["requests"]
    assert rows, "expected a seeded pending clearance request"
    request_id = rows[0]["id"]

    first = client.post(
        f"/api/v1/clearance/{request_id}/decide",
        headers=auth(admin_token),
        json={"state": "APPROVED", "note": "Dues cleared."},
    )
    assert first.status_code == 200, first.text
    body = first.json()["request"]
    assert body["state"] == "APPROVED"
    assert body["decided_at"] is not None
    assert body["decision_note"] == "Dues cleared."

    second = client.post(
        f"/api/v1/clearance/{request_id}/decide",
        headers=auth(admin_token),
        json={"state": "REJECTED"},
    )
    assert second.status_code == 422


def test_unknown_clearance_request_is_rejected(client, admin_token):
    response = client.post(
        "/api/v1/clearance/99999999/decide",
        headers=auth(admin_token),
        json={"state": "APPROVED"},
    )
    assert response.status_code in (404, 422)
