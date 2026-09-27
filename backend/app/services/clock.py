"""A single, overridable clock.

Demo mode needs to show SLA ageing and breaches without waiting hours, and tests
need determinism. Everything that needs "now" asks this module.
"""

from datetime import datetime, timedelta, timezone

_offset: timedelta = timedelta(0)


def now() -> datetime:
    return datetime.now(timezone.utc) + _offset


def set_offset(delta: timedelta) -> None:
    """Shift perceived time forward (used by demo tooling and tests)."""
    global _offset
    _offset = delta


def reset() -> None:
    global _offset
    _offset = timedelta(0)


def current_offset() -> timedelta:
    return _offset


def ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def minutes_until(target: datetime | None) -> float | None:
    target = ensure_aware(target)
    if target is None:
        return None
    return (target - now()).total_seconds() / 60.0


def minutes_since(value: datetime | None) -> float | None:
    value = ensure_aware(value)
    if value is None:
        return None
    return (now() - value).total_seconds() / 60.0
