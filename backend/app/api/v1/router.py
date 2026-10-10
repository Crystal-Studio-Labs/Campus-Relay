"""v1 API router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    academics,
    admin,
    agents,
    auth,
    career,
    cases,
    catalog,
    clearance,
    engagement,
    fees,
    gate,
    hrms,
    institution,
    kiosk,
    leave,
    library,
    notices,
    notifications,
    public,
    sync,
    system,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(system.router)
api_router.include_router(institution.router)
api_router.include_router(catalog.router)
api_router.include_router(academics.router)
api_router.include_router(fees.router)
api_router.include_router(clearance.router)
api_router.include_router(library.router)
api_router.include_router(leave.router)
api_router.include_router(engagement.router)
api_router.include_router(career.router)
api_router.include_router(hrms.router)
api_router.include_router(cases.router)
api_router.include_router(notices.router)
api_router.include_router(notifications.router)
api_router.include_router(public.router)
api_router.include_router(gate.router)
api_router.include_router(sync.router)
api_router.include_router(agents.router)
api_router.include_router(kiosk.router)
api_router.include_router(admin.router)

__all__ = ["api_router"]
