@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "BOT_DIR=%ROOT_DIR%\..\Discasa_bot"
set "APP_DIR=%ROOT_DIR%\..\Discasa_app"

if not exist "%BOT_DIR%\package.json" (
  echo Discasa bot package not found in sibling repository: "%BOT_DIR%\package.json"
  echo Clone or create the bot repository at "%BOT_DIR%" or start only the app with start-app.bat.
  exit /b 1
)

if not exist "%APP_DIR%\package.json" (
  echo Discasa app package not found in sibling repository: "%APP_DIR%\package.json"
  echo Clone or create the app repository at "%APP_DIR%" or start the bot directly from Discasa_bot.
  exit /b 1
)

start "Discasa Bot" cmd /k "cd /d ""%BOT_DIR%"" && npm run dev"
timeout /t 2 >nul
start "Discasa Server" cmd /k "cd /d ""%APP_DIR%"" && npm run dev:server"
timeout /t 2 >nul
start "Discasa Desktop" cmd /k "cd /d ""%APP_DIR%"" && npm --workspace @discasa/desktop exec tauri dev"

endlocal
