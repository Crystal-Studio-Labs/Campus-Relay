"""Notice system.

Notices are targeted broadcasts with a lifecycle and per-recipient tracking:
sent -> delivered -> read -> acknowledged -> actioned.

Audience semantics (documented because it matters):
  * selectors of the same type are ORed  (3rd Year OR 4th Year)
  * selectors of different types are ANDed (CSE AND Hostel B)
So "3rd Year + CSE + Hostel B" means exactly those students.
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.security import new_token
from app.models import (
    AcademicYear,
    Batch,
    Block,
    Branch,
    Case,
    Department,
    Hostel,
    Notice,
    NoticeAction,
    NoticeRecipient,
    NoticeShare,
    NoticeTarget,
    Role,
    Room,
    Staff,
    Student,
    User,
)
from app.models.enums import (
    AuditEventType,
    NotificationCategory,
    NotificationState,
    NoticeActionType,
    NoticeStatus,
    NoticeTargetType,
    NoticeType,
    Priority,
    RoleKey,
)
from app.services import audit, clock, notifications

URGENT_TYPES = {NoticeType.URGENT.value, NoticeType.EMERGENCY.value}

# Types that imply an acknowledgement requirement unless explicitly overridden.
ACK_BY_DEFAULT = {NoticeType.URGENT.value, NoticeType.EMERGENCY.value}


@dataclass
class NoticeDraft:
    title: str
    content: str
    notice_type: str = NoticeType.NORMAL.value
    category: str = "GENERAL"
    summary: str | None = None
    priority: str | None = None
    publish_at: datetime | None = None
    expires_at: datetime | None = None
    acknowledgement_required: bool | None = None
    required_action: str | None = None
    required_action_label: str | None = None
    is_pinned: bool = False
    share_enabled: bool = False
    attachment_path: str | None = None
    attachment_name: str | None = None
    image_path: str | None = None
    targets: list[dict] = field(default_factory=list)


def _audience_query(
    db: Session,
    *,
    campus_id: int,
    target_type: str,
    target_id: int | None,
    target_value: str | None = None,
):
    """Return the set of user ids matched by one selector.

    Most selectors are keyed by row id. ROLE is keyed by the role's string key
    (e.g. "STUDENT"), which is why `target_value` exists alongside `target_id`.
    """
    if target_type == NoticeTargetType.CAMPUS.value:
        return set(
            db.scalars(select(User.id).where(User.campus_id == campus_id, User.is_active.is_(True))).all()
        )
    if target_type == NoticeTargetType.ROLE.value:
        role_key = target_value or (str(target_id) if target_id is not None else None)
        if not role_key:
            return set()
        return set(
            db.scalars(
                select(User.id)
                .join(Role, Role.id == User.role_id)
                .where(User.campus_id == campus_id, User.is_active.is_(True), Role.key == role_key)
            ).all()
        )
    if target_type == NoticeTargetType.USER.value:
        user = db.get(User, target_id) if target_id is not None else None
        return {user.id} if user and user.campus_id == campus_id else set()
    if target_type == NoticeTargetType.DEPARTMENT.value:
        student_users = db.scalars(
            select(User.id)
            .join(Student, Student.user_id == User.id)
            .join(Branch, Branch.id == Student.branch_id)
            .where(Branch.department_id == target_id, User.is_active.is_(True))
        ).all()
        staff_users = db.scalars(
            select(User.id)
            .join(Staff, Staff.user_id == User.id)
            .where(Staff.department_id == target_id, User.is_active.is_(True))
        ).all()
        return set(student_users) | set(staff_users)
    if target_type == NoticeTargetType.BRANCH.value:
        return set(
            db.scalars(
                select(User.id)
                .join(Student, Student.user_id == User.id)
                .where(Student.branch_id == target_id, User.is_active.is_(True))
            ).all()
        )
    if target_type == NoticeTargetType.YEAR.value:
        return set(
            db.scalars(
                select(User.id)
                .join(Student, Student.user_id == User.id)
                .where(Student.year_id == target_id, User.is_active.is_(True))
            ).all()
        )
    if target_type == NoticeTargetType.BATCH.value:
        return set(
            db.scalars(
                select(User.id)
                .join(Student, Student.user_id == User.id)
                .where(Student.batch_id == target_id, User.is_active.is_(True))
            ).all()
        )
    if target_type == NoticeTargetType.HOSTEL.value:
        students = db.scalars(
            select(User.id)
            .join(Student, Student.user_id == User.id)
            .where(Student.hostel_id == target_id, User.is_active.is_(True))
        ).all()
        wardens = db.scalars(
            select(User.id)
            .join(Hostel, Hostel.warden_user_id == User.id)
            .where(Hostel.id == target_id, User.is_active.is_(True))
        ).all()
        return set(students) | set(wardens)
    if target_type == NoticeTargetType.BLOCK.value:
        return set(
            db.scalars(
                select(User.id)
                .join(Student, Student.user_id == User.id)
                .join(Room, Room.id == Student.room_id)
                .where(Room.block_id == target_id, User.is_active.is_(True))
            ).all()
        )
    raise ValidationError(f"Unsupported notice target type '{target_type}'.")


def resolve_audience(db: Session, *, campus_id: int, targets: list[dict]) -> set[int]:
    if not targets:
        return set(
            db.scalars(select(User.id).where(User.campus_id == campus_id, User.is_active.is_(True))).all()
        )

    grouped: dict[str, set[int]] = {}
    for target in targets:
        t_type = target.get("target_type")
        t_id = target.get("target_id")
        if target.get("include") is False:
            continue
        ids = _audience_query(
            db,
            campus_id=campus_id,
            target_type=t_type,
            target_id=t_id,
            target_value=target.get("target_value"),
        )
        grouped.setdefault(t_type, set()).update(ids)

    if not grouped:
        return set()
    audience: set[int] | None = None
    for ids in grouped.values():
        audience = ids if audience is None else audience & ids
    return audience or set()


def _describe_targets(db: Session, targets: list[dict]) -> str:
    labels: list[str] = []
    for target in targets:
        t_type = target.get("target_type")
        t_id = target.get("target_id")
        if t_type == NoticeTargetType.CAMPUS.value:
            labels.append("Entire campus")
        elif t_type == NoticeTargetType.ROLE.value:
            labels.append(f"Role: {target.get('target_value') or t_id}")
        elif t_type == NoticeTargetType.USER.value:
            user = db.get(User, t_id) if t_id else None
            labels.append(user.full_name if user else "Selected user")
        else:
            model = {
                NoticeTargetType.DEPARTMENT.value: Department,
                NoticeTargetType.BRANCH.value: Branch,
                NoticeTargetType.YEAR.value: AcademicYear,
                NoticeTargetType.BATCH.value: Batch,
                NoticeTargetType.HOSTEL.value: Hostel,
                NoticeTargetType.BLOCK.value: Block,
            }.get(t_type)
            entity = db.get(model, t_id) if model and t_id else None
            labels.append(getattr(entity, "name", f"{t_type} {t_id}") if entity else f"{t_type} {t_id}")
    return ", ".join(labels)[:240]


def create_notice(db: Session, *, actor: User, draft: NoticeDraft) -> Notice:
    if not draft.title.strip() or not draft.content.strip():
        raise ValidationError("A notice needs a title and content.")

    notice_type = draft.notice_type
    if notice_type not in {t.value for t in NoticeType}:
        raise ValidationError("Unknown notice type.")

    publish_at = clock.ensure_aware(draft.publish_at)
    expires_at = clock.ensure_aware(draft.expires_at)
    if publish_at and expires_at and expires_at <= publish_at:
        raise ValidationError("Expiry must be after the publish time.")

    acknowledgement = (
        draft.acknowledgement_required
        if draft.acknowledgement_required is not None
        else notice_type in ACK_BY_DEFAULT
    )
    priority = draft.priority or (
        Priority.CRITICAL.value if notice_type == NoticeType.EMERGENCY.value
        else Priority.HIGH.value if notice_type == NoticeType.URGENT.value
        else Priority.NORMAL.value
    )

    # No publish time means "publish now" - the composer's primary action.
    # A future time schedules it; an explicit draft is a separate request.
    status = NoticeStatus.PUBLISHED.value
    if publish_at and publish_at > clock.now():
        status = NoticeStatus.SCHEDULED.value
    elif publish_at is None:
        publish_at = clock.now()

    notice = Notice(
        campus_id=actor.campus_id,
        title=draft.title.strip(),
        content=draft.content.strip(),
        summary=(draft.summary or draft.content.strip())[:300],
        notice_type=notice_type,
        status=status,
        priority=priority,
        category=draft.category,
        created_by_id=actor.id,
        publish_at=publish_at,
        expires_at=expires_at,
        published_at=clock.now() if status == NoticeStatus.PUBLISHED.value else None,
        acknowledgement_required=acknowledgement,
        required_action=draft.required_action,
        required_action_label=draft.required_action_label
        or (draft.required_action or "").replace("_", " ").title()
        or None,
        is_pinned=draft.is_pinned,
        share_enabled=draft.share_enabled,
        share_token=new_token(16) if draft.share_enabled else None,
        attachment_path=draft.attachment_path,
        attachment_name=draft.attachment_name,
        image_path=draft.image_path,
    )
    db.add(notice)
    db.flush()

    for target in draft.targets or []:
        raw_value = target.get("target_value")
        target_id = target.get("target_id")
        notice.targets.append(
            NoticeTarget(
                notice_id=notice.id,
                target_type=target["target_type"],
                target_id=target_id,
                target_value=(
                    str(raw_value)
                    if raw_value is not None
                    else (str(target_id) if target_id is not None else None)
                ),
                include=bool(target.get("include", True)),
                label=target.get("label"),
            )
        )

    notice.audience_summary = _describe_targets(db, draft.targets or [])
    db.flush()

    audit.record_audit(
        db,
        event_type=AuditEventType.NOTICE_PUBLISHED.value
        if status == NoticeStatus.PUBLISHED.value
        else "NOTICE_DRAFTED",
        campus_id=actor.campus_id,
        actor=actor,
        entity_type="NOTICE",
        entity_id=notice.id,
        payload={
            "title": notice.title[:120],
            "type": notice_type,
            "status": status,
            "audience": notice.audience_summary,
        },
    )

    if status == NoticeStatus.PUBLISHED.value:
        publish_notice(db, notice=notice, actor=actor, already_published=True)
    return notice


def notice_attachment_content_type(notice: Notice) -> str:
    """Best-effort media type from the stored attachment filename."""
    import mimetypes

    guess, _ = mimetypes.guess_type(notice.attachment_name or notice.attachment_path or "")
    return guess or "application/octet-stream"


def publish_notice(
    db: Session, *, notice: Notice, actor: User | None = None, already_published: bool = False
) -> dict:
    """Materialise the audience and fan out per-recipient delivery records."""
    if notice.status == NoticeStatus.ARCHIVED.value:
        raise ConflictError("An archived notice cannot be published.")

    audience_ids = resolve_audience(
        db,
        campus_id=notice.campus_id,
        targets=[
            {
                "target_type": t.target_type,
                "target_id": t.target_id,
                "target_value": t.target_value,
                "include": t.include,
            }
            for t in notice.targets
        ],
    )
    if not audience_ids:
        raise ValidationError("This notice targets nobody. Adjust the audience and retry.")

    users = list(
        db.scalars(
            select(User).where(User.id.in_(audience_ids), User.is_active.is_(True))
        ).all()
    )

    now = clock.now()
    if not already_published:
        notice.status = NoticeStatus.PUBLISHED.value
        notice.published_at = now

    existing_ids = set(
        db.scalars(select(NoticeRecipient.user_id).where(NoticeRecipient.notice_id == notice.id)).all()
    )

    delivered = 0
    for user in users:
        if user.id in existing_ids:
            continue
        recipient = NoticeRecipient(
            campus_id=notice.campus_id,
            notice_id=notice.id,
            user_id=user.id,
            state=NotificationState.DELIVERED.value,
            delivered_at=now,
        )
        db.add(recipient)
        delivered += 1

        notifications.create_notification(
            db,
            user=user,
            category=NotificationCategory.URGENT_ANNOUNCEMENT.value
            if notice.notice_type in URGENT_TYPES
            else NotificationCategory.NOTICE.value,
            title=notice.title,
            body=(notice.summary or notice.content)[:300],
            priority=notice.priority,
            action_label="Open notice",
            action_type="OPEN_NOTICE",
            action_target=f"/notices/{notice.id}",
            notice_id=notice.id,
            dedupe_key=f"notice:{notice.id}:{user.id}",
            # The attachment travels with the notification so an external channel
            # can send the circular itself (image/PDF), not just a text summary.
            payload={
                "notice_id": notice.id,
                "attachment_url": f"/api/v1/notices/{notice.id}/attachment",
                "attachment_name": notice.attachment_name,
                "attachment_type": notice_attachment_content_type(notice),
            }
            if notice.attachment_path
            else {"notice_id": notice.id},
            actor=actor,
        )

    if not already_published:
        audit.record_audit(
            db,
            event_type=AuditEventType.NOTICE_PUBLISHED.value,
            campus_id=notice.campus_id,
            actor=actor,
            actor_role=(actor.role_key if actor else RoleKey.ADMIN.value),
            entity_type="NOTICE",
            entity_id=notice.id,
            payload={
                "title": notice.title[:120],
                "type": notice.notice_type,
                "audience_size": len(users),
                "new_recipients": delivered,
            },
        )
    db.flush()
    return {"audience": len(users), "delivered": delivered}


def update_notice_status(
    db: Session, *, notice: Notice, actor: User, action: str, when: datetime | None = None
) -> Notice:
    now = clock.now()
    if action == "schedule":
        notice.status = NoticeStatus.SCHEDULED.value
        notice.publish_at = clock.ensure_aware(when) or notice.publish_at
    elif action == "publish":
        publish_notice(db, notice=notice, actor=actor)
    elif action == "expire":
        notice.status = NoticeStatus.EXPIRED.value
        notice.expires_at = now
    elif action == "archive":
        notice.status = NoticeStatus.ARCHIVED.value
        notice.archived_at = now
    elif action == "pin":
        notice.is_pinned = True
    elif action == "unpin":
        notice.is_pinned = False
    else:
        raise ValidationError(f"Unsupported notice action '{action}'.")

    audit.record_audit(
        db,
        event_type=f"NOTICE_{action.upper()}",
        campus_id=notice.campus_id,
        actor=actor,
        entity_type="NOTICE",
        entity_id=notice.id,
        payload={"status": notice.status},
    )
    return notice


def duplicate_notice(db: Session, *, notice: Notice, actor: User) -> Notice:
    """Reuse an existing notice as a fresh draft."""
    draft = NoticeDraft(
        title=f"{notice.title} (copy)",
        content=notice.content,
        notice_type=notice.notice_type,
        category=notice.category,
        summary=notice.summary,
        priority=notice.priority,
        acknowledgement_required=notice.acknowledgement_required,
        required_action=notice.required_action,
        required_action_label=notice.required_action_label,
        is_pinned=False,
        share_enabled=notice.share_enabled,
        attachment_path=notice.attachment_path,
        attachment_name=notice.attachment_name,
        image_path=notice.image_path,
        targets=[
            {
                "target_type": t.target_type,
                "target_id": t.target_id,
                "target_value": t.target_value,
                "include": t.include,
            }
            for t in notice.targets
        ],
    )
    return create_notice(db, actor=actor, draft=draft)


def mark_read(
    db: Session,
    *,
    notice: Notice,
    user: User,
    source_channel: str = "PWA",
    offline_captured_at: datetime | None = None,
) -> NoticeRecipient:
    recipient = db.scalar(
        select(NoticeRecipient).where(
            NoticeRecipient.notice_id == notice.id, NoticeRecipient.user_id == user.id
        )
    )
    now = clock.now()
    if recipient is None:
        recipient = NoticeRecipient(
            campus_id=notice.campus_id,
            notice_id=notice.id,
            user_id=user.id,
            state=NotificationState.SENT.value,
            delivered_at=now,
        )
        db.add(recipient)

    if recipient.read_at is None:
        recipient.read_at = now
        recipient.state = NotificationState.READ.value
        recipient.source_channel = source_channel
        recipient.offline_captured_at = offline_captured_at
        audit.record_audit(
            db,
            event_type=AuditEventType.NOTICE_READ.value,
            campus_id=notice.campus_id,
            actor=user,
            entity_type="NOTICE",
            entity_id=notice.id,
            source_channel=source_channel,
            payload={"offline_captured_at": offline_captured_at.isoformat() if offline_captured_at else None},
        )
    return recipient


def acknowledge(db: Session, *, notice: Notice, user: User) -> NoticeRecipient:
    recipient = mark_read(db, notice=notice, user=user)
    if recipient.acknowledged_at is None:
        recipient.acknowledged_at = clock.now()
        recipient.state = NotificationState.ACTIONED.value if recipient.action_completed_at else NotificationState.READ.value
        audit.record_audit(
            db,
            event_type=AuditEventType.NOTICE_ACKNOWLEDGED.value,
            campus_id=notice.campus_id,
            actor=user,
            entity_type="NOTICE",
            entity_id=notice.id,
            payload={"title": notice.title[:120]},
        )
    return recipient


def complete_action(
    db: Session,
    *,
    notice: Notice,
    user: User,
    action_type: str | None = None,
    case_id: int | None = None,
    payload: dict | None = None,
) -> NoticeAction:
    resolved_action = action_type or notice.required_action or NoticeActionType.READ.value
    if resolved_action not in {a.value for a in NoticeActionType}:
        raise ValidationError("Unknown notice action.")

    existing = db.scalar(
        select(NoticeAction).where(
            NoticeAction.notice_id == notice.id,
            NoticeAction.user_id == user.id,
            NoticeAction.action_type == resolved_action,
        )
    )
    if existing is not None:
        return existing

    action = NoticeAction(
        campus_id=notice.campus_id,
        notice_id=notice.id,
        user_id=user.id,
        action_type=resolved_action,
        case_id=case_id,
        payload=payload or {},
        completed_at=clock.now(),
    )
    db.add(action)

    recipient = mark_read(db, notice=notice, user=user)
    if recipient.action_completed_at is None:
        recipient.action_completed_at = clock.now()
        recipient.state = NotificationState.ACTIONED.value

    if case_id:
        from app.models import Case

        case = db.get(Case, case_id)
        if case is not None:
            from app.services import case_engine

            case_engine.add_comment(
                db,
                case=case,
                actor=user,
                body=f"Action '{resolved_action}' completed from notice: {notice.title}",
                visibility="PUBLIC",
            )
    return action


def share_notice(
    db: Session, *, notice: Notice, actor: User, channel: str = "COPY_LINK"
) -> NoticeShare:
    if not notice.share_enabled:
        raise ConflictError("This notice is not shareable.")
    if notice.status not in {NoticeStatus.PUBLISHED.value, NoticeStatus.SCHEDULED.value}:
        raise ConflictError("Only published notices can be shared.")

    share = NoticeShare(
        campus_id=notice.campus_id,
        notice_id=notice.id,
        shared_by_id=actor.id,
        channel=channel,
        token=notice.share_token or new_token(16),
    )
    if not notice.share_token:
        notice.share_token = share.token
    db.add(share)
    audit.record_audit(
        db,
        event_type=AuditEventType.NOTICE_SHARED.value,
        campus_id=notice.campus_id,
        actor=actor,
        entity_type="NOTICE",
        entity_id=notice.id,
        payload={"channel": channel},
    )
    return share


def public_notice_view(db: Session, *, token: str) -> dict:
    """Public-safe view: notice content only. No student or recipient data."""
    notice = db.scalar(select(Notice).where(Notice.share_token == token))
    if notice is None or not notice.share_enabled:
        raise NotFoundError("That notice link is no longer valid.")
    if notice.status == NoticeStatus.ARCHIVED.value:
        raise NotFoundError("That notice has been archived.")

    share = db.scalar(select(NoticeShare).where(NoticeShare.token == token))
    if share is not None:
        share.view_count += 1
        share.last_viewed_at = clock.now()

    return {
        "title": notice.title,
        "content": notice.content,
        "type": notice.notice_type,
        "category": notice.category,
        "published_at": notice.published_at,
        "expires_at": notice.expires_at,
    }


def analytics(db: Session, *, notice: Notice) -> dict:
    sent = int(
        db.scalar(select(func.count(NoticeRecipient.id)).where(NoticeRecipient.notice_id == notice.id)) or 0
    )
    delivered = int(
        db.scalar(
            select(func.count(NoticeRecipient.id)).where(
                NoticeRecipient.notice_id == notice.id, NoticeRecipient.delivered_at.is_not(None)
            )
        )
        or 0
    )
    read = int(
        db.scalar(
            select(func.count(NoticeRecipient.id)).where(
                NoticeRecipient.notice_id == notice.id, NoticeRecipient.read_at.is_not(None)
            )
        )
        or 0
    )
    acknowledged = int(
        db.scalar(
            select(func.count(NoticeRecipient.id)).where(
                NoticeRecipient.notice_id == notice.id, NoticeRecipient.acknowledged_at.is_not(None)
            )
        )
        or 0
    )
    actioned = int(
        db.scalar(
            select(func.count(NoticeRecipient.id)).where(
                NoticeRecipient.notice_id == notice.id, NoticeRecipient.action_completed_at.is_not(None)
            )
        )
        or 0
    )

    by_role_rows = db.execute(
        select(Role.key, func.count(NoticeRecipient.id))
        .join(User, User.id == NoticeRecipient.user_id)
        .join(Role, Role.id == User.role_id)
        .where(NoticeRecipient.notice_id == notice.id)
        .group_by(Role.key)
    ).all()

    return {
        "notice_id": notice.id,
        "status": notice.status,
        "type": notice.notice_type,
        "audience_summary": notice.audience_summary,
        "sent": sent,
        "delivered": delivered,
        "read": read,
        "acknowledged": acknowledged,
        "actioned": actioned,
        "pending": max(sent - read, 0),
        "read_rate": round(read / sent, 3) if sent else 0.0,
        "action_rate": round(actioned / sent, 3) if sent else 0.0,
        "acknowledgement_required": notice.acknowledgement_required,
        "by_role": {key: int(count) for key, count in by_role_rows},
    }


def pending_acknowledgements(db: Session, *, campus_id: int, user: User) -> list[dict]:
    """Notices this user still has to acknowledge (drives the 'action needed' badge)."""
    rows = db.execute(
        select(Notice.id, Notice.title, Notice.notice_type, Notice.publish_at)
        .join(NoticeRecipient, NoticeRecipient.notice_id == Notice.id)
        .where(
            Notice.campus_id == campus_id,
            NoticeRecipient.user_id == user.id,
            Notice.acknowledgement_required.is_(True),
            NoticeRecipient.acknowledged_at.is_(None),
        )
        .order_by(Notice.publish_at.desc())
    ).all()
    return [
        {"notice_id": row[0], "title": row[1], "notice_type": row[2], "publish_at": row[3]}
        for row in rows
    ]


def visible_notice_ids(db: Session, *, campus_id: int, user: User) -> set[int]:
    """Notices addressed to this user (materialised recipients only)."""
    return set(
        db.scalars(
            select(NoticeRecipient.notice_id).where(
                NoticeRecipient.campus_id == campus_id, NoticeRecipient.user_id == user.id
            )
        ).all()
    )


def expire_due_notices(db: Session, *, campus_id: int | None = None) -> dict:
    """Scheduled -> published, published -> expired, based on the clock.

    Returns what changed so the UI can report facts instead of guessing.
    """
    now = clock.now()
    publish_stmt = select(Notice).where(
        Notice.status == NoticeStatus.SCHEDULED.value, Notice.publish_at <= now
    )
    expire_stmt = select(Notice).where(
        Notice.status == NoticeStatus.PUBLISHED.value,
        Notice.expires_at.is_not(None),
        Notice.expires_at <= now,
    )
    if campus_id is not None:
        publish_stmt = publish_stmt.where(Notice.campus_id == campus_id)
        expire_stmt = expire_stmt.where(Notice.campus_id == campus_id)

    to_publish = list(db.scalars(publish_stmt).all())
    to_expire = list(db.scalars(expire_stmt).all())

    for notice in to_publish:
        publish_notice(db, notice=notice, actor=None)
    for notice in to_expire:
        notice.status = NoticeStatus.EXPIRED.value

    return {"published": len(to_publish), "expired": len(to_expire)}
