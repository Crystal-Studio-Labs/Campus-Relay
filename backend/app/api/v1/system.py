"""System surface: health, generated documents, QR images and demo administration."""

import io

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, Response

from app.api.deps import CurrentUser, DbSession, assert_permission
from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.permissions import DASHBOARD_VIEW, DEMO_RESET
from app.models.enums import RoleKey
from app.services import clock, documents, scoping
from app.services import case_engine

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    """Liveness: no database access, so it answers even under DB pressure."""
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


@router.get("/meta")
def meta(db: DbSession, user: CurrentUser):
    """Deployment metadata the UI shows honestly (demo values, agents, channels)."""
    from app.services.agents import provider_status
    from app.services.notifications import channel_status, external_messaging_status

    return {
        "app": settings.app_name,
        "env": settings.app_env,
        "demo_mode": settings.is_demo_mode,
        "server_time": clock.now(),
        "clock_offset_minutes": clock.current_offset().total_seconds() / 60,
        "agents": provider_status(),
        "notification_channels": channel_status(),
        "external_messaging": external_messaging_status(),
        "demo_data": True,
    }


@router.get("/documents/{document_id}/download")
def download_document(document_id: int, db: DbSession, user: CurrentUser):
    document = db.get(documents.Document, document_id)
    if document is None:
        raise NotFoundError("Document not found.")
    if document.campus_id != user.campus_id:
        raise NotFoundError("Document not found.")

    # A student may download their own document; staff need dashboard access.
    own = False
    if document.student is not None and document.student.user_id == user.id:
        own = True
    if not own and DASHBOARD_VIEW not in user.permission_keys():
        raise NotFoundError("Document not found.")
    path = documents.document_path(document)
    return FileResponse(path, media_type="application/pdf", filename=f"{document.serial_no}.pdf")


@router.get("/documents/verify/{verification_code}")
def verify_document(db: DbSession, verification_code: str):
    """Public verification: confirms a serial exists and is not revoked."""
    return documents.verify_document(db, verification_code=verification_code)


@router.get("/qr/{code}.png")
def qr_image(code: str, size: int = Query(default=240, ge=80, le=800)):
    """Printable QR for a location or gate pass.

    The payload embeds no personal data, so this image is safe to stick on a wall.
    """
    import qrcode

    image = qrcode.make(code, box_size=10, border=2)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/locations/{code}/label")
def location_label(code: str, db: DbSession, user: CurrentUser):
    """Everything needed to print a physical QR sticker for a location."""
    location = case_engine.resolve_location(db, campus_id=user.campus_id, location_id=None, location_code=code)
    if location is None:
        raise NotFoundError("Location not found.")
    return {
        "code": location.code,
        "name": location.name,
        "kind": location.kind,
        "hostel": location.hostel.name if location.hostel else None,
        "room": location.room.number if location.room else None,
        "qr_image_url": f"/api/v1/qr/{location.code}.png",
        "instruction": "Scan this code to report an issue at this exact location.",
        "privacy_note": "The code contains only the location id - never a person.",
    }


@router.post("/admin/demo/reset")
def demo_reset(
    db: DbSession,
    user: CurrentUser,
    confirm: bool = Query(default=False),
    days_of_history: int = Query(default=30, ge=1, le=180),
):
    """DEMO TOOL: rebuild the demo campus from scratch."""
    assert_permission(user, DEMO_RESET)
    if user.role_key not in {RoleKey.SUPER_ADMIN.value, RoleKey.ADMIN.value}:
        from app.core.errors import PermissionDeniedError

        raise PermissionDeniedError("Only administrators can reset demo data.")
    if not confirm:
        from app.core.errors import ValidationError

        raise ValidationError("Set confirm=true to reset the demo dataset.")

    from app.seed.seed_data import reset_and_seed

    summary = reset_and_seed(days_of_history=days_of_history)
    return {"reset": True, "days_of_history": days_of_history, "summary": summary}
