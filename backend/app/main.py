"""Campus Relay API application."""

import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import AppError
from app.models import register_immutability_guards
from app.services import clock, delivery

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("campus_relay")

# Register append-only guards once, at import time, so no code path can slip past.
register_immutability_guards()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start the notification delivery worker beside the API, and stop it cleanly.

    Delivery to external providers (Telegram, WhatsApp, push) happens here rather
    than in a request, so no gateway latency is ever paid by the person filing a
    case. Disabled automatically under APP_ENV=test.
    """
    stop = delivery.start_worker()
    try:
        yield
    finally:
        delivery.stop_worker(stop)


app = FastAPI(
    title="Campus Relay API",
    lifespan=lifespan,
    description=(
        "A resilient operating layer for everyday campus operations. "
        "Every campus request becomes a trackable case; every action becomes an auditable event."
    ),
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms"],
)

# --- In-process rate limiting (best effort; enough for a demo deployment) ---
_hits: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def observe_and_limit(request: Request, call_next):
    started = time.perf_counter()

    if settings.app_env != "test":
        client = request.client.host if request.client else "unknown"
        bucket = _hits[client]
        now = time.time()
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        limit = settings.rate_limit_per_minute
        if len(bucket) >= limit:
            logger.warning("rate limit exceeded client=%s path=%s", client, request.url.path)
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please slow down.",
                        "details": {"limit_per_minute": limit},
                    }
                },
            )
        bucket.append(now)

    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    if elapsed_ms > 1500:
        logger.warning(
            "slow request path=%s method=%s duration_ms=%.1f",
            request.url.path,
            request.method,
            elapsed_ms,
        )
    return response


# --- Error handling: safe messages, no stack traces or SQL leaked to clients ---


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    if exc.status_code >= 500:
        logger.error("application error path=%s code=%s", request.url.path, exc.code)
    else:
        logger.info("handled error path=%s code=%s", request.url.path, exc.code)
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # Field-level detail is useful and safe; values are never echoed back.
    fields = [
        {"field": ".".join(str(p) for p in error.get("loc", [])), "message": error.get("msg")}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Some fields were not valid.",
                "details": {"fields": fields},
            }
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("database error path=%s", request.url.path)
    del exc
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "database_unavailable",
                "message": (
                    "The service could not complete that operation. Nothing was saved - "
                    "please retry, or keep working offline if you are on the PWA."
                ),
                "details": {},
            }
        },
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logger.exception("unhandled error path=%s", request.url.path)
    del exc
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "Something went wrong on our side. The operation was not reported as successful.",
                "details": {},
            }
        },
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", include_in_schema=False)
def root():
    return {
        "name": settings.app_name,
        "tagline": "A resilient operating layer for everyday campus operations.",
        "api": settings.api_v1_prefix,
        "docs": "/docs",
        "server_time": clock.now(),
    }
