# Discasa App

Discasa App is the desktop application for Discasa. It provides the Tauri, React, and local backend experience that turns a Discord server into a private file and media library.

The hosted Discord bot is maintained separately in the sibling `Discasa_bot` repository. This app talks to that service through `DISCORD_BOT_URL`.

## What This Repository Contains

- Tauri 2 and React 19 desktop interface.
- Local Node.js/Express backend for OAuth, local APIs, persistence, cache, and synchronization.
- Shared TypeScript contracts used by the desktop and local backend.
- App-specific images, fonts, source assets, and image-generation scripts under `img`.
- Runtime translation files for English and Portuguese.
- Local launchers for app-only and full-stack development.
- Folder uploads that create albums from selected folders, plus nested folders inside albums.
- Watched-folder imports and duplicate-file collection views.
- Optimistic library actions so moves, removes, trash, restore, delete, favorite, and album changes appear immediately.
- App-owned logical trash and restore, with all media stored in `discasa-drive` and Discord storage touched only for upload and permanent delete.
- Debounced Discord snapshot sync so fast local actions do not trigger redundant remote writes.

## Layout

```text
Discasa
  apps/desktop     Tauri + React interface
  apps/server      Local backend used by the desktop app
  packages/shared  Shared contracts
  img              App images, fonts, source assets, and asset-generation scripts
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

## Library Automation

- Uploading or dropping a folder at the library root creates an album named after that folder and places the discovered files inside it.
- Uploading or dropping a folder while an album or folder is open creates a nested folder inside that location. Nested folders are shown in the gallery, not in the sidebar.
- Folder tiles can be opened from the gallery, and the gallery toolbar includes controls to go up to the parent folder and create a folder in the current album.
- Folder tiles follow Explorer-style behavior: single click selects the folder and double click opens it.
- Folder tiles can be dragged onto sidebar albums or other folder targets to move that nested folder.
- Settings can enable a watched folder, such as a screenshots directory. Discasa periodically imports new stable files from that folder and shows them in the `Watched` collection.
- Discasa periodically groups duplicate library items in the `Duplicados` collection. The collection appears only while duplicates exist.
- Moving files between albums is exclusive: files are removed from previous album memberships and kept only in the destination album.

## Interface Responsiveness

Discasa applies common library actions optimistically in the desktop interface and lets the backend finish persistence and Discord snapshot synchronization in the background. Failed operations roll the affected local state back and surface an error.

Trash and restore are logical library states stored in the app-owned index snapshot. The bot is not asked to copy attachments between Discord channels for those actions. Permanent delete is the destructive storage operation: it is journaled before the UI response and resumes on the next start if the app is forced closed.

Automatic watched-folder and local-mirror imports keep their short polling loop. Expensive `discasa-drive` history scans are throttled separately so the bot is not asked to page through Discord history during normal file actions.

The gallery supports `Ctrl+A` to select all visible files. File right-click menus are custom Discasa menus, with different actions for active files, trashed files, and multi-file selections.

Thumbnail layout mode is persisted locally, so square and free-proportion viewing survive desktop restarts. The gallery header keeps album and folder titles compact, and zoom lives in the floating bottom control near toast notifications.

Settings are grouped by utility, with storage first, interface controls together, account status, diagnostics, and an About tab with version and repository details.

## Asset Layout

Image assets and source artwork live under `img`. Image-related helper scripts live under `img/scripts`.

## Local Reset

```powershell
.\hard-reset.bat
```

The reset removes generated development artifacts and local Discasa app data. It does not delete Discord server channels, messages, or files.

## Documentation

See [documentation.md](documentation.md) for architecture, storage, upload, recovery, localization, and maintenance notes.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for project history.

## License

This repository is licensed under the MIT License. See [LICENSE](LICENSE).
