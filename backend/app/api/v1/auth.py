"""Authentication endpoints."""

from typing import Annotated

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, RequestContext
from app.api.serializers import user_profile
from app.api.v1.schemas import LoginRequest
from app.core.config import settings
from app.core.errors import AuthError
from app.core.security import create_access_token, verify_password
from app.models import Role, User
from app.models.enums import AuditEventType, RoleKey
from app.services import audit, clock

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(payload: LoginRequest, db: DbSession, context: RequestContext):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        audit.record_audit(
            db,
            event_type=AuditEventType.AUTH_FAILED.value,
            campus_id=user.campus_id if user else None,
            entity_type="USER",
            entity_id=user.id if user else None,
            source_channel=context.source_channel,
            device_uid=context.device_uid,
            payload={"email_present": bool(payload.email), "reason": "invalid_credentials"},
        )
        db.commit()
        raise AuthError("Email or password is incorrect.")

    user.last_login_at = clock.now()
    token = create_access_token(
        subject=user.email,
        user_id=user.id,
        role=user.role_key,
        campus_id=user.campus_id,
    )
    audit.record_audit(
        db,
        event_type=AuditEventType.AUTH_LOGIN.value,
        campus_id=user.campus_id,
        actor=user,
        entity_type="USER",
        entity_id=user.id,
        source_channel=context.source_channel,
        device_uid=context.device_uid,
        payload={"role": user.role_key},
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_minutes": settings.access_token_expire_minutes,
        "profile": user_profile(db, user),
    }


@router.get("/auth/me")
def me(db: DbSession, user: CurrentUser):
    return user_profile(db, user)


@router.get("/auth/demo-accounts")
def demo_accounts(db: DbSession):
    """DEMO DATA: the seeded accounts, so judges can sign in without a handout.

    Only available when the deployment is in development/demo mode.
    """
    if not settings.is_demo_mode:
        raise AuthError("Demo accounts are not exposed in this deployment.")

    from app.seed.seed_data import DEMO_ACCOUNTS

    return {
        "note": "DEMO DATA - these credentials exist only in the seeded demo campus.",
        "accounts": DEMO_ACCOUNTS,
        "roles": [r.key for r in db.scalars(select(Role).order_by(Role.id)).all()],
    }


@router.get("/auth/roles")
def roles(db: DbSession, user: CurrentUser):
    if user.role_key not in {RoleKey.ADMIN.value, RoleKey.SUPER_ADMIN.value}:
        raise AuthError("Only administrators can list roles.")
    return {
        "roles": [
            {
                "key": role.key,
                "name": role.name,
                "description": role.description,
                "permissions": sorted(p.key for p in role.permissions),
            }
            for role in db.scalars(select(Role).order_by(Role.id)).all()
        ]
    }
