"""DEMO DATA seeding.

Everything this module creates is demo data, generated deterministically so the
dashboard shows a realistic operating picture immediately. The seed never
invents metrics - it creates records, and the analytics compute from them.

Reset is destructive but scoped: it truncates the campus tables and rebuilds
them. Never point it at a production database.
"""

from __future__ import annotations

import random
from datetime import timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.permissions import PERMISSION_CATALOGUE, permissions_for_role
from app.core.security import hash_password
from app.models import (
    AcademicYear,
    Asset,
    AuditLog,
    Base,
    Batch,
    Block,
    Branch,
    Campus,
    Case,
    CaseApproval,
    CaseAssignment,
    CaseComment,
    CaseEvent,
    Department,
    Device,
    Document,
    GateLog,
    GatePass,
    Hostel,
    Location,
    Notice,
    NoticeAction,
    NoticeRecipient,
    NoticeShare,
    NoticeTarget,
    Notification,
    NotificationEvent,
    NotificationPreference,
    Permission,
    Policy,
    Role,
    RolePermission,
    Room,
    Service,
    SlaRule,
    Staff,
    Student,
    SyncOperation,
    User,
    Workflow,
    WorkflowStep,
)
from app.models.enums import (
    AssetState,
    CaseStatus,
    GateDirection,
    LocationKind,
    NoticeStatus,
    NoticeType,
    Priority,
    RoleKey,
    ServiceCategory,
    SlaState,
    SourceChannel,
    VerificationState,
    WorkflowStepType,
)
from app.services import clock

DEMO_PASSWORD = "Campus@2026"

DEMO_ACCOUNTS = [
    {"role": RoleKey.SUPER_ADMIN.value, "email": "superadmin@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Super admin (everything)"},
    {"role": RoleKey.ADMIN.value, "email": "admin@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Registrar / admin command centre"},
    {"role": RoleKey.WARDEN.value, "email": "warden@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Hostel warden (leave + hostel)"},
    {"role": RoleKey.DEPARTMENT_HEAD.value, "email": "maintenance.head@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Maintenance head"},
    {"role": RoleKey.STAFF.value, "email": "technician@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Maintenance technician"},
    {"role": RoleKey.SECURITY.value, "email": "security@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Gate security"},
    {"role": RoleKey.HELPDESK_OPERATOR.value, "email": "helpdesk@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Helpdesk / kiosk operator"},
    {"role": RoleKey.STUDENT.value, "email": "student@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Student (hosteller)"},
    {"role": RoleKey.STUDENT.value, "email": "student2@campusrelay.demo", "password": DEMO_PASSWORD, "label": "Student (day scholar)"},
]

CASE_PREFIX_YEAR = 2026


# --- Reset ---------------------------------------------------------------

TRUNCATE_ORDER = [
    "sync_operations",
    "notification_deliveries",
    "notification_events",
    "notification_preferences",
    "notifications",
    "notice_actions",
    "notice_shares",
    "notice_reads",
    "notice_targets",
    "notices",
    "gate_logs",
    "gate_passes",
    "documents",
    "case_attachments",
    "case_comments",
    "case_approvals",
    "case_assignments",
    "case_events",
    "audit_logs",
    "cases",
    "devices",
    "staff",
    "students",
    "users",
    "role_permissions",
    "permissions",
    "roles",
    "sla_rules",
    "policies",
    "workflow_steps",
    "workflows",
    "services",
    "assets",
    "locations",
    "rooms",
    "blocks",
    "hostels",
    "years",
    "batches",
    "branches",
    "departments",
    "campuses",
]


def truncate_all(session: Session) -> None:
    """Fast, complete reset. TRUNCATE bypasses the append-only ORM guards,
    which is exactly why it is confined to the demo reset path."""
    session.execute(
        text(
            "TRUNCATE TABLE "
            + ", ".join(TRUNCATE_ORDER)
            + " RESTART IDENTITY CASCADE"
        )
    )
    session.commit()


# --- Structure ------------------------------------------------------------


def seed_roles(session: Session) -> dict[str, Role]:
    permission_rows: dict[str, Permission] = {}
    for key, (category, description) in PERMISSION_CATALOGUE.items():
        permission = Permission(key=key, category=category, description=description)
        session.add(permission)
        permission_rows[key] = permission
    session.flush()

    role_meta = {
        RoleKey.SUPER_ADMIN.value: ("Super administrator", "Full platform control"),
        RoleKey.ADMIN.value: ("Administrator", "Campus-wide operations"),
        RoleKey.WARDEN.value: ("Warden", "Hostel lifecycle and leave approvals"),
        RoleKey.DEPARTMENT_HEAD.value: ("Department head", "Departmental queue and approvals"),
        RoleKey.STAFF.value: ("Staff", "Assigned maintenance work"),
        RoleKey.SECURITY.value: ("Security", "Gate verification and logs"),
        RoleKey.HELPDESK_OPERATOR.value: ("Helpdesk operator", "Assisted and kiosk access"),
        RoleKey.STUDENT.value: ("Student", "Own requests and notices"),
    }
    roles: dict[str, Role] = {}
    for key, (name, description) in role_meta.items():
        role = Role(key=key, name=name, description=description, is_system=True)
        session.add(role)
        session.flush()
        for permission_key in sorted(permissions_for_role(key)):
            session.add(RolePermission(role_id=role.id, permission_id=permission_rows[permission_key].id))
        roles[key] = role
    session.flush()
    return roles


def seed_org(session: Session) -> dict:
    campus = Campus(
        name="Crystal Institute of Technology",
        code="CIT",
        city="Bhubaneswar",
        state="Odisha",
        timezone="Asia/Kolkata",
        default_language="en",
    )
    session.add(campus)
    session.flush()

    departments = {}
    for name, code, kind, multiplier in [
        ("Maintenance", "MAINT", "SERVICE", 1.0),
        ("Housekeeping", "HOUSE", "SERVICE", 1.0),
        ("Hostel Administration", "HOSTEL", "ADMIN", 1.0),
        ("Computer Science & Engineering", "CSE", "ACADEMIC", 1.2),
        ("Mess & Catering", "MESS", "SERVICE", 1.0),
        ("Accounts", "ACCTS", "ADMIN", 1.5),
        ("Information Technology", "IT", "SERVICE", 1.0),
        ("Examination", "EXAM", "ADMIN", 1.5),
        ("Security", "SEC", "SERVICE", 0.5),
    ]:
        dept = Department(campus_id=campus.id, name=name, code=code, kind=kind, sla_multiplier=multiplier)
        session.add(dept)
        session.flush()
        departments[code] = dept

    branches = {}
    for name, code, dept_code in [
        ("Computer Science & Engineering", "CSE", "CSE"),
        ("Electronics & Communication", "ECE", "CSE"),
        ("Mechanical Engineering", "MECH", "CSE"),
        ("Civil Engineering", "CIVIL", "CSE"),
    ]:
        branch = Branch(campus_id=campus.id, name=name, code=code, department_id=departments[dept_code].id)
        session.add(branch)
        session.flush()
        branches[code] = branch

    years = {}
    for ordinal, name in [(1, "1st Year"), (2, "2nd Year"), (3, "3rd Year"), (4, "4th Year")]:
        year = AcademicYear(campus_id=campus.id, name=name, ordinal=ordinal)
        session.add(year)
        session.flush()
        years[ordinal] = year

    batches = {}
    for label, start, end in [("2023-2027", 2023, 2027), ("2024-2028", 2024, 2028), ("2022-2026", 2022, 2026)]:
        batch = Batch(campus_id=campus.id, name=label, start_year=start, end_year=end)
        session.add(batch)
        session.flush()
        batches[label] = batch

    hostels = {}
    for name, code, gender in [
        ("Hostel A - Aryabhatta", "HOSTEL-A", "MALE"),
        ("Hostel B - Bhaskara", "HOSTEL-B", "MALE"),
        ("Hostel C - Kalpana", "HOSTEL-C", "FEMALE"),
    ]:
        hostel = Hostel(campus_id=campus.id, name=name, code=code, gender=gender)
        session.add(hostel)
        session.flush()
        hostels[code] = hostel

    blocks = {}
    rooms = {}
    for hostel_code, hostel in hostels.items():
        for block_code in ["A", "B"]:
            block = Block(
                campus_id=campus.id,
                hostel_id=hostel.id,
                name=f"Block {block_code}",
                code=f"{hostel_code[-1]}{block_code}",
            )
            session.add(block)
            session.flush()
            blocks[f"{hostel_code}-{block_code}"] = block
            for floor in (0, 1):
                for number in range(1, 9):
                    room = Room(
                        campus_id=campus.id,
                        hostel_id=hostel.id,
                        block_id=block.id,
                        number=f"{block.code}-{floor}{number:02d}",
                        floor=floor,
                        capacity=3,
                        occupant_count=random.randint(1, 3),
                    )
                    session.add(room)
                    session.flush()
                    rooms[f"{hostel_code}-{block_code}-{floor}{number:02d}"] = room

    locations: dict[str, Location] = {}

    def add_location(code, name, kind, hostel=None, block=None, room=None, department=None, building=None):
        location = Location(
            campus_id=campus.id,
            code=code,
            name=name,
            kind=kind,
            building=building,
            hostel_id=hostel.id if hostel else None,
            block_id=block.id if block else None,
            room_id=room.id if room else None,
            department_id=department.id if department else None,
        )
        session.add(location)
        session.flush()
        locations[code] = location
        return location

    hostel_a = hostels["HOSTEL-A"]
    hostel_b = hostels["HOSTEL-B"]
    hostel_c = hostels["HOSTEL-C"]

    add_location("CR-LOC-WC-A-17", "Water Cooler WC-17 (Hostel A, Block A)", LocationKind.WATER_COOLER, hostel=hostel_a, block=blocks["HOSTEL-A-A"], department=departments["MAINT"], building="Hostel A")
    add_location("CR-LOC-WC-B-04", "Water Cooler WC-04 (Hostel B, Block A)", LocationKind.WATER_COOLER, hostel=hostel_b, block=blocks["HOSTEL-B-A"], department=departments["MAINT"], building="Hostel B")
    add_location("CR-LOC-WASH-A-1F", "Washroom (Hostel A, Block A, Floor 1)", LocationKind.WASHROOM, hostel=hostel_a, block=blocks["HOSTEL-A-A"], department=departments["MAINT"], building="Hostel A")
    add_location("CR-LOC-WASH-C-2F", "Washroom (Hostel C, Block B, Floor 2)", LocationKind.WASHROOM, hostel=hostel_c, block=blocks["HOSTEL-C-B"], department=departments["MAINT"], building="Hostel C")
    add_location("CR-LOC-MESS-A", "Mess Hall A", LocationKind.MESS, hostel=hostel_a, department=departments["MESS"], building="Dining Complex")
    add_location("CR-LOC-MESS-C", "Mess Hall C", LocationKind.MESS, hostel=hostel_c, department=departments["MESS"], building="Dining Complex")
    add_location("CR-LOC-LAB-CSE-1", "CSE Lab 1", LocationKind.LAB, department=departments["CSE"], building="Academic Block 1")
    add_location("CR-LOC-CLASS-CSE-201", "Classroom CSE-201", LocationKind.CLASSROOM, department=departments["CSE"], building="Academic Block 1")
    add_location("CR-LOC-LIB-01", "Central Library", LocationKind.LIBRARY, building="Library Block")
    add_location("CR-LOC-GATE-MAIN", "Main Gate", LocationKind.GATE, department=departments["SEC"], building="Perimeter")
    add_location("CR-LOC-GATE-HOSTEL", "Hostel Gate", LocationKind.GATE, department=departments["SEC"], building="Hostel Zone")
    add_location("CR-LOC-OFFICE-REG", "Registrar Office", LocationKind.OFFICE, department=departments["EXAM"], building="Admin Block")
    add_location("CR-LOC-OFFICE-ACC", "Accounts Office", LocationKind.OFFICE, department=departments["ACCTS"], building="Admin Block")
    add_location("CR-LOC-CORR-A-1F", "Hostel A Corridor, Floor 1", LocationKind.CORRIDOR, hostel=hostel_a, block=blocks["HOSTEL-A-A"], building="Hostel A")

    for key in ["HOSTEL-A-A-101", "HOSTEL-A-A-102", "HOSTEL-A-B-101", "HOSTEL-B-A-101", "HOSTEL-C-B-102"]:
        room = rooms[key]
        add_location(
            f"CR-ROOM-{key}",
            f"Room {room.number}",
            LocationKind.HOSTEL_ROOM,
            hostel=hostels[key.split("-")[0] + "-" + key.split("-")[1]],
            block=blocks["-".join(key.split("-")[:3])],
            room=room,
            department=departments["HOSTEL"],
        )

    assets = {}
    for code, name, category, location_code, state in [
        ("WC-17", "Water Cooler WC-17", "COOLER", "CR-LOC-WC-A-17", AssetState.DEGRADED),
        ("WC-04", "Water Cooler WC-04", "COOLER", "CR-LOC-WC-B-04", AssetState.OPERATIONAL),
        ("WH-01", "Geyser A-Block Floor 1", "GEYSER", "CR-LOC-WASH-A-1F", AssetState.OPERATIONAL),
        ("PROJ-LAB1", "Projector (CSE Lab 1)", "PROJECTOR", "CR-LOC-LAB-CSE-1", AssetState.OPERATIONAL),
        ("FAN-C201-01", "Ceiling fan set (CSE-201)", "FAN", "CR-LOC-CLASS-CSE-201", AssetState.OPERATIONAL),
        ("MESS-OVEN-1", "Mess oven unit 1", "KITCHEN", "CR-LOC-MESS-A", AssetState.UNDER_REPAIR),
    ]:
        asset = Asset(
            campus_id=campus.id,
            code=code,
            name=name,
            category=category,
            location_id=locations[location_code].id,
            department_id=locations[location_code].department_id,
            state=state,
        )
        session.add(asset)
        session.flush()
        assets[code] = asset

    session.flush()
    return {
        "campus": campus,
        "departments": departments,
        "branches": branches,
        "years": years,
        "batches": batches,
        "hostels": hostels,
        "blocks": blocks,
        "rooms": rooms,
        "locations": locations,
        "assets": assets,
    }


# --- Workflows, services, policies, SLA ----------------------------------


def seed_workflows(session: Session, campus: Campus) -> dict[str, Workflow]:
    definitions = {
        "HOSTEL_MAINTENANCE": {
            "name": "Hostel maintenance",
            "description": "Complaint -> routed to Maintenance -> assigned -> repaired -> requester verifies -> closed.",
            "steps": [
                {
                    "key": "assign",
                    "name": "Route and assign",
                    "type": WorkflowStepType.ASSIGNMENT.value,
                    "role": RoleKey.DEPARTMENT_HEAD.value,
                    "sla": 60,
                    "transitions": {"assign": "work", "default": "work"},
                    "instructions": "Assign the least-loaded technician in the target department.",
                },
                {
                    "key": "work",
                    "name": "Carry out repair",
                    "type": WorkflowStepType.RESOLUTION.value,
                    "role": RoleKey.STAFF.value,
                    "sla": 1440,
                    "requires_note": True,
                    "transitions": {"resolve": "verify", "default": "verify"},
                    "instructions": "Record what was actually fixed. Attach evidence if the repair is not visible.",
                },
                {
                    "key": "verify",
                    "name": "Requester verification",
                    "type": WorkflowStepType.VERIFICATION.value,
                    "role": RoleKey.STUDENT.value,
                    "sla": 4320,
                    "transitions": {"accept": "@CLOSED", "reject": "@REOPENED"},
                    "instructions": "Only the requester can confirm the fix or reopen it.",
                },
            ],
        },
        "CERTIFICATE_ISSUE": {
            "name": "Certificate issue",
            "description": "Request -> policy validation -> approval -> document generation -> notification -> closed.",
            "steps": [
                {
                    "key": "approve",
                    "name": "Administrative approval",
                    "type": WorkflowStepType.APPROVAL.value,
                    "role": RoleKey.ADMIN.value,
                    "sla": 1440,
                    "requires_note": False,
                    "transitions": {"approve": "issue", "reject": "@CANCELLED"},
                    "instructions": "Check dues and enrolment before approving.",
                },
                {
                    "key": "issue",
                    "name": "Generate certificate",
                    "type": WorkflowStepType.ACTION.value,
                    "role": RoleKey.ADMIN.value,
                    "sla": 480,
                    "requires_note": False,
                    "transitions": {"issue": "@CLOSED", "default": "@CLOSED"},
                    "instructions": "Generate the PDF; the student is notified automatically.",
                },
            ],
        },
        "LEAVE_GATE": {
            "name": "Leave request and gate pass",
            "description": "Leave -> policy validation -> warden approval -> digital gate pass -> security verification -> return -> closed.",
            "steps": [
                {
                    "key": "warden_approval",
                    "name": "Warden approval",
                    "type": WorkflowStepType.APPROVAL.value,
                    "role": RoleKey.WARDEN.value,
                    "sla": 720,
                    "requires_note": False,
                    "transitions": {"approve": "issue_pass", "reject": "@CANCELLED"},
                    "instructions": "Verify the reason and dates before approving.",
                },
                {
                    "key": "issue_pass",
                    "name": "Issue digital gate pass",
                    "type": WorkflowStepType.ACTION.value,
                    "role": RoleKey.WARDEN.value,
                    "sla": 120,
                    "transitions": {"issue": "@RESOLVED", "default": "@RESOLVED"},
                    "instructions": "A pass is valid only within the approved leave window.",
                },
            ],
        },
        "QUICK_QUERY": {
            "name": "Quick query",
            "description": "Route -> answer -> close. Used for fee and academic queries.",
            "steps": [
                {
                    "key": "answer",
                    "name": "Answer the query",
                    "type": WorkflowStepType.RESOLUTION.value,
                    "role": RoleKey.STAFF.value,
                    "sla": 1440,
                    "requires_note": True,
                    "transitions": {"resolve": "@CLOSED", "default": "@CLOSED"},
                    "instructions": "Reply with the actual figure or rule, then close.",
                }
            ],
        },
        "ESCALATION_REVIEW": {
            "name": "Escalation review",
            "description": "Department head reviews work that breached its target.",
            "steps": [
                {
                    "key": "review",
                    "name": "Head review",
                    "type": WorkflowStepType.APPROVAL.value,
                    "role": RoleKey.DEPARTMENT_HEAD.value,
                    "sla": 240,
                    "transitions": {"approve": "@ROUTED", "reject": "@CANCELLED"},
                    "instructions": "Decide whether to re-work or close with a recorded reason.",
                }
            ],
        },
    }

    workflows: dict[str, Workflow] = {}
    for key, definition in definitions.items():
        workflow = Workflow(
            campus_id=campus.id,
            key=key,
            name=definition["name"],
            description=definition["description"],
            initial_state=CaseStatus.SUBMITTED.value,
            allowed_states=[s.value for s in CaseStatus],
        )
        session.add(workflow)
        session.flush()
        for index, step in enumerate(definition["steps"]):
            session.add(
                WorkflowStep(
                    workflow_id=workflow.id,
                    order_index=index,
                    key=step["key"],
                    name=step["name"],
                    step_type=step["type"],
                    responsible_role=step["role"],
                    sla_minutes=step["sla"],
                    requires_note=step.get("requires_note", False),
                    instructions=step.get("instructions"),
                    transitions=step["transitions"],
                )
            )
        session.flush()
        workflows[key] = workflow
    return workflows


def seed_services(session: Session, campus: Campus, org: dict, workflows: dict[str, Workflow]) -> dict[str, Service]:
    definitions = [
        {
            "key": "HOSTEL_COMPLAINT",
            "name": "Hostel maintenance complaint",
            "category": ServiceCategory.HOSTEL.value,
            "dept": "MAINT",
            "workflow": "HOSTEL_MAINTENANCE",
            "priority": Priority.NORMAL.value,
            "sla": 1440,
            "icon": "wrench",
            "description": "Broken or leaking anything in a hostel: taps, fans, lights, doors, coolers.",
            "form": [
                {"name": "location_id", "label": "Where is the problem?", "type": "location", "required": True},
                {"name": "description", "label": "What is wrong?", "type": "textarea", "required": True},
                {"name": "asset_code", "label": "Asset code (if known)", "type": "text", "required": False},
                {"name": "since_when", "label": "Since when?", "type": "text", "required": False},
            ],
        },
        {
            "key": "MESS_COMPLAINT",
            "name": "Mess complaint or feedback",
            "category": ServiceCategory.MESS.value,
            "dept": "MESS",
            "workflow": "HOSTEL_MAINTENANCE",
            "priority": Priority.NORMAL.value,
            "sla": 720,
            "icon": "utensils",
            "description": "Food quality, hygiene, menu change or mess facility feedback.",
            "form": [
                {"name": "meal", "label": "Meal", "type": "select", "options": ["Breakfast", "Lunch", "Snacks", "Dinner"], "required": True},
                {"name": "description", "label": "What happened?", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "FACILITY_REQUEST",
            "name": "Facility / classroom request",
            "category": ServiceCategory.FACILITY.value,
            "dept": "MAINT",
            "workflow": "HOSTEL_MAINTENANCE",
            "priority": Priority.NORMAL.value,
            "sla": 1440,
            "icon": "building",
            "description": "Labs, classrooms, library, auditorium and sports facilities.",
            "form": [
                {"name": "location_id", "label": "Location", "type": "location", "required": True},
                {"name": "description", "label": "Describe the issue", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "BONAFIDE_CERTIFICATE",
            "name": "Bonafide certificate",
            "category": ServiceCategory.ADMINISTRATIVE.value,
            "dept": "EXAM",
            "workflow": "CERTIFICATE_ISSUE",
            "priority": Priority.NORMAL.value,
            "sla": 2880,
            "icon": "file-text",
            "description": "Official bonafide certificate with a verifiable serial number.",
            "form": [
                {"name": "purpose", "label": "Purpose", "type": "select", "options": ["Bank loan", "Passport", "Scholarship", "Visa", "Other"], "required": True},
                {"name": "description", "label": "Additional details", "type": "textarea", "required": False},
            ],
            "roles": ["STUDENT"],
        },
        {
            "key": "DOCUMENT_REQUEST",
            "name": "Other document request",
            "category": ServiceCategory.ADMINISTRATIVE.value,
            "dept": "EXAM",
            "workflow": "CERTIFICATE_ISSUE",
            "priority": Priority.NORMAL.value,
            "sla": 2880,
            "icon": "folder",
            "description": "Transcript, migration certificate, duplicate marksheet.",
            "form": [
                {"name": "document_type", "label": "Which document?", "type": "text", "required": True},
                {"name": "description", "label": "Details", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "LEAVE_REQUEST",
            "name": "Leave request",
            "category": ServiceCategory.HOSTEL.value,
            "dept": "HOSTEL",
            "workflow": "LEAVE_GATE",
            "priority": Priority.NORMAL.value,
            "sla": 720,
            "icon": "calendar",
            "description": "Hostel leave. Approval is required, and a gate pass is issued after approval.",
            "form": [
                {"name": "leave_start", "label": "From", "type": "date", "required": True},
                {"name": "leave_end", "label": "To", "type": "date", "required": True},
                {"name": "destination", "label": "Going to", "type": "text", "required": True},
                {"name": "reason", "label": "Reason", "type": "textarea", "required": True},
                {"name": "guardian_contact", "label": "Guardian contact", "type": "text", "required": True},
            ],
        },
        {
            "key": "GATE_PASS",
            "name": "Gate pass",
            "category": ServiceCategory.SECURITY.value,
            "dept": "SEC",
            "workflow": "LEAVE_GATE",
            "priority": Priority.HIGH.value,
            "sla": 240,
            "icon": "key",
            "description": "Out-pass for a day scholar or an approved short absence.",
            "form": [
                {"name": "leave_start", "label": "From", "type": "date", "required": True},
                {"name": "leave_end", "label": "To", "type": "date", "required": True},
                {"name": "destination", "label": "Destination", "type": "text", "required": True},
                {"name": "reason", "label": "Reason", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "ROOM_CHANGE",
            "name": "Room change request",
            "category": ServiceCategory.HOSTEL.value,
            "dept": "HOSTEL",
            "workflow": "LEAVE_GATE",
            "priority": Priority.NORMAL.value,
            "sla": 2880,
            "icon": "bed",
            "description": "Change hostel room or block.",
            "form": [
                {"name": "current_room", "label": "Current room", "type": "text", "required": True},
                {"name": "preferred_room", "label": "Preferred room or block", "type": "text", "required": False},
                {"name": "reason", "label": "Reason", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "FEE_QUERY",
            "name": "Fee or dues query",
            "category": ServiceCategory.FINANCE.value,
            "dept": "ACCTS",
            "workflow": "QUICK_QUERY",
            "priority": Priority.NORMAL.value,
            "sla": 1440,
            "icon": "rupee",
            "description": "Outstanding dues, receipt, scholarship or refund questions.",
            "form": [
                {"name": "description", "label": "What do you need to know?", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "ACADEMIC_QUERY",
            "name": "Academic query",
            "category": ServiceCategory.ACADEMIC.value,
            "dept": "CSE",
            "workflow": "QUICK_QUERY",
            "priority": Priority.NORMAL.value,
            "sla": 1440,
            "icon": "book",
            "description": "Marks, attendance, exam forms, timetable clarifications.",
            "form": [
                {"name": "description", "label": "Your question", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "LOST_ITEM",
            "name": "Lost item report",
            "category": ServiceCategory.SECURITY.value,
            "dept": "SEC",
            "workflow": "QUICK_QUERY",
            "priority": Priority.HIGH.value,
            "sla": 1440,
            "icon": "search",
            "description": "Report a lost item so security can check the gate log.",
            "form": [
                {"name": "item", "label": "What was lost?", "type": "text", "required": True},
                {"name": "description", "label": "Where and when did you last have it?", "type": "textarea", "required": True},
            ],
        },
        {
            "key": "VISITOR_REQUEST",
            "name": "Visitor request",
            "category": ServiceCategory.SECURITY.value,
            "dept": "SEC",
            "workflow": "QUICK_QUERY",
            "priority": Priority.NORMAL.value,
            "sla": 240,
            "icon": "users",
            "description": "Request approval for a visitor at the gate or in the hostel.",
            "form": [
                {"name": "visitor_name", "label": "Visitor name", "type": "text", "required": True},
                {"name": "visit_date", "label": "Date", "type": "date", "required": True},
                {"name": "reason", "label": "Purpose", "type": "textarea", "required": True},
            ],
        },
    ]

    services: dict[str, Service] = {}
    for index, definition in enumerate(definitions):
        service = Service(
            campus_id=campus.id,
            workflow_id=workflows[definition["workflow"]].id,
            department_id=org["departments"][definition["dept"]].id,
            key=definition["key"],
            name=definition["name"],
            description=definition["description"],
            category=definition["category"],
            icon=definition.get("icon", "file"),
            default_priority=definition["priority"],
            default_sla_minutes=definition["sla"],
            allowed_requester_roles=definition.get("roles", ["STUDENT", "STAFF", "SECURITY", "HELPDESK_OPERATOR", "WARDEN", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]),
            form_schema=definition["form"],
            sort_order=index,
        )
        session.add(service)
        session.flush()
        services[definition["key"]] = service
    return services


def seed_policies(session: Session, campus: Campus) -> list[Policy]:
    definitions = [
        {
            "key": "certificate.requires_enrolment",
            "name": "Certificate requires an active enrolment",
            "service_key": "BONAFIDE_CERTIFICATE",
            "effect": "REQUIRE",
            "order": 10,
            "conditions": {
                "all": [
                    {"fact": "enrolment_complete", "op": "eq", "value": True,
                     "message": "Your branch or year of study is not recorded, so a certificate cannot be issued yet."}
                ]
            },
            "message": "Your branch or year of study is not recorded, so a certificate cannot be issued yet.",
        },
        {
            "key": "certificate.purpose_required",
            "name": "Certificate needs a stated purpose",
            "service_key": "BONAFIDE_CERTIFICATE",
            "effect": "REQUIRE",
            "order": 20,
            "conditions": {
                "all": [
                    {"field": "state_payload.purpose", "op": "required",
                     "message": "Tell us what the certificate is for."}
                ]
            },
            "message": "Tell us what the certificate is for.",
        },
        {
            "key": "certificate.dues_advisory",
            "name": "Outstanding dues advisory",
            "service_key": "BONAFIDE_CERTIFICATE",
            "effect": "ALLOW",
            "order": 30,
            "conditions": {"all": [{"fact": "dues_clear", "op": "truthy"}]},
            "message": "Dues are clear. Certificates with outstanding dues are still accepted, but Accounts will be notified.",
        },
        {
            "key": "leave.dates_valid",
            "name": "Leave dates must be coherent",
            "service_key": "LEAVE_REQUEST",
            "effect": "REQUIRE",
            "order": 10,
            "conditions": {
                "all": [
                    {"field": "state_payload.leave_start", "op": "required", "message": "Select a start date."},
                    {"field": "state_payload.leave_end", "op": "required", "message": "Select an end date."},
                    {"field": "state_payload.leave_end", "op": "gte_field", "other": "state_payload.leave_start",
                     "message": "The return date cannot be before the departure date."},
                    {"field": "state_payload.leave_start", "op": "date_gte_today",
                     "message": "Leave cannot start in the past."},
                    {"field": "state_payload.leave_end", "op": "max_span_days", "value": 30,
                     "message": "Leave longer than 30 days needs the Dean's approval - raise it at the office."},
                ]
            },
            "message": "Check the leave dates.",
        },
        {
            "key": "leave.reason_required",
            "name": "Leave needs a reason",
            "service_key": "LEAVE_REQUEST",
            "effect": "REQUIRE",
            "order": 20,
            "conditions": {
                "all": [
                    {"field": "state_payload.reason", "op": "min_length", "value": 5,
                     "message": "Give a brief reason for the leave."}
                ]
            },
            "message": "Give a brief reason for the leave.",
        },
        {
            "key": "gatepass.requires_approved_leave",
            "name": "Gate pass requires an approved leave",
            "service_key": "GATE_PASS",
            "effect": "REQUIRE",
            "order": 10,
            "conditions": {
                "all": [
                    {"field": "state_payload.leave_start", "op": "required", "message": "Select a start date."},
                    {"field": "state_payload.leave_end", "op": "required", "message": "Select an end date."},
                    {"field": "state_payload.leave_end", "op": "gte_field", "other": "state_payload.leave_start",
                     "message": "The pass window is invalid."},
                ]
            },
            "message": "A gate pass needs a valid window inside an approved leave.",
        },
        {
            "key": "complaint.description_required",
            "name": "Complaint needs a description",
            "service_key": "HOSTEL_COMPLAINT",
            "effect": "REQUIRE",
            "order": 10,
            "conditions": {
                "all": [
                    {"field": "description", "op": "min_length", "value": 8,
                     "message": "Describe the problem in a few words so the right person is sent."}
                ]
            },
            "message": "Describe the problem in a few words so the right person is sent.",
        },
        {
            "key": "complaint.location_required",
            "name": "Hostel complaint needs a location",
            "service_key": "HOSTEL_COMPLAINT",
            "effect": "REQUIRE",
            "order": 20,
            "conditions": {
                "all": [
                    {"fact": "has_location", "op": "truthy",
                     "message": "Scan the QR at the spot, or pick the room/location."}
                ]
            },
            "message": "Scan the QR at the spot, or pick the room/location.",
        },
    ]

    policies = []
    for definition in definitions:
        policy = Policy(
            campus_id=campus.id,
            key=definition["key"],
            name=definition["name"],
            description=f"Enforced server-side for {definition['service_key'] or 'all services'}.",
            service_key=definition["service_key"],
            effect=definition["effect"],
            evaluation_order=definition["order"],
            conditions=definition["conditions"],
            message=definition["message"],
        )
        session.add(policy)
        policies.append(policy)
    session.flush()
    return policies


def seed_sla_rules(session: Session, campus: Campus) -> list[SlaRule]:
    """DEMO VALUES. Replace with institution-provided targets before pilot."""
    rows = []
    for priority, minutes in [
        (Priority.LOW.value, 4320),
        (Priority.NORMAL.value, 1440),
        (Priority.HIGH.value, 480),
        (Priority.CRITICAL.value, 120),
        (Priority.URGENT.value, 60),
    ]:
        rows.append(
            SlaRule(
                campus_id=campus.id,
                service_key=None,
                priority=priority,
                target_minutes=minutes,
                at_risk_ratio=0.75,
                escalate_to_role=RoleKey.DEPARTMENT_HEAD.value,
            )
        )
    for service_key, priority, minutes in [
        ("HOSTEL_COMPLAINT", Priority.NORMAL.value, 1440),
        ("HOSTEL_COMPLAINT", Priority.HIGH.value, 360),
        ("HOSTEL_COMPLAINT", Priority.CRITICAL.value, 120),
        ("MESS_COMPLAINT", Priority.NORMAL.value, 720),
        ("BONAFIDE_CERTIFICATE", Priority.NORMAL.value, 2880),
        ("LEAVE_REQUEST", Priority.NORMAL.value, 720),
        ("GATE_PASS", Priority.NORMAL.value, 240),
        ("GATE_PASS", Priority.HIGH.value, 120),
        ("FEE_QUERY", Priority.NORMAL.value, 1440),
    ]:
        rows.append(
            SlaRule(
                campus_id=campus.id,
                service_key=service_key,
                priority=priority,
                target_minutes=minutes,
                at_risk_ratio=0.75,
                escalate_to_role=RoleKey.DEPARTMENT_HEAD.value,
            )
        )
    session.add_all(rows)
    session.flush()
    return rows


# --- People ---------------------------------------------------------------


def seed_users(session: Session, campus: Campus, roles: dict[str, Role], org: dict) -> dict:
    def make_user(email, full_name, role_key, phone=None, language="en"):
        user = User(
            campus_id=campus.id,
            role_id=roles[role_key].id,
            email=email,
            full_name=full_name,
            password_hash=hash_password(DEMO_PASSWORD),
            phone=phone,
            language=language,
        )
        session.add(user)
        session.flush()
        return user

    admin = make_user("admin@campusrelay.demo", "Registrar Anita Das", RoleKey.ADMIN.value, "+919000000001")
    super_admin = make_user("superadmin@campusrelay.demo", "Platform Owner", RoleKey.SUPER_ADMIN.value, "+919000000000")
    warden = make_user("warden@campusrelay.demo", "Warden Rakesh Mohanty", RoleKey.WARDEN.value, "+919000000002")
    warden2 = make_user("warden.b@campusrelay.demo", "Warden Sunita Patra", RoleKey.WARDEN.value, "+919000000012")
    maint_head = make_user("maintenance.head@campusrelay.demo", "Maintenance Head Bikash Sahoo", RoleKey.DEPARTMENT_HEAD.value, "+919000000003")
    security = make_user("security@campusrelay.demo", "Security Guard Prakash Behera", RoleKey.SECURITY.value, "+919000000004")
    helpdesk = make_user("helpdesk@campusrelay.demo", "Helpdesk Sarmistha Nayak", RoleKey.HELPDESK_OPERATOR.value, "+919000000005")
    student_user = make_user("student@campusrelay.demo", "Aarav Mishra", RoleKey.STUDENT.value, "+919000000006", language="or")
    student_user2 = make_user("student2@campusrelay.demo", "Diya Pradhan", RoleKey.STUDENT.value, "+919000000007")

    org["hostels"]["HOSTEL-A"].warden_user_id = warden.id
    org["hostels"]["HOSTEL-B"].warden_user_id = warden.id
    org["hostels"]["HOSTEL-C"].warden_user_id = warden2.id
    org["departments"]["MAINT"].head_user_id = maint_head.id

    technician_specs = [
        ("technician@campusrelay.demo", "Technician Sanjay Rout", "MAINT", ["plumbing", "water_cooler", "general"], 4),
        ("technician2@campusrelay.demo", "Technician Kabir Jena", "MAINT", ["electrical", "general"], 4),
        ("technician3@campusrelay.demo", "Technician Meera Sahu", "MAINT", ["carpentry", "civil"], 3),
        ("housekeeping@campusrelay.demo", "Supervisor Lina Barik", "HOUSE", ["housekeeping"], 6),
    ]
    staff_rows: dict[str, Staff] = {}
    for email, name, dept_code, skills, capacity in technician_specs:
        user = make_user(email, name, RoleKey.STAFF.value, "+9190000000" + str(10 + len(staff_rows)))
        staff = Staff(
            campus_id=campus.id,
            user_id=user.id,
            department_id=org["departments"][dept_code].id,
            designation="Technician" if dept_code == "MAINT" else "Supervisor",
            employee_code=f"EMP{1000 + len(staff_rows)}",
            skills=skills,
            workload_capacity=capacity,
        )
        session.add(staff)
        session.flush()
        staff_rows[email] = staff
        if dept_code == "MAINT" and len(staff_rows) == 1:
            staff.skills = ["plumbing", "water_cooler", "general"]

    # Two maintenance staff so workload distribution is meaningful.
    maintenance_staff = [
        staff_rows["technician@campusrelay.demo"],
        staff_rows["technician2@campusrelay.demo"],
        staff_rows["technician3@campusrelay.demo"],
    ]

    # --- Students ---
    first_names = ["Aarav", "Diya", "Ishaan", "Sneha", "Rohan", "Ananya", "Vihaan", "Priya", "Advait", "Meera",
                   "Kabir", "Riya", "Arjun", "Tara", "Dev", "Nisha", "Yash", "Ira", "Kunal", "Sara",
                   "Manav", "Pooja", "Neel", "Aisha", "Om", "Rutuja", "Sahil", "Trisha", "Veer", "Zoya",
                   "Aryan", "Bhavya", "Chirag", "Divya", "Eshan", "Falguni", "Gaurav", "Hina", "Irfan", "Jaya"]
    last_names = ["Mishra", "Pradhan", "Das", "Mohanty", "Sahoo", "Patra", "Nayak", "Behera", "Rout", "Jena",
                  "Sahu", "Barik", "Swain", "Panda", "Tripathy", "Mohapatra", "Biswal", "Lenka", "Samal", "Acharya"]
    branches = list(org["branches"].values())
    hostel_pool = [org["hostels"]["HOSTEL-A"], org["hostels"]["HOSTEL-B"], org["hostels"]["HOSTEL-C"]]
    room_pool = [room for room in org["rooms"].values() if room.hostel_id == org["hostels"]["HOSTEL-A"].id]
    batches = list(org["batches"].values())

    rng = random.Random(20260920)
    students: list[Student] = []

    students.append(
        Student(
            campus_id=campus.id,
            user_id=student_user.id,
            roll_number="CSE2023001",
            registration_number="REG23CSE001",
            full_name=student_user.full_name,
            branch_id=org["branches"]["CSE"].id,
            year_id=org["years"][3].id,
            batch_id=batches[0].id,
            hostel_id=org["hostels"]["HOSTEL-A"].id,
            room_id=room_pool[0].id,
            is_hosteller=True,
            guardian_phone="+919888800001",
            dues_amount=45000,
            dues_paid=45000,
            has_smartphone=True,
        )
    )
    students.append(
        Student(
            campus_id=campus.id,
            user_id=student_user2.id,
            roll_number="ECE2024015",
            registration_number="REG24ECE015",
            full_name=student_user2.full_name,
            branch_id=org["branches"]["ECE"].id,
            year_id=org["years"][2].id,
            batch_id=batches[1].id,
            is_hosteller=False,
            guardian_phone="+919888800002",
            dues_amount=52000,
            dues_paid=20000,
            has_smartphone=True,
        )
    )

    for index in range(1, 61):
        first = first_names[index % len(first_names)]
        last = last_names[(index * 7) % len(last_names)]
        branch = branches[index % len(branches)]
        year_ordinal = (index % 4) + 1
        is_hosteller = index % 3 != 0
        hostel = hostel_pool[index % len(hostel_pool)] if is_hosteller else None
        room = None
        if hostel is not None:
            candidates = [r for r in org["rooms"].values() if r.hostel_id == hostel.id]
            room = candidates[index % len(candidates)]
        students.append(
            Student(
                campus_id=campus.id,
                roll_number=f"{branch.code}{2024 - year_ordinal}{index:03d}",
                registration_number=f"REG{2024 - year_ordinal}{branch.code}{index:03d}",
                full_name=f"{first} {last}",
                branch_id=branch.id,
                year_id=org["years"][year_ordinal].id,
                batch_id=batches[index % len(batches)].id,
                hostel_id=hostel.id if hostel else None,
                room_id=room.id if room else None,
                is_hosteller=is_hosteller,
                guardian_phone=f"+91988{rng.randint(10000, 99999)}",
                dues_amount=rng.choice([38000, 41000, 45000, 52000]),
                dues_paid=rng.choice([38000, 41000, 45000, 20000, 0]),
                has_smartphone=index % 11 != 0,
            )
        )
    session.add_all(students)
    session.flush()

    for hostel in org["hostels"].values():
        rooms = [r for r in org["rooms"].values() if r.hostel_id == hostel.id]
        for room in rooms:
            room.occupant_count = len([s for s in students if s.room_id == room.id])

    # Notification preferences for the two sign-in demo students.
    from app.models.enums import NotificationCategory

    for user in (student_user, student_user2, warden, maint_head):
        for category in [
            NotificationCategory.MESS.value,
            NotificationCategory.ACADEMIC.value,
            NotificationCategory.HOSTEL.value,
            NotificationCategory.TIMETABLE.value,
        ]:
            session.add(
                NotificationPreference(
                    campus_id=campus.id,
                    user_id=user.id,
                    category=category,
                    in_app=True,
                    push=False,
                )
            )

    session.flush()
    return {
        "users": {
            "admin": admin,
            "super_admin": super_admin,
            "warden": warden,
            "warden2": warden2,
            "maint_head": maint_head,
            "security": security,
            "helpdesk": helpdesk,
            "student": student_user,
            "student2": student_user2,
        },
        "maintenance_staff": maintenance_staff,
        "staff_rows": staff_rows,
        "students": students,
    }


# --- Historical cases -----------------------------------------------------

CASE_SPECS = [
    # (service_key, description, days_ago, priority, outcome, location_code, asset_code)
    ("HOSTEL_COMPLAINT", "Water tap in the washroom has been leaking for nine days and the floor stays wet.", 26, Priority.HIGH.value, "CLOSED", "CR-LOC-WASH-A-1F", "WH-01"),
    ("HOSTEL_COMPLAINT", "Ceiling fan makes a loud rattling noise and stops on its own.", 24, Priority.NORMAL.value, "CLOSED", "CR-ROOM-HOSTEL-A-A-101", None),
    ("HOSTEL_COMPLAINT", "Tube light in the corridor has been flickering since last week.", 21, Priority.NORMAL.value, "CLOSED", "CR-LOC-CORR-A-1F", None),
    ("HOSTEL_COMPLAINT", "Water cooler WC-17 is dispensing warm water.", 19, Priority.NORMAL.value, "CLOSED", "CR-LOC-WC-A-17", "WC-17"),
    ("HOSTEL_COMPLAINT", "Water cooler WC-17 is leaking from the base again.", 12, Priority.HIGH.value, "CLOSED", "CR-LOC-WC-A-17", "WC-17"),
    ("HOSTEL_COMPLAINT", "Water cooler WC-17 makes a loud noise and the water tastes metallic.", 6, Priority.NORMAL.value, "IN_PROGRESS", "CR-LOC-WC-A-17", "WC-17"),
    ("HOSTEL_COMPLAINT", "Water cooler WC-17 is not cooling at all - third time this month.", 2, Priority.HIGH.value, "ASSIGNED", "CR-LOC-WC-A-17", "WC-17"),
    ("HOSTEL_COMPLAINT", "Almirah lock in room is broken and will not close.", 9, Priority.NORMAL.value, "WAITING_VERIFICATION", "CR-ROOM-HOSTEL-A-B-201", None),
    ("HOSTEL_COMPLAINT", "Washroom tap in Hostel C is running continuously, wasting water.", 5, Priority.HIGH.value, "IN_PROGRESS", "CR-LOC-WASH-C-2F", None),
    ("HOSTEL_COMPLAINT", "Door hinge broken, door does not shut properly at night.", 15, Priority.NORMAL.value, "CLOSED_BREACHED", "CR-ROOM-HOSTEL-B-A-101", None),
    ("HOSTEL_COMPLAINT", "Electrical socket sparks when the charger is plugged in.", 3, Priority.CRITICAL.value, "RESOLVED", "CR-ROOM-HOSTEL-A-A-102", None),
    ("HOSTEL_COMPLAINT", "Dustbin outside the washroom has not been cleared for four days.", 4, Priority.NORMAL.value, "CLOSED", "CR-LOC-WASH-A-1F", None),
    ("HOSTEL_COMPLAINT", "Wifi in Block B drops every evening after 8 pm.", 8, Priority.NORMAL.value, "IN_PROGRESS", "CR-ROOM-HOSTEL-A-B-201", None),
    ("MESS_COMPLAINT", "Dinner served cold on Tuesday and the queue took 40 minutes.", 18, Priority.NORMAL.value, "CLOSED", "CR-LOC-MESS-A", "MESS-OVEN-1"),
    ("MESS_COMPLAINT", "Mess menu for the week has still not been displayed.", 7, Priority.NORMAL.value, "CLOSED", "CR-LOC-MESS-C", None),
    ("MESS_COMPLAINT", "Water in the mess tank smells unclean.", 1, Priority.HIGH.value, "ASSIGNED", "CR-LOC-MESS-A", None),
    ("FACILITY_REQUEST", "Projector in CSE Lab 1 has a permanent green tint.", 11, Priority.NORMAL.value, "CLOSED", "CR-LOC-LAB-CSE-1", "PROJ-LAB1"),
    ("FACILITY_REQUEST", "Two fans in classroom CSE-201 are not working before the mid-semester exam.", 13, Priority.HIGH.value, "CLOSED", "CR-LOC-CLASS-CSE-201", "FAN-C201-01"),
    ("FACILITY_REQUEST", "Library reading room has no air circulation in the afternoon.", 20, Priority.NORMAL.value, "CLOSED", "CR-LOC-LIB-01", None),
    ("BONAFIDE_CERTIFICATE", "Bonafide certificate needed for a bank education loan.", 17, Priority.NORMAL.value, "CLOSED_DOCUMENT", "CR-LOC-OFFICE-REG", None),
    ("BONAFIDE_CERTIFICATE", "Bonafide certificate required for passport application.", 10, Priority.NORMAL.value, "CLOSED_DOCUMENT", "CR-LOC-OFFICE-REG", None),
    ("BONAFIDE_CERTIFICATE", "Bonafide certificate for scholarship renewal.", 4, Priority.NORMAL.value, "IN_PROGRESS", "CR-LOC-OFFICE-REG", None),
    ("BONAFIDE_CERTIFICATE", "Need bonafide certificate urgently for a visa appointment next week.", 2, Priority.HIGH.value, "WAITING_APPROVAL", "CR-LOC-OFFICE-REG", None),
    ("LEAVE_REQUEST", "Going home for my sister's wedding, need four days of leave.", 22, Priority.NORMAL.value, "CLOSED_GATE_RETURNED", "CR-LOC-GATE-HOSTEL", None),
    ("LEAVE_REQUEST", "Leave for a medical check-up in Bhubaneswar for two days.", 14, Priority.NORMAL.value, "CLOSED_GATE_RETURNED", "CR-LOC-GATE-HOSTEL", None),
    ("LEAVE_REQUEST", "Leave to attend a family function this weekend.", 3, Priority.NORMAL.value, "WAITING_APPROVAL", "CR-LOC-GATE-HOSTEL", None),
    ("LEAVE_REQUEST", "Leave for an inter-college hackathon in Cuttack, three days.", 1, Priority.HIGH.value, "WAITING_APPROVAL", "CR-LOC-GATE-HOSTEL", None),
    ("GATE_PASS", "Day scholar needs a late-exit pass for a lab session till 9 pm.", 6, Priority.NORMAL.value, "CLOSED", "CR-LOC-GATE-MAIN", None),
    ("FEE_QUERY", "My semester fee payment is not reflecting in the portal.", 16, Priority.NORMAL.value, "CLOSED", "CR-LOC-OFFICE-ACC", None),
    ("FEE_QUERY", "How much scholarship amount has been adjusted against my dues?", 5, Priority.NORMAL.value, "CLOSED_BREACHED", "CR-LOC-OFFICE-ACC", None),
    ("FEE_QUERY", "Need a duplicate fee receipt for last semester.", 3, Priority.NORMAL.value, "IN_PROGRESS", "CR-LOC-OFFICE-ACC", None),
    ("ACADEMIC_QUERY", "Attendance shown in the portal does not match the class register.", 12, Priority.NORMAL.value, "CLOSED", "CR-LOC-CLASS-CSE-201", None),
    ("ACADEMIC_QUERY", "Latest timetable is not uploaded for the 3rd year CSE section.", 4, Priority.NORMAL.value, "CLOSED", "CR-LOC-CLASS-CSE-201", None),
    ("ROOM_CHANGE", "Roommate has vacated, requesting a shift to Block B to be with my batchmates.", 9, Priority.NORMAL.value, "WAITING_APPROVAL", "CR-ROOM-HOSTEL-A-B-201", None),
    ("LOST_ITEM", "Lost my college ID card somewhere near the mess.", 5, Priority.HIGH.value, "CLOSED", "CR-LOC-MESS-A", None),
    ("VISITOR_REQUEST", "Parents visiting on Sunday, requesting hostel gate approval.", 2, Priority.NORMAL.value, "ASSIGNED", "CR-LOC-GATE-HOSTEL", None),
    ("HOSTEL_COMPLAINT", "Geyser in the washroom is not heating water since morning.", 1, Priority.HIGH.value, "IN_PROGRESS", "CR-LOC-WASH-C-2F", "WH-01"),
    ("HOSTEL_COMPLAINT", "Broken window pane is letting in rain and mosquitoes.", 7, Priority.HIGH.value, "RESOLVED", "CR-ROOM-HOSTEL-A-A-101", None),
    ("MESS_COMPLAINT", "Requesting a change in the mess menu for Sunday dinner.", 6, Priority.NORMAL.value, "CLOSED", "CR-LOC-MESS-A", None),
    ("HOSTEL_COMPLAINT", "Ceiling seepage after rain, paint is peeling above the bed.", 23, Priority.HIGH.value, "CLOSED_BREACHED", "CR-ROOM-HOSTEL-A-B-201", None),
    ("BONAFIDE_CERTIFICATE", "Bonafide certificate for an internship application.", 8, Priority.NORMAL.value, "CANCELLED", "CR-LOC-OFFICE-REG", None),
]


def seed_cases(session: Session, org: dict, people: dict, services: dict[str, Service], workflows: dict[str, Workflow]) -> list[Case]:
    campus = org["campus"]
    students: list[Student] = people["students"]
    users = people["users"]
    maintenance_staff: list[Staff] = people["maintenance_staff"]
    admin = users["admin"]
    warden = users["warden"]
    maint_head = users["maint_head"]
    security = users["security"]

    rng = random.Random(7)
    now = clock.now()
    created: list[Case] = []

    for index, (service_key, description, days_ago, priority, outcome, location_code, asset_code) in enumerate(CASE_SPECS):
        service = services[service_key]
        location = org["locations"].get(location_code)
        asset = org["assets"].get(asset_code) if asset_code else None

        # Requester selection: certificate/leave students mostly, general mix otherwise.
        if service_key in {"BONAFIDE_CERTIFICATE", "DOCUMENT_REQUEST", "LEAVE_REQUEST", "ROOM_CHANGE"}:
            student = students[index % 2]
        elif service_key == "GATE_PASS":
            student = students[1]
        else:
            student = students[(index * 3) % len(students)]

        requester = db_user_for(session, student) or admin
        created_at = now - timedelta(days=days_ago, hours=rng.randint(0, 8), minutes=rng.randint(0, 59))

        state_payload: dict = {}
        if service_key == "LEAVE_REQUEST":
            start = created_at + timedelta(days=1)
            state_payload = {
                "leave_start": start.date().isoformat(),
                "leave_end": (start + timedelta(days=rng.randint(1, 4))).date().isoformat(),
                "destination": rng.choice(["Bhubaneswar", "Cuttack", "Puri", "Family home", "Rourkela"]),
                "reason": "Family function and travel.",
                "guardian_contact": "+919888800100",
            }
        elif service_key == "GATE_PASS":
            start = created_at
            state_payload = {
                "leave_start": start.date().isoformat(),
                "leave_end": (start + timedelta(days=1)).date().isoformat(),
                "destination": "Local lab session",
                "reason": "Late lab session on campus.",
            }
        elif service_key == "BONAFIDE_CERTIFICATE":
            state_payload = {"purpose": rng.choice(["Bank loan", "Passport", "Scholarship", "Visa"]), "description": description}
        elif service_key == "ROOM_CHANGE":
            state_payload = {"current_room": "A-A-201", "preferred_room": "Block B", "reason": description}
        elif service_key == "FEE_QUERY":
            state_payload = {"description": description}
        elif service_key == "LOST_ITEM":
            state_payload = {"item": "College ID card", "description": description}
        elif service_key == "VISITOR_REQUEST":
            state_payload = {"visitor_name": "Parent", "visit_date": created_at.date().isoformat(), "reason": description}

        case = Case(
            campus_id=campus.id,
            case_number=f"CR-{CASE_PREFIX_YEAR}-{index + 1:05d}",
            requester_id=requester.id,
            requester_role=RoleKey.STUDENT.value,
            requester_student_id=student.id,
            created_by_id=requester.id,
            service_id=service.id,
            service_key=service_key,
            category={
                "HOSTEL_COMPLAINT": rng.choice(["PLUMBING", "ELECTRICAL", "CARPENTRY", "HOUSEKEEPING", "WATER_COOLER", "CIVIL"]),
                "MESS_COMPLAINT": "MESS",
                "FACILITY_REQUEST": rng.choice(["ELECTRICAL", "CIVIL", "INTERNET"]),
            }.get(service_key, service.category),
            title=description.split(".")[0][:80] or service.name,
            description=description,
            location_id=location.id if location else None,
            asset_id=asset.id if asset else None,
            department_id=service.department_id,
            priority=priority,
            status=CaseStatus.SUBMITTED.value,
            source_channel=rng.choice(
                [SourceChannel.PWA.value] * 6
                + [SourceChannel.QR.value] * 2
                + [SourceChannel.KIOSK.value]
                + [SourceChannel.ASSISTED_DESK.value]
            ),
            language=rng.choice(["en", "en", "en", "or"]),
            state_payload=state_payload,
            created_at=created_at,
            updated_at=created_at,
            last_activity_at=created_at,
            duplicate_group_id=f"{service_key}:{case_category(service_key, description)}:{location.id if location else 'campus'}",
        )
        session.add(case)
        session.flush()
        created.append(case)

        # SLA target
        from app.services.sla import resolve_target_minutes

        minutes = resolve_target_minutes(
            session, campus_id=campus.id, service_key=service_key, priority=priority
        )
        case.sla_minutes = minutes
        case.due_at = created_at + timedelta(minutes=minutes)

        # --- Timeline ---
        events: list[tuple[str, int, str | None, str | None, dict]] = []
        events.append(("CASE_CREATED", 0, None, "SUBMITTED", {"service_key": service_key, "priority": priority}))
        events.append(("CASE_CLASSIFIED", 1, "SUBMITTED", "SUBMITTED", {"engine": "rules", "confidence": 0.72, "category": case.category}))
        events.append(("CASE_ROUTED", 2, "SUBMITTED", "VALIDATING", {"department_id": service.department_id}))
        events.append(("STATUS_CHANGED", 3, "VALIDATING", "ROUTED", {"step": "assign"}))

        assigned_staff: Staff | None = None
        if outcome in {
            "CLOSED",
            "CLOSED_BREACHED",
            "IN_PROGRESS",
            "ASSIGNED",
            "WAITING_VERIFICATION",
            "RESOLVED",
            "CLOSED_GATE_RETURNED",
            "CLOSED_DOCUMENT",
        }:
            pool = maintenance_staff if service.category in {ServiceCategory.HOSTEL.value, ServiceCategory.FACILITY.value, ServiceCategory.MESS.value} else maintenance_staff
            assigned_staff = pool[index % len(pool)]
            case.assigned_staff_id = assigned_staff.id
            events.append(("CASE_ASSIGNED", 4, "ROUTED", "ASSIGNED", {"staff_id": assigned_staff.id, "staff_name": assigned_staff.user.full_name if assigned_staff.user else None}))
            session.add(
                CaseAssignment(
                    campus_id=campus.id,
                    case_id=case.id,
                    staff_id=assigned_staff.id,
                    assigned_by_id=maint_head.id,
                    assignment_type="AUTO" if index % 2 else "MANUAL",
                    reason="Least-loaded technician in Maintenance" if index % 2 else "Assigned by department head",
                    is_active=True,
                    created_at=created_at + timedelta(minutes=4),
                )
            )

        work_started = created_at + timedelta(minutes=rng.randint(20, 240))
        resolution = work_started + timedelta(minutes=rng.randint(45, 600))

        if outcome in {"WAITING_APPROVAL"}:
            approval_time = created_at + timedelta(minutes=3)
            case.status = CaseStatus.WAITING_FOR_APPROVAL.value
            case.current_step_key = "warden_approval" if service_key in {"LEAVE_REQUEST", "ROOM_CHANGE"} else "approve"
            case.required_approvals = [case.current_step_key]
            session.add(
                CaseApproval(
                    campus_id=campus.id,
                    case_id=case.id,
                    step_key=case.current_step_key,
                    sequence=1,
                    approver_role=(
                        RoleKey.WARDEN.value
                        if service_key in {"LEAVE_REQUEST", "ROOM_CHANGE", "GATE_PASS"}
                        else RoleKey.ADMIN.value
                    ),
                    state="PENDING",
                    requested_at=approval_time,
                )
            )
            events.append(("APPROVAL_REQUESTED", 3, "ROUTED", "WAITING_FOR_APPROVAL", {"approver_role": RoleKey.WARDEN.value if service_key in {"LEAVE_REQUEST", "ROOM_CHANGE"} else RoleKey.ADMIN.value}))

        if outcome in {
            "CLOSED",
            "CLOSED_BREACHED",
            "IN_PROGRESS",
            "WAITING_VERIFICATION",
            "RESOLVED",
            "CLOSED_GATE_RETURNED",
            "CLOSED_DOCUMENT",
        }:
            if outcome in {"CLOSED_DOCUMENT", "CLOSED_GATE_RETURNED"} or service_key in {"BONAFIDE_CERTIFICATE", "DOCUMENT_REQUEST"}:
                events.append(("APPROVAL_REQUESTED", 5, "ROUTED", "WAITING_FOR_APPROVAL", {"approver_role": RoleKey.ADMIN.value if service_key != "LEAVE_REQUEST" else RoleKey.WARDEN.value}))
                session.add(
                    CaseApproval(
                        campus_id=campus.id,
                        case_id=case.id,
                        step_key="approve" if service_key != "LEAVE_REQUEST" else "warden_approval",
                        sequence=1,
                        approver_role=RoleKey.ADMIN.value if service_key != "LEAVE_REQUEST" else RoleKey.WARDEN.value,
                        approver_id=admin.id if service_key != "LEAVE_REQUEST" else warden.id,
                        state="APPROVED",
                        requested_at=created_at + timedelta(minutes=5),
                        decided_at=created_at + timedelta(minutes=rng.randint(60, 600)),
                        decision_note="Verified enrolment and dues records.",
                    )
                )
                events.append(("APPROVED", 6, "WAITING_FOR_APPROVAL", "IN_PROGRESS", {"approver_role": "ADMIN"}))
            events.append(("STATUS_CHANGED", 7, "ASSIGNED", "IN_PROGRESS", {"step": "work"}))
            events.append(("COMMENT_ADDED", 8, "IN_PROGRESS", "IN_PROGRESS", {"preview": "Reached the location and started work."}))

        if outcome in {"RESOLVED", "CLOSED", "CLOSED_BREACHED", "WAITING_VERIFICATION", "CLOSED_GATE_RETURNED", "CLOSED_DOCUMENT"}:
            case.resolution_note = "Replaced the worn part and tested the fixture."
            events.append(("RESOLVED", 9, "IN_PROGRESS", "RESOLVED", {"note": case.resolution_note}))

        if outcome == "CLOSED_BREACHED":
            # Resolved, but after the target time: a genuine breach with the trail intact.
            case.resolved_at = case.due_at + timedelta(hours=rng.randint(3, 30))
            case.status = CaseStatus.RESOLVED.value
            case.verification_state = VerificationState.PENDING.value
            case.sla_state = SlaState.MISSED.value
            case.breached_at = case.due_at
            case.current_step_key = "verify"
        elif outcome in {"RESOLVED"}:
            case.resolved_at = resolution
            case.status = CaseStatus.RESOLVED.value
            case.verification_state = VerificationState.PENDING.value
            case.sla_state = SlaState.MET.value
            case.current_step_key = "verify"
        elif outcome == "WAITING_VERIFICATION":
            case.resolved_at = resolution
            case.status = CaseStatus.VERIFICATION_REQUIRED.value
            case.verification_state = VerificationState.PENDING.value
            case.sla_state = SlaState.MET.value
            case.current_step_key = "verify"
        elif outcome in {"CLOSED", "CLOSED_GATE_RETURNED", "CLOSED_DOCUMENT"}:
            case.resolved_at = resolution
            case.closed_at = resolution + timedelta(hours=rng.randint(1, 20))
            case.status = CaseStatus.CLOSED.value
            case.verification_state = VerificationState.VERIFIED.value
            case.sla_state = SlaState.MET.value
            case.current_step_key = None
            events.append(("VERIFIED", 10, "VERIFICATION_REQUIRED", "CLOSED", {"note": "Confirmed by requester."}))
            session.add(
                CaseComment(
                    campus_id=campus.id,
                    case_id=case.id,
                    author_id=requester.id,
                    author_role=RoleKey.STUDENT.value,
                    body="Fixed, thank you. Water is flowing normally now.",
                    visibility="PUBLIC",
                    created_at=case.closed_at,
                )
            )
        elif outcome == "IN_PROGRESS":
            case.status = CaseStatus.IN_PROGRESS.value
            case.current_step_key = "work"
            case.sla_state = SlaState.BREACHED.value if days_ago >= 6 else SlaState.AT_RISK.value
            case.breached_at = case.due_at if days_ago >= 6 else None
        elif outcome == "ASSIGNED":
            case.status = CaseStatus.ASSIGNED.value
            case.current_step_key = "assign"
            case.sla_state = SlaState.ON_TIME.value
        elif outcome == "CANCELLED":
            case.status = CaseStatus.CANCELLED.value
            case.closed_at = created_at + timedelta(days=1)
            case.sla_state = SlaState.NO_SLA.value
            case.state_payload = {**state_payload, "cancel_reason": "Student arranged the certificate at the office directly."}

        case.last_activity_at = case.closed_at or case.resolved_at or created_at

        for offset, (event_type, order, from_status, to_status, payload) in enumerate(events):
            session.add(
                CaseEvent(
                    campus_id=campus.id,
                    case_id=case.id,
                    event_type=event_type,
                    actor_id=requester.id if order < 3 else (assigned_staff.user_id if assigned_staff else admin.id),
                    actor_role=RoleKey.STUDENT.value if order < 3 else (RoleKey.STAFF.value if assigned_staff else RoleKey.ADMIN.value),
                    actor_kind="SYSTEM" if order in {1, 2} else "USER",
                    from_status=from_status,
                    to_status=to_status,
                    step_key=case.current_step_key,
                    source_channel=case.source_channel,
                    payload=payload,
                    created_at=created_at + timedelta(minutes=order * rng.randint(3, 25)),
                )
            )

        session.add(
            CaseComment(
                campus_id=campus.id,
                case_id=case.id,
                author_id=assigned_staff.user_id if assigned_staff else admin.id,
                author_role=RoleKey.STAFF.value if assigned_staff else RoleKey.ADMIN.value,
                body=rng.choice(
                    [
                        "Checked the fixture. Replacement part is available in the store.",
                        "Work scheduled after the morning classes to avoid disturbance.",
                        "Temporary fix applied; permanent replacement ordered.",
                    ]
                ),
                visibility="INTERNAL" if index % 4 == 0 else "PUBLIC",
                created_at=created_at + timedelta(hours=2),
            )
        )

        session.flush()

    return created


def case_category(service_key: str, description: str) -> str:
    from app.services.routing import detect_category

    category, _ = detect_category(description, service_key)
    return category


def db_user_for(session: Session, student: Student) -> User | None:
    if student.user_id is None:
        return None
    return session.get(User, student.user_id)


def seed_documents(session: Session, org: dict, people: dict, cases: list[Case]) -> list[Document]:
    from app.services import documents as document_service

    admin = people["users"]["admin"]
    created: list[Document] = []
    targets = [c for c in cases if c.service_key in {"BONAFIDE_CERTIFICATE", "DOCUMENT_REQUEST"} and c.status == CaseStatus.CLOSED.value][:3]
    for case in targets:
        document = document_service.generate_bonafide(
            db=session,
            case=case,
            actor=admin,
            purpose=(case.state_payload or {}).get("purpose"),
            campus_name=org["campus"].name,
        )
        created.append(document)
    return created


def seed_gate(session: Session, org: dict, people: dict, cases: list[Case]) -> dict:
    from app.services.case_engine import issue_gate_pass

    warden = people["users"]["warden"]
    security = people["users"]["security"]
    gate_location = org["locations"]["CR-LOC-GATE-HOSTEL"]

    leave_cases = [c for c in cases if c.service_key == "LEAVE_REQUEST"]
    passes = []
    for index, case in enumerate(leave_cases):
        if case.status not in {CaseStatus.CLOSED.value, CaseStatus.RESOLVED.value}:
            continue
        gate_pass = issue_gate_pass(
            session,
            case=case,
            actor=warden,
            valid_from=case.created_at,
            valid_to=case.created_at + timedelta(days=3),
        )
        passes.append(gate_pass)

    logs = []
    if passes:
        first = passes[0]
        for direction, offset in ((GateDirection.EXIT.value, timedelta(hours=6)), (GateDirection.ENTRY.value, timedelta(days=2))):
            occurred = first.created_at + offset
            logs.append(
                GateLog(
                    campus_id=org["campus"].id,
                    gate_pass_id=first.id,
                    student_id=first.student_id,
                    case_id=first.case_id,
                    direction=direction,
                    occurred_at=occurred,
                    gate_location_id=gate_location.id,
                    logged_by_id=security.id,
                    device_id="gate-tablet-01",
                    source_channel=SourceChannel.PWA.value,
                    client_ref=f"seed-gate-{direction.lower()}-1",
                    payload={"pass_code": first.pass_code},
                )
            )
        first.state = "USED"

    if len(passes) > 1:
        second = passes[1]
        logs.append(
            GateLog(
                campus_id=org["campus"].id,
                gate_pass_id=second.id,
                student_id=second.student_id,
                case_id=second.case_id,
                direction=GateDirection.EXIT.value,
                occurred_at=second.created_at + timedelta(hours=5),
                gate_location_id=gate_location.id,
                logged_by_id=security.id,
                device_id="gate-tablet-01",
                source_channel=SourceChannel.PWA.value,
                client_ref="seed-gate-exit-2",
                payload={"pass_code": second.pass_code},
            )
        )
        second.state = "PARTIALLY_USED"

    session.add_all(logs)
    session.flush()
    return {"passes": passes, "logs": logs}


def seed_notices(session: Session, org: dict, people: dict) -> list[Notice]:
    from app.services import notices as notice_service

    admin = people["users"]["admin"]
    warden = people["users"]["warden"]
    org_data = org

    specs = [
        {
            "title": "Tomorrow's classes start at 10:00 AM",
            "content": (
                "Due to the electrical maintenance window in Academic Block 1, all classes tomorrow "
                "will begin at 10:00 AM instead of 8:00 AM. Labs will run in their usual slots from 2:00 PM."
            ),
            "notice_type": NoticeType.IMPORTANT.value,
            "category": "ACADEMIC",
            "targets": [
                {"target_type": "YEAR", "target_id": org_data["years"][3].id},
                {"target_type": "BRANCH", "target_id": org_data["branches"]["CSE"].id},
            ],
            "ack": True,
            "required_action": "ACKNOWLEDGE",
            "action_label": "Acknowledge",
            "share": True,
            "author": admin,
        },
        {
            "title": "Water supply interruption in Hostel A on Saturday",
            "content": (
                "The overhead tank in Hostel A will be cleaned on Saturday between 10:00 AM and 1:00 PM. "
                "Please store water in advance. The water cooler on Floor 1 remains usable."
            ),
            "notice_type": NoticeType.URGENT.value,
            "category": "HOSTEL",
            "targets": [{"target_type": "HOSTEL", "target_id": org_data["hostels"]["HOSTEL-A"].id}],
            "ack": True,
            "required_action": "ACKNOWLEDGE",
            "action_label": "Acknowledge",
            "share": False,
            "author": warden,
        },
        {
            "title": "Mess menu updated for the rest of the month",
            "content": (
                "The revised mess menu is now displayed at both mess halls and in the app. "
                "Sunday dinner now includes a special item as requested in last week's feedback."
            ),
            "notice_type": NoticeType.NORMAL.value,
            "category": "MESS",
            "targets": [{"target_type": "CAMPUS", "target_id": None}],
            "ack": False,
            "required_action": None,
            "action_label": None,
            "share": True,
            "author": admin,
        },
        {
            "title": "EMERGENCY: No entry to the new academic block until further notice",
            "content": (
                "Structural inspection is in progress at the new academic block. "
                "Entry is prohibited for everyone until the block is declared safe. "
                "Classes scheduled there have been moved to Block B."
            ),
            "notice_type": NoticeType.EMERGENCY.value,
            "category": "SAFETY",
            "targets": [{"target_type": "CAMPUS", "target_id": None}],
            "ack": True,
            "required_action": "ACKNOWLEDGE",
            "action_label": "Acknowledge",
            "share": True,
            "author": admin,
        },
        {
            "title": "Fee payment window closes on the 30th",
            "content": (
                "Semester fee payment closes on the 30th of this month. "
                "Check your dues in the app before the deadline; a late fee applies afterwards."
            ),
            "notice_type": NoticeType.IMPORTANT.value,
            "category": "FINANCE",
            "targets": [{"target_type": "ROLE", "target_id": None, "target_value": "STUDENT"}],
            "ack": False,
            "required_action": "VIEW_DOCUMENT",
            "action_label": "View fee structure",
            "share": False,
            "author": admin,
        },
    ]

    created: list[Notice] = []
    rng = random.Random(11)
    for spec in specs:
        draft = notice_service.NoticeDraft(
            title=spec["title"],
            content=spec["content"],
            summary=spec["content"][:200],
            notice_type=spec["notice_type"],
            category=spec["category"],
            acknowledgement_required=spec["ack"],
            required_action=spec["required_action"],
            required_action_label=spec["action_label"],
            share_enabled=spec["share"],
            publish_at=clock.now() - timedelta(days=rng.randint(1, 4)),
            targets=[
                {
                    "target_type": t["target_type"],
                    "target_id": t.get("target_id"),
                    "target_value": t.get("target_value"),
                }
                for t in spec["targets"]
            ],
        )
        notice = notice_service.create_notice(session, actor=spec["author"], draft=draft)

        # Simulate realistic engagement: most read, most acknowledge, some act.
        recipients = session.scalars(
            select(NoticeRecipient).where(NoticeRecipient.notice_id == notice.id)
        ).all()
        for recipient in recipients:
            roll = rng.random()
            if roll < 0.12:
                continue  # never read
            recipient.read_at = notice.published_at + timedelta(minutes=rng.randint(5, 600))
            recipient.state = "READ"
            if notice.acknowledgement_required and roll < 0.85:
                recipient.acknowledged_at = recipient.read_at + timedelta(minutes=rng.randint(1, 60))
            if notice.required_action and roll < 0.45:
                recipient.action_completed_at = recipient.read_at + timedelta(minutes=rng.randint(5, 240))
                recipient.state = "ACTIONED"
            if recipient.acknowledged_at or recipient.action_completed_at:
                session.add(
                    NoticeAction(
                        campus_id=notice.campus_id,
                        notice_id=notice.id,
                        user_id=recipient.user_id,
                        action_type=notice.required_action or "READ",
                        completed_at=recipient.action_completed_at or recipient.acknowledged_at,
                        payload={"seeded": True},
                    )
                )
        if notice.share_enabled:
            session.add(
                NoticeShare(
                    campus_id=notice.campus_id,
                    notice_id=notice.id,
                    shared_by_id=admin.id,
                    channel="COPY_LINK",
                    token=notice.share_token,
                    view_count=rng.randint(0, 14),
                )
            )
        session.flush()
        created.append(notice)
    return created


# --- Orchestration --------------------------------------------------------


def reset_and_seed(days_of_history: int = 30) -> dict:
    from app.core.db import session_scope

    del days_of_history  # history depth is encoded in CASE_SPECS
    with session_scope() as session:
        truncate_all(session)
        summary = seed_all(session)
        return summary


def seed_all(session: Session) -> dict:
    campus_total = session.scalar(select(Campus.id))
    if campus_total is not None and session.scalar(select(User.id)) is not None:
        raise RuntimeError("Database already seeded. Run reset_and_seed() or truncate first.")

    roles = seed_roles(session)
    org = seed_org(session)
    org["roles_student_id"] = roles[RoleKey.STUDENT.value].id
    workflows = seed_workflows(session, org["campus"])
    services = seed_services(session, org["campus"], org, workflows)
    seed_policies(session, org["campus"])
    seed_sla_rules(session, org["campus"])
    people = seed_users(session, org["campus"], roles, org)

    cases = seed_cases(session, org, people, services, workflows)
    documents = seed_documents(session, org, people, cases)
    gate = seed_gate(session, org, people, cases)
    notices = seed_notices(session, org, people)

    # A pending outbox item so the sync screen has something real to show.
    device = Device(
        campus_id=org["campus"].id,
        user_id=people["users"]["student"].id,
        device_uid="demo-phone-01",
        platform="android-chrome",
        user_agent="Mozilla/5.0 (Linux; Android 10) Mobile Safari",
        last_seen_at=clock.now(),
    )
    session.add(device)

    session.add(
        SyncOperation(
            campus_id=org["campus"].id,
            user_id=people["users"]["student"].id,
            device_id="demo-phone-01",
            idempotency_key="seed-offline-op-1",
            operation="CASE_CREATE",
            entity_type="CASE",
            entity_id=str(cases[-1].id),
            status="SYNCED",
            attempts=1,
            payload={"service_key": cases[-1].service_key, "note": "Queued while offline, replayed once."},
            response={"detail": "Applied once; a retry returned the same case."},
            captured_offline_at=clock.now() - timedelta(hours=3),
            synced_at=clock.now() - timedelta(hours=2),
        )
    )

    session.add(
        AuditLog(
            campus_id=org["campus"].id,
            event_type="SEED_RESET",
            actor_role=RoleKey.SUPER_ADMIN.value,
            actor_kind="SYSTEM",
            entity_type="SYSTEM",
            entity_id="seed",
            payload={
                "marker": "DEMO DATA",
                "cases": len(cases),
                "notices": len(notices),
                "documents": len(documents),
                "gate_passes": len(gate["passes"]),
                "students": len(people["students"]),
            },
        )
    )

    session.flush()

    def count(model) -> int:
        return int(session.scalar(select(func.count(model.id))) or 0)

    return {
        "marker": "DEMO DATA",
        "students": count(Student),
        "staff": count(Staff),
        "users": count(User),
        "locations": count(Location),
        "assets": count(Asset),
        "services": len(services),
        "workflows": len(workflows),
        "cases": len(cases),
        "notices": len(notices),
        "documents": len(documents),
        "gate_passes": len(gate["passes"]),
        "gate_logs": len(gate["logs"]),
        "demo_accounts": DEMO_ACCOUNTS,
    }


def reset_and_seed_cli() -> None:
    summary = reset_and_seed()
    print("Seeded demo campus:")
    for key, value in summary.items():
        if key != "demo_accounts":
            print(f"  {key}: {value}")
    print("\nDEMO ACCOUNTS (password for all):", DEMO_PASSWORD)
    for account in DEMO_ACCOUNTS:
        print(f"  {account['email']:<42} {account['label']}")


if __name__ == "__main__":
    reset_and_seed_cli()
