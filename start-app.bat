@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "APP_DIR=%ROOT_DIR%"
set "DESKTOP_DIR=%APP_DIR%\apps\desktop"

if not exist "%APP_DIR%\package.json" (
  echo Discasa app package not found: "%APP_DIR%\package.json"
  exit /b 1
)

if not exist "%DESKTOP_DIR%\package.json" (
  echo Discasa desktop package not found: "%DESKTOP_DIR%\package.json"
  exit /b 1
)

start "Discasa Server" cmd /k "cd /d ""%APP_DIR%"" && npm run dev:server"
timeout /t 2 >nul
start "Discasa Desktop" cmd /k "cd /d ""%DESKTOP_DIR%"" && npm exec tauri dev"

endlocal
