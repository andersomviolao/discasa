@echo off
setlocal

rem Detect the folder where this .bat is located
set "PROJECT_DIR=%~dp0"

rem Remove trailing backslash if present
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

start "Discasa Server" cmd /k "cd /d ""%PROJECT_DIR%"" && npm run dev:server"
timeout /t 2 >nul
start "Discasa Desktop" cmd /k "cd /d ""%PROJECT_DIR%"" && npm --workspace @discasa/desktop exec tauri dev"

endlocal
