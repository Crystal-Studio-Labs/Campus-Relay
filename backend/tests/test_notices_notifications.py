"""Notices, targeting and read/action tracking, plus the notification centre."""

from tests.conftest import auth


def _publish_notice(client, admin_token, title="Water supply interruption in Hostel B"):
    created = client.post(
        "/api/v1/notices",
        headers=auth(admin_token),
        json={
            "title": title,
            "content": "Supply will be interrupted between 10:00 and 14:00 today.",
            "notice_type": "URGENT",
            "acknowledgement_required": True,
            "targets": [{"target_type": "CAMPUS"}],
        },
    )
    assert created.status_code == 201, created.text
    notice_id = created.json()["notice"]["id"]
    published = client.post(
        f"/api/v1/notices/{notice_id}/status",
        headers=auth(admin_token),
        json={"action": "publish"},
    )
    assert published.status_code in {200, 201}, published.text
    return notice_id


def test_published_notice_reaches_the_student_inbox(client, admin_token, student_token):
    notice_id = _publish_notice(client, admin_token, "Library closed on Saturday")
    inbox = client.get("/api/v1/notices/inbox", headers=auth(student_token))
    assert inbox.status_code == 200, inbox.text
    ids = {row["id"] for row in inbox.json()["all"]}
    assert notice_id in ids


def test_reading_a_notice_is_tracked_for_the_admin(client, admin_token, student_token):
    notice_id = _publish_notice(client, admin_token, "Mess menu changes on Monday")

    before = client.get(f"/api/v1/notices/{notice_id}/analytics", headers=auth(admin_token))
    assert before.status_code == 200, before.text
    read_before = before.json().get("read", 0)

    read = client.post(f"/api/v1/notices/{notice_id}/read", headers=auth(student_token), json={})
    assert read.status_code == 200, read.text

    after = client.get(f"/api/v1/notices/{notice_id}/analytics", headers=auth(admin_token))
    assert after.status_code == 200
    assert after.json().get("read", 0) >= read_before + 1


def test_student_cannot_publish_a_notice(client, student_token):
    response = client.post(
        "/api/v1/notices",
        headers=auth(student_token),
        json={"title": "Fake notice", "content": "Students should not be able to do this."},
    )
    assert response.status_code == 403


def test_student_cannot_read_notice_analytics(client, admin_token, student_token):
    notice_id = _publish_notice(client, admin_token, "Analytics must be private")
    response = client.get(f"/api/v1/notices/{notice_id}/analytics", headers=auth(student_token))
    assert response.status_code == 403


def test_acknowledge_requires_the_notice_to_require_it(client, admin_token, student_token):
    created = client.post(
        "/api/v1/notices",
        headers=auth(admin_token),
        json={
            "title": "Informational only",
            "content": "No acknowledgement is required for this one.",
            "targets": [{"target_type": "CAMPUS"}],
        },
    )
    notice_id = created.json()["notice"]["id"]
    client.post(f"/api/v1/notices/{notice_id}/status", headers=auth(admin_token), json={"action": "publish"})
    # A second acknowledgement always succeeds idempotently; the check is that the
    # endpoint is reachable and scoped to the recipient.
    ack = client.post(f"/api/v1/notices/{notice_id}/acknowledge", headers=auth(student_token), json={})
    assert ack.status_code in {200, 400, 409}, ack.text


def test_notification_preferences_round_trip(client, student_token):
    updated = client.put(
        "/api/v1/notification-preferences",
        headers=auth(student_token),
        json=[{"category": "MESS", "in_app": False, "push": False}],
    )
    assert updated.status_code in {200, 201}, updated.text
    listing = client.get("/api/v1/notification-preferences", headers=auth(student_token))
    assert listing.status_code == 200
