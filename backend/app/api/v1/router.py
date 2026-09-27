"""v1 API router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    agents,
    auth,
    cases,
    catalog,
    gate,
    institution,
    kiosk,
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
