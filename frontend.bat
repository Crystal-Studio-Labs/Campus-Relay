@echo off
REM ============================================================================
REM CRYSTAL STUDIO LABS - CAMPUS RELAY
REM Frontend launcher: installs dependencies when missing, then the Vite PWA.
REM
REM Options:
REM   frontend.bat             start the dev server (hot reload)
REM   frontend.bat --build     production build into frontend\dist
REM   frontend.bat --preview   build, then serve the built app
REM ============================================================================
setlocal EnableDelayedExpansion
title Campus Relay - Frontend PWA

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

set "FRONTEND_PORT=5173"
if exist "%PROJECT_ROOT%config.bat" call "%PROJECT_ROOT%config.bat"

set "MODE=dev"
for %%A in (%*) do (
    if /i "%%~A"=="--build" set "MODE=build"
    if /i "%%~A"=="--preview" set "MODE=preview"
)

REM --- Locate npm / local Vite ------------------------------------------------
set "NPM_CMD="
if defined CUSTOM_NPM_CMD if exist "%CUSTOM_NPM_CMD%" set "NPM_CMD=%CUSTOM_NPM_CMD%"
if not defined NPM_CMD for /f "delims=" %%I in ('where.exe npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
if not defined NPM_CMD for /f "delims=" %%I in ('where.exe npm 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"

set "VITE_EXE=%PROJECT_ROOT%frontend\node_modules\.bin\vite.cmd"

if not defined NPM_CMD if not exist "%VITE_EXE%" (
    echo [X] npm was not found. Install Node.js 18+ and retry.
    pause
    exit /b 1
)

cd /d "%PROJECT_ROOT%frontend"

REM --- Dependencies ------------------------------------------------------------
if not exist "node_modules" (
    echo [*] Installing frontend dependencies (first run)...
    if defined NPM_CMD (
        call "%NPM_CMD%" install
    ) else (
        echo [X] node_modules is missing and npm is unavailable.
        pause
        exit /b 1
    )
    if !errorlevel! neq 0 (
        echo [X] npm install failed.
        pause
        exit /b 1
    )
)

REM --- Run ---------------------------------------------------------------------
if /i "%MODE%"=="build" (
    echo [*] Building the production bundle into frontend\dist ...
    call "%NPM_CMD%" run build
    if !errorlevel! neq 0 pause
    endlocal
    exit /b 0
)

if /i "%MODE%"=="preview" (
    echo [*] Building, then previewing the production bundle ...
    call "%NPM_CMD%" run build
    call "%NPM_CMD%" run preview -- --port %FRONTEND_PORT%
    endlocal
    exit /b 0
)

echo.
echo [*] Starting the Campus Relay PWA on http://localhost:%FRONTEND_PORT%
echo.
if exist "%VITE_EXE%" (
    call "%VITE_EXE%" --port %FRONTEND_PORT%
) else (
    call "%NPM_CMD%" run dev -- --port %FRONTEND_PORT%
)
if !errorlevel! neq 0 (
    echo [X] The dev server exited with an error.
    pause
)
endlocal
