"""Identity and access: users, roles, permissions, student/staff profiles, devices."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import RoleKey


class Role(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "roles"
    __table_args__ = (enum_check("key", RoleKey, "ck_roles_key"),)

    key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(String(240))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    permissions: Mapped[list["Permission"]] = relationship(
        secondary="role_permissions", lazy="selectin"
    )


class Permission(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="general")
    description: Mapped[str | None] = mapped_column(String(240))


class RolePermission(Base, TimestampMixin):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )


class User(Base, SurrogateIdMixin, TimestampMixin):
    """Authentication principal. One row per human (or service) identity."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("campus_id", "email", name="uq_user_campus_email"),
        Index("ix_users_campus_role", "campus_id", "role_id"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(180), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(24))
    # Optional external-messaging endpoints. Empty means the channel reports
    # "no recipient" rather than silently pretending to deliver.
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64))
    whatsapp_number: Mapped[str | None] = mapped_column(String(24))
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role] = relationship(lazy="joined")
    campus: Mapped["Campus"] = relationship(lazy="joined")  # noqa: F821
    student: Mapped["Student | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )
    staff: Mapped["Staff | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )

    @property
    def role_key(self) -> str:
        return self.role.key if self.role else ""

    def permission_keys(self) -> set[str]:
        return {p.key for p in self.role.permissions} if self.role else set()


class Student(Base, SurrogateIdMixin, TimestampMixin):
    """Student profile. Kept separate from User so non-app users are representable."""

    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("campus_id", "roll_number", name="uq_student_campus_roll"),
        UniqueConstraint("user_id", name="uq_student_user"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False)
    registration_number: Mapped[str | None] = mapped_column(String(48))
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    year_id: Mapped[int | None] = mapped_column(ForeignKey("years.id", ondelete="SET NULL"))
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id", ondelete="SET NULL"))
    hostel_id: Mapped[int | None] = mapped_column(ForeignKey("hostels.id", ondelete="SET NULL"))
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"))
    is_hosteller: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    guardian_phone: Mapped[str | None] = mapped_column(String(24))
    dues_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dues_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_smartphone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User | None] = relationship(back_populates="student", lazy="joined")
    branch: Mapped["Branch | None"] = relationship(lazy="joined")  # noqa: F821
    year: Mapped["AcademicYear | None"] = relationship(lazy="joined")  # noqa: F821
    batch: Mapped["Batch | None"] = relationship(lazy="joined")  # noqa: F821
    hostel: Mapped["Hostel | None"] = relationship(lazy="joined")  # noqa: F821
    room: Mapped["Room | None"] = relationship(lazy="joined")  # noqa: F821

    @property
    def dues_balance(self) -> int:
        return max(self.dues_amount - self.dues_paid, 0)


class Staff(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "staff"
    __table_args__ = (UniqueConstraint("user_id", name="uq_staff_user"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    designation: Mapped[str] = mapped_column(String(80), nullable=False, default="Technician")
    employee_code: Mapped[str | None] = mapped_column(String(32))
    skills: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    workload_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User] = relationship(back_populates="staff", lazy="joined")
    department: Mapped["Department | None"] = relationship(lazy="joined")  # noqa: F821


class Device(Base, SurrogateIdMixin, TimestampMixin):
    """Client install identity + push subscription, used by the sync engine."""

    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("user_id", "device_uid", name="uq_device_user_uid"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_uid: Mapped[str] = mapped_column(String(80), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False, default="web")
    user_agent: Mapped[str | None] = mapped_column(String(300))
    push_subscription: Mapped[dict | None] = mapped_column(JSONB)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
