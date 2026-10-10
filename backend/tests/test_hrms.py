"""HRMS: staff leave, the payroll register, and who may touch them."""

from datetime import date, timedelta

from tests.conftest import auth

FUTURE = (date.today() + timedelta(days=14)).isoformat()
LATER = (date.today() + timedelta(days=16)).isoformat()


def test_a_teacher_sees_their_own_employment_record(client, teacher_token):
    response = client.get("/api/v1/hrms/me", headers=auth(teacher_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["employee"]["full_name"]
    assert body["payslips"], "expected seeded payslips"
    assert body["payslips"][0]["net_pay"] == (
        body["payslips"][0]["basic"] + body["payslips"][0]["allowances"] - body["payslips"][0]["deductions"]
    )


def test_a_student_has_no_employment_record(client, student_token):
    assert client.get("/api/v1/hrms/me", headers=auth(student_token)).status_code == 403
    assert client.get("/api/v1/hrms/staff", headers=auth(student_token)).status_code == 403
    assert client.get("/api/v1/hrms/payroll", headers=auth(student_token)).status_code == 403


def test_a_teacher_applies_for_their_own_leave(client, teacher_token):
    created = client.post(
        "/api/v1/hrms/leave",
        headers=auth(teacher_token),
        json={"kind": "CASUAL", "from_date": FUTURE, "to_date": LATER, "reason": "Family function."},
    )
    assert created.status_code == 201, created.text
    assert created.json()["leave"]["state"] == "PENDING"

    mine = client.get("/api/v1/hrms/me", headers=auth(teacher_token)).json()
    assert mine["summary"]["pending_leave"] >= 1


def test_staff_leave_rejects_backwards_dates(client, teacher_token):
    response = client.post(
        "/api/v1/hrms/leave",
        headers=auth(teacher_token),
        json={"kind": "CASUAL", "from_date": LATER, "to_date": FUTURE, "reason": "Backwards."},
    )
    assert response.status_code == 422


def test_the_office_decides_staff_leave(client, admin_token, teacher_token):
    listing = client.get("/api/v1/hrms/leave?state=PENDING", headers=auth(admin_token))
    assert listing.status_code == 200, listing.text
    rows = listing.json()["leave"]
    assert rows, "expected a seeded pending staff leave application"
    leave_id = rows[0]["id"]

    decided = client.post(
        f"/api/v1/hrms/leave/{leave_id}/decide",
        headers=auth(admin_token),
        json={"state": "APPROVED", "note": "Cover arranged."},
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["leave"]["state"] == "APPROVED"

    again = client.post(
        f"/api/v1/hrms/leave/{leave_id}/decide", headers=auth(admin_token), json={"state": "REJECTED"}
    )
    assert again.status_code == 422


def test_nobody_decides_their_own_leave(client, admin_token):
    created = client.post(
        "/api/v1/hrms/leave",
        headers=auth(admin_token),
        json={"kind": "CASUAL", "from_date": FUTURE, "to_date": LATER, "reason": "My own leave."},
    )
    assert created.status_code == 201, created.text
    leave_id = created.json()["leave"]["id"]

    response = client.post(
        f"/api/v1/hrms/leave/{leave_id}/decide",
        headers=auth(admin_token),
        json={"state": "APPROVED"},
    )
    assert response.status_code == 403


def test_a_teacher_cannot_read_the_payroll_register(client, teacher_token):
    assert client.get("/api/v1/hrms/payroll", headers=auth(teacher_token)).status_code == 403


def test_the_office_generates_and_settles_a_payslip(client, admin_token, teacher_token):
    period = (date.today() + timedelta(days=40)).strftime("%Y-%m")
    created = client.post(
        "/api/v1/hrms/payslips",
        headers=auth(admin_token),
        json={"user_id": None, "period": period, "basic": 50000, "allowances": 5000, "deductions": 4000},
    )
    # A payslip with no user_id is generated for the caller (the administrator).
    assert created.status_code == 201, created.text
    slip = created.json()["payslip"]
    assert slip["net_pay"] == 51000
    assert slip["state"] == "DRAFT"

    duplicate = client.post(
        "/api/v1/hrms/payslips",
        headers=auth(admin_token),
        json={"period": period, "basic": 1, "allowances": 0, "deductions": 0},
    )
    assert duplicate.status_code == 422

    paid = client.post(f"/api/v1/hrms/payslips/{slip['id']}/pay", headers=auth(admin_token))
    assert paid.status_code == 200, paid.text
    assert paid.json()["payslip"]["state"] == "PAID"
    assert paid.json()["payslip"]["paid_on"] == date.today().isoformat()


def test_deductions_cannot_exceed_gross(client, admin_token):
    response = client.post(
        "/api/v1/hrms/payslips",
        headers=auth(admin_token),
        json={"period": "2099-01", "basic": 100, "allowances": 0, "deductions": 500},
    )
    assert response.status_code == 422


def test_a_teacher_cannot_generate_a_payslip(client, teacher_token):
    response = client.post(
        "/api/v1/hrms/payslips",
        headers=auth(teacher_token),
        json={"period": "2099-02", "basic": 1000},
    )
    assert response.status_code == 403


def test_a_payslip_is_only_issued_to_a_staff_account(client, admin_token, student_token):
    # The student is the one demo account that holds no staff role, so a payslip
    # made out to them must be refused. Their id is resolved at runtime rather
    # than hardcoded, so a reseed cannot silently retarget the check.
    student_id = client.get("/api/v1/auth/me", headers=auth(student_token)).json()["id"]
    response = client.post(
        "/api/v1/hrms/payslips",
        headers=auth(admin_token),
        json={"user_id": student_id, "period": "2099-03", "basic": 1000},
    )
    assert response.status_code == 422
