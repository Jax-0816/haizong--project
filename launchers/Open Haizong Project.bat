@echo off
setlocal

set "LAUNCHER_DIR=%~dp0"
for %%I in ("%LAUNCHER_DIR%..") do set "PROJECT_DIR=%%~fI"
set "SCRIPT_PATH=%PROJECT_DIR%\scripts\start-haizong.bat"

if not exist "%SCRIPT_PATH%" (
  echo Could not find the Windows launcher script:
  echo %SCRIPT_PATH%
  echo.
  pause
  exit /b 1
)

call "%SCRIPT_PATH%"
