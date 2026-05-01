@echo off
setlocal EnableExtensions

echo ==========================================
echo Discasa - Stop
echo ==========================================
echo.

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "APP_DIR=%ROOT_DIR%"
set "BOT_DIR=%ROOT_DIR%\..\Discasa_bot"
set "PORTS=3002 3001 5173 1420"

for %%P in (%PORTS%) do (
  call :stop_port %%P
)

echo.
echo Stopping Discasa processes...
set "DISCASA_APP_DIR=%APP_DIR%"
set "DISCASA_BOT_DIR=%BOT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$roots = @($env:DISCASA_APP_DIR, $env:DISCASA_BOT_DIR) | Where-Object { $_ } | ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd('\') };" ^
  "$names = @('cmd.exe','node.exe','discasa.exe','cargo.exe','rustc.exe','esbuild.exe');" ^
  "$currentPid = $PID;" ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { $process = $_; $commandLine = [string]$process.CommandLine; $executablePath = [string]$process.ExecutablePath; ($names -contains $process.Name) -and ($process.ProcessId -ne $currentPid) -and (($roots | Where-Object { $commandLine -like ('*' + $_ + '*') -or $executablePath -like ('*' + $_ + '*') }).Count -gt 0) };" ^
  "$targets | Sort-Object ProcessId -Unique | ForEach-Object { Write-Host ('Stopping process {0} ({1})' -f $_.ProcessId, $_.Name); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"

echo.
for %%P in (%PORTS%) do (
  call :check_port %%P
)

echo.
echo Discasa stop complete.
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
exit /b 0

:check_port
set "PORT=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Port %PORT% is still in use.
) else (
  echo Port %PORT% is free.
)
exit /b 0
