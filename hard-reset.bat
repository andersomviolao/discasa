@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "APP_DIR=%ROOT_DIR%\discasa_app"
set "BOT_DIR=%ROOT_DIR%\discasa_bot"
set "APP_ID=com.andersomviolao.discasa"
set "APP_NAME=Discasa"

echo ==========================================
echo Discasa - Hard Reset
echo ==========================================
echo.
echo Close the app and bot before running this reset.
echo.
echo This will remove generated development items:
echo - node_modules
echo - package-lock.json
echo - discasa_app\apps\desktop\dist
echo - discasa_app\apps\desktop\src-tauri\gen
echo - discasa_app\apps\desktop\src-tauri\target
echo - discasa_app\apps\server\dist
echo - discasa_bot\dist
echo.
echo This will also remove Discasa local app data:
echo - %%APPDATA%%\%APP_NAME%                 ^(auth, local metadata, saved runtime state^)
echo - %%LOCALAPPDATA%%\%APP_NAME%            ^(temporary cache, thumbnails, default local mirror^)
echo - %%APPDATA%%\%APP_ID%                   ^(legacy Tauri app data^)
echo - %%LOCALAPPDATA%%\%APP_ID%              ^(legacy Tauri cache^)
echo - discasa_app\apps\server\.discasa-data  ^(legacy prototype storage^)
echo.
echo This does not delete Discord server channels.
echo On the next setup, Discasa uses 3 Discord channels:
echo - discasa-drive
echo - discasa-index
echo - discasa-trash
echo.
choice /C YN /M "Continue"
if errorlevel 2 (
  echo Cancelled.
  exit /b 0
)

call :remove_dir "%APP_DIR%\node_modules"
call :remove_file "%APP_DIR%\package-lock.json"
call :remove_dir "%APP_DIR%\apps\desktop\node_modules"
call :remove_dir "%APP_DIR%\apps\desktop\dist"
call :remove_dir "%APP_DIR%\apps\desktop\src-tauri\gen"
call :remove_dir "%APP_DIR%\apps\desktop\src-tauri\target"
call :remove_dir "%APP_DIR%\apps\server\node_modules"
call :remove_dir "%APP_DIR%\apps\server\dist"
call :remove_dir "%BOT_DIR%\node_modules"
call :remove_file "%BOT_DIR%\package-lock.json"
call :remove_dir "%BOT_DIR%\dist"

call :remove_dir "%APPDATA%\%APP_NAME%"
call :remove_dir "%LOCALAPPDATA%\%APP_NAME%"
call :remove_dir "%APPDATA%\%APP_ID%"
call :remove_dir "%LOCALAPPDATA%\%APP_ID%"
call :remove_dir "%APP_DIR%\apps\server\.discasa-data"

echo.
echo Hard reset complete.
echo.

choice /C YN /M "Run npm install in discasa_app and discasa_bot now"
if errorlevel 2 goto ask_start

call :run_npm_install "%APP_DIR%" "Discasa app"
if errorlevel 1 goto end
call :run_npm_install "%BOT_DIR%" "Discasa bot"
if errorlevel 1 goto end

:ask_start
echo.
choice /C YN /M "Start Discasa bot and Discasa app now"
if errorlevel 2 goto end

call :start_discasa
goto end

:end
exit /b 0

:run_npm_install
set "INSTALL_DIR=%~1"
set "INSTALL_NAME=%~2"
if not exist "%INSTALL_DIR%\package.json" (
  echo package.json not found for %INSTALL_NAME%: %INSTALL_DIR%
  exit /b 1
)

echo.
echo Running npm install for %INSTALL_NAME%...
pushd "%INSTALL_DIR%"
call npm install
set "EXIT_CODE=%ERRORLEVEL%"
popd

if not "%EXIT_CODE%"=="0" (
  echo npm install failed for %INSTALL_NAME% with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo npm install finished successfully for %INSTALL_NAME%.
exit /b 0

:start_discasa
if not exist "%ROOT_DIR%\start.bat" (
  echo Root start script not found: %ROOT_DIR%\start.bat
  pause
  exit /b 1
)

echo.
echo Starting Discasa from root launcher...
call "%ROOT_DIR%\start.bat"
exit /b 0

:remove_dir
if exist "%~1" (
  echo Removing folder: %~1
  rmdir /s /q "%~1"
) else (
  echo Folder not found, skipping: %~1
)
exit /b 0

:remove_file
if exist "%~1" (
  echo Removing file: %~1
  del /f /q "%~1"
) else (
  echo File not found, skipping: %~1
)
exit /b 0
