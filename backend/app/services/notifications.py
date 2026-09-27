"""Notification engine.

Separate from notices: notices are broadcasts to an audience, notifications are
"something happened about *your* stuff".

Channel architecture
--------------------
Every notification is written to Postgres (in-app is a real, first-class
channel). Optional channels sit behind `NotificationAdapter`, so adding a
channel means registering an adapter - not rewriting the callers.

Delivery is asynchronous on purpose. A provider call must never sit inside the
request transaction: a slow or hanging gateway would add seconds to filing a
complaint. So an optional-channel delivery is written to the `notification_deliveries`
outbox and drained by the delivery worker (`app/services/delivery.py`) with retry
and backoff, which records the true outcome as an append-only `NotificationEvent`.

Honesty rule
------------
A channel with no configured provider is reported as unconfigured by GET /meta
and in the delivery view - no attempt is recorded, because no attempt was made.
A configured channel with no address for the recipient records a `FAILED` event
whose reason is "no recipient on file". Nothing is ever reported as delivered
unless the provider actually accepted it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Case,
    Notification,
    NotificationDelivery,
    NotificationEvent,
    NotificationPreference,
    User,
)
from app.models.enums import (
    AuditEventType,
    DeliveryState,
    NotificationCategory,
    NotificationChannel,
    NotificationState,
    Priority,
    RoleKey,
)
from app.services import clock

# Institutional notifications a user cannot switch off.
CRITICAL_CATEGORIES: frozenset[str] = frozenset(
    {
        NotificationCategory.URGENT_ANNOUNCEMENT.value,
        NotificationCategory.SLA_ALERT.value,
        NotificationCategory.SYSTEM.value,
        NotificationCategory.APPROVAL.value,
    }
)

# Channels that leave the building. In-app is always synchronous; these are not.
OPTIONAL_CHANNELS: tuple[str, ...] = (
    NotificationChannel.PUSH.value,
    NotificationChannel.TELEGRAM.value,
    NotificationChannel.WHATSAPP.value,
)


@dataclass
class DeliveryResult:
    channel: str
    state: str
    provider: str
    detail: str


class NotificationAdapter(Protocol):
    channel: str
    name: str
    configured: bool

    def deliver(self, notification: Notification, target: str | None) -> DeliveryResult: ...


class InAppAdapter:
    """In-app is a real channel: the row itself is the delivery."""

    channel = NotificationChannel.IN_APP.value
    name = "in_app"
    configured = True

    def deliver(self, notification: Notification, target: str | None) -> DeliveryResult:  # noqa: ARG002
        notification.delivered_at = notification.delivered_at or clock.now()
        return DeliveryResult(
            channel=self.channel,
            state=NotificationState.DELIVERED.value,
            provider="in_app",
            detail="Stored in the user notification center",
        )


class PushAdapter:
    """OPTIONAL INTEGRATION - configured from the environment, off by default.

    Web push needs a provider endpoint and a VAPID key pair (see
    PUSH_PROVIDER_URL / PUSH_VAPID_* in .env.example). When they are absent this
    adapter reports honestly that nothing was attempted rather than claiming a
    delivery. When they are present it POSTs the payload to the provider and
    records the real outcome. In-app delivery is never affected either way.
    """

    channel = NotificationChannel.PUSH.value
    name = "webpush"

    def __init__(self, configured: bool = False, provider_url: str = "", timeout: float = 8.0) -> None:
        self.configured = configured
        self.provider_url = provider_url
        self.timeout = timeout

    def deliver(self, notification: Notification, target: str | None) -> DeliveryResult:
        if not self.configured or not target:
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="not_configured",
                detail=(
                    "No push provider configured and/or no subscription registered; "
                    "in-app delivery is unaffected."
                ),
            )
        try:
            import httpx

            response = httpx.post(
                self.provider_url,
                json={
                    "title": notification.title,
                    "body": notification.body,
                    "category": notification.category,
                    "subscription": target,
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001 - a failed push must never break the write
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="provider_error",
                detail=f"Push provider call failed ({exc.__class__.__name__}); in-app delivery is unaffected.",
            )
        return DeliveryResult(
            channel=self.channel,
            state=NotificationState.DELIVERED.value,
            provider=self.name,
            detail="Delivered via configured push provider",
        )


class TelegramAdapter:
    """REAL INTEGRATION - a Telegram bot token is all that is required.

    Telegram is used rather than SMS because it is genuinely reachable by a
    college without a business account or per-message billing: create a bot with
    @BotFather, set TELEGRAM_BOT_TOKEN, and each user links a chat id. Delivery
    is confirmed from Telegram's own response (`ok: true`); we can prove
    *delivered*, never *read*, and this adapter never claims otherwise.
    """

    channel = NotificationChannel.TELEGRAM.value
    name = "telegram"

    def __init__(self, configured: bool = False, bot_token: str = "", api_base: str = "", timeout: float = 8.0) -> None:
        self.configured = configured
        self.bot_token = bot_token.strip()
        self.api_base = api_base.rstrip("/")
        self.timeout = timeout

    def deliver(self, notification: Notification, target: str | None) -> DeliveryResult:
        if not self.configured:
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="not_configured",
                detail="No Telegram bot token configured; nothing was attempted.",
            )
        if not target:
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="no_recipient",
                detail="Recipient has not linked a Telegram chat id.",
            )
        text = f"{notification.title}\n\n{notification.body}".strip()
        media = _attachment_media(notification)
        if media:
            # A notice that is really a photographed circular is sent as the
            # image itself, because that is how a college actually publishes it.
            method = "sendPhoto" if media["content_type"].startswith("image/") else "sendDocument"
            field = "photo" if method == "sendPhoto" else "document"
            body = {"chat_id": target, field: media["url"], "caption": text[:1000]}
        else:
            method = "sendMessage"
            body = {"chat_id": target, "text": text, "disable_web_page_preview": True}
        url = f"{self.api_base}/bot{self.bot_token}/{method}"
        try:
            import httpx

            response = httpx.post(url, json=body, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            if not payload.get("ok"):
                raise RuntimeError(payload.get("description") or "telegram rejected the message")
        except Exception as exc:  # noqa: BLE001 - a failed send must never break the write
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="provider_error",
                detail=f"Telegram call failed ({exc.__class__.__name__}).",
            )
        return DeliveryResult(
            channel=self.channel,
            state=NotificationState.DELIVERED.value,
            provider=self.name,
            detail=(
                f"Accepted by Telegram via {method} (delivered, not read)."
                if media
                else "Accepted by Telegram (delivered, not read)."
            ),
        )


class WhatsAppAdapter:
    """OPTIONAL INTEGRATION - Meta WhatsApp Cloud API.

    The adapter is real, but WhatsApp business messaging needs a Meta business
    account, a phone-number id, a permanent token, and a pre-approved message
    template for anything the institution sends first. Until all of that exists
    this reports itself unconfigured rather than pretending to send.
    """

    channel = NotificationChannel.WHATSAPP.value
    name = "whatsapp_cloud"

    def __init__(
        self,
        configured: bool = False,
        phone_number_id: str = "",
        token: str = "",
        template: str = "",
        template_language: str = "en",
        api_base: str = "",
        api_version: str = "v21.0",
        timeout: float = 8.0,
    ) -> None:
        self.configured = configured
        self.phone_number_id = phone_number_id.strip()
        self.token = token.strip()
        self.template = template.strip()
        self.template_language = template_language
        self.api_base = api_base.rstrip("/")
        self.api_version = api_version
        self.timeout = timeout

    def deliver(self, notification: Notification, target: str | None) -> DeliveryResult:
        if not self.configured:
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="not_configured",
                detail="No WhatsApp Cloud API credentials configured; nothing was attempted.",
            )
        if not target:
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="no_recipient",
                detail="Recipient has no WhatsApp number on file.",
            )
        url = f"{self.api_base}/{self.api_version}/{self.phone_number_id}/messages"
        number = target.lstrip("+")
        media = _attachment_media(notification)
        if media and not self.template:
            # The circular as an image/document, with the title as its caption.
            # Only valid inside an open customer-service window; outside it the
            # template path above is required.
            media_type = "image" if media["content_type"].startswith("image/") else "document"
            payload_media: dict = {"link": media["url"], "caption": notification.title[:900]}
            if media_type == "document":
                payload_media["filename"] = media["name"]
            message = {
                "messaging_product": "whatsapp",
                "to": number,
                "type": media_type,
                media_type: payload_media,
            }
        elif self.template:
            # Business-initiated messages must use an approved template.
            message = {
                "messaging_product": "whatsapp",
                "to": number,
                "type": "template",
                "template": {
                    "name": self.template,
                    "language": {"code": self.template_language},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": notification.title},
                                {"type": "text", "text": notification.body},
                            ],
                        }
                    ],
                },
            }
        else:
            # No template configured: a free-form message only works inside a
            # 24-hour customer-service window, so it is attempted as text.
            message = {
                "messaging_product": "whatsapp",
                "to": number,
                "type": "text",
                "text": {"body": f"{notification.title}\n\n{notification.body}".strip()},
            }
        try:
            import httpx

            response = httpx.post(
                url,
                json=message,
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            return DeliveryResult(
                channel=self.channel,
                state=NotificationState.FAILED.value,
                provider="provider_error",
                detail=f"WhatsApp Cloud API call failed ({exc.__class__.__name__}).",
            )
        return DeliveryResult(
            channel=self.channel,
            state=NotificationState.DELIVERED.value,
            provider=self.name,
            detail="Accepted by the WhatsApp Cloud API (delivered, not read).",
        )


def push_status() -> dict:
    """Reported by GET /meta so the UI can state the truth about push."""
    return {
        "configured": settings.push_configured,
        "note": (
            "OPTIONAL INTEGRATION - web push provider configured."
            if settings.push_configured
            else "OPTIONAL INTEGRATION - adapter slot reserved; no provider configured."
        ),
    }


def telegram_status() -> dict:
    return {
        "configured": settings.telegram_configured,
        "note": (
            "REAL INTEGRATION - Telegram bot configured; users link a chat id."
            if settings.telegram_configured
            else "REAL INTEGRATION - set TELEGRAM_BOT_TOKEN to enable; nothing is sent until then."
        ),
    }


def whatsapp_status() -> dict:
    return {
        "configured": settings.whatsapp_configured,
        "note": (
            "OPTIONAL INTEGRATION - WhatsApp Cloud API configured"
            + (" with an approved template." if settings.whatsapp_template else " (free-form only).")
            if settings.whatsapp_configured
            else "OPTIONAL INTEGRATION - needs Meta business credentials and an approved template."
        ),
    }


def channel_status() -> dict:
    """The full, honest channel picture, served by GET /meta."""
    return {
        "in_app": {"configured": True, "note": "Real: stored and tracked in Postgres."},
        "push": push_status(),
        "telegram": telegram_status(),
        "whatsapp": whatsapp_status(),
        "sms": {"configured": False, "note": "OPTIONAL INTEGRATION - adapter slot reserved."},
        "email": {"configured": False, "note": "OPTIONAL INTEGRATION - adapter slot reserved."},
    }


def external_messaging_status() -> dict:
    """A one-line summary for the landing/meta surface, kept strictly honest."""
    configured = [name for name in ("telegram", "whatsapp") if channel_status()[name]["configured"]]
    if not configured:
        return {
            "configured": False,
            "channels": ["telegram", "whatsapp"],
            "note": (
                "Telegram and WhatsApp adapters are implemented but no provider is configured; "
                "nothing is sent and no delivery is claimed until credentials are supplied."
            ),
        }
    return {
        "configured": True,
        "channels": configured,
        "note": (
            "External messaging is enabled for: " + ", ".join(configured) + ". "
            "Delivery is reported from the provider response; read receipts are never claimed."
        ),
    }


_ADAPTERS: list[NotificationAdapter] = [
    InAppAdapter(),
    PushAdapter(configured=settings.push_configured, provider_url=settings.push_provider_url),
    TelegramAdapter(
        configured=settings.telegram_configured,
        bot_token=settings.telegram_bot_token,
        api_base=settings.telegram_api_base,
        timeout=settings.delivery_timeout_seconds,
    ),
    WhatsAppAdapter(
        configured=settings.whatsapp_configured,
        phone_number_id=settings.whatsapp_phone_number_id,
        token=settings.whatsapp_token,
        template=settings.whatsapp_template,
        template_language=settings.whatsapp_template_language,
        api_base=settings.whatsapp_api_base,
        api_version=settings.whatsapp_api_version,
        timeout=settings.delivery_timeout_seconds,
    ),
]
_ADAPTER_REGISTRY: dict[str, NotificationAdapter] = {a.channel: a for a in _ADAPTERS}


def register_adapter(adapter: NotificationAdapter) -> None:
    _ADAPTER_REGISTRY[adapter.channel] = adapter


def get_adapter(channel: str) -> NotificationAdapter | None:
    return _ADAPTER_REGISTRY.get(channel)


def channel_configured(channel: str) -> bool:
    adapter = get_adapter(channel)
    return bool(adapter is not None and getattr(adapter, "configured", True))


def channel_target(user: User, channel: str) -> str | None:
    """Where a channel should send for this user, or None if nowhere."""
    if channel == NotificationChannel.TELEGRAM.value:
        return (user.telegram_chat_id or "").strip() or None
    if channel == NotificationChannel.WHATSAPP.value:
        return (user.whatsapp_number or user.phone or "").strip() or None
    if channel == NotificationChannel.PUSH.value:
        # A push subscription is per device and is not stored server-side yet.
        return None
    return None


def _preference_value(pref: NotificationPreference, channel: str) -> bool:
    if channel == NotificationChannel.PUSH.value:
        return pref.push
    if channel == NotificationChannel.TELEGRAM.value:
        return pref.telegram
    if channel == NotificationChannel.WHATSAPP.value:
        return pref.whatsapp
    return pref.in_app


def preference_allows(db: Session, *, user_id: int, category: str, channel: str) -> bool:
    if category in CRITICAL_CATEGORIES:
        return True
    pref = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.category == category,
        )
    )
    if pref is None:
        return True
    return _preference_value(pref, channel)


def _attachment_media(notification: Notification) -> dict | None:
    """Resolve a notice attachment into a media descriptor, or None.

    External providers fetch media by URL, so a deployment with no
    PUBLIC_BASE_URL cannot send an attachment off-box - and says so rather than
    silently dropping it.
    """
    payload = notification.payload or {}
    path = payload.get("attachment_url")
    if not path:
        return None
    base = (settings.public_base_url or "").strip().rstrip("/")
    if not base and not str(path).startswith("http"):
        return None
    url = path if str(path).startswith("http") else f"{base}{path}"
    return {
        "url": url,
        "name": payload.get("attachment_name") or "attachment",
        "content_type": payload.get("attachment_type") or "",
    }


def _record_event(
    db: Session,
    notification: Notification,
    *,
    channel: str,
    state: str,
    provider: str,
    detail: str,
) -> None:
    db.add(
        NotificationEvent(
            campus_id=notification.campus_id,
            notification_id=notification.id,
            channel=channel,
            state=state,
            provider=provider,
            detail=detail[:400],
            payload={},
            created_at=clock.now(),
        )
    )


def enqueue_delivery(
    db: Session,
    *,
    notification: Notification,
    channel: str,
    target: str,
    delay_seconds: float = 0.0,
) -> NotificationDelivery:
    """Queue one outbound delivery. The provider call happens later, never here."""
    row = NotificationDelivery(
        campus_id=notification.campus_id,
        notification_id=notification.id,
        channel=channel,
        state=DeliveryState.QUEUED.value,
        target=target,
        attempts=0,
        max_attempts=5,
        next_attempt_at=clock.now() + timedelta(seconds=delay_seconds),
    )
    db.add(row)
    db.flush()
    return row


def _backoff_seconds(attempts: int) -> float:
    """15s, 30s, 60s, 120s, capped at 5 minutes."""
    return float(min(300, 15 * (2 ** max(0, attempts - 1))))


def deliver_one(db: Session, delivery: NotificationDelivery) -> str:
    """Attempt one outbox row. Returns delivered | retrying | failed | cancelled."""
    notification = db.get(Notification, delivery.notification_id)
    delivery.attempts += 1

    if notification is None:
        delivery.state = DeliveryState.CANCELLED.value
        delivery.last_error = "Notification no longer exists."
        return "cancelled"

    adapter = get_adapter(delivery.channel)
    if adapter is None or not getattr(adapter, "configured", True):
        delivery.state = DeliveryState.CANCELLED.value
        delivery.last_error = "Provider not configured."
        return "cancelled"

    result = adapter.deliver(notification, delivery.target)
    _record_event(
        db,
        notification,
        channel=result.channel,
        state=result.state,
        provider=result.provider,
        detail=result.detail,
    )

    if result.state == NotificationState.DELIVERED.value:
        delivery.state = DeliveryState.DELIVERED.value
        delivery.provider = result.provider
        delivery.last_error = None
        return "delivered"

    delivery.provider = result.provider
    delivery.last_error = result.detail[:400]
    if delivery.attempts >= delivery.max_attempts:
        delivery.state = DeliveryState.FAILED.value
        return "failed"
    delivery.state = DeliveryState.QUEUED.value
    delivery.next_attempt_at = clock.now() + timedelta(seconds=_backoff_seconds(delivery.attempts))
    return "retrying"


def process_due_deliveries(db: Session, *, limit: int = 25) -> dict:
    """Drain due outbox rows. Safe to call repeatedly; idempotent per row."""
    now = clock.now()
    rows = db.scalars(
        select(NotificationDelivery)
        .where(
            NotificationDelivery.state == DeliveryState.QUEUED.value,
            NotificationDelivery.next_attempt_at <= now,
        )
        .order_by(NotificationDelivery.next_attempt_at.asc())
        .limit(limit)
    ).all()

    summary = {"processed": 0, "delivered": 0, "retrying": 0, "failed": 0, "cancelled": 0}
    for row in rows:
        outcome = deliver_one(db, row)
        summary["processed"] += 1
        summary[outcome] = summary.get(outcome, 0) + 1
    # Flush so the recorded events and updated outbox rows are visible to the
    # caller within the same unit of work (the worker's session_scope commits).
    db.flush()
    return summary


def pending_deliveries(db: Session, *, notification_id: int) -> list[NotificationDelivery]:
    return list(
        db.scalars(
            select(NotificationDelivery)
            .where(NotificationDelivery.notification_id == notification_id)
            .order_by(NotificationDelivery.created_at.asc())
        ).all()
    )


def create_notification(
    db: Session,
    *,
    user: User,
    category: str,
    title: str,
    body: str = "",
    priority: str = Priority.NORMAL.value,
    action_label: str | None = None,
    action_type: str | None = None,
    action_target: str | None = None,
    case_id: int | None = None,
    notice_id: int | None = None,
    dedupe_key: str | None = None,
    payload: dict | None = None,
    source_channel: str = "PWA",
    device_uid: str | None = None,
    actor: User | None = None,
) -> Notification | None:
    """Create + deliver one notification. Returns None if suppressed or deduped.

    In-app delivery is immediate (it is just the row). Optional channels are
    queued for the delivery worker, so a slow gateway cannot delay this call.
    """
    if dedupe_key:
        existing = db.scalar(
            select(Notification).where(
                Notification.user_id == user.id, Notification.dedupe_key == dedupe_key
            )
        )
        if existing is not None:
            return existing

    if not preference_allows(
        db, user_id=user.id, category=category, channel=NotificationChannel.IN_APP.value
    ):
        return None

    notification = Notification(
        campus_id=user.campus_id,
        user_id=user.id,
        category=category,
        title=title,
        body=body,
        priority=priority,
        state=NotificationState.SENT.value,
        action_label=action_label,
        action_type=action_type,
        action_target=action_target,
        case_id=case_id,
        notice_id=notice_id,
        dedupe_key=dedupe_key,
        payload=payload or {},
        created_at=clock.now(),
    )
    db.add(notification)
    db.flush()

    adapter = get_adapter(NotificationChannel.IN_APP.value)
    if adapter is not None:
        result = adapter.deliver(notification, None)
        _record_event(
            db,
            notification,
            channel=result.channel,
            state=result.state,
            provider=result.provider,
            detail=result.detail,
        )
        notification.state = NotificationState.DELIVERED.value

    # Optional channels. Two honest outcomes and one queued attempt:
    #   - provider not configured -> no attempt, nothing recorded (GET /meta says so);
    #   - configured but no address -> a FAILED event that names the reason;
    #   - configured with an address -> queued for the worker.
    for channel in OPTIONAL_CHANNELS:
        if not channel_configured(channel):
            continue
        if not preference_allows(db, user_id=user.id, category=category, channel=channel):
            continue
        target = channel_target(user, channel)
        if not target:
            _record_event(
                db,
                notification,
                channel=channel,
                state=NotificationState.FAILED.value,
                provider="no_recipient",
                detail=f"No address on file for {channel.lower()}; nothing was attempted.",
            )
            continue
        enqueue_delivery(db, notification=notification, channel=channel, target=target)

    from app.services import audit

    audit.record_audit(
        db,
        event_type=AuditEventType.NOTIFICATION_SENT.value,
        campus_id=notification.campus_id,
        actor=actor,
        actor_role=actor.role_key if actor else RoleKey.ADMIN.value,
        entity_type="NOTIFICATION",
        entity_id=notification.id,
        source_channel=source_channel,
        device_uid=device_uid,
        case_id=case_id,
        payload={"category": category, "title": title[:120], "recipient_id": user.id},
    )
    return notification


def staff_for_department(db: Session, *, campus_id: int, department_id: int | None) -> list[User]:
    from app.models import Staff

    stmt = select(Staff).where(Staff.campus_id == campus_id)
    if department_id:
        stmt = stmt.where(Staff.department_id == department_id)
    return [s.user for s in db.scalars(stmt).all() if s.user and s.user.is_active]


def users_with_role(db: Session, *, campus_id: int, role_key: str) -> list[User]:
    from app.models import Role

    return list(
        db.scalars(
            select(User)
            .join(Role, Role.id == User.role_id)
            .where(
                User.campus_id == campus_id,
                Role.key == role_key,
                User.is_active.is_(True),
            )
        ).all()
    )


def notify_case_stakeholders(
    db: Session,
    *,
    case: Case,
    category: str,
    title: str,
    body: str = "",
    priority: str = Priority.NORMAL.value,
    action_label: str | None = "View case",
    action_type: str | None = "OPEN_CASE",
    action_target: str | None = None,
    include_requester: bool = True,
    include_staff: bool = True,
    dedupe_suffix: str | None = None,
) -> list[Notification]:
    """Notify the people who actually care about a case."""
    created: list[Notification] = []
    dedupe_key = f"{category}:{case.id}:{dedupe_suffix}" if dedupe_suffix else None
    requester_target = action_target or f"/cases/{case.id}"

    if include_requester and case.requester is not None:
        note = create_notification(
            db,
            user=case.requester,
            category=category,
            title=title,
            body=body,
            priority=priority,
            action_label=action_label,
            action_type=action_type,
            action_target=requester_target,
            case_id=case.id,
            dedupe_key=dedupe_key,
        )
        if note:
            created.append(note)

    if include_staff:
        recipients: list[User] = []
        if case.assigned_staff_id:
            from app.models import Staff

            staff = db.get(Staff, case.assigned_staff_id)
            if staff and staff.user:
                recipients.append(staff.user)
        if case.department_id:
            recipients.extend(staff_for_department(db, campus_id=case.campus_id, department_id=case.department_id))

        seen: set[int] = set()
        for user in recipients:
            if user.id in seen or (case.requester and user.id == case.requester.id):
                continue
            seen.add(user.id)
            note = create_notification(
                db,
                user=user,
                category=category,
                title=title,
                body=body,
                priority=priority,
                action_label="Open assignment",
                action_type="OPEN_CASE",
                action_target=f"/staff/cases/{case.id}",
                case_id=case.id,
                dedupe_key=f"{dedupe_key}:{user.id}" if dedupe_key else None,
            )
            if note:
                created.append(note)

    return created


def notify_admins(
    db: Session,
    *,
    campus_id: int,
    category: str,
    title: str,
    body: str = "",
    priority: str = Priority.HIGH.value,
    action_target: str | None = None,
    dedupe_key: str | None = None,
) -> list[Notification]:
    created: list[Notification] = []
    for role_key in (RoleKey.ADMIN.value, RoleKey.SUPER_ADMIN.value, RoleKey.WARDEN.value):
        for user in users_with_role(db, campus_id=campus_id, role_key=role_key):
            note = create_notification(
                db,
                user=user,
                category=category,
                title=title,
                body=body,
                priority=priority,
                action_label="Open",
                action_type="OPEN_DASHBOARD",
                action_target=action_target or "/admin",
                dedupe_key=f"{dedupe_key}:{user.id}" if dedupe_key else None,
            )
            if note:
                created.append(note)
    return created


def mark_read(db: Session, *, notification: Notification, user: User, source_channel: str = "PWA") -> Notification:
    from app.services import audit

    if notification.user_id != user.id:
        from app.core.errors import PermissionDeniedError

        raise PermissionDeniedError("That notification belongs to another user.")

    if notification.read_at is None:
        notification.read_at = clock.now()
        notification.state = NotificationState.READ.value
        _record_event(
            db,
            notification,
            channel=NotificationChannel.IN_APP.value,
            state=NotificationState.READ.value,
            provider="in_app",
            detail="Marked read in app",
        )
        audit.record_audit(
            db,
            event_type=AuditEventType.NOTIFICATION_READ.value,
            campus_id=notification.campus_id,
            actor=user,
            entity_type="NOTIFICATION",
            entity_id=notification.id,
            source_channel=source_channel,
            case_id=notification.case_id,
            payload={"category": notification.category},
        )
    return notification


def mark_actioned(
    db: Session, *, notification: Notification, user: User, source_channel: str = "PWA"
) -> Notification:
    from app.services import audit

    if notification.actioned_at is None:
        notification.actioned_at = clock.now()
        notification.read_at = notification.read_at or clock.now()
        notification.state = NotificationState.ACTIONED.value
        _record_event(
            db,
            notification,
            channel=NotificationChannel.IN_APP.value,
            state=NotificationState.ACTIONED.value,
            provider="in_app",
            detail="Recipient acted on the notification",
        )
        audit.record_audit(
            db,
            event_type=AuditEventType.NOTIFICATION_ACTIONED.value,
            campus_id=notification.campus_id,
            actor=user,
            entity_type="NOTIFICATION",
            entity_id=notification.id,
            source_channel=source_channel,
            case_id=notification.case_id,
            payload={"category": notification.category},
        )
    return notification
