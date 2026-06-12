@echo off
setlocal

set "LAUNCHER_DIR=%~dp0"
for %%I in ("%LAUNCHER_DIR%..") do set "PROJECT_DIR=%%~fI"

if not exist "%PROJECT_DIR%\package.json" (
  echo [ERROR] package.json not found.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo ========================================
echo   Haizong Project - Local Launcher
echo ========================================
echo.
echo Project: %PROJECT_DIR%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Starting server in a new window...
start "Haizong Server" cmd /c "cd /d "%PROJECT_DIR%" && npm run dev"

echo Waiting 6 seconds for server to start...
timeout /t 6 /nobreak

echo Opening browser...
start "" "http://127.0.0.1:4280/"

echo.
echo Done! Browser should open. Keep the server window running.
pause
