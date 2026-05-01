@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "APP_RESET=%ROOT_DIR%\..\Discasa_app\hard-reset.bat"

if not exist "%APP_RESET%" (
  echo Discasa app reset script not found in sibling repository:
  echo "%APP_RESET%"
  exit /b 1
)

call "%APP_RESET%"
endlocal
