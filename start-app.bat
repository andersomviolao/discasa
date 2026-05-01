@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "APP_DIR=%ROOT_DIR%\..\Discasa_app"

if not exist "%APP_DIR%\package.json" (
  echo Discasa app package not found in sibling repository: "%APP_DIR%\package.json"
  echo Clone or create the app repository at "%APP_DIR%".
  exit /b 1
)

start "Discasa Server" cmd /k "cd /d ""%APP_DIR%"" && npm run dev:server"
timeout /t 2 >nul
start "Discasa Desktop" cmd /k "cd /d ""%APP_DIR%"" && npm --workspace @discasa/desktop exec tauri dev"

endlocal
