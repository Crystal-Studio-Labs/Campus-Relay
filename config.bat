@echo off
REM ============================================================================
REM CRYSTAL STUDIO LABS — CAMPUS RELAY
REM Environment Configuration for Batch Launchers
REM ============================================================================

REM Server Network Bindings
set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=5173"

REM PostgreSQL Database Settings (matches docker-compose.yml and backend/.env)
set "POSTGRES_HOST=127.0.0.1"
set "POSTGRES_PORT=5432"
set "POSTGRES_DB=campus_relay"
set "POSTGRES_USER=campus"
set "POSTGRES_PASSWORD=campus"

REM Automation Options
set "AUTO_START_DOCKER=true"
set "AUTO_RUN_MIGRATIONS=true"
set "AUTO_SEED_IF_EMPTY=true"
set "AUTO_OPEN_BROWSER=true"

REM Paths (Leave blank to automatically detect project venv and system PATH)
set "CUSTOM_PYTHON_EXE="
set "CUSTOM_NPM_CMD="
