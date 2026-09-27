"""Document generation: real, verifiable PDFs written to local storage.

A generated document carries a serial number and a verification code, and its
SHA-256 is stored, so an administrator can prove which bytes were issued.
"""

import hashlib
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.security import new_code
from app.models import Case, Document, Student, User
from app.models.enums import AuditEventType, DocumentKind, NotificationCategory
from app.services import audit, clock, notifications


def media_root() -> Path:
    root = Path(settings.media_root)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / settings.media_root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _next_serial(db: Session, *, campus_id: int, year: int, prefix: str = "CR") -> str:
    count = int(
        db.scalar(select(func.count(Document.id)).where(Document.campus_id == campus_id)) or 0
    )
    for attempt in range(50):
        serial = f"{prefix}-{year}-{count + 1 + attempt:05d}"
        if db.scalar(select(Document.id).where(Document.serial_no == serial)) is None:
            return serial
    raise ConflictError("Could not allocate a document serial number; please retry.")


def _unique_verification_code(db: Session) -> str:
    for _ in range(20):
        code = new_code(10)
        if db.scalar(select(Document.id).where(Document.verification_code == code)) is None:
            return code
    raise ConflictError("Could not allocate a verification code; please retry.")


def _student_for_case(db: Session, case: Case) -> Student:
    student = None
    if case.requester_student_id:
        student = db.get(Student, case.requester_student_id)
    if student is None and case.requester_id:
        student = db.scalar(select(Student).where(Student.user_id == case.requester_id))
    if student is None:
        raise ValidationError("This case has no student record to print.")
    return student


def render_bonafide_pdf(
    *,
    campus_name: str,
    student: Student,
    purpose: str | None,
    serial_no: str,
    verification_code: str,
    issued_on: date,
    destination_path: Path,
) -> None:
    """Render the certificate. Kept deliberately plain and print-friendly."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdf_canvas

    page_width, page_height = A4
    c = pdf_canvas.Canvas(str(destination_path), pagesize=A4)
    c.setLineWidth(3)
    c.setStrokeColor(colors.black)
    c.rect(24, 24, page_width - 48, page_height - 48, stroke=1, fill=0)
    c.setLineWidth(1)
    c.rect(34, 34, page_width - 68, page_height - 68, stroke=1, fill=0)

    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(page_width / 2, page_height - 90, campus_name.upper())
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(page_width / 2, page_height - 120, "BONAFIDE CERTIFICATE")

    c.setFont("Helvetica", 11.5)
    branch = student.branch.name if student.branch else "the institute"
    year_name = student.year.name if student.year else ""
    roll = student.roll_number
    name = student.full_name

    lines = [
        "",
        "This is to certify that",
        "",
    ]
    y = page_height - 170
    for line in lines:
        c.setFont("Helvetica", 12)
        c.drawCentredString(page_width / 2, y, line)
        y -= 20

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(page_width / 2, y, name)
    y -= 26

    c.setFont("Helvetica", 12)
    body = [
        f"bearing Roll Number {roll},",
        f"is a bona fide student of {branch}{(' , ' + year_name) if year_name else ''}",
        "of this institution for the current academic session.",
        "",
        f"The certificate is issued on request for: {purpose or 'official purposes'}.",
    ]
    for line in body:
        c.drawCentredString(page_width / 2, y, line)
        y -= 20

    hostel = student.hostel.name if student.hostel else None
    room = student.room.number if student.room else None
    if hostel:
        c.drawCentredString(page_width / 2, y, f"Hostel: {hostel}{(' / Room ' + room) if room else ''}")
        y -= 20

    c.setFont("Helvetica", 9.5)
    c.drawString(46, 96, f"Serial: {serial_no}")
    c.drawString(46, 82, f"Verification code: {verification_code}")
    c.drawString(46, 68, f"Issued on: {issued_on.isoformat()}")

    c.setFont("Helvetica", 11)
    c.drawString(60, 130, "_________________________")
    c.drawString(60, 116, "Authorised Signatory")
    c.drawRightString(page_width - 60, 130, "_________________________")
    c.drawRightString(page_width - 60, 116, "Registrar / Dean")

    c.showPage()
    c.save()


def generate_bonafide(
    db: Session,
    *,
    case: Case,
    actor: User,
    purpose: str | None = None,
    campus_name: str = "Campus",
) -> Document:
    """Issue the certificate for an approved case and record the audit trail."""
    existing = db.scalar(
        select(Document).where(
            Document.case_id == case.id,
            Document.kind == DocumentKind.BONAFIDE_CERTIFICATE.value,
            Document.is_revoked.is_(False),
        )
    )
    if existing is not None:
        return existing

    student = _student_for_case(db, case)
    now = clock.now()
    serial_no = _next_serial(db, campus_id=case.campus_id, year=now.year)
    verification_code = _unique_verification_code(db)

    relative = Path("documents") / str(case.campus_id) / f"{serial_no}.pdf"
    destination = media_root() / relative
    destination.parent.mkdir(parents=True, exist_ok=True)

    render_bonafide_pdf(
        campus_name=campus_name,
        student=student,
        purpose=purpose or (case.state_payload or {}).get("purpose"),
        serial_no=serial_no,
        verification_code=verification_code,
        issued_on=now.date(),
        destination_path=destination,
    )

    digest = hashlib.sha256(destination.read_bytes()).hexdigest()

    document = Document(
        campus_id=case.campus_id,
        case_id=case.id,
        student_id=student.id,
        kind=DocumentKind.BONAFIDE_CERTIFICATE.value,
        serial_no=serial_no,
        verification_code=verification_code,
        title="Bonafide Certificate",
        storage_path=str(relative).replace("\\", "/"),
        sha256=digest,
        issued_at=now,
        generated_by_id=actor.id,
        meta={
            "purpose": purpose or (case.state_payload or {}).get("purpose"),
            "student_name": student.full_name,
            "roll_number": student.roll_number,
            "branch": student.branch.name if student.branch else None,
            "year": student.year.name if student.year else None,
        },
    )
    db.add(document)
    case.state_payload = {
        **(case.state_payload or {}),
        "document_serial": serial_no,
        "document_verification_code": verification_code,
        "document_path": document.storage_path,
    }

    audit.record_case_event(
        db,
        case_id=case.id,
        campus_id=case.campus_id,
        event_type=AuditEventType.DOCUMENT_GENERATED.value,
        actor=actor,
        step_key=case.current_step_key,
        payload={
            "document": document.kind,
            "serial_no": serial_no,
            "verification_code": verification_code,
            "sha256": digest,
        },
    )

    # Completing the generation step advances the certificate workflow.
    from app.models.enums_map import can_transition
    from app.services.workflow import WorkflowRunner

    runner = WorkflowRunner(db, case)
    advance = runner.advance("issue")
    if advance.next_status == "CLOSED":
        if can_transition(case.status, "RESOLVED"):
            case_engine_transition(db, case, "RESOLVED", actor)
        if can_transition(case.status, "CLOSED"):
            case_engine_transition(db, case, "CLOSED", actor)
    elif advance.next_status and can_transition(case.status, advance.next_status):
        case_engine_transition(db, case, advance.next_status, actor)

    notifications.notify_case_stakeholders(
        db,
        case=case,
        category=NotificationCategory.CERTIFICATE_READY.value,
        title=f"{document.title} is ready",
        body=f"Serial {serial_no}. Open the case to view or download it.",
        action_label="View certificate",
        action_type="OPEN_DOCUMENT",
        action_target=f"/cases/{case.id}",
        include_requester=True,
        include_staff=False,
        dedupe_suffix="certificate-ready",
    )
    return document


def case_engine_transition(db: Session, case: Case, to_status: str, actor: User) -> None:
    """Advance a case through the engine without duplicating its rules here."""
    from app.services import case_engine

    case_engine._transition(db, case, to_status, actor=actor, actor_kind="SYSTEM")


def document_path(document: Document) -> Path:
    path = media_root() / document.storage_path
    if not path.exists():
        raise NotFoundError("The generated document file is missing.")
    return path


def verify_document(db: Session, *, verification_code: str) -> dict:
    """Public-safe verification used by the 'verify document' screen."""
    document = db.scalar(
        select(Document).where(Document.verification_code == verification_code.strip().upper())
    )
    if document is None:
        return {"valid": False, "reason": "NOT_FOUND"}
    return {
        "valid": not document.is_revoked,
        "reason": "REVOKED" if document.is_revoked else None,
        "serial_no": document.serial_no,
        "title": document.title,
        "kind": document.kind,
        "issued_at": document.issued_at,
        "revoked": document.is_revoked,
        # Deliberately limited: verification must not expose a student dossier.
        "holder": (document.meta or {}).get("student_name"),
        "roll_number": (document.meta or {}).get("roll_number"),
    }


def list_documents(db: Session, *, campus_id: int, limit: int = 100) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.campus_id == campus_id)
            .order_by(Document.issued_at.desc())
            .limit(limit)
        ).all()
    )


def parse_iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return clock.ensure_aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None
