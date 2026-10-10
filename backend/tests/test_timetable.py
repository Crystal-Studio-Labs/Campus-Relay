"""Timetable: the weekly view and who may change it."""

from tests.conftest import auth


def test_student_has_a_weekly_timetable(client, student_token):
    response = client.get("/api/v1/timetable/me", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slots"]
    assert {"MON", "TUE", "WED", "THU", "FRI", "SAT"} == set(body["days"])
    assert body["slots"][0]["subject"]["code"]


def test_teacher_sees_their_teaching_timetable(client, teacher_token):
    response = client.get("/api/v1/timetable/mine", headers=auth(teacher_token))
    assert response.status_code == 200, response.text
    assert response.json()["slots"]


def test_student_cannot_add_a_slot(client, student_token):
    response = client.post(
        "/api/v1/timetable",
        headers=auth(student_token),
        json={"subject_id": 1, "day": "TUE", "start_time": "08:00", "end_time": "08:50", "room": "X"},
    )
    assert response.status_code == 403


def test_teacher_can_add_a_slot_to_their_subject(client, teacher_token):
    subject_id = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"][0]["id"]
    response = client.post(
        "/api/v1/timetable",
        headers=auth(teacher_token),
        json={
            "subject_id": subject_id,
            "day": "TUE",
            "start_time": "14:00",
            "end_time": "14:50",
            "room": "LH-3",
        },
    )
    assert response.status_code == 201, response.text
    slot = response.json()["slot"]
    assert slot["day"] == "TUE" and slot["room"] == "LH-3"


def test_a_period_must_end_after_it_starts(client, teacher_token):
    subject_id = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"][0]["id"]
    response = client.post(
        "/api/v1/timetable",
        headers=auth(teacher_token),
        json={"subject_id": subject_id, "day": "THU", "start_time": "10:00", "end_time": "09:00"},
    )
    assert response.status_code in (404, 422), response.text
