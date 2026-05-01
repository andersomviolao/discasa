# Discasa App Documentation

This document covers the standalone Discasa desktop app repository.

## 1. Purpose

Discasa App is the local product surface for Discasa. It owns the desktop interface, local backend, synchronization decisions, pending upload previews, cache, thumbnails, settings, and runtime localization.

The hosted Discord bot lives in `..\Discasa_bot` and acts as a compact HTTP adapter for Discord operations that require bot identity.

## 2. Repository Layout

```text
Discasa
  apps/desktop
    src/App.tsx
    src/components
    src/i18n
    src/lib
    src-tauri
  apps/server
    src
  packages/shared
    src
  img
    app
    fonts
    scripts
    sources
```

## 3. App Responsibilities

- Discord OAuth and setup flow.
- Local API used by the desktop interface.
- Library, folder, trash, restore, and delete flows.
- Fixed `10 MiB` upload limit enforcement.
- Large-file chunking and manifest creation.
- Live pending previews while uploads are still processing.
- Recovery for interrupted local-path uploads.
- Snapshot creation, hydration, recovery, and URL relinking.
- Automatic import from `discasa-drive` and optional local mirror folders.
- Local file and thumbnail cache.
- Runtime language switching between English and Portuguese.
- App and bot diagnostics in Settings.

## 4. Bot Boundary

The app calls the bot through `DISCORD_BOT_URL`, usually:

```text
http://localhost:3002
```

The bot should remain a hosted Discord adapter. Product rules should stay in the app whenever possible.

## 5. Discord Storage

Discasa creates or reuses:

```text
Discasa
  #discasa-drive
  #discasa-index
  #discasa-trash
```

- `discasa-drive`: active files and chunk parts.
- `discasa-index`: index, folder, config, and installation snapshots.
- `discasa-trash`: trashed items.

## 6. Upload Flow

1. The user selects or drops files.
2. Tauri sends native local paths to `/api/upload-local`.
3. The UI creates pending items immediately.
4. The user can favorite, move, or trash pending items while upload continues.
5. The backend chunks files larger than `10 MiB`.
6. The bot uploads each attachment or chunk to Discord.
7. The app reconciles the final item with the pending id.
8. Snapshots and caches are updated.

Pending upload records are stored outside the normal library cache so interrupted previews cannot become permanent ghost files.

## 7. Localization

Runtime translation files live in:

```text
apps/desktop/src/i18n
  en.ts
  pt.ts
  index.ts
```

Language is stored in `DiscasaConfig.language`. Changing the setting applies immediately without restarting the app.

## 8. Development

Install:

```powershell
npm install
copy .env.example .env
```

Run app only:

```powershell
.\start-app.bat
```

Run with the sibling bot:

```powershell
.\start-all.bat
```

Validate:

```powershell
npm run check
npm run build:desktop
npm run build:server
```

## 9. Local Data

On Windows, Discasa uses:

```text
%APPDATA%\Discasa
%LOCALAPPDATA%\Discasa\Cache
```

Legacy Tauri paths may also exist under:

```text
%APPDATA%\com.andersomviolao.discasa
%LOCALAPPDATA%\com.andersomviolao.discasa
```

## 10. Maintenance Guidelines

- Keep the app repository responsible for user-facing behavior and state decisions.
- Keep the bot repository small and suitable for online hosting.
- Keep app images, source assets, and image scripts under `img`.
- Keep translations in sync when interface text changes.
- Validate desktop and server checks before pushing.
