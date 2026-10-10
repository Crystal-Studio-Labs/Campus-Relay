"""Fees: totals, derived status, and who may record a payment."""

from tests.conftest import auth


def test_student_sees_their_fee_summary(client, student_token):
    response = client.get("/api/v1/fees/me", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["total"] > 0
    assert body["summary"]["paid"] > 0
    assert body["summary"]["pending"] < body["summary"]["total"]
    statuses = {record["status"] for record in body["records"]}
    # An overdue balance and a settled record are both seeded.
    assert "OVERDUE" in statuses or "PARTIALLY_PAID" in statuses
    assert "PAID" in statuses


def test_student_cannot_create_a_fee_record(client, student_token):
    response = client.post(
        "/api/v1/fees",
        headers=auth(student_token),
        json={"student_id": 1, "term": "2026-ODD", "label": "Forged", "amount": 100},
    )
    assert response.status_code == 403


def test_admin_records_a_payment_and_overpayment_is_refused(client, admin_token):
    # Find an outstanding record the seeded student owes against.
    outstanding = client.get("/api/v1/fees/outstanding", headers=auth(admin_token))
    assert outstanding.status_code == 200, outstanding.text
    rows = outstanding.json()["records"]
    assert rows
    record = rows[0]
    assert record["balance"] > 0

    # A payment larger than the balance is refused, not silently accepted.
    too_much = client.post(
        f"/api/v1/fees/{record['id']}/payments",
        headers=auth(admin_token),
        json={"amount": record["balance"] + 1000, "method": "CASH"},
    )
    assert too_much.status_code in (404, 422), too_much.text

    ok = client.post(
        f"/api/v1/fees/{record['id']}/payments",
        headers=auth(admin_token),
        json={"amount": 500, "method": "CASH", "reference": "TEST-1"},
    )
    assert ok.status_code == 201, ok.text
    updated = ok.json()["record"]
    assert updated["paid"] == record["paid"] + 500
    assert updated["balance"] == record["balance"] - 500


def test_student_cannot_record_a_payment(client, student_token):
    response = client.post(
        "/api/v1/fees/1/payments",
        headers=auth(student_token),
        json={"amount": 10, "method": "CASH"},
    )
    assert response.status_code == 403
