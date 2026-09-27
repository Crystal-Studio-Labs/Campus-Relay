@echo off
setlocal EnableDelayedExpansion
title Campus Relay — Shutdown Utility

REM ============================================================================
REM CRYSTAL STUDIO LABS — CAMPUS RELAY
REM Shutdown Script for Backend and Frontend Services
REM ============================================================================

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

if exist "%PROJECT_ROOT%config.bat" (
    call "%PROJECT_ROOT%config.bat"
) else (
    set "BACKEND_PORT=8000"
    set "FRONTEND_PORT=5173"
)

echo [*] Terminating Campus Relay active processes...

REM Terminate processes on backend and frontend ports cleanly
powershell -NoProfile -Command ^
    "$ports = @(%BACKEND_PORT%, %FRONTEND_PORT%); " ^
    "foreach ($port in $ports) { " ^
    "    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; " ^
    "    if ($conns) { " ^
    "        $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique; " ^
    "        foreach ($id in $procIds) { " ^
    "            try { " ^
    "                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; " ^
    "                Write-Host \"[+] Stopped process PID $id listening on port $port\"; " ^
    "            } catch {} " ^
    "        } " ^
    "    } " ^
    "}"

REM Terminate by window title if any lingered
taskkill /FI "WINDOWTITLE eq Campus Relay - Backend API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Campus Relay - Frontend PWA*" /T /F >nul 2>&1

echo [*] Backend and Frontend servers have been stopped.

REM Check if docker container should be stopped
where docker >nul 2>&1
if %errorlevel% equ 0 (
    set /p stop_docker="Do you also want to stop the PostgreSQL Docker container? [y/N]: "
    if /i "!stop_docker!"=="y" (
        echo [*] Stopping database container...
        docker compose stop db >nul 2>&1
        echo [+] PostgreSQL container stopped.
    )
)

echo [+] Shutdown complete.
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
exit /b 0
