@echo off
cd /d "%~dp0"
if not exist "launch\start.bat" (
  echo [ERROR] Could not find launch\start.bat
  echo Please make sure the entire project folder is extracted completely.
  echo 请确保整个项目文件夹完整解压后再运行。
  pause
  exit /b 1
)
call "launch\start.bat"
