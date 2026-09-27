"""External messaging: Telegram, WhatsApp and the delivery outbox.

Two things are being protected here, and they are the reason the feature exists
at all:

* **Honesty** - with no provider configured, nothing is queued and nothing is
  reported as delivered. The tests assert the *absence* of a claim as much as the
  presence of a delivery.
* **The write path stays fast** - a provider call never happens inside the
  request. The outbox row is the contract between the two.
"""

from __future__ import annotations

import httpx
from sqlalchemy import select

from app.models import NotificationDelivery, NotificationEvent
from app.models.enums import DeliveryState, NotificationChannel, NotificationState
from app.services import notifications as notification_service
from app.services.notifications import (
    DeliveryResult,
    TelegramAdapter,
    WhatsAppAdapter,
)
from tests.conftest import auth


# --------------------------------------------------------------------------
# Adapter behaviour, in isolation
# --------------------------------------------------------------------------


def test_telegram_reports_unconfigured_without_calling_out(monkeypatch):
    called = {"n": 0}

    def _spy(*args, **kwargs):  # pragma: no cover - must never run
        called["n"] += 1

    monkeypatch.setattr(httpx, "post", _spy)
    adapter = TelegramAdapter(configured=False, bot_token="")
    result = adapter.deliver(_FakeNotification(), "12345")
    assert result.state == NotificationState.FAILED.value
    assert result.provider == "not_configured"
    assert called["n"] == 0


def test_telegram_reports_missing_recipient(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no call")))
    adapter = TelegramAdapter(configured=True, bot_token="tok", api_base="https://api.telegram.org")
    result = adapter.deliver(_FakeNotification(), None)
    assert result.state == NotificationState.FAILED.value
    assert result.provider == "no_recipient"


def test_telegram_delivers_when_telegram_accepts(monkeypatch):
    captured: dict = {}

    class _Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"ok": True, "result": {"message_id": 1}}

    def _post(url, json=None, timeout=None):  # noqa: A002 - match httpx signature
        captured["url"] = url
        captured["json"] = json
        return _Response()

    monkeypatch.setattr(httpx, "post", _post)
    adapter = TelegramAdapter(configured=True, bot_token="tok", api_base="https://api.telegram.org")
    result = adapter.deliver(_FakeNotification(), "987654")
    assert result.state == NotificationState.DELIVERED.value
    assert captured["url"].endswith("/bottok/sendMessage")
    assert captured["json"]["chat_id"] == "987654"


def test_telegram_treats_ok_false_as_a_failure(monkeypatch):
    class _Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"ok": False, "description": "chat not found"}

    monkeypatch.setattr(httpx, "post", lambda *a, **k: _Response())
    adapter = TelegramAdapter(configured=True, bot_token="tok")
    result = adapter.deliver(_FakeNotification(), "1")
    assert result.state == NotificationState.FAILED.value
    assert result.provider == "provider_error"


def test_whatsapp_is_honest_when_unconfigured():
    adapter = WhatsAppAdapter(configured=False)
    result = adapter.deliver(_FakeNotification(), "919876543210")
    assert result.state == NotificationState.FAILED.value
    assert result.provider == "not_configured"


# --------------------------------------------------------------------------
# API surface
# --------------------------------------------------------------------------


def test_meta_reports_channels_honestly_without_credentials(client, student_token):
    meta = client.get("/api/v1/meta", headers=auth(student_token))
    assert meta.status_code == 200, meta.text
    body = meta.json()
    channels = body["notification_channels"]
    assert set(channels) >= {"in_app", "push", "telegram", "whatsapp", "sms", "email"}
    assert channels["in_app"]["configured"] is True
    # No credentials in the test environment, so nothing may claim to be ready.
    assert channels["telegram"]["configured"] is False
    assert channels["whatsapp"]["configured"] is False
    assert body["external_messaging"]["configured"] is False
    assert "no provider" in body["external_messaging"]["note"].lower()


def test_preferences_expose_external_channels(client, student_token):
    response = client.get("/api/v1/notification-preferences", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert "channels" in body
    first = body["preferences"][0]
    assert {"in_app", "push", "telegram", "whatsapp"} <= set(first)
    assert "telegram_chat_id" in body["user"]


def test_channel_contact_round_trip_and_validation(client, student_token):
    saved = client.put(
        "/api/v1/notification-channels",
        headers=auth(student_token),
        json={"telegram_chat_id": "123456789", "whatsapp_number": "919876543210"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["user"]["telegram_chat_id"] == "123456789"

    fetched = client.get("/api/v1/notification-channels", headers=auth(student_token)).json()
    assert fetched["user"]["whatsapp_number"] == "919876543210"

    bad = client.put(
        "/api/v1/notification-channels",
        headers=auth(student_token),
        json={"whatsapp_number": "not-a-number"},
    )
    assert bad.status_code == 422, bad.text


def test_test_endpoint_queues_nothing_without_a_provider(client, student_token):
    response = client.post("/api/v1/notification-channels/test", headers=auth(student_token))
    assert response.status_code == 200, response.text
    body = response.json()
    # In-app is delivered synchronously; no external channel is configured.
    assert body["queued"] == []


# --------------------------------------------------------------------------
# Outbox: queue -> deliver -> retry
# --------------------------------------------------------------------------


class _StubAdapter:
    """Stands in for a configured provider so the outbox can be exercised."""

    channel = NotificationChannel.TELEGRAM.value
    name = "stub"
    configured = True

    def __init__(self, state: str = NotificationState.DELIVERED.value) -> None:
        self.state = state
        self.calls: list[str | None] = []

    def deliver(self, notification, target):  # noqa: ANN001
        self.calls.append(target)
        return DeliveryResult(
            channel=self.channel,
            state=self.state,
            provider="stub",
            detail="stub outcome",
        )


def _register_stub(adapter: _StubAdapter):
    previous = notification_service.get_adapter(_StubAdapter.channel)
    notification_service.register_adapter(adapter)
    return previous


def test_configured_channel_queues_then_delivers(client, db, student_token):
    client.put(
        "/api/v1/notification-channels",
        headers=auth(student_token),
        json={"telegram_chat_id": "555"},
    )
    stub = _StubAdapter()
    previous = _register_stub(stub)
    try:
        sent = client.post("/api/v1/notification-channels/test", headers=auth(student_token))
        assert sent.status_code == 200, sent.text
        assert "TELEGRAM" in sent.json()["queued"]

        # Nothing has been sent yet - the queue is the whole point.
        assert stub.calls == []

        summary = notification_service.process_due_deliveries(db, limit=10)
        assert summary["delivered"] >= 1
        assert stub.calls == ["555"]

        rows = db.scalars(
            select(NotificationDelivery).where(NotificationDelivery.channel == NotificationChannel.TELEGRAM.value)
        ).all()
        assert any(row.state == DeliveryState.DELIVERED.value for row in rows)

        events = db.scalars(
            select(NotificationEvent).where(NotificationEvent.channel == NotificationChannel.TELEGRAM.value)
        ).all()
        assert any(event.state == NotificationState.DELIVERED.value for event in events)
    finally:
        if previous is not None:
            notification_service.register_adapter(previous)


def test_failed_delivery_is_retried_not_dropped(client, db, student_token):
    client.put(
        "/api/v1/notification-channels",
        headers=auth(student_token),
        json={"telegram_chat_id": "777"},
    )
    stub = _StubAdapter(state=NotificationState.FAILED.value)
    previous = _register_stub(stub)
    try:
        client.post("/api/v1/notification-channels/test", headers=auth(student_token))
        summary = notification_service.process_due_deliveries(db, limit=10)
        assert summary["retrying"] >= 1

        row = db.scalars(
            select(NotificationDelivery).where(NotificationDelivery.target == "777")
        ).one()
        assert row.state == DeliveryState.QUEUED.value
        assert row.attempts == 1
        assert row.last_error
    finally:
        if previous is not None:
            notification_service.register_adapter(previous)


class _FakeNotification:
    title = "Test title"
    body = "Test body"
    category = "SYSTEM"
    payload: dict = {}


# --------------------------------------------------------------------------
# Notice attachments travel as media
# --------------------------------------------------------------------------


def test_telegram_sends_a_notice_image_as_a_photo(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "public_base_url", "https://relay.example.edu")
    captured: dict = {}

    class _Response:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"ok": True}

    def _post(url, json=None, timeout=None):  # noqa: A002
        captured["url"] = url
        captured["json"] = json
        return _Response()

    monkeypatch.setattr(httpx, "post", _post)

    class _Notice(_FakeNotification):
        payload = {
            "attachment_url": "/api/v1/notices/7/attachment",
            "attachment_name": "circular.png",
            "attachment_type": "image/png",
        }

    adapter = TelegramAdapter(configured=True, bot_token="tok")
    result = adapter.deliver(_Notice(), "42")
    assert result.state == NotificationState.DELIVERED.value
    assert captured["url"].endswith("/bottok/sendPhoto")
    assert captured["json"]["photo"] == "https://relay.example.edu/api/v1/notices/7/attachment"


def test_notice_attachment_upload_and_download(client, admin_token, student_token, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "media_root", str(tmp_path))

    created = client.post(
        "/api/v1/notices",
        headers=auth(admin_token),
        json={
            "title": "Circular with a photo",
            "content": "The photographed circular is the notice.",
            "notice_type": "IMPORTANT",
            "targets": [{"target_type": "CAMPUS"}],
        },
    )
    assert created.status_code == 201, created.text
    notice_id = created.json()["notice"]["id"]

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    upload = client.post(
        f"/api/v1/notices/{notice_id}/attachment",
        headers=auth(admin_token),
        files={"file": ("circular.png", png, "image/png")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["name"] == "circular.png"

    # A non-image/PDF is refused with a reason rather than stored.
    bad = client.post(
        f"/api/v1/notices/{notice_id}/attachment",
        headers=auth(admin_token),
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert bad.status_code == 422, bad.text

    # Publish, then a student can fetch the file.
    published = client.post(
        f"/api/v1/notices/{notice_id}/status", headers=auth(admin_token), json={"action": "publish"}
    )
    assert published.status_code == 200, published.text
    download = client.get(f"/api/v1/notices/{notice_id}/attachment", headers=auth(student_token))
    assert download.status_code == 200, download.text
    assert download.content == png
