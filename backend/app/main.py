"""Campus Relay API application."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import AppError
from app.core.ratelimit import PER_ADDRESS_RULE, Rule, SlidingWindowLimiter, rule_for
from app.core.security import decode_access_token
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
    expose_headers=["X-Process-Time-Ms", "Retry-After"],
)

# --- In-process rate limiting (best effort; enough for a demo deployment) ---
# The limiter caps how many client buckets it will remember, so a stream of
# distinct addresses cannot be used to grow this table without bound.
limiter = SlidingWindowLimiter()

# The health probe is deliberately exempt. Clients use it to tell a live
# server from a captive portal, so throttling it would make a busy client
# report itself offline instead of busy.
_RATE_LIMIT_EXEMPT = frozenset({"/api/v1/health", "/health"})

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    # The API serves images (QR stickers) and attachments that a separately
    # hosted frontend loads by URL, so this must stay cross-origin. Locking it
    # to same-origin would break a split deployment.
    "Cross-Origin-Resource-Policy": "cross-origin",
}


def _address(request: Request) -> str:
    """The socket address - never a client-supplied header.

    ``X-Forwarded-For`` is trivially spoofed, so keying on it would let one
    attacker mint unlimited rate-limit buckets and walk straight past the
    limiter. A deployment that needs true client IPs terminates at a proxy and
    rate limits there as well.
    """
    return request.client.host if request.client else "unknown"


def _client_key(request: Request) -> str:
    """Who is spending this budget: the signed-in account, else the address.

    A campus address is usually shared by a whole hostel through NAT, so one
    allowance per address would have every student on it competing for the same
    240 requests a minute - a busy dormitory would throttle itself. Reading the
    account id out of the bearer token costs one HMAC and needs no database, so
    each signed-in person gets their own budget. Unauthenticated traffic (and
    traffic with a forged or expired token) falls back to the address, which is
    then also held to the looser per-address ceiling.
    """
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            payload = decode_access_token(authorization.split(" ", 1)[1].strip())
            user_id = int(payload.get("uid", 0))
            if user_id:
                return f"u:{user_id}"
        except Exception:  # noqa: BLE001 - an unusable token is just unauthenticated
            pass
    return f"ip:{_address(request)}"


def _with_cors(request: Request, headers: dict[str, str]) -> dict[str, str]:
    """Add CORS headers to a response that short-circuits before CORSMiddleware.

    Without them a throttled or refused response reads to the browser as an
    opaque CORS failure, and the client cannot see the status or Retry-After.
    """
    origin = request.headers.get("origin")
    if origin and origin in settings.cors_origin_list:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Expose-Headers"] = "Retry-After"
        headers["Vary"] = "Origin"
    return headers


def _apply_security_headers(request: Request, response) -> None:
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    # HSTS only over TLS: sending it from a plain-HTTP development server would
    # make a browser refuse to load that host over HTTP for a year.
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if request.url.scheme == "https" or forwarded == "https":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )


@app.middleware("http")
async def observe_and_limit(request: Request, call_next):
    started = time.perf_counter()
    path = request.url.path

    if settings.app_env != "test" and request.method != "OPTIONS" and path not in _RATE_LIMIT_EXEMPT:
        # Refuse an oversized body from its declared length, before it is read.
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > settings.max_request_bytes:
            logger.warning("request too large path=%s bytes=%s", path, declared)
            return JSONResponse(
                status_code=413,
                headers=_with_cors(request, {}),
                content={
                    "error": {
                        "code": "payload_too_large",
                        "message": "That request is larger than this server accepts.",
                        "details": {"max_bytes": settings.max_request_bytes},
                    }
                },
            )

        # The general budget stays configurable; the strict per-path rules
        # (sign-in, CSV import, QR rendering) deliberately do not.
        rule: Rule = rule_for(
            path, Rule(limit=settings.rate_limit_per_minute, window_seconds=60)
        )
        key = _client_key(request)
        allowed, retry_after = limiter.check(key, rule)
        # Every request is also charged to its address, so a flood cannot be
        # spread across many accounts to stay under the ceiling. The `net:`
        # namespace is deliberate: an anonymous request is already keyed by its
        # address, and reusing that same bucket here would charge it twice and
        # halve every anonymous budget.
        if allowed:
            allowed, retry_after = limiter.check(f"net:{_address(request)}", PER_ADDRESS_RULE)
        if not allowed:
            logger.warning("rate limit exceeded client=%s path=%s", key, path)
            # Tell the client when a slot frees up, so it backs off for that long
            # instead of treating a throttle as a network failure.
            return JSONResponse(
                status_code=429,
                headers=_with_cors(request, {"Retry-After": str(retry_after)}),
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please slow down.",
                        "details": {
                            "limit_per_window": rule.limit,
                            "window_seconds": int(rule.window_seconds),
                            "retry_after_seconds": retry_after,
                        },
                    }
                },
            )

    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    _apply_security_headers(request, response)
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
