@echo off
REM ============================================================================
REM CRYSTAL STUDIO LABS - CAMPUS RELAY
REM Backend launcher: migrations, then the FastAPI API.
REM
REM Run this on its own for a backend-only session, or let run.bat call it.
REM Options:
REM   backend.bat            migrate + serve with autoreload (development)
REM   backend.bat --no-reload  serve without autoreload (closer to production)
REM   backend.bat --no-migrate skip "alembic upgrade head"
REM ============================================================================
setlocal EnableDelayedExpansion
title Campus Relay - Backend API

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

REM Defaults, overridden by config.bat when present.
set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=8000"
set "POSTGRES_HOST=127.0.0.1"
set "POSTGRES_PORT=5432"
set "AUTO_RUN_MIGRATIONS=true"
if exist "%PROJECT_ROOT%config.bat" call "%PROJECT_ROOT%config.bat"

set "DO_MIGRATE=%AUTO_RUN_MIGRATIONS%"
set "RELOAD=--reload"
for %%A in (%*) do (
    if /i "%%~A"=="--no-reload" set "RELOAD="
    if /i "%%~A"=="--no-migrate" set "DO_MIGRATE=false"
)

REM --- Locate Python ---------------------------------------------------------
set "PYTHON_EXE="
if defined CUSTOM_PYTHON_EXE if exist "%CUSTOM_PYTHON_EXE%" set "PYTHON_EXE=%CUSTOM_PYTHON_EXE%"
if not defined PYTHON_EXE if exist "%PROJECT_ROOT%backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%backend\.venv\Scripts\python.exe"
)
if not defined PYTHON_EXE (
    for /f "delims=" %%I in ('where python 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
)
if not defined PYTHON_EXE (
    echo [X] Python was not found. Create backend\.venv or install Python 3.10+.
    pause
    exit /b 1
)

REM --- Wait for PostgreSQL (best effort) --------------------------------------
powershell -NoProfile -Command "$t = New-Object Net.Sockets.TcpClient; try { $t.Connect('%POSTGRES_HOST%', %POSTGRES_PORT%); exit 0 } catch { exit 1 } finally { $t.Dispose() }" >nul 2>&1
if !errorlevel! neq 0 (
    echo [!] PostgreSQL is not reachable at %POSTGRES_HOST%:%POSTGRES_PORT%.
    echo     Start Docker Desktop, run "docker compose up -d db", or start a local server.
)

REM --- Migrations -------------------------------------------------------------
if /i "%DO_MIGRATE%"=="true" (
    echo [*] Applying database migrations...
    "%PYTHON_EXE%" -m alembic upgrade head
    if !errorlevel! neq 0 (
        echo [!] Migration failed or the database was unreachable. Starting anyway.
    ) else (
        echo     [+] Schema is up to date.
    )
)

REM --- Serve ------------------------------------------------------------------
echo.
echo [*] Starting FastAPI on http://%BACKEND_HOST%:%BACKEND_PORT%
echo     API docs: http://%BACKEND_HOST%:%BACKEND_PORT%/docs
echo.
"%PYTHON_EXE%" -m uvicorn app.main:app --host %BACKEND_HOST% --port %BACKEND_PORT% %RELOAD%
if !errorlevel! neq 0 (
    echo [X] The API exited with an error.
    pause
)
endlocal
