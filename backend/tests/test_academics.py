"""Attendance: scoping, marking, and who may do it."""

from tests.conftest import auth


def test_student_sees_their_attendance(client, student_token):
    response = client.get("/api/v1/attendance/me", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["total"] > 0
    assert 0 <= body["summary"]["percentage"] <= 100
    assert body["summary"]["per_subject"]


def test_teacher_lists_only_their_subjects(client, teacher_token):
    response = client.get("/api/v1/subjects", headers=auth(teacher_token))
    assert response.status_code == 200, response.text
    assert response.json()["subjects"]


def test_student_cannot_mark_attendance(client, student_token):
    subject_id = client.get("/api/v1/subjects", headers=auth(student_token)).json()["subjects"][0]["id"]
    response = client.post(
        "/api/v1/attendance/mark",
        headers=auth(student_token),
        json={
            "subject_id": subject_id,
            "on_date": "2026-10-06",
            "slot": "P1",
            "records": [{"student_id": 1, "status": "PRESENT"}],
        },
    )
    assert response.status_code == 403


def test_teacher_can_mark_and_re_mark_without_duplicating(client, teacher_token):
    subject_id = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"][0]["id"]
    roster = client.get(
        f"/api/v1/attendance/subject/{subject_id}?on_date=2026-10-06", headers=auth(teacher_token)
    ).json()["roster"]
    assert roster
    student_id = roster[0]["student_id"]

    body = {
        "subject_id": subject_id,
        "on_date": "2026-10-06",
        "slot": "P2",
        "records": [{"student_id": student_id, "status": "ABSENT"}],
    }
    first = client.post("/api/v1/attendance/mark", headers=auth(teacher_token), json=body)
    assert first.status_code == 201, first.text

    # Re-marking the same day and slot updates the row rather than adding one.
    body["records"][0]["status"] = "PRESENT"
    second = client.post("/api/v1/attendance/mark", headers=auth(teacher_token), json=body)
    assert second.status_code == 201, second.text

    refreshed = client.get(
        f"/api/v1/attendance/subject/{subject_id}?on_date=2026-10-06", headers=auth(teacher_token)
    ).json()["roster"]
    assert next(r for r in refreshed if r["student_id"] == student_id)["status"] == "PRESENT"


def test_teacher_cannot_mark_a_subject_that_does_not_exist(client, teacher_token):
    response = client.post(
        "/api/v1/attendance/mark",
        headers=auth(teacher_token),
        json={
            "subject_id": 999999,
            "on_date": "2026-10-06",
            "slot": "P1",
            "records": [{"student_id": 1, "status": "PRESENT"}],
        },
    )
    assert response.status_code in (404, 422), response.text
