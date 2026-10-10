"""Career: postings, applying once, and the placement pipeline."""

from datetime import date, timedelta

from tests.conftest import auth


def test_student_sees_open_postings_and_can_apply(client, student_token):
    board = client.get("/api/v1/career/jobs", headers=auth(student_token))
    assert board.status_code == 200, board.text
    jobs = board.json()["jobs"]
    assert jobs
    assert all(job["state"] == "OPEN" for job in jobs)

    applied = {a["job"]["id"] for a in client.get("/api/v1/career/applications/me", headers=auth(student_token)).json()["applications"]}
    target = next(job for job in jobs if job["id"] not in applied)

    response = client.post(
        f"/api/v1/career/jobs/{target['id']}/apply",
        headers=auth(student_token),
        json={"cover_note": "Keen to work on the platform team.", "resume_url": "https://example.com/r.pdf"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["application"]["state"] == "APPLIED"


def test_a_student_cannot_apply_twice(client, student_token):
    board = client.get("/api/v1/career/jobs", headers=auth(student_token)).json()["jobs"]
    applied = {a["job"]["id"] for a in client.get("/api/v1/career/applications/me", headers=auth(student_token)).json()["applications"]}
    target = next(job for job in board if job["id"] not in applied)

    first = client.post(f"/api/v1/career/jobs/{target['id']}/apply", headers=auth(student_token), json={})
    assert first.status_code == 201, first.text

    second = client.post(f"/api/v1/career/jobs/{target['id']}/apply", headers=auth(student_token), json={})
    assert second.status_code == 422


def test_applying_to_a_closed_posting_is_refused(client, admin_token, student_token):
    created = client.post(
        "/api/v1/career/jobs",
        headers=auth(admin_token),
        json={"company": "Closed Co", "role": "Closed Role", "state": "CLOSED"},
    )
    assert created.status_code == 201, created.text
    job_id = created.json()["job"]["id"]

    response = client.post(f"/api/v1/career/jobs/{job_id}/apply", headers=auth(student_token), json={})
    assert response.status_code == 422


def test_applying_after_the_deadline_is_refused(client, admin_token, student_token):
    created = client.post(
        "/api/v1/career/jobs",
        headers=auth(admin_token),
        json={
            "company": "Late Co",
            "role": "Late Role",
            "state": "OPEN",
            "deadline": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    job_id = created.json()["job"]["id"]

    response = client.post(f"/api/v1/career/jobs/{job_id}/apply", headers=auth(student_token), json={})
    assert response.status_code == 422


def test_student_cannot_publish_a_posting(client, student_token):
    response = client.post(
        "/api/v1/career/jobs",
        headers=auth(student_token),
        json={"company": "Forged", "role": "Forged"},
    )
    assert response.status_code == 403


def test_placement_cell_reads_applicants_and_moves_them(client, admin_token, student_token):
    board = client.get("/api/v1/career/jobs", headers=auth(student_token)).json()["jobs"]
    applied = {a["job"]["id"] for a in client.get("/api/v1/career/applications/me", headers=auth(student_token)).json()["applications"]}
    job_id = next(job["id"] for job in board if job["id"] not in applied)

    client.post(f"/api/v1/career/jobs/{job_id}/apply", headers=auth(student_token), json={})

    applicants = client.get(f"/api/v1/career/jobs/{job_id}/applications", headers=auth(admin_token))
    assert applicants.status_code == 200, applicants.text
    rows = applicants.json()["applications"]
    assert rows

    moved = client.post(
        f"/api/v1/career/applications/{rows[0]['id']}/stage",
        headers=auth(admin_token),
        json={"state": "INTERVIEW", "note": "Interview on Friday."},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["application"]["state"] == "INTERVIEW"


def test_package_is_returned_as_a_number(client, student_token):
    jobs = client.get("/api/v1/career/jobs?include_closed=true", headers=auth(student_token)).json()["jobs"]
    with_package = [job for job in jobs if job["package_lpa"] is not None]
    assert with_package
    assert isinstance(with_package[0]["package_lpa"], (int, float))


def test_teacher_can_publish_but_only_students_apply(client, teacher_token, student_token):
    """The placement cell (teacher) posts; applying is a student-only act."""
    created = client.post(
        "/api/v1/career/jobs",
        headers=auth(teacher_token),
        json={"company": "Teacher Co", "role": "Intern", "kind": "INTERNSHIP", "state": "OPEN"},
    )
    assert created.status_code == 201, created.text
    job_id = created.json()["job"]["id"]

    # The teacher may list postings through the placement desk (career:manage)
    # even without the student board's career:read.
    listed = client.get("/api/v1/career/jobs", headers=auth(teacher_token))
    assert listed.status_code == 200, listed.text

    # Neither the teacher nor management may apply: only students hold
    # career:apply, and the account must have a linked student record.
    for token in (teacher_token,):
        refused = client.post(f"/api/v1/career/jobs/{job_id}/apply", headers=auth(token), json={})
        assert refused.status_code == 403, refused.text


def test_management_can_post_but_not_apply(client, admin_token, student_token):
    created = client.post(
        "/api/v1/career/jobs",
        headers=auth(admin_token),
        json={"company": "Office Co", "role": "Graduate", "state": "OPEN"},
    )
    assert created.status_code == 201, created.text
    job_id = created.json()["job"]["id"]

    refused = client.post(f"/api/v1/career/jobs/{job_id}/apply", headers=auth(admin_token), json={})
    assert refused.status_code == 403, refused.text
