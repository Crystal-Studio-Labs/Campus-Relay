# Campus Relay API - container image.
#
# Build context is the REPOSITORY ROOT, not backend/, because the institution
# template lives in config/ at the root and is read relative to the repository
# (see app/core/institution.py::repository_root).
#
#   docker build -f backend/Dockerfile -t campus-relay-api .
#   docker run -p 8000:8000 -e DATABASE_URL=... campus-relay-api
#
# Also used by docker-compose.selfhost.yml for the single-machine install.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# psycopg[binary] needs no build toolchain, but curl is handy for healthchecks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Layout mirrors the repository so institution.py's parents[3] resolves to /app.
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY config/ /app/config/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

# Apply migrations, then serve. Seeding is a separate, explicit step (see
# docker-compose.selfhost.yml) so a production database is never wiped by a
# redeploy.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
