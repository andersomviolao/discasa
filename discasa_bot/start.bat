@echo off
setlocal EnableExtensions

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

start "Discasa Bot" cmd /k "cd /d ""%PROJECT_DIR%"" && npm run dev"

endlocal
