@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_DIR=%%~fI"
set "URL=http://127.0.0.1:4280/"

cd /d "%PROJECT_DIR%"

echo Starting Haizong project from:
echo %PROJECT_DIR%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please install Node.js first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Opening %URL%
start "" "%URL%"
echo Starting dev server. Keep this window open while using the project.
echo.

call npm run dev

echo.
pause
