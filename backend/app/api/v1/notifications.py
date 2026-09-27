"""Notification centre: list, read, action, preferences and delivery history."""

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.api.serializers import notification_brief
from app.api.v1.schemas import ChannelContactUpdate, PreferenceUpdate
from app.core.errors import NotFoundError, ValidationError
from app.core.permissions import NOTIFICATION_PREFERENCE_MANAGE, NOTIFICATION_READ
from app.models import Notification, NotificationEvent, NotificationPreference
from app.models.enums import NotificationCategory
from app.services import notifications as notification_service

router = APIRouter(tags=["notifications"])


@router.get("/notifications")
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    category: str | None = None,
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
):
    assert_permission(user, NOTIFICATION_READ)
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    if category:
        stmt = stmt.where(Notification.category == category)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)).all()
    unread = int(
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id, Notification.read_at.is_(None)
            )
        )
        or 0
    )
    return {
        "total": total,
        "unread": unread,
        "notifications": [notification_brief(n) for n in rows],
    }


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTIFICATION_READ)
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    notification_service.mark_read(db, notification=notification, user=user)
    return {"notification": notification_brief(notification)}


@router.post("/notifications/read-all")
def mark_all_read(db: DbSession, user: CurrentUser):
    assert_permission(user, NOTIFICATION_READ)
    rows = db.scalars(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ).all()
    for notification in rows:
        notification_service.mark_read(db, notification=notification, user=user)
    return {"marked_read": len(rows)}


@router.post("/notifications/{notification_id}/actioned")
def mark_actioned(notification_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTIFICATION_READ)
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    notification_service.mark_actioned(db, notification=notification, user=user)
    return {"notification": notification_brief(notification)}


@router.get("/notifications/{notification_id}/delivery")
def delivery_history(db: DbSession, user: CurrentUser, notification_id: int):
    assert_permission(user, NOTIFICATION_READ)
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    events = db.scalars(
        select(NotificationEvent)
        .where(NotificationEvent.notification_id == notification.id)
        .order_by(NotificationEvent.created_at.asc())
    ).all()
    outbox = notification_service.pending_deliveries(db, notification_id=notification.id)
    return {
        "notification_id": notification.id,
        "state": notification.state,
        "events": [
            {
                "channel": e.channel,
                "state": e.state,
                "provider": e.provider,
                "detail": e.detail,
                "at": e.created_at,
            }
            for e in events
        ],
        # The outbox is shown separately from the append-only event log: an
        # event is an attempt that happened, a queued row is one that has not.
        "outbox": [
            {
                "channel": d.channel,
                "state": d.state,
                "attempts": d.attempts,
                "max_attempts": d.max_attempts,
                "next_attempt_at": d.next_attempt_at,
                "last_error": d.last_error,
            }
            for d in outbox
        ],
        "channels": notification_service.channel_status(),
        "honesty_note": (
            "A channel is reported as delivered only when the provider accepted it. "
            "Channels with no provider configured record no attempt at all; a deleted "
            "or unset address is reported as a failure with its reason."
        ),
    }


@router.get("/notification-preferences")
def get_preferences(db: DbSession, user: CurrentUser):
    assert_permission(user, NOTIFICATION_READ)
    rows = db.scalars(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    ).all()
    configured = {
        row.category: {
            "in_app": row.in_app,
            "push": row.push,
            "telegram": row.telegram,
            "whatsapp": row.whatsapp,
        }
        for row in rows
    }
    categories = [c.value for c in NotificationCategory]
    return {
        "user": {
            "telegram_chat_id": user.telegram_chat_id,
            "whatsapp_number": user.whatsapp_number or user.phone,
            "phone": user.phone,
        },
        "channels": notification_service.channel_status(),
        "preferences": [
            {
                "category": category,
                "in_app": configured.get(category, {}).get("in_app", True),
                "push": configured.get(category, {}).get("push", True),
                "telegram": configured.get(category, {}).get("telegram", True),
                "whatsapp": configured.get(category, {}).get("whatsapp", True),
                "locked": category in notification_service.CRITICAL_CATEGORIES,
                "reason": "Institutional-critical notifications cannot be switched off."
                if category in notification_service.CRITICAL_CATEGORIES
                else None,
            }
            for category in categories
        ]
    }


@router.put("/notification-preferences")
def update_preferences(payload: list[PreferenceUpdate], db: DbSession, user: CurrentUser):
    assert_permission(user, NOTIFICATION_PREFERENCE_MANAGE)
    updated = 0
    rejected: list[dict] = []
    for item in payload:
        if item.category in notification_service.CRITICAL_CATEGORIES and not item.in_app:
            rejected.append(
                {
                    "category": item.category,
                    "reason": "Institutional-critical notifications cannot be disabled.",
                }
            )
            continue
        row = db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user.id,
                NotificationPreference.category == item.category,
            )
        )
        if row is None:
            row = NotificationPreference(
                campus_id=user.campus_id,
                user_id=user.id,
                category=item.category,
            )
            db.add(row)
        row.in_app = True if item.category in notification_service.CRITICAL_CATEGORIES else item.in_app
        row.push = item.push
        # Only touch the external-channel flags when the client sent them, so an
        # older PWA that only knows in_app/push cannot silently re-enable a channel.
        if item.telegram is not None:
            row.telegram = item.telegram
        if item.whatsapp is not None:
            row.whatsapp = item.whatsapp
        updated += 1
    return {"updated": updated, "rejected": rejected}


@router.get("/notification-channels")
def get_channels(db: DbSession, user: CurrentUser):
    """Where this user can be reached externally, and whether each channel works."""
    assert_permission(user, NOTIFICATION_READ)
    return {
        "user": {
            "telegram_chat_id": user.telegram_chat_id,
            "whatsapp_number": user.whatsapp_number,
            "phone": user.phone,
        },
        "channels": notification_service.channel_status(),
        "help": {
            "telegram": (
                "Message your campus bot and copy the chat id here, then press Send test. "
                "Chat ids look like 123456789 or @channelname."
            ),
            "whatsapp": (
                "Your WhatsApp number in international format, e.g. 919876543210. "
                "The institution must have a Cloud API number and (for first-contact "
                "messages) an approved template before anything is sent."
            ),
        },
    }


@router.put("/notification-channels")
def update_channels(payload: ChannelContactUpdate, db: DbSession, user: CurrentUser):
    """Set or clear the external-channel addresses for the signed-in user."""
    assert_permission(user, NOTIFICATION_READ)
    changed: list[str] = []
    if payload.telegram_chat_id is not None:
        value = payload.telegram_chat_id.strip()
        user.telegram_chat_id = value or None
        changed.append("telegram_chat_id")
    if payload.whatsapp_number is not None:
        value = payload.whatsapp_number.strip().lstrip("+")
        if value and not value.isdigit():
            raise ValidationError("A WhatsApp number must contain digits only, in international format.")
        user.whatsapp_number = value or None
        changed.append("whatsapp_number")
    from app.services import audit

    audit.record_audit(
        db,
        event_type="NOTIFICATION_CHANNELS_UPDATED",
        campus_id=user.campus_id,
        actor=user,
        entity_type="USER",
        entity_id=user.id,
        payload={"fields": changed},
    )
    return {
        "updated": changed,
        "user": {
            "telegram_chat_id": user.telegram_chat_id,
            "whatsapp_number": user.whatsapp_number,
        },
        "channels": notification_service.channel_status(),
    }


@router.post("/notification-channels/test")
def send_test_notification(db: DbSession, user: CurrentUser):
    """Send a real test through every configured channel the user has accepted.

    Honest by construction: if no provider is configured, nothing is queued and
    the response says so. If a provider is configured but the address is missing,
    the attempt is recorded as failed with that reason - never as delivered.
    """
    assert_permission(user, NOTIFICATION_READ)
    notification = notification_service.create_notification(
        db,
        user=user,
        category=NotificationCategory.SYSTEM.value,
        title="Test notification from Campus Relay",
        body="If you can read this, the channel is working. Delivery is confirmed, read is not claimed.",
        priority="NORMAL",
        source_channel="PWA",
    )
    deliveries = (
        notification_service.pending_deliveries(db, notification_id=notification.id)
        if notification
        else []
    )
    return {
        "notification_id": notification.id if notification else None,
        "queued": [d.channel for d in deliveries],
        "channels": notification_service.channel_status(),
        "note": (
            "Queued channels are delivered by the background worker within a few seconds. "
            "Unconfigured channels are never queued and never reported as sent."
        ),
    }
