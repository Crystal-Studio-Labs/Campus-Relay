"""Public landing-page surface.

The landing page is the institution's front door, and a front door with nothing
behind it reads as an empty office. Everything here is deliberately public: live
service names, published notice headlines, and honest counts about the build.
No personal data, no draft content, nothing a campus would not put on a notice
board by the gate.
"""

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.core.config import settings
from app.models import Campus, Notice, Service
from app.models.enums import NoticeStatus
from app.models.workflow import Workflow

router = APIRouter(tags=["public"])


@router.get("/public/summary")
def public_summary(db: DbSession):
    """What a visitor sees before signing in: services, notice headlines, scale.

    Counts are exact and unauthenticated-safe: they describe the deployment's
    structure, never its people. Where the demo dataset inflates a number, the
    response says so, because a landing page that quietly counts seeded rows as
    if they were users would be exactly the kind of claim this product refuses
    to make elsewhere.
    """
    services = db.scalars(
        select(Service).order_by(Service.category, Service.name).limit(12)
    ).all()

    notices = db.scalars(
        select(Notice)
        .where(Notice.status == NoticeStatus.PUBLISHED.value)
        .order_by(Notice.publish_at.desc())
        .limit(3)
    ).all()

    service_count = db.scalar(select(func.count(Service.id))) or 0
    department_count = db.scalar(
        select(func.count(func.distinct(Service.department_id)))
    ) or 0
    workflow_count = db.scalar(select(func.count(Workflow.id))) or 0
    campus_count = db.scalar(select(func.count(Campus.id))) or 0

    return {
        "demo_mode": settings.is_demo_mode,
        "services": [
            {
                "key": service.key,
                "name": service.name,
                "category": service.category,
                "icon": service.icon,
                "description": service.description,
                "sla_minutes": service.default_sla_minutes,
            }
            for service in services
        ],
        "service_count": service_count,
        "department_count": department_count,
        "workflow_count": workflow_count,
        "campus_count": campus_count,
        "notices": [
            {
                "title": notice.title,
                "summary": notice.summary,
                "notice_type": notice.notice_type,
                "publish_at": notice.publish_at,
            }
            for notice in notices
        ],
    }
