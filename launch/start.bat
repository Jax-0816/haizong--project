@echo off
chcp 65001 >nul
setlocal

set "LAUNCHER_DIR=%~dp0"
for %%I in ("%LAUNCHER_DIR%..") do set "PROJECT_DIR=%%~fI"
set "URL=http://127.0.0.1:4280/"

if not exist "%PROJECT_DIR%\package.json" (
  echo [ERROR] Could not find package.json in the project root:
  echo %PROJECT_DIR%
  echo.
  echo Please make sure the entire project folder is extracted completely.
  echo 请确保整个项目文件夹已完整解压。
  echo.
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
  echo [ERROR] npm was not found. Please install Node.js first:
  echo https://nodejs.org/
  echo 请先安装 Node.js 20 或更高版本。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies, please wait...
  echo 正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo 依赖安装失败，请检查网络连接后重试。
    pause
    exit /b 1
  )
  echo.
)

echo Opening browser: %URL%
start "" "%URL%"
echo Starting dev server. Keep this window open while using the project.
echo 正在启动开发服务器，使用期间请勿关闭此窗口。
echo.

call npm run dev

echo.
echo Server stopped. Press any key to exit.
echo 服务器已停止，按任意键退出。
pause
