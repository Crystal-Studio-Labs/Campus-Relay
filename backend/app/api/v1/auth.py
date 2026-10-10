"""Authentication endpoints."""

from typing import Annotated

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, RequestContext
from app.api.serializers import user_profile
from app.api.v1.schemas import LoginRequest
from app.core.config import settings
from app.core.errors import AuthError, PermissionDeniedError, RateLimitedError
from app.core.ratelimit import LOGIN_ATTEMPT_RULE, SlidingWindowLimiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Role, User
from app.models.enums import AuditEventType, RoleKey
from app.services import audit, clock

router = APIRouter(tags=["auth"])

# A real bcrypt hash to verify against when the email is unknown. Without it the
# response for an unknown address returns before any hashing work, and that
# timing difference is enough to enumerate which addresses have accounts. The
# cost of one bcrypt check is paid either way.
_UNKNOWN_ACCOUNT_HASH = hash_password("a-password-that-is-never-valid")

# Attempts per email address. An address-keyed limit can be diluted by attacking
# from many source addresses; an account-keyed one cannot, which is why this is
# the real brute-force control. Bounded, like the request limiter, so a flood of
# invented addresses cannot grow the table without limit.
_login_attempts = SlidingWindowLimiter(max_keys=10_000)


def _email_key(email: str) -> str:
    return "email:" + (email or "").strip().lower()[:180]


@router.post("/auth/login")
def login(payload: LoginRequest, db: DbSession, context: RequestContext):
    email = payload.email.strip().lower()
    key = _email_key(email)
    allowed, retry_after = _login_attempts.check(key, LOGIN_ATTEMPT_RULE)
    if not allowed:
        # Deliberately the same shape for a real and an invented address, so a
        # throttle does not confirm that the address exists.
        raise RateLimitedError(
            "Too many sign-in attempts for this account. Please wait and try again.",
            details={"retry_after_seconds": retry_after},
        )

    user = db.scalar(select(User).where(User.email == email))
    password_ok = verify_password(
        payload.password, user.password_hash if user is not None else _UNKNOWN_ACCOUNT_HASH
    )
    if user is None or not user.is_active or not password_ok:
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

    # A successful sign-in clears the account's attempt history, so someone who
    # mistyped their password is not left throttled after getting in.
    _login_attempts.clear(key)
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
    if user.role_key != RoleKey.MANAGEMENT.value:
        raise PermissionDeniedError("Only the management role can list roles.")
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
