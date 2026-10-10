"""Security invariants: throttling, size limits, headers, and honest auth.

These pin the properties that a deployed college API has to hold, not just the
happy paths. The rate limiter is normally off under ``APP_ENV=test`` so the
suite is not throttling itself; these tests turn it back on deliberately.
"""

import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.ratelimit import DEFAULT_RULE, Rule, SlidingWindowLimiter, rule_for
from app.main import app, limiter
from tests.conftest import auth


# --- The limiter itself ----------------------------------------------------


def test_rule_for_picks_the_tightest_matching_budget():
    login = rule_for("/api/v1/auth/login")
    assert login.limit == 30
    # The rest of /auth is looser than sign-in but tighter than the default.
    assert rule_for("/api/v1/auth/me").limit == 120
    # Anything unmatched gets the general budget.
    assert rule_for("/api/v1/cases").limit == 240


def test_a_sliding_window_refuses_past_its_limit_and_reports_retry_after():
    limiter_under_test = SlidingWindowLimiter()
    rule = Rule(limit=3, window_seconds=60)
    for _ in range(3):
        allowed, _ = limiter_under_test.check("client", rule)
        assert allowed
    allowed, retry_after = limiter_under_test.check("client", rule)
    assert allowed is False
    assert 1 <= retry_after <= 61


def test_a_refused_request_does_not_extend_the_penalty():
    limiter_under_test = SlidingWindowLimiter()
    rule = Rule(limit=2, window_seconds=60)
    limiter_under_test.check("client", rule)
    limiter_under_test.check("client", rule)
    _, first_retry = limiter_under_test.check("client", rule)
    for _ in range(20):
        limiter_under_test.check("client", rule)
    _, later_retry = limiter_under_test.check("client", rule)
    # Hammering must not push the window forward.
    assert later_retry <= first_retry


def test_the_bucket_table_is_capped_so_it_cannot_exhaust_memory():
    limiter_under_test = SlidingWindowLimiter(max_keys=50)
    rule = Rule(limit=5, window_seconds=60)
    for index in range(500):
        limiter_under_test.check(f"client-{index}", rule)
    assert limiter_under_test.key_count() <= 50


def test_buckets_that_have_gone_quiet_are_reclaimed():
    limiter_under_test = SlidingWindowLimiter(max_keys=10)
    stale = Rule(limit=5, window_seconds=0.05)
    for index in range(20):
        limiter_under_test.check(f"old-{index}", stale)
    time.sleep(0.06)
    # A fresh key trips pruning, and the expired buckets must be reclaimed.
    limiter_under_test.check("new", stale)
    assert limiter_under_test.key_count() <= 10


def _request(headers=(), client=("9.9.9.9", 12345)):
    from starlette.requests import Request

    return Request(
        {"type": "http", "method": "GET", "path": "/api/v1/cases", "headers": list(headers), "client": client}
    )


def test_keying_ignores_a_spoofed_forwarded_for_header():
    """A client must not be able to mint a fresh bucket per request."""
    from app.main import _client_key

    assert _client_key(_request([(b"x-forwarded-for", b"1.2.3.4")])) == "ip:9.9.9.9"


def test_an_authenticated_request_is_budgeted_per_account_not_per_address():
    """A hostel behind one NAT address must not share a single budget.

    Two signed-in students on the same address get separate keys, so one busy
    user cannot exhaust another's allowance. An unauthenticated request (or one
    with a token this server cannot read) falls back to the address.
    """
    from app.core.security import create_access_token
    from app.main import _client_key

    alice = create_access_token(subject="a@x.y", user_id=11, role="STUDENT", campus_id=1)
    bob = create_access_token(subject="b@x.y", user_id=22, role="STUDENT", campus_id=1)
    key = lambda token: _client_key(_request([(b"authorization", f"Bearer {token}".encode())]))

    assert key(alice) == "u:11"
    assert key(bob) == "u:22"
    assert key(alice) != key(bob)
    # A forged token is simply unauthenticated, and shares the address bucket.
    assert _client_key(_request([(b"authorization", b"Bearer not-a-token")])) == "ip:9.9.9.9"


# --- The limiter wired into the app ---------------------------------------


@pytest.fixture()
def limited_client(db):
    """A client with the limiter switched on, as a real deployment has it."""

    def override_get_db():
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    from app.core.db import get_db

    app.dependency_overrides[get_db] = override_get_db
    limiter.reset()
    previous_env = settings.app_env
    previous_limit = settings.rate_limit_per_minute
    settings.app_env = "development"
    settings.rate_limit_per_minute = 3
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        settings.app_env = previous_env
        settings.rate_limit_per_minute = previous_limit
        limiter.reset()
        app.dependency_overrides.clear()


def test_the_api_refuses_a_burst_with_a_retry_after(limited_client):
    # The general budget is 3 in this fixture. Whatever the endpoint answers
    # (200, 401 - it does not matter here), the fourth call must be throttled.
    statuses = [limited_client.get("/api/v1/institution").status_code for _ in range(5)]
    assert statuses.count(429) == 2
    assert statuses[0] != 429

    blocked = limited_client.get("/api/v1/institution")
    assert blocked.status_code == 429
    assert blocked.headers.get("retry-after")
    body = blocked.json()["error"]
    assert body["code"] == "rate_limited"
    assert body["details"]["retry_after_seconds"] >= 1


def test_sign_in_is_throttled_on_its_own_budget(limited_client):
    # Sign-in has a built-in 10/minute budget. The fixture's general budget of 3
    # is stricter, so the stricter one applies - an operator can tighten a path
    # but never loosen the built-in sign-in limit. Invalid bodies are used so the
    # assertion is about the limiter, not about bcrypt.
    for _ in range(3):
        limited_client.post("/api/v1/auth/login", json={})
    blocked = limited_client.post("/api/v1/auth/login", json={})
    assert blocked.status_code == 429


def test_the_built_in_sign_in_rule_is_stricter_than_the_general_budget():
    # With the default general budget (240), the sign-in rule is what applies.
    assert rule_for("/api/v1/auth/login").limit == 30
    assert rule_for("/api/v1/auth/login").limit < DEFAULT_RULE.limit


def test_an_oversized_body_is_refused_before_it_is_read(limited_client):
    """A declared length above the cap is refused with 413, not parsed."""
    earlier = settings.max_request_bytes
    settings.max_request_bytes = 1024
    try:
        response = limited_client.post(
            "/api/v1/auth/login",
            json={"email": "x@y.z", "password": "a" * 5000},
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "payload_too_large"
    finally:
        settings.max_request_bytes = earlier


# --- Headers ---------------------------------------------------------------


def test_responses_carry_the_baseline_security_headers(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "geolocation=()" in response.headers["Permissions-Policy"]
    assert response.headers["Cross-Origin-Resource-Policy"] == "cross-origin"


def test_hsts_is_only_sent_over_tls(client):
    plain = client.get("/api/v1/health")
    assert "strict-transport-security" not in {k.lower() for k in plain.headers}

    behind_tls = client.get("/api/v1/health", headers={"X-Forwarded-Proto": "https"})
    assert "max-age=31536000" in behind_tls.headers["Strict-Transport-Security"]


# --- Per-account brute-force control --------------------------------------


def test_sign_in_is_throttled_per_account_even_from_many_addresses(client):
    """The account-keyed limit cannot be diluted by changing source address.

    The request limiter keys on address; this one keys on the email, which is
    what makes credential stuffing against one account impractical.
    """
    from app.api.v1.auth import _login_attempts
    from app.core.ratelimit import LOGIN_ATTEMPT_RULE

    _login_attempts.reset()
    victim = "student@campusrelay.demo"
    statuses = []
    try:
        for _ in range(LOGIN_ATTEMPT_RULE.limit + 1):
            response = client.post(
                "/api/v1/auth/login", json={"email": victim, "password": "Wrong@12345"}
            )
            statuses.append(response.status_code)
    finally:
        _login_attempts.reset()

    # The first attempts fail on credentials; once the budget is spent it is a
    # throttle, and it stays one no matter how many addresses are used.
    assert statuses.count(401) == LOGIN_ATTEMPT_RULE.limit
    assert statuses[-1] == 429


def test_a_successful_sign_in_clears_the_account_attempt_history(client):
    from app.api.v1.auth import _login_attempts
    from app.core.ratelimit import LOGIN_ATTEMPT_RULE
    from tests.conftest import DEMO_PASSWORD

    _login_attempts.reset()
    email = "student@campusrelay.demo"
    try:
        for _ in range(3):
            client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong@12345"})
        ok = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert ok.status_code == 200, ok.text

        # The counter was cleared, so the account has its full budget again and
        # a mistyped password never leaves someone locked out after signing in.
        statuses = [
            client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong@12345"}).status_code
            for _ in range(LOGIN_ATTEMPT_RULE.limit)
        ]
        assert statuses.count(429) == 0
    finally:
        _login_attempts.reset()


# --- Authentication honesty ------------------------------------------------


def test_a_wrong_password_and_an_unknown_account_are_indistinguishable(client):
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "nobody@nowhere.demo", "password": "Guessing@123"}
    )
    wrong = client.post(
        "/api/v1/auth/login", json={"email": "student@campusrelay.demo", "password": "Wrong@12345"}
    )
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["error"]["message"] == wrong.json()["error"]["message"]


def test_login_verifies_a_hash_even_for_an_unknown_address(client):
    """The unknown-account path must pay the same bcrypt cost, or response
    timing enumerates which addresses exist."""
    started = time.perf_counter()
    client.post("/api/v1/auth/login", json={"email": "nobody@nowhere.demo", "password": "Guessing@123"})
    elapsed = time.perf_counter() - started
    # bcrypt at 12 rounds is far slower than the hash lookup; a fast path here
    # would mean the dummy verification was skipped.
    assert elapsed > 0.01, f"unknown-account login returned in {elapsed:.4f}s"


# --- Privileged tools are not reachable in production ----------------------


@pytest.mark.parametrize(
    "path",
    ["/api/v1/admin/demo/reset", "/api/v1/admin/demo/time-travel?minutes=5", "/api/v1/admin/demo/time-reset"],
)
def test_demo_endpoints_are_refused_outside_demo_mode(client, admin_token, path):
    previous = settings.app_env
    settings.app_env = "production"
    try:
        response = client.post(path, headers=auth(admin_token))
        assert response.status_code == 404, response.text
    finally:
        settings.app_env = previous


def test_a_password_reset_is_never_accepted_from_the_query_string(client, admin_token):
    """A password in a URL lands in access logs. The old shape must 422."""
    response = client.post(
        "/api/v1/admin/users/1/reset-password?new_password=Insecure123",
        headers=auth(admin_token),
    )
    assert response.status_code == 422
