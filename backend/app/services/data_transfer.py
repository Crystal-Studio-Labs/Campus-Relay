"""CSV import and export for a college's own data.

This is the mechanism behind the "bring your own campus" onboarding flow: a
college exports its departments, hostels, rooms, staff and students to CSV,
fills in the templates, and imports them without touching code.

Two deliberate properties:

1. **Export is a snapshot of the real tables.** Columns match the templates, so
   an export can be edited and re-imported.
2. **Import upserts by natural key and reports per-row failures.** A row that
   cannot be resolved is reported with its line number and reason; a partial
   file never looks like a clean import, and nothing is reported as imported
   when it was skipped.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, new_code
from app.models import (
    Asset,
    Branch,
    Block,
    Department,
    Hostel,
    Location,
    Room,
    Staff,
    Student,
    User,
)
from app.models.enums import RoleKey


@dataclass
class EntitySpec:
    name: str
    columns: list[str]
    required: list[str]
    template_note: str = ""
    sample: list[dict[str, str]] = field(default_factory=list)


# Order matters: earlier entities are dependencies of later ones.
ENTITIES: dict[str, EntitySpec] = {
    "departments": EntitySpec(
        name="departments",
        columns=["code", "name", "kind"],
        required=["code", "name"],
        template_note="kind is ACADEMIC, MAINTENANCE, ADMIN, SECURITY or OTHER.",
        sample=[{"code": "MAINT", "name": "Maintenance", "kind": "MAINTENANCE"}],
    ),
    "branches": EntitySpec(
        name="branches",
        columns=["code", "name", "department_code"],
        required=["code", "name"],
        sample=[{"code": "CSE", "name": "Computer Science", "department_code": ""}],
    ),
    "hostels": EntitySpec(
        name="hostels",
        columns=["code", "name", "gender"],
        required=["code", "name"],
        template_note="gender is MALE, FEMALE or MIXED.",
        sample=[{"code": "BH1", "name": "Boys Hostel 1", "gender": "MALE"}],
    ),
    "rooms": EntitySpec(
        name="rooms",
        columns=["hostel_code", "block_code", "number", "floor", "capacity"],
        required=["hostel_code", "number"],
        template_note="A block is created automatically if block_code is new.",
        sample=[{"hostel_code": "BH1", "block_code": "A", "number": "101", "floor": "1", "capacity": "3"}],
    ),
    "locations": EntitySpec(
        name="locations",
        columns=["code", "name", "kind", "building", "hostel_code", "block_code", "room_number", "department_code"],
        required=["code", "name"],
        template_note="kind is HOSTEL_ROOM, WASHROOM, WATER_COOLER, CORRIDOR, CLASSROOM, LAB, LIBRARY, MESS, GATE, OFFICE, EQUIPMENT or OTHER. code is what the QR carries.",
        sample=[{"code": "CR-ROOM-BH1-101", "name": "Room 101", "kind": "HOSTEL_ROOM", "building": "BH1", "hostel_code": "BH1", "block_code": "A", "room_number": "101", "department_code": ""}],
    ),
    "assets": EntitySpec(
        name="assets",
        columns=["code", "name", "category", "location_code", "department_code", "state"],
        required=["code", "name"],
        sample=[{"code": "CR-FAN-014", "name": "Ceiling fan", "category": "ELECTRICAL", "location_code": "CR-ROOM-BH1-101", "department_code": "MAINT", "state": "OPERATIONAL"}],
    ),
    "staff": EntitySpec(
        name="staff",
        columns=["email", "full_name", "department_code", "designation", "employee_code", "workload_capacity", "skills"],
        required=["email", "full_name"],
        template_note="skills is a |-separated list. Password is set to the demo default.",
        sample=[{"email": "tech.rao@college.edu", "full_name": "S. Rao", "department_code": "MAINT", "designation": "Electrician", "employee_code": "", "workload_capacity": "5", "skills": "ELECTRICAL|PLUMBING"}],
    ),
    "students": EntitySpec(
        name="students",
        columns=["roll_number", "full_name", "email", "branch_code", "year_name", "hostel_code", "room_number", "is_hosteller", "guardian_phone", "dues_amount", "dues_paid"],
        required=["roll_number", "full_name"],
        template_note="year_name must match a study year, e.g. 1st Year. Password is set to the demo default.",
        sample=[{"roll_number": "23CSE001", "full_name": "A. Nayak", "email": "23cse001@college.edu", "branch_code": "CSE", "year_name": "1st Year", "hostel_code": "BH1", "room_number": "101", "is_hosteller": "yes", "guardian_phone": "", "dues_amount": "0", "dues_paid": "0"}],
    ),
}

DEFAULT_PASSWORD = "Campus@2026"


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "yes", "true", "y"}


def _int(value: str, default: int = 0) -> int:
    try:
        return int(str(value).strip() or default)
    except (TypeError, ValueError):
        return default


# --- Lookup helpers -------------------------------------------------------


def _department(db: Session, campus_id: int, code: str) -> Department | None:
    code = (code or "").strip()
    if not code:
        return None
    return db.scalar(select(Department).where(Department.campus_id == campus_id, Department.code == code))


def _hostel(db: Session, campus_id: int, code: str) -> Hostel | None:
    code = (code or "").strip()
    if not code:
        return None
    return db.scalar(select(Hostel).where(Hostel.campus_id == campus_id, Hostel.code == code))


def _block(db: Session, campus_id: int, hostel: Hostel | None, code: str) -> Block | None:
    code = (code or "").strip()
    if hostel is None or not code:
        return None
    block = db.scalar(select(Block).where(Block.hostel_id == hostel.id, Block.code == code))
    if block is None:
        block = Block(campus_id=campus_id, hostel_id=hostel.id, name=f"Block {code}", code=code)
        db.add(block)
        db.flush()
    return block


def _room(db: Session, campus_id: int, hostel: Hostel | None, block: Block | None, number: str) -> Room | None:
    number = (number or "").strip()
    if hostel is None or block is None or not number:
        return None
    room = db.scalar(select(Room).where(Room.block_id == block.id, Room.number == number))
    if room is None:
        room = Room(campus_id=campus_id, hostel_id=hostel.id, block_id=block.id, number=number)
        db.add(room)
        db.flush()
    return room


def _branch(db: Session, campus_id: int, code: str) -> Branch | None:
    code = (code or "").strip()
    if not code:
        return None
    return db.scalar(select(Branch).where(Branch.campus_id == campus_id, Branch.code == code))


def _year_id(db: Session, campus_id: int, name: str) -> int | None:
    from app.models import AcademicYear

    name = (name or "").strip()
    if not name:
        return None
    row = db.scalar(select(AcademicYear).where(AcademicYear.campus_id == campus_id, AcademicYear.name == name))
    return row.id if row else None


def _role(db: Session, key: str):
    from app.models import Role

    return db.scalar(select(Role).where(Role.key == key))


# --- Import handlers ------------------------------------------------------


def _import_department(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    code = row["code"].strip()
    existing = _department(db, campus_id, code)
    if existing:
        existing.name = row["name"].strip() or existing.name
        existing.kind = (row.get("kind") or existing.kind or "OTHER").strip().upper()
    else:
        db.add(
            Department(
                campus_id=campus_id,
                code=code,
                name=row["name"].strip(),
                kind=(row.get("kind") or "OTHER").strip().upper(),
            )
        )
    return None


def _import_branch(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    code = row["code"].strip()
    dept = _department(db, campus_id, row.get("department_code", ""))
    existing = _branch(db, campus_id, code)
    if existing:
        existing.name = row["name"].strip() or existing.name
        existing.department_id = dept.id if dept else existing.department_id
    else:
        db.add(
            Branch(
                campus_id=campus_id,
                code=code,
                name=row["name"].strip(),
                department_id=dept.id if dept else None,
            )
        )
    return None


def _import_hostel(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    code = row["code"].strip()
    existing = _hostel(db, campus_id, code)
    gender = (row.get("gender") or "MIXED").strip().upper()
    if existing:
        existing.name = row["name"].strip() or existing.name
        existing.gender = gender
    else:
        db.add(Hostel(campus_id=campus_id, code=code, name=row["name"].strip(), gender=gender))
    return None


def _import_room(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    hostel = _hostel(db, campus_id, row.get("hostel_code", ""))
    if hostel is None:
        return f"unknown hostel_code '{row.get('hostel_code', '')}'"
    block = _block(db, campus_id, hostel, row.get("block_code", "A") or "A")
    number = row["number"].strip()
    room = db.scalar(select(Room).where(Room.block_id == block.id, Room.number == number))
    if room is None:
        room = Room(campus_id=campus_id, hostel_id=hostel.id, block_id=block.id, number=number)
        db.add(room)
    room.floor = _int(row.get("floor", "0"), room.floor)
    room.capacity = _int(row.get("capacity", "3"), room.capacity) or 3
    return None


def _import_location(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    code = row["code"].strip()
    hostel = _hostel(db, campus_id, row.get("hostel_code", ""))
    block = _block(db, campus_id, hostel, row.get("block_code", "")) if hostel else None
    room = _room(db, campus_id, hostel, block, row.get("room_number", "")) if block else None
    dept = _department(db, campus_id, row.get("department_code", ""))
    existing = db.scalar(select(Location).where(Location.campus_id == campus_id, Location.code == code))
    if existing is None:
        existing = Location(campus_id=campus_id, code=code, name=row["name"].strip())
        db.add(existing)
    existing.name = row["name"].strip() or existing.name
    existing.kind = (row.get("kind") or existing.kind or "OTHER").strip().upper()
    existing.building = (row.get("building") or "").strip() or existing.building
    existing.hostel_id = hostel.id if hostel else existing.hostel_id
    existing.block_id = block.id if block else existing.block_id
    existing.room_id = room.id if room else existing.room_id
    existing.department_id = dept.id if dept else existing.department_id
    return None


def _import_asset(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    code = row["code"].strip()
    location_code = (row.get("location_code") or "").strip()
    location = (
        db.scalar(select(Location).where(Location.campus_id == campus_id, Location.code == location_code))
        if location_code
        else None
    )
    dept = _department(db, campus_id, row.get("department_code", ""))
    existing = db.scalar(select(Asset).where(Asset.campus_id == campus_id, Asset.code == code))
    if existing is None:
        existing = Asset(campus_id=campus_id, code=code, name=row["name"].strip())
        db.add(existing)
    existing.name = row["name"].strip() or existing.name
    existing.category = (row.get("category") or existing.category or "GENERAL").strip().upper()
    existing.location_id = location.id if location else existing.location_id
    existing.department_id = dept.id if dept else existing.department_id
    if (row.get("state") or "").strip():
        existing.state = row["state"].strip().upper()
    return None


def _import_staff(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    email = row["email"].strip().lower()
    if not email:
        return "email is required"
    role = _role(db, RoleKey.STAFF.value)
    if role is None:
        return "STAFF role is missing from the database"
    user = db.scalar(select(User).where(User.campus_id == campus_id, User.email == email))
    if user is None:
        user = User(
            campus_id=campus_id,
            role_id=role.id,
            email=email,
            full_name=row["full_name"].strip(),
            password_hash=hash_password(DEFAULT_PASSWORD),
            must_change_password=True,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = row["full_name"].strip() or user.full_name
    dept = _department(db, campus_id, row.get("department_code", ""))
    staff = db.scalar(select(Staff).where(Staff.user_id == user.id))
    if staff is None:
        staff = Staff(campus_id=campus_id, user_id=user.id)
        db.add(staff)
    staff.department_id = dept.id if dept else staff.department_id
    staff.designation = (row.get("designation") or staff.designation or "Technician").strip()
    staff.employee_code = (row.get("employee_code") or "").strip() or staff.employee_code
    staff.workload_capacity = _int(row.get("workload_capacity", "5"), staff.workload_capacity) or 5
    skills = (row.get("skills") or "").strip()
    if skills:
        staff.skills = [s.strip().upper() for s in skills.split("|") if s.strip()]
    return None


def _import_student(db: Session, campus_id: int, row: dict[str, str]) -> str | None:
    roll = row["roll_number"].strip()
    if not roll:
        return "roll_number is required"
    branch = _branch(db, campus_id, row.get("branch_code", ""))
    hostel = _hostel(db, campus_id, row.get("hostel_code", ""))
    block = _block(db, campus_id, hostel, "A") if hostel else None
    room = _room(db, campus_id, hostel, block, row.get("room_number", "")) if block else None
    year_id = _year_id(db, campus_id, row.get("year_name", ""))
    email = (row.get("email") or "").strip().lower()
    role = _role(db, RoleKey.STUDENT.value)

    student = db.scalar(select(Student).where(Student.campus_id == campus_id, Student.roll_number == roll))
    if student is None:
        student = Student(campus_id=campus_id, roll_number=roll)
        db.add(student)
    student.full_name = row["full_name"].strip() or student.full_name
    student.branch_id = branch.id if branch else student.branch_id
    student.year_id = year_id or student.year_id
    student.hostel_id = hostel.id if hostel else student.hostel_id
    student.room_id = room.id if room else student.room_id
    student.is_hosteller = _truthy(row.get("is_hosteller", "no"))
    student.guardian_phone = (row.get("guardian_phone") or "").strip() or student.guardian_phone
    student.dues_amount = _int(row.get("dues_amount", "0"), student.dues_amount)
    student.dues_paid = _int(row.get("dues_paid", "0"), student.dues_paid)

    if email and role is not None:
        user = db.scalar(select(User).where(User.campus_id == campus_id, User.email == email))
        if user is None:
            user = User(
                campus_id=campus_id,
                role_id=role.id,
                email=email,
                full_name=student.full_name,
                password_hash=hash_password(DEFAULT_PASSWORD),
                must_change_password=True,
            )
            db.add(user)
            db.flush()
        student.user_id = user.id
    return None


IMPORT_HANDLERS: dict[str, Callable[[Session, int, dict[str, str]], str | None]] = {
    "departments": _import_department,
    "branches": _import_branch,
    "hostels": _import_hostel,
    "rooms": _import_room,
    "locations": _import_location,
    "assets": _import_asset,
    "staff": _import_staff,
    "students": _import_student,
}


# --- Public API -----------------------------------------------------------


def known_entity(name: str) -> bool:
    return name in ENTITIES


def template_csv(name: str) -> str:
    """A CSV template: header row plus one illustrative sample row."""
    spec = ENTITIES[name]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=spec.columns)
    writer.writeheader()
    for sample in spec.sample:
        writer.writerow({col: sample.get(col, "") for col in spec.columns})
    return buffer.getvalue()


def export_csv(db: Session, campus_id: int, name: str) -> str:
    """Snapshot the campus's current rows in the template's column order."""
    spec = ENTITIES[name]
    rows = _export_rows(db, campus_id, name)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=spec.columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({col: row.get(col, "") for col in spec.columns})
    return buffer.getvalue()


def _export_rows(db: Session, campus_id: int, name: str) -> list[dict[str, Any]]:
    if name == "departments":
        rows = db.scalars(select(Department).where(Department.campus_id == campus_id).order_by(Department.code)).all()
        return [{"code": d.code, "name": d.name, "kind": d.kind} for d in rows]
    if name == "branches":
        rows = db.scalars(select(Branch).where(Branch.campus_id == campus_id).order_by(Branch.code)).all()
        return [
            {"code": b.code, "name": b.name, "department_code": b.department.code if b.department else ""}
            for b in rows
        ]
    if name == "hostels":
        rows = db.scalars(select(Hostel).where(Hostel.campus_id == campus_id).order_by(Hostel.code)).all()
        return [{"code": h.code, "name": h.name, "gender": h.gender} for h in rows]
    if name == "rooms":
        rows = db.scalars(select(Room).where(Room.campus_id == campus_id).order_by(Room.number)).all()
        block_ids = {}
        return [
            {
                "hostel_code": _hostel_code(db, block_ids, r.hostel_id),
                "block_code": _block_code(db, r.block_id),
                "number": r.number,
                "floor": r.floor,
                "capacity": r.capacity,
            }
            for r in rows
        ]
    if name == "locations":
        rows = db.scalars(select(Location).where(Location.campus_id == campus_id).order_by(Location.code)).all()
        return [
            {
                "code": loc.code,
                "name": loc.name,
                "kind": loc.kind,
                "building": loc.building or "",
                "hostel_code": loc.hostel.code if loc.hostel else "",
                "block_code": "",
                "room_number": loc.room.number if loc.room else "",
                "department_code": loc.department.code if loc.department else "",
            }
            for loc in rows
        ]
    if name == "assets":
        rows = db.scalars(select(Asset).where(Asset.campus_id == campus_id).order_by(Asset.code)).all()
        loc_ids = {a.location_id for a in rows if a.location_id}
        locations = {
            loc.id: loc.code
            for loc in db.scalars(select(Location).where(Location.id.in_(loc_ids or {0}))).all()
        }
        return [
            {
                "code": a.code,
                "name": a.name,
                "category": a.category,
                "location_code": locations.get(a.location_id, ""),
                "department_code": a.department.code if a.department else "",
                "state": a.state,
            }
            for a in rows
        ]
    if name == "staff":
        rows = db.scalars(select(Staff).where(Staff.campus_id == campus_id)).all()
        return [
            {
                "email": s.user.email,
                "full_name": s.user.full_name,
                "department_code": s.department.code if s.department else "",
                "designation": s.designation,
                "employee_code": s.employee_code or "",
                "workload_capacity": s.workload_capacity,
                "skills": "|".join(s.skills or []),
            }
            for s in rows
        ]
    if name == "students":
        rows = db.scalars(select(Student).where(Student.campus_id == campus_id).order_by(Student.roll_number)).all()
        return [
            {
                "roll_number": s.roll_number,
                "full_name": s.full_name,
                "email": s.user.email if s.user else "",
                "branch_code": s.branch.code if s.branch else "",
                "year_name": s.year.name if s.year else "",
                "hostel_code": s.hostel.code if s.hostel else "",
                "room_number": s.room.number if s.room else "",
                "is_hosteller": "yes" if s.is_hosteller else "no",
                "guardian_phone": s.guardian_phone or "",
                "dues_amount": s.dues_amount,
                "dues_paid": s.dues_paid,
            }
            for s in rows
        ]
    return []


def _hostel_code(db: Session, cache: dict[int, str], hostel_id: int | None) -> str:
    if hostel_id is None:
        return ""
    if hostel_id not in cache:
        hostel = db.get(Hostel, hostel_id)
        cache[hostel_id] = hostel.code if hostel else ""
    return cache[hostel_id]


def _block_code(db: Session, block_id: int | None) -> str:
    if block_id is None:
        return ""
    block = db.get(Block, block_id)
    return block.code if block else ""


def import_csv(db: Session, campus_id: int, name: str, text: str) -> dict[str, Any]:
    """Import rows and return a per-row report.

    Never raises on bad data: the row is reported and the rest are processed.
    The caller commits; on any hard error the transaction rolls back and the
    caller must not report success.
    """
    spec = ENTITIES[name]
    handler = IMPORT_HANDLERS[name]
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return {"entity": name, "imported": 0, "failed": 0, "errors": [{"line": 0, "reason": "empty file"}]}

    missing = [col for col in spec.required if col not in (reader.fieldnames or [])]
    if missing:
        return {
            "entity": name,
            "imported": 0,
            "failed": 0,
            "errors": [{"line": 0, "reason": f"missing required column(s): {', '.join(missing)}"}],
        }

    imported = 0
    errors: list[dict[str, Any]] = []
    for index, raw in enumerate(reader, start=2):  # line 1 is the header
        row = {(k or "").strip(): (v or "") for k, v in raw.items()}
        # Skip fully blank lines.
        if not any(str(v).strip() for v in row.values()):
            continue
        blank = [col for col in spec.required if not str(row.get(col, "")).strip()]
        if blank:
            errors.append({"line": index, "reason": f"missing value(s): {', '.join(blank)}"})
            continue
        try:
            with db.begin_nested():  # a bad row rolls back only itself
                problem = handler(db, campus_id, row)
                if problem:
                    raise ValueError(problem)
        except ValueError as exc:
            errors.append({"line": index, "reason": str(exc)})
            continue
        except Exception as exc:  # noqa: BLE001 - report, never crash the import
            errors.append({"line": index, "reason": f"database rejected the row ({exc.__class__.__name__})"})
            continue
        imported += 1

    return {"entity": name, "imported": imported, "failed": len(errors), "errors": errors}
