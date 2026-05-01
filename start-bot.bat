@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "BOT_DIR=%ROOT_DIR%\discasa_bot"

if not exist "%BOT_DIR%\package.json" (
  echo Discasa bot package not found: "%BOT_DIR%\package.json"
  exit /b 1
)

start "Discasa Bot" cmd /k "cd /d ""%BOT_DIR%"" && npm run dev"

endlocal
