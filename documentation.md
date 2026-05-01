# Discasa Coordinator Documentation

This repository coordinates the local Discasa workspace after the app and bot were extracted into standalone repositories.

## 1. Local Workspace

Use this sibling layout:

```text
F:\scripts
  Discasa
  Discasa_app
  Discasa_bot
```

The coordinator launchers resolve paths relative to this repository and then start the app and bot from their own roots.

## 2. Repositories

### Discasa_app

Public repository:

```text
https://github.com/Discasa/Discasa_app
```

Contains:

- Tauri and React desktop interface;
- local Node.js backend;
- shared TypeScript contracts;
- app-specific artwork and generation scripts;
- English and Portuguese runtime translations;
- app-only documentation and launchers.

### Discasa_bot

Public repository:

```text
https://github.com/Discasa/Discasa_bot
```

Contains:

- hosted Discord bot HTTP service;
- Discord setup, upload, deletion, resolve, and snapshot endpoints;
- bot-specific artwork and documentation.

## 3. Coordinator Scripts

```text
start-all.bat   Start Discasa_app and Discasa_bot
stop-all.bat    Stop app and bot development ports
start-app.bat   Start sibling Discasa_app
stop-app.bat    Stop app development ports
start-bot.bat   Start sibling Discasa_bot
stop-bot.bat    Stop bot development port
hard-reset.bat  Delegate to ..\Discasa_app\hard-reset.bat
```

## 4. Development Ports

- `3001`: local app backend.
- `3002`: bot service.
- `1420`: Tauri/Vite desktop.
- `5173`: alternate Vite port in some scenarios.

## 5. Maintenance

- Keep app code in `Discasa_app`.
- Keep bot code in `Discasa_bot`.
- Keep this coordinator small and focused on workspace-level scripts and notes.
- Update sibling repository links when remotes change.
