"""Declarative base, shared mixins and schema helpers."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, CheckConstraint, Integer, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    """Timezone-aware UTC now. All timestamps in Campus Relay are UTC."""
    return datetime.now(timezone.utc)


def enum_check(column: str, enum_cls, name: str | None = None) -> CheckConstraint:
    """Build a CHECK constraint listing the allowed values of a StrEnum.

    Keeps the database honest without native PG enum types, which are painful
    to extend in later migrations.
    """
    values = ", ".join(f"'{member.value}'" for member in enum_cls)
    constraint_name = name or f"ck_{column}"
    return CheckConstraint(f"{column} IN ({values})", name=constraint_name)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SurrogateIdMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
