# Discasa App Documentation

This document is the technical onboarding guide for the Discasa desktop app repository. A developer who has not worked on Discasa before should be able to use it to run the stack, find the right code, understand the app/bot boundary, and change behavior without accidentally moving product rules into the wrong repository.

## 1. Product And Repository Role

Discasa turns a Discord server into a private file and media library. The desktop app is the product surface and the local coordinator. It owns UI behavior, local persistence, file organization, upload orchestration, snapshots, recovery, cache, localization, settings, and all product decisions.

The hosted bot lives in the sibling `..\Discasa_bot` repository. The bot is intentionally a thin Discord adapter: it performs operations that require bot identity, such as channel setup, uploads, message deletion, attachment lookup, and snapshot storage. Do not move product rules into the bot unless the rule truly requires Discord bot identity.

## 2. Repository Layout

```text
Discasa
  apps/desktop
    src/App.tsx                 Main React state owner and feature coordinator
    src/components              UI components, modals, gallery, sidebar, viewer
    src/i18n                    Runtime translation catalogs and DOM translator
    src/lib/app-logic.ts        Frontend API client helpers and shared UI logic
    src/styles.css              App-wide styling
    src-tauri                   Tauri desktop shell
  apps/server
    src/index.ts                Local Express entrypoint
    src/routes.ts               Local API, auth, upload, sync, diagnostics
    src/persistence.ts          Local database, albums, folders, memberships, cache metadata
    src/bot-client.ts           HTTP client for Discasa_bot and Discord snapshot helpers
    src/local-storage.ts        Local mirror, watched folder, thumbnail cache, file reads
    src/config.ts               Environment loading
  packages/shared
    src/index.ts                Shared TypeScript contracts used by desktop and server
  img
    app                         Runtime app images
    fonts                       Bundled fonts
    scripts                     Image helper scripts
    sources                     Source artwork
  start-app.bat                 Start desktop frontend, backend, and Tauri app
  start-all.bat                 Start this app plus sibling ..\Discasa_bot
  stop-app.bat                  Stop app development services
  stop-all.bat                  Stop app and bot development services
```

## 3. Runtime Processes

In local development there are usually three services:

```text
Desktop frontend  http://localhost:1420  Vite + React
Local backend     http://localhost:3001  Express API used by the desktop
Hosted bot        http://localhost:3002  Sibling Discasa_bot service
```

Tauri opens the desktop window and points it at the Vite frontend. The frontend calls the local backend through API helpers in `apps/desktop/src/lib/app-logic.ts`. The backend calls the bot through `DISCORD_BOT_URL`.

## 4. Environment

Copy `.env.example` to `.env`.

```env
PORT=3001
FRONTEND_URL=http://localhost:1420
SESSION_SECRET=discasa-dev-session-secret
MOCK_MODE=true
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_URL=http://localhost:3002
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback
```

Important values:

- `PORT`: local backend port.
- `FRONTEND_URL`: URL allowed for CORS and OAuth return flow.
- `SESSION_SECRET`: local session signing secret.
- `MOCK_MODE`: when `true`, the app can develop without live Discord credentials.
- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`: OAuth application credentials used by the local backend.
- `DISCORD_BOT_URL`: URL for the hosted bot adapter.
- `DISCORD_REDIRECT_URI`: OAuth callback route exposed by the local backend.

## 5. Install, Run, Stop, Validate

Install:

```powershell
npm install
copy .env.example .env
```

Run only the app side:

```powershell
.\start-app.bat
```

Run the full local stack, with `..\Discasa_bot` beside this repository:

```powershell
.\start-all.bat
```

Stop:

```powershell
.\stop-app.bat
.\stop-all.bat
```

Validate before committing:

```powershell
npm run check
npm run build:desktop
npm run build:server
```

`npm run check` runs TypeScript for the desktop and local backend. If `@discasa/shared` cannot be resolved after a repository move, run `npm install` again from the repository root.

## 6. App/Bot Boundary

Keep these responsibilities in this repository:

- UI layout, interactions, drag and drop, viewer behavior, settings, localization.
- Library state, album/folder state, trash/favorite state, duplicate detection.
- Folder upload expansion, watched-folder scans, local mirror behavior.
- Chunking decisions, pending upload previews, interrupted upload recovery.
- Snapshot contents and reconciliation rules.
- Optimistic UI and rollback behavior.

Keep these responsibilities in `Discasa_bot`:

- Discord bot login.
- Discord category and channel creation.
- Attachment upload to a requested channel.
- Message deletion from Discord.
- Listing raw attachments in `discasa-drive`.
- Resolving a known attachment reference.
- Reading and writing snapshot blobs supplied by the app.

If a change asks "what should Discasa do?", it usually belongs in this app. If it asks "how does the bot perform this Discord operation?", it belongs in the bot.

## 7. Core Data Contracts

The shared contracts live in `packages/shared/src/index.ts`.

Important types:

- `LibraryItem`: one user-visible file. Includes file identity, MIME type, size, storage references, trash/favorite state, optional chunk manifest, saved media edits, content hash, watched-folder markers, and local preview URLs.
- `AlbumRecord`: a root album or nested folder shown in the UI. `type` is `"album"` for sidebar roots and `"folder"` for nested folders. `parentId` links nested folders.
- `FolderNode`: persisted folder tree node used in snapshots.
- `FolderMembership`: item-to-folder relation. Moving between albums is exclusive for current product behavior.
- `DiscasaConfig`: user settings persisted locally and synced by config snapshot.
- `LibraryItemStorageManifest`: chunk manifest for files larger than the fixed `10 MiB` upload part limit.
- `DiscasaAttachmentRecoveryWarning`: unresolved storage reference found during hydration/recovery.

Do not add fields independently in only one layer. A new persistent field usually needs updates in shared contracts, backend persistence/snapshot logic, UI typing, and bot snapshot preservation.

## 8. Discord Storage Model

Discasa creates or reuses this private Discord structure:

```text
Discasa
  #discasa-drive
  #discasa-index
  #discasa-trash
```

- `discasa-drive`: active file attachments and chunk parts.
- `discasa-index`: index, folder, config, and installation snapshots.
- `discasa-trash`: storage for files moved to trash.

The app treats Discord snapshots as durable remote state. The local backend persists local state first, then syncs snapshots through the bot. The bot stores the JSON it receives; it should not reinterpret product meaning.

Trash movement is split into two phases:

1. The backend marks items as trashed locally and records a pending remote operation before responding to the UI.
2. A background worker moves the Discord attachment or chunk manifest into `discasa-trash`, updates storage pointers, clears the pending operation, and syncs the index snapshot.

This keeps large batch actions fast in the UI while preserving recovery after a forced shutdown. If a stored Discord attachment URL has expired, the worker can reupload from the local mirror or thumbnail cache when a size-matched local file exists.

## 9. Local Backend API

Frontend helpers in `apps/desktop/src/lib/app-logic.ts` call the local backend routes in `apps/server/src/routes.ts`.

Main route groups:

```text
GET    /api/session
GET    /api/bot/status
GET    /api/diagnostics
GET    /api/guilds
GET    /api/discasa/status
POST   /api/discasa/initialize

GET    /api/config
PATCH  /api/config
GET    /api/local-storage
POST   /api/local-paths/inspect

GET    /api/albums
POST   /api/albums
PATCH  /api/albums/:albumId
PUT    /api/albums/reorder
DELETE /api/albums/:albumId
PUT    /api/albums/:albumId/items
PATCH  /api/albums/:albumId/items/move
PATCH  /api/albums/:albumId/items/remove

GET    /api/library
POST   /api/library/import-external-files
GET    /api/library/:itemId/content
GET    /api/library/:itemId/thumbnail
POST   /api/upload
POST   /api/upload-local
PATCH  /api/library/:itemId/favorite
PATCH  /api/library/trash
PATCH  /api/library/:itemId/trash
PATCH  /api/library/:itemId/restore
PATCH  /api/library/:itemId/media-edit
DELETE /api/library/:itemId/media-edit
DELETE /api/library/:itemId

GET    /auth/discord/login
GET    /auth/discord/install
POST   /auth/discord/logout
GET    /auth/discord/callback
```

Action routes persist local state before responding. For common action routes, Discord snapshot sync is queued in the background so the UI does not wait for remote writes. Use `PATCH /api/library/trash` for bulk trash moves; it accepts `{ "itemIds": string[] }` and returns after local persistence.

## 10. Upload Flow

Native local-path upload:

1. User drags files/folders or clicks upload.
2. Tauri supplies local paths to the frontend.
3. Frontend calls `/api/local-paths/inspect`.
4. Direct files become pending upload items with local previews when possible.
5. Direct folders create albums/folders immediately:
   - from the library root, a directory creates a root album;
   - from inside an album/folder, a directory creates a nested folder.
6. Frontend calls `/api/upload-local` with client upload ids and folder targets.
7. Backend reads files, chunks large files, and calls the bot for Discord upload.
8. Backend persists final `LibraryItem` records and folder memberships.
9. Frontend reconciles pending ids with final items.
10. Snapshots and local cache are refreshed.

Browser `FileList` upload follows the same product rules but starts from web file objects instead of Tauri local paths.

## 11. Pending Uploads And Recovery

Pending uploads exist so the user can keep organizing files while the backend uploads to Discord.

Key behavior:

- Pending records are stored outside the normal library cache so they cannot become permanent ghost files.
- Pending files can be moved, favorited, or trashed before upload finishes.
- When upload finishes, the final item inherits pending choices.
- If the app restarts while pending local-path uploads exist, recoverable records are reconstructed and retried.

Code to inspect:

```text
apps/desktop/src/App.tsx
  createPendingUploadItem
  createPendingUploadRecord
  finalizePendingUploadItems
  resumePendingLocalUploads

apps/server/src/routes.ts
  /api/upload-local

apps/server/src/persistence.ts
  local file reading and cache helpers
```

## 12. Albums And Nested Folders

Albums and folders use the same persisted folder tree. Root albums have `type: "album"` and `parentId: null`; nested folders have `type: "folder"` and a parent folder or album id.

UI rules:

- Sidebar shows root albums only.
- Gallery shows child folders before files.
- Folder tiles single-click to select and double-click to open.
- The toolbar can go up one level and create a folder inside the current album/folder.
- Dragging files onto a folder or album moves them there.
- Current move semantics are exclusive: after moving, an item belongs only to the destination album/folder.

When changing album behavior, check:

```text
apps/desktop/src/App.tsx
apps/desktop/src/components/app-components.tsx
apps/server/src/persistence.ts
apps/server/src/routes.ts
packages/shared/src/index.ts
```

## 13. Watched Folders

The storage settings can enable a watched folder. The import loop periodically scans the configured top-level folder for stable files.

Rules:

- Temporary or still-changing files are skipped.
- Imported files receive watched-folder source metadata.
- Source fingerprints prevent repeated imports of the same watched file.
- The `Watched` collection appears while the option is enabled.

The watched-folder scanner is app-owned. The bot only stores snapshot metadata.

## 14. Duplicate Detection

The desktop periodically groups duplicates without scanning too aggressively. Duplicate detection must use exact content hashes only: `storageManifest.sha256` for chunked files or `contentHash` for regular files. Do not group files by name, size, or MIME type alone; that creates false positives when unrelated files share metadata.

The `Duplicados` collection appears only while duplicate groups exist. UI ordering should keep duplicate pairs/groups adjacent enough for the user to compare.

## 15. Optimistic UI And Background Sync

Common library actions update React state before their HTTP request resolves:

- move to album/folder;
- remove from album/folder;
- favorite/unfavorite;
- move to trash;
- restore from trash;
- permanent delete;
- album/folder rename;
- root album reorder;
- album/folder delete.

If the backend request fails, the app restores the previous local items/albums and shows an error. The backend persists local state first and queues remote snapshot sync after the response. Remote sync is serialized by snapshot type to avoid older writes racing newer writes.

When adding a new optimistic action, capture enough previous state to roll back:

- affected items;
- affected albums;
- selected view and selected ids if navigation changes;
- pending upload records if pending items are affected.

Bulk trash has an additional durability rule. The backend persists a `pendingRemoteOperations` journal entry for each item before responding. On startup and after remote hydration, the server reapplies pending local intent and resumes the worker. This prevents a forced app close from reverting the UI while Discord movement is half-finished.

## 16. Media Viewer And Saved Edits

The viewer is UI-owned. Saved media edits currently support images. The persisted edit contract stores rotation and crop-state metadata on the item rather than rewriting the original Discord attachment.

Relevant code:

```text
apps/desktop/src/components/app-components.tsx
apps/desktop/src/lib/app-logic.ts
apps/server/src/persistence.ts
```

## 17. Localization

Runtime language support lives in:

```text
apps/desktop/src/i18n/en.ts
apps/desktop/src/i18n/pt.ts
apps/desktop/src/i18n/index.ts
```

English strings are the source text in components. Portuguese is mapped in `pt.ts`. The runtime translator observes DOM changes and translates text and selected attributes. When adding visible UI text, update Portuguese translations in the same change.

## 18. Local Data And Cache

On Windows, current data paths are:

```text
%APPDATA%\Discasa
%LOCALAPPDATA%\Discasa\Cache
```

Legacy Tauri paths may also exist:

```text
%APPDATA%\com.andersomviolao.discasa
%LOCALAPPDATA%\com.andersomviolao.discasa
```

`hard-reset.bat` removes generated development artifacts and local Discasa app data. It does not delete Discord channels, messages, or remote files.

## 19. Feature Development Guide

Use this map to start changes:

```text
UI layout or interactions
  apps/desktop/src/components/app-components.tsx
  apps/desktop/src/styles.css
  apps/desktop/src/App.tsx

App-wide state or workflows
  apps/desktop/src/App.tsx

Frontend API helper
  apps/desktop/src/lib/app-logic.ts

Backend route
  apps/server/src/routes.ts

Local persistence, albums, memberships, snapshots
  apps/server/src/persistence.ts

Local files, watched folder, mirror, thumbnails
  apps/server/src/local-storage.ts

Bot communication and remote snapshot helpers
  apps/server/src/bot-client.ts

Shared persistent contract
  packages/shared/src/index.ts
```

Before implementing, decide whether the behavior is product logic or Discord adapter logic. Product logic stays here.

## 20. Manual Test Checklist

Run this checklist for changes touching library behavior:

- App opens through `start-all.bat`.
- `http://localhost:1420/` responds.
- `http://localhost:3001/api/diagnostics` responds.
- `http://localhost:3002/health` responds when using the bot.
- Upload direct files.
- Upload a folder at the library root.
- Upload a folder inside an album/folder.
- Single-click a folder tile selects it.
- Double-click a folder tile opens it.
- Move files between albums and confirm exclusive membership.
- Favorite/unfavorite a file.
- Move to trash and restore.
- Permanently delete a file.
- Enable watched folder and verify the `Watched` collection appears.
- Verify duplicate collection appears only when duplicates exist.
- Open Settings, change tabs, and close color picker by clicking outside.
- Run `npm run check`.

## 21. Troubleshooting

Vite cannot load `/src/main.tsx`:

- Avoid running from a path containing `#`; this was a known source of Vite URL resolution errors.
- Current runtime images/fonts are public assets to reduce path parsing problems.

`@discasa/shared` cannot be resolved:

- Run `npm install` at the repository root to refresh workspace links.

Port is already in use:

- Run `.\stop-all.bat`, then `.\start-all.bat`.
- If Tauri is still open, close the app window or inspect lingering `discasa` processes.

Bot unavailable:

- Check `..\Discasa_bot\.env`.
- Check `DISCORD_BOT_URL`.
- Validate `http://localhost:3002/health`.

OAuth or setup fails:

- Confirm `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI`.
- Confirm the bot is invited to the selected server.
- In Discord mode, confirm the bot token is valid and the bot is logged in.

Uploads fail:

- Check file size and chunking.
- Check bot upload endpoint health.
- Check whether Discord rate limits or attachment failures are logged by the bot.

## 22. Maintenance Rules

- Keep the app responsible for user-facing behavior and state decisions.
- Keep the bot small and suitable for online hosting.
- Keep shared contracts synchronized across frontend, backend, and bot snapshot preservation.
- Keep app images, source assets, and image scripts under `img`.
- Keep translations in sync when interface text changes.
- Prefer optimistic UI only when rollback state is well-defined.
- Run checks before commit.
- Update README, documentation, and changelog when behavior or structure changes.

## 23. License

Discasa is distributed under the MIT License. See `LICENSE` for the full text.
