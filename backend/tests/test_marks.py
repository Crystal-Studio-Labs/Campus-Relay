"""Marks: scoping, entry, and who may enter them."""

from tests.conftest import auth


def test_student_sees_their_marks(client, student_token):
    response = client.get("/api/v1/marks/me", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["max"] > 0
    assert 0 <= body["summary"]["percentage"] <= 100
    assert body["summary"]["per_subject"]


def test_teacher_can_enter_and_re_enter_marks(client, teacher_token):
    subjects = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"]
    subject_id = subjects[0]["id"]
    roster = client.get(
        f"/api/v1/marks/subject/{subject_id}?assessment=Quiz%201&term=2026-ODD",
        headers=auth(teacher_token),
    ).json()["roster"]
    assert roster
    student_id = roster[0]["student_id"]

    body = {
        "subject_id": subject_id,
        "assessment": "Quiz 1",
        "term": "2026-ODD",
        "marks": [{"student_id": student_id, "obtained_marks": 17, "max_marks": 20}],
    }
    first = client.post("/api/v1/marks", headers=auth(teacher_token), json=body)
    assert first.status_code == 201, first.text

    # Re-entry updates the row rather than adding a second one.
    body["marks"][0]["obtained_marks"] = 19
    second = client.post("/api/v1/marks", headers=auth(teacher_token), json=body)
    assert second.status_code == 201, second.text

    refreshed = client.get(
        f"/api/v1/marks/subject/{subject_id}?assessment=Quiz%201&term=2026-ODD",
        headers=auth(teacher_token),
    ).json()["roster"]
    assert next(r for r in refreshed if r["student_id"] == student_id)["obtained_marks"] == 19


def test_a_score_cannot_exceed_the_maximum(client, teacher_token):
    subject_id = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"][0]["id"]
    response = client.post(
        "/api/v1/marks",
        headers=auth(teacher_token),
        json={
            "subject_id": subject_id,
            "assessment": "Impossible",
            "term": "2026-ODD",
            "marks": [{"student_id": 1, "obtained_marks": 120, "max_marks": 100}],
        },
    )
    assert response.status_code in (404, 422), response.text


def test_student_cannot_enter_marks(client, student_token):
    response = client.post(
        "/api/v1/marks",
        headers=auth(student_token),
        json={
            "subject_id": 1,
            "assessment": "Forged",
            "term": "2026-ODD",
            "marks": [{"student_id": 1, "obtained_marks": 100, "max_marks": 100}],
        },
    )
    assert response.status_code == 403


def test_management_views_any_subject_but_cannot_enter(client, admin_token, teacher_token):
    """marks:manage is oversight: read any subject, write none."""
    subject_id = client.get("/api/v1/subjects", headers=auth(teacher_token)).json()["subjects"][0]["id"]

    viewed = client.get(f"/api/v1/marks/subject/{subject_id}", headers=auth(admin_token))
    assert viewed.status_code == 200, viewed.text

    attempted = client.post(
        "/api/v1/marks",
        headers=auth(admin_token),
        json={
            "subject_id": subject_id,
            "assessment": "Forged",
            "term": "2026-ODD",
            "marks": [{"student_id": 1, "obtained_marks": 100, "max_marks": 100}],
        },
    )
    assert attempted.status_code == 403
