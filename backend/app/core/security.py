"""Password hashing, JWT issuing and secure code generation."""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

# bcrypt silently truncates at 72 bytes. Pre-hashing with SHA-256 + base64 keeps
# the full entropy of long passphrases while staying inside the limit.
_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    *,
    subject: str,
    user_id: int,
    role: str,
    campus_id: int,
    expires_minutes: int | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "uid": user_id,
        "role": role,
        "cid": campus_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": "campus-relay",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.app_secret_key,
        algorithms=[settings.jwt_algorithm],
        issuer="campus-relay",
    )


def new_idempotency_key(prefix: str = "op") -> str:
    return f"{prefix}_{secrets.token_urlsafe(18)}"


def new_code(length: int = 8, alphabet: str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") -> str:
    """Human-transcribable code (no confusing 0/O/1/I). Used for passes/serials."""
    return "".join(secrets.choice(alphabet) for _ in range(length))


def new_token(length: int = 24) -> str:
    return secrets.token_urlsafe(length)


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
