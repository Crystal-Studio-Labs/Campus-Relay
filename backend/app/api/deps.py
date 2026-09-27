"""Shared FastAPI dependencies: authentication, authorization, request context."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AuthError, PermissionDeniedError
from app.core.security import decode_access_token
from app.models import User
from app.models.enums import SourceChannel


@dataclass
class ClientContext:
    """Everything the server needs to attribute an action honestly."""

    source_channel: str = SourceChannel.PWA.value
    device_uid: str | None = None
    idempotency_key: str | None = None
    user_agent: str | None = None
    captured_offline_at: str | None = None


def get_client_context(
    x_source_channel: Annotated[str | None, Header(alias="X-Source-Channel")] = None,
    x_device_uid: Annotated[str | None, Header(alias="X-Device-Uid")] = None,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    captured_offline_at: Annotated[str | None, Header(alias="X-Captured-Offline-At")] = None,
    request: Request = None,  # type: ignore[assignment]
) -> ClientContext:
    channel = (x_source_channel or SourceChannel.PWA.value).upper()
    valid = {c.value for c in SourceChannel}
    if channel not in valid:
        channel = SourceChannel.PWA.value
    return ClientContext(
        source_channel=channel,
        device_uid=x_device_uid,
        idempotency_key=idempotency_key,
        user_agent=request.headers.get("user-agent") if request is not None else None,
        captured_offline_at=captured_offline_at,
    )


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Sign-in required.")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    token = _bearer_token(authorization)
    try:
        payload = decode_access_token(token)
    except Exception as exc:  # noqa: BLE001 - any decode failure is unauthenticated
        raise AuthError("Session expired or invalid. Please sign in again.") from exc

    user = db.get(User, int(payload.get("uid", 0)))
    if user is None or not user.is_active:
        raise AuthError("Account is not active.")
    if user.campus_id != int(payload.get("cid", user.campus_id)):
        # Token was minted for another tenant.
        raise AuthError("Session is not valid for this campus.")
    return user


def require_permission(*required: str):
    """Dependency factory: caller must hold every listed permission."""

    def _dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        held = user.permission_keys()
        missing = [p for p in required if p not in held]
        if missing:
            raise PermissionDeniedError(
                "Your role does not allow this action.",
                details={"missing_permissions": missing},
            )
        return user

    return _dependency


def assert_permission(user: User, *required: str) -> None:
    """Imperative check for use inside services (agents, sync replay)."""
    held = user.permission_keys()
    missing = [p for p in required if p not in held]
    if missing:
        raise PermissionDeniedError(
            "Your role does not allow this action.",
            details={"missing_permissions": missing},
        )


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]
RequestContext = Annotated[ClientContext, Depends(get_client_context)]
