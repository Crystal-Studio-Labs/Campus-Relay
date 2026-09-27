"""Campus organisational structure: departments, branches, batches, hostels, locations, assets."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SurrogateIdMixin, TimestampMixin, enum_check
from app.models.enums import AssetState, LocationKind


class Campus(Base, SurrogateIdMixin, TimestampMixin):
    """Tenant root. Every campus-owned row carries campus_id."""

    __tablename__ = "campuses"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Kolkata")
    default_language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Department(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("campus_id", "code", name="uq_department_campus_code"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="ACADEMIC")
    head_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True, name="fk_department_head_user"),
        nullable=True,
    )
    sla_multiplier: Mapped[float] = mapped_column(nullable=False, default=1.0)


class Branch(Base, SurrogateIdMixin, TimestampMixin):
    """Academic branch/programme, e.g. CSE, ECE."""

    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("campus_id", "code", name="uq_branch_campus_code"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(24), nullable=False)


class AcademicYear(Base, SurrogateIdMixin, TimestampMixin):
    """Study year, e.g. 1st Year. Table named `years` per the data model spec."""

    __tablename__ = "years"
    __table_args__ = (UniqueConstraint("campus_id", "name", name="uq_year_campus_name"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)


class Batch(Base, SurrogateIdMixin, TimestampMixin):
    """Admission batch, e.g. 2023-2027."""

    __tablename__ = "batches"
    __table_args__ = (UniqueConstraint("campus_id", "name", name="uq_batch_campus_name"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    end_year: Mapped[int] = mapped_column(Integer, nullable=False)


class Hostel(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "hostels"
    __table_args__ = (UniqueConstraint("campus_id", "code", name="uq_hostel_campus_code"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    gender: Mapped[str] = mapped_column(String(12), nullable=False, default="MIXED")
    warden_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class Block(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("hostel_id", "code", name="uq_block_hostel_code"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hostel_id: Mapped[int] = mapped_column(
        ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str] = mapped_column(String(16), nullable=False)


class Room(Base, SurrogateIdMixin, TimestampMixin):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("block_id", "number", name="uq_room_block_number"),)

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hostel_id: Mapped[int] = mapped_column(
        ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    block_id: Mapped[int] = mapped_column(
        ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(16), nullable=False)
    floor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    occupant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Location(Base, SurrogateIdMixin, TimestampMixin):
    """A scannable, reportable place on campus.

    `code` is the QR payload. It intentionally contains no personal data:
    it is a stable, non-guessable-in-practice operational identifier.
    """

    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_location_campus_code"),
        enum_check("kind", LocationKind),
        Index("ix_locations_campus_kind", "campus_id", "kind"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=LocationKind.OTHER.value)
    building: Mapped[str | None] = mapped_column(String(80))
    hostel_id: Mapped[int | None] = mapped_column(ForeignKey("hostels.id", ondelete="SET NULL"))
    block_id: Mapped[int | None] = mapped_column(ForeignKey("blocks.id", ondelete="SET NULL"))
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    qr_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    hostel: Mapped[Hostel | None] = relationship(lazy="joined")
    room: Mapped[Room | None] = relationship(lazy="joined")
    department: Mapped[Department | None] = relationship(lazy="joined")


class Asset(Base, SurrogateIdMixin, TimestampMixin):
    """Physical asset with operational history (see recurring-issue detection)."""

    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_asset_campus_code"),
        enum_check("state", AssetState),
        Index("ix_assets_campus_location", "campus_id", "location_id"),
    )

    campus_id: Mapped[int] = mapped_column(
        ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(48), nullable=False, default="GENERAL")
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    state: Mapped[str] = mapped_column(String(24), nullable=False, default=AssetState.OPERATIONAL.value)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    location: Mapped[Location | None] = relationship(lazy="joined")
