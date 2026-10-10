"""Leave: applying, date validation, deciding, and withdrawing."""

from datetime import date, timedelta

from tests.conftest import auth

FUTURE = (date.today() + timedelta(days=5)).isoformat()
LATER = (date.today() + timedelta(days=9)).isoformat()


def test_student_applies_for_leave_and_sees_it(client, student_token):
    created = client.post(
        "/api/v1/leave",
        headers=auth(student_token),
        json={
            "kind": "CASUAL",
            "from_date": FUTURE,
            "to_date": LATER,
            "reason": "Travelling home for a family function.",
            "destination": "Cuttack",
        },
    )
    assert created.status_code == 201, created.text
    row = created.json()["application"]
    assert row["state"] == "PENDING"

    listing = client.get("/api/v1/leave/me", headers=auth(student_token)).json()
    assert any(a["id"] == row["id"] for a in listing["applications"])
    assert listing["summary"]["pending"] >= 1


def test_leave_cannot_end_before_it_starts(client, student_token):
    response = client.post(
        "/api/v1/leave",
        headers=auth(student_token),
        json={"kind": "CASUAL", "from_date": LATER, "to_date": FUTURE, "reason": "Backwards dates."},
    )
    assert response.status_code == 422


def test_leave_reason_must_be_meaningful(client, student_token):
    response = client.post(
        "/api/v1/leave",
        headers=auth(student_token),
        json={"kind": "CASUAL", "from_date": FUTURE, "to_date": LATER, "reason": "x"},
    )
    assert response.status_code == 422


def test_teacher_decides_a_leave_application(client, admin_token):
    listing = client.get("/api/v1/leave?state=PENDING", headers=auth(admin_token)).json()
    assert listing["applications"], "expected a seeded pending leave application"
    application_id = listing["applications"][0]["id"]

    first = client.post(
        f"/api/v1/leave/{application_id}/decide",
        headers=auth(admin_token),
        json={"state": "APPROVED", "note": "Approved by the warden."},
    )
    assert first.status_code == 200, first.text
    assert first.json()["application"]["state"] == "APPROVED"

    second = client.post(
        f"/api/v1/leave/{application_id}/decide",
        headers=auth(admin_token),
        json={"state": "REJECTED"},
    )
    assert second.status_code == 422


def test_student_cannot_decide_leave(client, student_token):
    response = client.post(
        "/api/v1/leave/1/decide", headers=auth(student_token), json={"state": "APPROVED"}
    )
    assert response.status_code == 403


def test_student_can_withdraw_their_own_pending_leave(client, student_token):
    created = client.post(
        "/api/v1/leave",
        headers=auth(student_token),
        json={"kind": "SICK", "from_date": FUTURE, "to_date": LATER, "reason": "Not well."},
    )
    assert created.status_code == 201, created.text
    application_id = created.json()["application"]["id"]

    cancelled = client.post(f"/api/v1/leave/{application_id}/cancel", headers=auth(student_token))
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["application"]["state"] == "CANCELLED"

    # A decided or withdrawn application cannot be withdrawn twice.
    again = client.post(f"/api/v1/leave/{application_id}/cancel", headers=auth(student_token))
    assert again.status_code == 422


def test_a_non_owner_cannot_withdraw_a_pending_application(client, student_token, teacher_token):
    created = client.post(
        "/api/v1/leave",
        headers=auth(student_token),
        json={"kind": "CASUAL", "from_date": FUTURE, "to_date": LATER, "reason": "Family event."},
    )
    assert created.status_code == 201, created.text
    application_id = created.json()["application"]["id"]

    # A teacher holds leave:read but is not the owner and not an administrator.
    response = client.post(f"/api/v1/leave/{application_id}/cancel", headers=auth(teacher_token))
    assert response.status_code == 403
