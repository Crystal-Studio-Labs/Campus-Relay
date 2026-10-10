"""Library: the catalogue, my loans, issuing and returning, and the fine."""

from tests.conftest import auth


def test_student_sees_the_catalogue_and_their_loans(client, student_token):
    books = client.get("/api/v1/library/books", headers=auth(student_token))
    assert books.status_code == 200, books.text
    assert books.json()["count"] > 0

    loans = client.get("/api/v1/library/loans/me", headers=auth(student_token))
    assert loans.status_code == 200, loans.text
    body = loans.json()
    assert body["student"] is not None
    assert body["loans"], "expected seeded loans"
    # The seed includes one overdue loan, so a real fine must be computed.
    assert body["outstanding_fine"] > 0
    assert any(loan["overdue_days"] > 0 for loan in body["loans"])


def test_student_cannot_manage_the_library(client, student_token):
    add = client.post(
        "/api/v1/library/books",
        headers=auth(student_token),
        json={"isbn": "000", "title": "Forged"},
    )
    assert add.status_code == 403

    issue = client.post(
        "/api/v1/library/loans",
        headers=auth(student_token),
        json={"book_id": 1, "student_id": 1},
    )
    assert issue.status_code == 403


def test_admin_adds_and_restocks_a_title(client, admin_token):
    created = client.post(
        "/api/v1/library/books",
        headers=auth(admin_token),
        json={"isbn": "978-TEST-0001", "title": "Test Title", "author": "A. Author", "copies_total": 2},
    )
    assert created.status_code == 201, created.text
    book = created.json()["book"]
    assert book["copies_available"] == 2

    # The same ISBN raises stock rather than raising an error on the unique key.
    restocked = client.post(
        "/api/v1/library/books",
        headers=auth(admin_token),
        json={"isbn": "978-TEST-0001", "title": "Test Title", "copies_total": 3},
    )
    assert restocked.status_code == 201, restocked.text
    assert restocked.json()["book"]["copies_total"] == 5
    assert restocked.json()["restocked"] == 3


def test_issuing_decrements_stock_and_a_double_issue_is_refused(client, admin_token, student_token):
    # A title the seeded student does not already hold.
    books = client.get("/api/v1/library/books", headers=auth(admin_token)).json()["books"]
    held = {
        loan["book"]["id"]
        for loan in client.get("/api/v1/library/loans/me", headers=auth(student_token)).json()["loans"]
        if loan["state"] == "ISSUED"
    }
    target = next(b for b in books if b["copies_available"] > 0 and b["id"] not in held)

    first = client.post(
        "/api/v1/library/loans",
        headers=auth(admin_token),
        json={"book_id": target["id"], "student_id": 1, "days": 7},
    )
    assert first.status_code == 201, first.text
    assert first.json()["book"]["copies_available"] == target["copies_available"] - 1

    again = client.post(
        "/api/v1/library/loans",
        headers=auth(admin_token),
        json={"book_id": target["id"], "student_id": 1, "days": 7},
    )
    assert again.status_code == 422

    returned = client.post(
        f"/api/v1/library/loans/{first.json()['loan']['id']}/return", headers=auth(admin_token)
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["loan"]["state"] == "RETURNED"


def test_issuing_an_unknown_book_is_rejected(client, admin_token):
    response = client.post(
        "/api/v1/library/loans",
        headers=auth(admin_token),
        json={"book_id": 99999999, "student_id": 1},
    )
    assert response.status_code in (404, 422)


def test_returning_an_overdue_loan_charges_a_fine(client, admin_token):
    loans = client.get("/api/v1/library/loans", headers=auth(admin_token)).json()["loans"]
    overdue = next((loan for loan in loans if loan["overdue_days"] > 0), None)
    assert overdue is not None, "expected a seeded overdue loan"

    returned = client.post(
        f"/api/v1/library/loans/{overdue['id']}/return", headers=auth(admin_token)
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["fine_charged"] > 0
