@echo off
setlocal EnableExtensions

echo ==========================================
echo Discasa Bot - Stop
echo ==========================================
echo.

set "PORTS=3002"

for %%P in (%PORTS%) do (
  call :stop_port %%P
)

echo.
echo Done.
pause
exit /b 0

:stop_port
set "PORT=%~1"
echo Checking port %PORT%...

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; $connections | Select-Object -ExpandProperty OwningProcess -Unique"`) do (
  if not "%%I"=="" (
    echo Stopping process %%I on port %PORT%...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id %%I -Force -ErrorAction SilentlyContinue"
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Port %PORT% is still in use.
) else (
  echo Port %PORT% is free.
)
exit /b 0
