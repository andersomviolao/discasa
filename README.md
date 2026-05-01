# Discasa App

Discasa App is the desktop application for Discasa. It provides the Tauri, React, and local backend experience that turns a Discord server into a private file and media library.

The hosted Discord bot is maintained separately in the sibling `Discasa_bot` repository. This app talks to that service through `DISCORD_BOT_URL`.

## What This Repository Contains

- Tauri 2 and React 19 desktop interface.
- Local Node.js/Express backend for OAuth, local APIs, persistence, cache, and synchronization.
- Shared TypeScript contracts used by the desktop and local backend.
- App-specific artwork, fonts, and asset-generation scripts.
- Runtime translation files for English and Portuguese.
- Local launchers for app-only and full-stack development.

## Layout

```text
Discasa
  apps/desktop     Tauri + React interface
  apps/server      Local backend used by the desktop app
  packages/shared  Shared contracts
  art              App artwork, fonts, and asset-generation scripts
  start-app.bat    Start only the app services
  start-all.bat    Start app plus sibling ..\Discasa_bot
  stop-app.bat     Stop app development ports
  stop-all.bat     Stop app and bot development ports
```

## Requirements

- Node.js 20 or newer.
- Rust and Tauri dependencies for desktop development.
- A Discord application with OAuth configured when `MOCK_MODE=false`.
- The bot repository at `..\Discasa_bot` for full-stack local development.

## Install

```powershell
npm install
copy .env.example .env
```

## Run

App only:

```powershell
.\start-app.bat
```

Full local stack, with `..\Discasa_bot` beside this repository:

```powershell
.\start-all.bat
```

Stop:

```powershell
.\stop-app.bat
.\stop-all.bat
```

## Checks

```powershell
npm run check
npm run build:desktop
npm run build:server
```

## Local Reset

```powershell
.\hard-reset.bat
```

The reset removes generated development artifacts and local Discasa app data. It does not delete Discord server channels, messages, or files.

## Documentation

See [documentation.md](documentation.md) for architecture, storage, upload, recovery, localization, and maintenance notes.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for project history.
