"""Engagement: feedback (including anonymity) and campus activities."""

from datetime import datetime, timedelta

from sqlalchemy import select

from app.models import ActivityRegistration, Student
from app.models.enums import ParticipationState
from tests.conftest import auth


# --- Feedback --------------------------------------------------------------


def test_student_submits_feedback_and_reads_it_back(client, student_token):
    created = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={
            "kind": "MESS",
            "subject": "Test feedback subject",
            "message": "The test message for the feedback channel.",
            "rating": 4,
            "is_anonymous": True,
        },
    )
    assert created.status_code == 201, created.text
    row = created.json()["feedback"]
    assert row["rating"] == 4
    assert row["is_anonymous"] is True

    mine = client.get("/api/v1/feedback/me", headers=auth(student_token))
    assert mine.status_code == 200, mine.text
    # The author always sees their own submission, anonymous or not.
    assert any(f["id"] == row["id"] for f in mine.json()["feedback"])


def test_rating_is_bounded(client, student_token):
    too_high = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={"kind": "OTHER", "subject": "Rating", "message": "Out of range.", "rating": 9},
    )
    assert too_high.status_code == 422

    too_low = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={"kind": "OTHER", "subject": "Rating", "message": "Out of range.", "rating": 0},
    )
    assert too_low.status_code == 422


def test_student_cannot_read_the_campus_feedback_queue(client, student_token):
    response = client.get("/api/v1/feedback", headers=auth(student_token))
    assert response.status_code == 403


def test_only_the_office_sees_other_peoples_feedback(client, admin_token, teacher_token, student_token):
    """Faculty hold feedback:manage, so they read the queue; a student does not."""
    assert client.get("/api/v1/feedback", headers=auth(teacher_token)).status_code == 200
    assert client.get("/api/v1/feedback", headers=auth(admin_token)).status_code == 200
    assert client.get("/api/v1/feedback", headers=auth(student_token)).status_code == 403

    mine = client.get("/api/v1/feedback/me", headers=auth(teacher_token)).json()
    assert isinstance(mine.get("feedback"), list)


def test_office_reads_and_responds_to_feedback(client, admin_token, student_token):
    created = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={"kind": "FACILITY", "subject": "Respond to me", "message": "Please respond.", "rating": 2},
    )
    feedback_id = created.json()["feedback"]["id"]

    listing = client.get("/api/v1/feedback", headers=auth(admin_token))
    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["count"] >= 1
    assert body["average_rating"] is not None

    responded = client.post(
        f"/api/v1/feedback/{feedback_id}/respond",
        headers=auth(admin_token),
        json={"response": "Thank you, this is being looked into.", "state": "ACKNOWLEDGED"},
    )
    assert responded.status_code == 200, responded.text
    row = responded.json()["feedback"]
    assert row["state"] == "ACKNOWLEDGED"
    assert row["responded_at"] is not None


def test_management_does_not_give_feedback(client, admin_token):
    """The office reads and asks; it does not rate the people it runs."""
    response = client.post(
        "/api/v1/feedback",
        headers=auth(admin_token),
        json={"kind": "FACULTY", "subject": "Management opinion", "message": "Not mine to give.", "rating": 1},
    )
    assert response.status_code == 403


# --- Asking for feedback ---------------------------------------------------


def _ask(client, token, *, audience, subject="Tell us about the mess menu") -> dict:
    response = client.post(
        "/api/v1/feedback/requests",
        headers=auth(token),
        json={
            "subject": subject,
            "message": "The caterer review is next week; what should we raise?",
            "audience": audience,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["request"]


def test_the_office_asks_for_feedback_and_people_answer(client, admin_token, student_token):
    request = _ask(client, admin_token, audience=["STUDENT"])
    assert request["audience"] == ["STUDENT"]
    assert request["state"] == "OPEN"
    assert request["answered"] == 0

    asked = client.get("/api/v1/feedback/requests/mine", headers=auth(student_token)).json()
    mine = [row for row in asked["requests"] if row["id"] == request["id"]]
    assert mine, "a student should be asked for feedback addressed to students"
    assert mine[0]["answered_by_me"] is False

    answered = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={
            "kind": "MESS",
            "subject": "The new menu is better",
            "message": "Weekday dinner has improved a lot since the change.",
            "rating": 4,
            "request_id": request["id"],
        },
    )
    assert answered.status_code == 201, answered.text
    assert answered.json()["feedback"]["request_id"] == request["id"]

    office = client.get("/api/v1/feedback/requests", headers=auth(admin_token)).json()
    row = next(item for item in office["requests"] if item["id"] == request["id"])
    assert row["answered"] == 1
    assert row["asked"] >= 1
    assert row["average_rating"] is not None

    again = client.get("/api/v1/feedback/requests/mine", headers=auth(student_token)).json()
    row = next(item for item in again["requests"] if item["id"] == request["id"])
    assert row["answered_by_me"] is True


def test_a_request_is_only_shown_to_the_group_it_asks(client, admin_token, teacher_token, student_token):
    request = _ask(client, admin_token, audience=["TEACHER"], subject="Lab support next semester")
    teacher_view = client.get("/api/v1/feedback/requests/mine", headers=auth(teacher_token)).json()
    assert any(row["id"] == request["id"] for row in teacher_view["requests"])

    student_view = client.get("/api/v1/feedback/requests/mine", headers=auth(student_token)).json()
    assert all(row["id"] != request["id"] for row in student_view["requests"])

    # And the same answer holds on the write path, not just the listing.
    refused = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={
            "kind": "ACADEMIC",
            "subject": "Not asked",
            "message": "Answering a request addressed to faculty.",
            "rating": 3,
            "request_id": request["id"],
        },
    )
    assert refused.status_code == 422


def test_only_management_asks_for_feedback(client, teacher_token, student_token):
    for token in (teacher_token, student_token):
        response = client.post(
            "/api/v1/feedback/requests",
            headers=auth(token),
            json={"subject": "Let me ask", "message": "Not my call to make.", "audience": ["STUDENT"]},
        )
        assert response.status_code == 403


def test_a_request_can_only_ask_teachers_and_students(client, admin_token):
    response = client.post(
        "/api/v1/feedback/requests",
        headers=auth(admin_token),
        json={"subject": "Asking ourselves", "message": "The office cannot ask itself.", "audience": ["MANAGEMENT"]},
    )
    assert response.status_code == 422


def test_a_closed_request_can_no_longer_be_answered(client, admin_token, student_token):
    request = _ask(client, admin_token, audience=["STUDENT"], subject="Closing this one")
    closed = client.post(f"/api/v1/feedback/requests/{request['id']}/close", headers=auth(admin_token))
    assert closed.status_code == 200, closed.text
    assert closed.json()["request"]["state"] == "CLOSED"

    still_listed = client.get("/api/v1/feedback/requests/mine", headers=auth(student_token)).json()
    assert all(row["id"] != request["id"] for row in still_listed["requests"])

    late = client.post(
        "/api/v1/feedback",
        headers=auth(student_token),
        json={
            "kind": "OTHER",
            "subject": "Too late",
            "message": "Answering after the request was closed.",
            "rating": 3,
            "request_id": request["id"],
        },
    )
    assert late.status_code == 422


# --- Activities ------------------------------------------------------------


def _new_activity(client, staff_token, name: str, capacity: int = 3) -> dict:
    """Create an OPEN activity that this test owns.

    These tests used to pick any activity the student had not already joined,
    which silently assumed a pristine database. Once a browser run had enrolled
    the demo student everywhere, no candidate was left and the lookup raised
    StopIteration instead of failing an assertion. Owning the row removes the
    dependency on history without weakening what is being checked.
    """
    created = client.post(
        "/api/v1/activities",
        headers=auth(staff_token),
        json={
            "name": name,
            "kind": "CLUB",
            "starts_at": (datetime.now() + timedelta(days=3)).isoformat(),
            "capacity": capacity,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["activity"]


def test_student_browses_and_registers_for_an_activity(client, student_token, teacher_token):
    target = _new_activity(client, teacher_token, "Browsing club")

    board = client.get("/api/v1/activities", headers=auth(student_token))
    assert board.status_code == 200, board.text
    activities = board.json()["activities"]
    assert activities
    assert target["id"] in {a["id"] for a in activities}

    mine = {
        r["activity"]["id"]
        for r in client.get("/api/v1/activities/me", headers=auth(student_token)).json()["registrations"]
    }
    assert target["id"] not in mine

    joined = client.post(f"/api/v1/activities/{target['id']}/register", headers=auth(student_token))
    assert joined.status_code == 201, joined.text
    assert joined.json()["waitlisted"] is False
    assert joined.json()["registration"]["state"] == "REGISTERED"

    again = client.post(f"/api/v1/activities/{target['id']}/register", headers=auth(student_token))
    assert again.status_code == 422


def test_student_can_withdraw_and_rejoin(client, student_token, teacher_token):
    target = _new_activity(client, teacher_token, "Rejoin club")

    joined = client.post(f"/api/v1/activities/{target['id']}/register", headers=auth(student_token))
    assert joined.status_code == 201, joined.text

    withdrawn = client.post(f"/api/v1/activities/{target['id']}/withdraw", headers=auth(student_token))
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["registration"]["state"] == "CANCELLED"

    rejoined = client.post(f"/api/v1/activities/{target['id']}/register", headers=auth(student_token))
    assert rejoined.status_code == 201, rejoined.text
    assert rejoined.json()["registration"]["state"] == "REGISTERED"


def test_registering_for_an_unknown_activity_is_rejected(client, student_token):
    response = client.post("/api/v1/activities/99999999/register", headers=auth(student_token))
    assert response.status_code in (404, 422)


def test_student_cannot_create_an_activity_but_staff_can(client, student_token, teacher_token):
    payload = {
        "name": "Test Activity",
        "kind": "CLUB",
        "starts_at": (datetime.now() + timedelta(days=2)).isoformat(),
        "capacity": 5,
    }
    denied = client.post("/api/v1/activities", headers=auth(student_token), json=payload)
    assert denied.status_code == 403

    allowed = client.post("/api/v1/activities", headers=auth(teacher_token), json=payload)
    assert allowed.status_code == 201, allowed.text
    assert allowed.json()["activity"]["seats_left"] == 5


def test_an_activity_cannot_end_before_it_starts(client, admin_token):
    response = client.post(
        "/api/v1/activities",
        headers=auth(admin_token),
        json={
            "name": "Backwards",
            "starts_at": (datetime.now() + timedelta(days=2)).isoformat(),
            "ends_at": (datetime.now() + timedelta(days=1)).isoformat(),
        },
    )
    assert response.status_code == 422


def test_a_full_activity_waitlists_the_next_student(client, db, admin_token, student_token):
    """When every seat is taken the next registration is waitlisted, not refused."""
    created = client.post(
        "/api/v1/activities",
        headers=auth(admin_token),
        json={
            "name": "Single Seat",
            "kind": "CLUB",
            "starts_at": (datetime.now() + timedelta(days=1)).isoformat(),
            "capacity": 1,
        },
    )
    assert created.status_code == 201, created.text
    activity_id = created.json()["activity"]["id"]

    # A second student fills the only seat, directly through the session.
    other_student = db.scalar(select(Student).where(Student.id != 1))
    assert other_student is not None
    db.add(
        ActivityRegistration(
            campus_id=other_student.campus_id,
            activity_id=activity_id,
            student_id=other_student.id,
            state=ParticipationState.REGISTERED.value,
        )
    )
    db.flush()

    board = client.get("/api/v1/activities", headers=auth(admin_token)).json()["activities"]
    filled = next(a for a in board if a["id"] == activity_id)
    assert filled["is_full"] is True
    assert filled["seats_left"] == 0

    waitlisted = client.post(f"/api/v1/activities/{activity_id}/register", headers=auth(student_token))
    assert waitlisted.status_code == 201, waitlisted.text
    assert waitlisted.json()["waitlisted"] is True
    assert waitlisted.json()["registration"]["state"] == "WAITLISTED"
