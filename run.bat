@echo off
setlocal EnableDelayedExpansion
title Campus Relay — Master Controller

REM ============================================================================
REM CRYSTAL STUDIO LABS — CAMPUS RELAY
REM Master Launcher for Backend API and Frontend PWA
REM ============================================================================

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

REM Load configuration
if exist "%PROJECT_ROOT%config.bat" (
    call "%PROJECT_ROOT%config.bat"
) else (
    echo [!] config.bat not found. Using default environment settings.
    set "BACKEND_HOST=127.0.0.1"
    set "BACKEND_PORT=8000"
    set "FRONTEND_PORT=5173"
    set "POSTGRES_HOST=127.0.0.1"
    set "POSTGRES_PORT=5432"
    set "AUTO_START_DOCKER=true"
    set "AUTO_RUN_MIGRATIONS=true"
    set "AUTO_SEED_IF_EMPTY=true"
    set "AUTO_OPEN_BROWSER=true"
)

cls
echo ============================================================================
echo                      CRYSTAL STUDIO LABS -- CAMPUS RELAY
echo             "A resilient operating layer for everyday campus operations"
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM Step 1: Detect Python
REM ----------------------------------------------------------------------------
echo [*] Checking Python runtime...
set "PYTHON_EXE="

if defined CUSTOM_PYTHON_EXE if exist "%CUSTOM_PYTHON_EXE%" (
    set "PYTHON_EXE=%CUSTOM_PYTHON_EXE%"
)

if not defined PYTHON_EXE if exist "%PROJECT_ROOT%backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%PROJECT_ROOT%backend\.venv\Scripts\python.exe"
)

if not defined PYTHON_EXE (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "delims=" %%I in ('where python') do (
            if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
        )
    )
)

if not defined PYTHON_EXE (
    echo [X] ERROR: Python runtime could not be found!
    echo     Please create a virtual environment in backend\.venv or install Python 3.10+.
    pause
    exit /b 1
)
echo     Found Python: !PYTHON_EXE!

REM ----------------------------------------------------------------------------
REM Step 2: Detect Node / npm
REM ----------------------------------------------------------------------------
echo [*] Checking Node.js and npm...
set "NPM_CMD="

if defined CUSTOM_NPM_CMD if exist "%CUSTOM_NPM_CMD%" (
    set "NPM_CMD=%CUSTOM_NPM_CMD%"
)

if not defined NPM_CMD (
    for /f "delims=" %%I in ('where.exe npm.cmd 2^>nul') do (
        if not defined NPM_CMD set "NPM_CMD=%%I"
    )
    if not defined NPM_CMD (
        for /f "delims=" %%I in ('where.exe npm 2^>nul') do (
            if not defined NPM_CMD set "NPM_CMD=%%I"
        )
    )
)

set "VITE_EXE="
if exist "%PROJECT_ROOT%frontend\node_modules\.bin\vite.cmd" (
    set "VITE_EXE=%PROJECT_ROOT%frontend\node_modules\.bin\vite.cmd"
)

if not defined NPM_CMD if not defined VITE_EXE (
    echo [X] ERROR: npm or vite was not found!
    echo     Please install Node.js 18+ to run the frontend PWA.
    pause
    exit /b 1
)
if defined NPM_CMD echo     Found npm: !NPM_CMD!
if defined VITE_EXE echo     Found local Vite: !VITE_EXE!

REM Check node_modules
if not exist "%PROJECT_ROOT%frontend\node_modules" (
    echo [*] frontend\node_modules is missing. Installing frontend dependencies...
    cd /d "%PROJECT_ROOT%frontend"
    call "!NPM_CMD!" install
    if !errorlevel! neq 0 (
        echo [X] npm install failed.
        pause
        exit /b 1
    )
    cd /d "%PROJECT_ROOT%"
)

REM ----------------------------------------------------------------------------
REM Step 3: Check PostgreSQL Database
REM ----------------------------------------------------------------------------
echo [*] Checking PostgreSQL database at %POSTGRES_HOST%:%POSTGRES_PORT%...

:check_postgres
powershell -NoProfile -Command "$t = New-Object Net.Sockets.TcpClient; try { $t.Connect('%POSTGRES_HOST%', %POSTGRES_PORT%); exit 0 } catch { exit 1 } finally { $t.Dispose() }" >nul 2>&1
if %errorlevel% equ 0 (
    echo     [+] PostgreSQL is active and accepting connections.
    goto postgres_ready
)

echo     [-] PostgreSQL is not currently reachable on port %POSTGRES_PORT%.
if /i "%AUTO_START_DOCKER%"=="true" (
    where docker >nul 2>&1
    if !errorlevel! equ 0 (
        echo     [*] Attempting to launch PostgreSQL container via Docker Compose...
        docker compose up -d db >nul 2>&1
        if !errorlevel! equ 0 (
            echo     [*] Waiting for database container to initialize (up to 12s)...
            set /a attempts=0
            :wait_docker_pg
            set /a attempts+=1
            powershell -NoProfile -Command "Start-Sleep -Seconds 2"
            powershell -NoProfile -Command "$t = New-Object Net.Sockets.TcpClient; try { $t.Connect('%POSTGRES_HOST%', %POSTGRES_PORT%); exit 0 } catch { exit 1 } finally { $t.Dispose() }" >nul 2>&1
            if !errorlevel! equ 0 (
                echo     [+] PostgreSQL is now ready via Docker!
                goto postgres_ready
            )
            if !attempts! lss 6 goto wait_docker_pg
        ) else (
            echo     [-] Docker daemon is not active.
        )
    )
)

echo.
echo [!] WARNING: PostgreSQL is required for authoritative storage and state machine transitions.
echo     Option 1: Start Docker Desktop and re-try.
echo     Option 2: Start your local PostgreSQL service on port %POSTGRES_PORT%.
echo.
set /p pg_choice="[R]etry connection, [C]ontinue without DB check, or [Q]uit? [R/C/Q]: "
if /i "!pg_choice!"=="R" goto check_postgres
if /i "!pg_choice!"=="Q" exit /b 0
echo [!] Proceeding anyway...

:postgres_ready

REM ----------------------------------------------------------------------------
REM Step 4: Run Migrations and Seed Check
REM ----------------------------------------------------------------------------
if /i "%AUTO_RUN_MIGRATIONS%"=="true" (
    echo [*] Checking database migrations...
    cd /d "%PROJECT_ROOT%backend"
    "!PYTHON_EXE!" -m alembic upgrade head
    if !errorlevel! neq 0 (
        echo [!] Migration encountered an error or DB was unreachable.
    ) else (
        echo     [+] Database schema is up to date.
    )
    cd /d "%PROJECT_ROOT%"
)

if /i "%AUTO_SEED_IF_EMPTY%"=="true" (
    cd /d "%PROJECT_ROOT%backend"
    "!PYTHON_EXE!" -c "from app.core.db import session_scope; from app.models import Campus; from sqlalchemy import select; session = session_scope().__enter__(); count = session.scalar(select(Campus.id)); session.close(); exit(0 if count else 1)" >nul 2>&1
    if !errorlevel! equ 1 (
        echo [*] Database appears unseeded. Seeding realistic demo data...
        "!PYTHON_EXE!" -m app.seed.seed_data
        echo     [+] Demo dataset successfully seeded.
    )
    cd /d "%PROJECT_ROOT%"
)

REM ----------------------------------------------------------------------------
REM Step 5: Start Backend API & Frontend PWA
REM ----------------------------------------------------------------------------
echo.
REM Each service has its own launcher so it can also be run on its own:
REM   backend.bat   migrations + FastAPI        frontend.bat  Vite PWA
echo [*] Launching Campus Relay Backend API (migrate + serve)...
start "Campus Relay - Backend API" cmd /c ""%PROJECT_ROOT%backend.bat" || pause"

echo [*] Launching Campus Relay Frontend PWA (Vite React)...
start "Campus Relay - Frontend PWA" cmd /c ""%PROJECT_ROOT%frontend.bat" || pause"

REM ----------------------------------------------------------------------------
REM Step 6: Wait for servers & open browser
REM ----------------------------------------------------------------------------
echo [*] Waiting for services to initialize...
powershell -NoProfile -Command "Start-Sleep -Seconds 3"

if /i "%AUTO_OPEN_BROWSER%"=="true" (
    echo [*] Opening application in default browser...
    start "" "http://localhost:%FRONTEND_PORT%"
)

REM ----------------------------------------------------------------------------
REM Step 7: Controller Dashboard & Interactive Menu
REM ----------------------------------------------------------------------------
:menu_loop
cls
echo ============================================================================
echo                      CRYSTAL STUDIO LABS -- CAMPUS RELAY
echo             "A resilient operating layer for everyday campus operations"
echo ============================================================================
echo.
echo   [ACTIVE SERVICES]
echo   - Backend API  : http://%BACKEND_HOST%:%BACKEND_PORT%
echo   - API Docs     : http://%BACKEND_HOST%:%BACKEND_PORT%/docs (Interactive OpenAPI)
echo   - Frontend PWA : http://localhost:%FRONTEND_PORT%
echo   - Database     : PostgreSQL on %POSTGRES_HOST%:%POSTGRES_PORT% (%POSTGRES_DB%)
echo.
echo   [PRE-CONFIGURED DEMO ACCOUNTS]  Password for all: Campus@2026
echo   --------------------------------------------------------------------------
echo   Role               Account Email                       Access Scope
echo   --------------------------------------------------------------------------
echo   Super Admin        superadmin@campusrelay.demo         Full System Governance
echo   Administrator      admin@campusrelay.demo              Command Centre / SLA / Audit
echo   Hostel Warden      warden@campusrelay.demo             Leave Approvals / Hostel
echo   Maintenance Head   maintenance.head@campusrelay.demo   Dept Routing / Overdue
echo   Technician         technician@campusrelay.demo         Staff Task Execution
echo   Security Guard     security@campusrelay.demo           Pass Verification / Gate Logs
echo   Helpdesk Operator  helpdesk@campusrelay.demo           Assisted Desk / Kiosk
echo   Student (Hostel)   student@campusrelay.demo            Hostel Complaints / Passes
echo   Student (Day)      student2@campusrelay.demo           Day Scholar Workflows
echo   --------------------------------------------------------------------------
echo.
echo   [CONTROLLER ACTIONS]
echo   [O] Open Frontend PWA in Browser
echo   [D] Open API Interactive Documentation (/docs)
echo   [B] Start Backend alone (backend.bat)
echo   [F] Start Frontend alone (frontend.bat)
echo   [T] Run Automated End-to-End Test Suite (scripts.e2e_demo)
echo   [R] Reset and Re-seed Demo Dataset (app.seed.seed_data)
echo   [S] Stop all Campus Relay services and Exit
echo.
echo   Tip: if the UI looks unchanged after an update, hard-refresh (Ctrl+Shift+R)
echo        to drop the cached app shell.
echo.
set /p user_action="Select an option [O/D/B/F/T/R/S]: "

if /i "%user_action%"=="O" (
    start "" "http://localhost:%FRONTEND_PORT%"
    goto menu_loop
)

if /i "%user_action%"=="D" (
    start "" "http://%BACKEND_HOST%:%BACKEND_PORT%/docs"
    goto menu_loop
)

if /i "%user_action%"=="B" (
    start "Campus Relay - Backend API" cmd /c ""%PROJECT_ROOT%backend.bat" || pause"
    goto menu_loop
)

if /i "%user_action%"=="F" (
    start "Campus Relay - Frontend PWA" cmd /c ""%PROJECT_ROOT%frontend.bat" || pause"
    goto menu_loop
)

if /i "%user_action%"=="T" (
    echo.
    echo [*] Running End-to-End Verification Suite against live API...
    cd /d "%PROJECT_ROOT%backend"
    "!PYTHON_EXE!" -m scripts.e2e_demo --base-url "http://%BACKEND_HOST%:%BACKEND_PORT%"
    cd /d "%PROJECT_ROOT%"
    echo.
    pause
    goto menu_loop
)

if /i "%user_action%"=="R" (
    echo.
    echo [!] WARNING: This will wipe and rebuild all demo campus tables!
    set /p confirm_reset="Are you sure you want to re-seed? [Y/N]: "
    if /i "!confirm_reset!"=="Y" (
        cd /d "%PROJECT_ROOT%backend"
        "!PYTHON_EXE!" -m app.seed.seed_data
        cd /d "%PROJECT_ROOT%"
        echo.
        echo [+] Demo database successfully reset.
        pause
    )
    goto menu_loop
)

if /i "%user_action%"=="S" (
    goto stop_services
)

goto menu_loop

:stop_services
echo.
echo [*] Stopping Campus Relay services...
call "%PROJECT_ROOT%stop.bat"
echo [+] All Campus Relay services stopped.
exit /b 0
