"""Notice API: authoring, targeting, tracking and sharing."""

import hashlib
from pathlib import Path

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, DbSession, RequestContext
from app.api.serializers import notice_brief
from app.api.v1.schemas import (
    NoticeActionRequest,
    NoticeCreateRequest,
    NoticeShareRequest,
    NoticeStatusRequest,
)
from app.core.config import settings
from app.core.errors import NotFoundError, PermissionDeniedError, ValidationError
from app.core.permissions import NOTICE_ANALYTICS, NOTICE_CREATE, NOTICE_MANAGE, NOTICE_PUBLISH, NOTICE_READ, NOTICE_SHARE
from app.api.deps import assert_permission
from app.models import Case, Notice, NoticeRecipient, Role, User
from app.models.enums import NoticeStatus
from app.services import clock, notices as notice_service
from app.services.documents import media_root

# A notice attachment is an image or a PDF, because that is how a circular is
# actually produced. Anything else is rejected with a stated reason.
ALLOWED_NOTICE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}

router = APIRouter(tags=["notices"])


@router.get("/notices")
def list_notices(
    db: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    pending_acknowledgement: bool = False,
    notice_type: str | None = None,
    status: str | None = None,
    q: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
):
    assert_permission(user, NOTICE_READ)
    is_manager = NOTICE_MANAGE in user.permission_keys() or NOTICE_PUBLISH in user.permission_keys()

    if is_manager and (include_archived or status or not (unread_only or pending_acknowledgement)):
        stmt = select(Notice).where(Notice.campus_id == user.campus_id)
        if not include_archived and not status:
            stmt = stmt.where(Notice.status != NoticeStatus.ARCHIVED.value)
    else:
        stmt = (
            select(Notice)
            .join(NoticeRecipient, NoticeRecipient.notice_id == Notice.id)
            .where(
                NoticeRecipient.user_id == user.id,
                Notice.campus_id == user.campus_id,
            )
        )
        if not include_archived and not status:
            stmt = stmt.where(Notice.status != NoticeStatus.ARCHIVED.value)
        if unread_only:
            stmt = stmt.where(NoticeRecipient.read_at.is_(None))
        if pending_acknowledgement:
            stmt = stmt.where(
                Notice.acknowledgement_required.is_(True), NoticeRecipient.acknowledged_at.is_(None)
            )

    if status:
        stmt = stmt.where(Notice.status == status.upper())
    if notice_type:
        stmt = stmt.where(Notice.notice_type == notice_type.upper())
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Notice.title.ilike(term), Notice.summary.ilike(term)))

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(Notice.is_pinned.desc(), Notice.publish_at.desc()).limit(limit).offset(offset)
    ).all()
    return {
        "total": total,
        "notices": [notice_brief(db, notice, user=user) for notice in rows],
        "pending_acknowledgements": notice_service.pending_acknowledgements(
            db, campus_id=user.campus_id, user=user
        ),
    }


@router.get("/notices/inbox")
def notices_inbox(db: DbSession, user: CurrentUser):
    """Everything the mobile notice tab needs in one round trip."""
    rows = db.scalars(
        select(Notice)
        .join(NoticeRecipient, NoticeRecipient.notice_id == Notice.id)
        .where(
            NoticeRecipient.user_id == user.id,
            Notice.campus_id == user.campus_id,
            Notice.status != NoticeStatus.ARCHIVED.value,
        )
        .order_by(Notice.is_pinned.desc(), Notice.publish_at.desc())
        .limit(50)
    ).all()
    payload = [notice_brief(db, notice, user=user) for notice in rows]
    return {
        "unread": [n for n in payload if (n.get("my_state") or {}).get("read_at") is None],
        "needs_action": [n for n in payload if (n.get("my_state") or {}).get("needs_acknowledgement")],
        "all": payload,
    }


@router.post("/notices", status_code=201)
def create_notice(payload: NoticeCreateRequest, db: DbSession, user: CurrentUser):
    # Publishing now (or immediately) is a stronger right than drafting one.
    immediate = payload.publish_at is None or clock.ensure_aware(payload.publish_at) <= clock.now()
    assert_permission(user, NOTICE_PUBLISH if immediate else NOTICE_CREATE)

    draft = notice_service.NoticeDraft(
        title=payload.title,
        content=payload.content,
        summary=payload.summary,
        notice_type=payload.notice_type,
        category=payload.category,
        priority=payload.priority,
        publish_at=payload.publish_at,
        expires_at=payload.expires_at,
        acknowledgement_required=payload.acknowledgement_required,
        required_action=payload.required_action,
        required_action_label=payload.required_action_label,
        is_pinned=payload.is_pinned,
        share_enabled=payload.share_enabled,
        targets=[t.model_dump() for t in payload.targets],
    )
    notice = notice_service.create_notice(db, actor=user, draft=draft)
    return {"notice": notice_brief(db, notice, user=user)}


@router.get("/notices/audience-preview")
def audience_preview(
    db: DbSession,
    user: CurrentUser,
    target_type: str,
    target_id: int | None = None,
    target_value: str | None = None,
):
    """Show how many people a selector reaches before publishing."""
    assert_permission(user, NOTICE_CREATE)
    ids = notice_service.resolve_audience(
        db,
        campus_id=user.campus_id,
        targets=[{"target_type": target_type, "target_id": target_id, "target_value": target_value}],
    )
    return {"reach": len(ids)}


@router.get("/notices/{notice_id}")
def get_notice(db: DbSession, user: CurrentUser, notice_id: int):
    assert_permission(user, NOTICE_READ)
    notice = db.get(Notice, notice_id)
    if notice is None or notice.campus_id != user.campus_id:
        from app.core.errors import NotFoundError

        raise NotFoundError("Notice not found.")
    is_manager = NOTICE_MANAGE in user.permission_keys() or NOTICE_PUBLISH in user.permission_keys()
    addressed = db.scalar(
        select(NoticeRecipient.id).where(
            NoticeRecipient.notice_id == notice.id, NoticeRecipient.user_id == user.id
        )
    )
    if not addressed and not is_manager:
        raise PermissionDeniedError("This notice was not addressed to you.")

    payload = notice_brief(db, notice, user=user)
    if is_manager:
        payload["analytics"] = notice_service.analytics(db, notice=notice)
    return payload


@router.post("/notices/{notice_id}/status")
def update_status(notice_id: int, payload: NoticeStatusRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTICE_PUBLISH)
    notice = _notice_or_404(db, user, notice_id)
    if payload.action in {"publish", "expire", "archive", "schedule"}:
        assert_permission(user, NOTICE_PUBLISH)
    notice_service.update_notice_status(db, notice=notice, actor=user, action=payload.action, when=payload.when)
    return {"notice": notice_brief(db, notice, user=user)}


@router.post("/notices/{notice_id}/duplicate", status_code=201)
def duplicate_notice(notice_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTICE_CREATE)
    notice = _notice_or_404(db, user, notice_id)
    copy = notice_service.duplicate_notice(db, notice=notice, actor=user)
    return {"notice": notice_brief(db, copy, user=user)}


@router.post("/notices/{notice_id}/attachment", status_code=201)
async def upload_notice_attachment(
    notice_id: int, db: DbSession, user: CurrentUser, file: UploadFile = File(...)
):
    """Attach one image or PDF to a notice.

    This is how a college actually publishes: the circular is written,
    photographed or exported to PDF, and that file *is* the notice. Storing it on
    the notice (not only as text) is what lets it be delivered to WhatsApp and
    Telegram as the image or document people already expect to receive.
    """
    assert_permission(user, NOTICE_CREATE)
    notice = _notice_or_404(db, user, notice_id)
    content = await file.read()
    if not content:
        raise ValidationError("The uploaded file is empty.")
    if len(content) > settings.max_upload_bytes:
        raise ValidationError(
            f"Attachments are limited to {settings.max_upload_bytes // (1024 * 1024)} MB."
        )
    safe_name = Path(file.filename or "notice.bin").name
    if Path(safe_name).suffix.lower() not in ALLOWED_NOTICE_SUFFIXES:
        raise ValidationError("A notice attachment must be an image (jpg, png, webp, gif) or a PDF.")

    digest = hashlib.sha256(content).hexdigest()
    relative = Path("notices") / str(notice.campus_id) / str(notice.id) / f"{digest[:12]}-{safe_name}"
    destination = Path(media_root()) / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    notice.attachment_path = relative.as_posix()
    notice.attachment_name = safe_name
    db.flush()
    return {
        "notice_id": notice.id,
        "name": safe_name,
        "content_type": file.content_type,
        "size_bytes": len(content),
        "sha256": digest,
        "url": f"/api/v1/notices/{notice.id}/attachment",
    }


@router.get("/notices/{notice_id}/attachment")
def download_notice_attachment(notice_id: int, db: DbSession, user: CurrentUser):
    """Serve a notice attachment to someone allowed to see the notice."""
    assert_permission(user, NOTICE_READ)
    notice = _notice_or_404(db, user, notice_id)
    if not notice.attachment_path:
        raise NotFoundError("This notice has no attachment.")
    # The authoring team always; everyone else only once it is published.
    if NOTICE_MANAGE not in user.permission_keys() and notice.status != NoticeStatus.PUBLISHED.value:
        raise NotFoundError("This notice has no attachment.")
    path = Path(media_root()) / notice.attachment_path
    if not path.exists():
        raise NotFoundError("The attachment is no longer on disk.")
    return FileResponse(
        path,
        filename=notice.attachment_name or path.name,
        media_type=notice_service.notice_attachment_content_type(notice),
    )


@router.post("/notices/{notice_id}/read")
def mark_read(notice_id: int, db: DbSession, user: CurrentUser, context: RequestContext):
    assert_permission(user, NOTICE_READ)
    notice = _notice_or_404(db, user, notice_id)
    recipient = notice_service.mark_read(
        db,
        notice=notice,
        user=user,
        source_channel=context.source_channel,
        offline_captured_at=_parse(context.captured_offline_at),
    )
    return {
        "read_at": recipient.read_at,
        "state": recipient.state,
    }


@router.post("/notices/{notice_id}/acknowledge")
def acknowledge(notice_id: int, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTICE_READ)
    notice = _notice_or_404(db, user, notice_id)
    recipient = notice_service.acknowledge(db, notice=notice, user=user)
    return {"acknowledged_at": recipient.acknowledged_at, "state": recipient.state}


@router.post("/notices/{notice_id}/action")
def complete_action(notice_id: int, payload: NoticeActionRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTICE_READ)
    notice = _notice_or_404(db, user, notice_id)
    action = notice_service.complete_action(
        db,
        notice=notice,
        user=user,
        action_type=payload.action_type,
        case_id=payload.case_id,
        payload=payload.payload,
    )
    return {"action_type": action.action_type, "completed_at": action.completed_at}


@router.post("/notices/{notice_id}/share")
def share_notice(notice_id: int, payload: NoticeShareRequest, db: DbSession, user: CurrentUser):
    assert_permission(user, NOTICE_SHARE)
    supported_channels = {"COPY_LINK", "NATIVE_SHARE", "QR", "INTERNAL"}
    if payload.channel not in supported_channels:
        raise ValidationError("Unsupported share channel.")
    notice = _notice_or_404(db, user, notice_id)
    share = notice_service.share_notice(db, notice=notice, actor=user, channel=payload.channel)
    return {
        "share_token": share.token,
        "share_url": f"/shared/notices/{share.token}",
        "channel": share.channel,
        "note": (
            "External messaging integrations are not configured in this deployment. "
            "Use Copy Link or the native Web Share sheet."
        ),
        "integration_disclosure": "No WhatsApp/Telegram integration is configured or claimed.",
    }


@router.get("/notices/{notice_id}/analytics")
def notice_analytics(db: DbSession, user: CurrentUser, notice_id: int):
    assert_permission(user, NOTICE_ANALYTICS)
    notice = _notice_or_404(db, user, notice_id)
    return notice_service.analytics(db, notice=notice)


@router.get("/notices/{notice_id}/recipients")
def notice_recipients(db: DbSession, user: CurrentUser, notice_id: int, limit: int = Query(default=100, le=500)):
    """Who read or ignored a notice. Visible to authoring roles only."""
    assert_permission(user, NOTICE_ANALYTICS)
    notice = _notice_or_404(db, user, notice_id)
    rows = db.execute(
        select(NoticeRecipient, User.full_name, Role.key)
        .join(User, User.id == NoticeRecipient.user_id)
        .join(Role, Role.id == User.role_id)
        .where(NoticeRecipient.notice_id == notice.id)
        .order_by(NoticeRecipient.read_at.desc().nullslast())
        .limit(limit)
    ).all()
    return {
        "notice_id": notice.id,
        "recipients": [
            {
                "user_id": recipient.user_id,
                "name": name,
                "role": role_key,
                "delivered_at": recipient.delivered_at,
                "read_at": recipient.read_at,
                "acknowledged_at": recipient.acknowledged_at,
                "action_completed_at": recipient.action_completed_at,
            }
            for recipient, name, role_key in rows
        ],
    }


@router.get("/public/notices/{token}")
def public_notice(db: DbSession, token: str):
    """Public-safe notice view. No authentication, no student data."""
    return notice_service.public_notice_view(db, token=token)


def _notice_or_404(db, user, notice_id: int) -> Notice:
    from app.core.errors import NotFoundError

    notice = db.get(Notice, notice_id)
    if notice is None or notice.campus_id != user.campus_id:
        raise NotFoundError("Notice not found.")
    return notice


def _parse(value: str | None):
    from datetime import datetime

    if not value:
        return None
    try:
        return clock.ensure_aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None
