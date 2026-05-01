# Discasa

Discasa is a desktop file and media library that uses Discord as its storage and synchronization layer. The interface runs locally and the app coordinates the main product state. The Discord bot now lives in its own repository, `Discasa_bot`, as a small HTTP adapter for operations that require bot identity in Discord.

The project is organized around the desktop app:

- `discasa_app`: desktop app, local backend, and shared app contracts.
- `art`: source artwork and asset-generation scripts for the desktop app.
- `..\Discasa_bot`: sibling repository for the hosted Discord bot service used during local full-stack development.

For full architecture and flow details, see [documentation.md](documentation.md).

## Current State

Discasa currently includes:

- a Tauri 2, React 19, and Vite desktop app;
- a local Node.js/Express backend for OAuth, local APIs, persistence, cache, and synchronization coordination;
- file synchronization through the `discasa-drive` channel;
- automatic import of files manually added to `discasa-drive`;
- optional local mirroring, with automatic import of files placed directly in the mirror folder;
- a fixed `10 MiB` limit for each upload sent to Discord;
- automatic chunking for files larger than `10 MiB`;
- instant upload previews for local desktop uploads, with recovery after app shutdowns or interrupted connections;
- index, folder, and config snapshots stored in Discord;
- runtime language switching between English and Portuguese;
- local app and hosted bot diagnostics in Settings;
- a login/install flow with Discord-blue styling, a dynamic synchronization screen, and consistent modal overlays;
- local cache for the library, files, and thumbnails.

## Architecture Summary

```text
Discasa
  art
    app              App source artwork
    fonts            Bundled design fonts
    scripts          Asset-generation scripts
    sources          External reference artwork

  discasa_app
    apps/desktop     Tauri + React interface
      src/main.tsx    Desktop entrypoint
      src/App.tsx     Main app flow and state
      src/components  Desktop UI components
      src/lib         Desktop API and view helpers
    apps/server      Local app backend
    packages/shared  Shared app contracts

  start-all.bat      Start the app plus sibling ..\Discasa_bot
  stop-all.bat       Stop the full local stack
  start-app.bat      Start only the app services
  stop-app.bat       Stop only the app services
  start-bot.bat      Start sibling ..\Discasa_bot
  stop-bot.bat       Stop only the bot service
```

The app owns product rules and coordination:

- chunking and large-file manifests;
- optimistic upload previews and pending-upload recovery;
- known attachment comparison and filtering;
- automatic external file import;
- snapshot recovery and relinking;
- trash, restore, and delete flows;
- local cache and local mirroring;
- OAuth and setup flow;
- UI language state.

The separate `Discasa_bot` repository owns operations that require the Discord bot identity:

- status and installation checks in a server;
- creating or reusing the Discasa category and channels;
- uploading attachments to channels;
- deleting storage messages;
- listing raw attachment pages;
- resolving specific attachment references;
- reading and writing snapshots.

## Discord Structure

When Discasa is applied to a server, the app creates or reuses:

```text
Discasa
  #discasa-drive
  #discasa-index
  #discasa-trash
```

- `discasa-drive`: active files.
- `discasa-index`: index, folder, and config snapshots.
- `discasa-trash`: storage for items moved to trash.

Older installations can have legacy `discasa-folder` and `discasa-config` channels. The app still includes recovery for those formats.

## Upload Limit

Discasa always uses a fixed `10 MiB` Discord upload limit, even when a server currently accepts larger files because of boosts or plan changes. This prevents storage from breaking if the server is downgraded later.

Files larger than `10 MiB` are split by the app into smaller parts and registered in a `chunked` manifest. Reading and reconstruction are coordinated by the app.

## Upload Previews and Recovery

In the Tauri desktop app, files selected from the native file picker or dropped from the operating system are sent to the local backend by path through `/api/upload-local`. The WebView does not load the whole file into memory before upload.

The interface creates a temporary library item immediately, so the user can preview supported media, favorite it, move it to a folder, remove it from a folder, or move it to trash while the backend uploads and chunks the file. For local path uploads, pending items are stored in a small recovery queue in local storage. If Discasa closes, the connection drops, or the machine loses power, the next startup restores the pending items and retries the upload. The backend accepts the client-generated upload id, which prevents duplicate library items when an upload completed remotely but the desktop closed before clearing the pending queue.

Browser-style file uploads still use `FormData` as a fallback. The native Tauri flow is the preferred path for large local files.

## Development

### Requirements

- Node.js 20 or newer.
- Rust and Tauri dependencies for running the desktop app in development mode.
- A Discord application with OAuth configured when `MOCK_MODE=false`.
- A Discord bot token when `MOCK_MODE=false`.

### Install

From the repository root:

```powershell
cd discasa_app
npm install
```

Copy the environment examples:

```powershell
copy discasa_app\.env.example discasa_app\.env
```

### App Variables

`discasa_app\.env`:

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

### Run

Use the root launcher after placing the bot repository beside this repository as `..\Discasa_bot`:

```powershell
.\start-all.bat
```

It starts:

- bot on `3002`;
- local backend on `3001`;
- Tauri/Vite desktop on `1420`.

To stop:

```powershell
.\stop-all.bat
```

To run only one side of the project, use the root component launchers:

```powershell
.\start-app.bat
.\stop-app.bat
.\start-bot.bat
.\stop-bot.bat
```

The bot launcher expects the extracted bot repository at:

```text
..\Discasa_bot
```

## Useful Scripts

App:

```powershell
cd discasa_app
npm run check
npm --workspace @discasa/desktop run build
npm --workspace @discasa/server run build
```

Local reset:

```powershell
.\hard-reset.bat
```

The reset removes local generated artifacts, `node_modules`, caches, and Discasa local data. It does not remove existing Discord channels or files.

## Development Ports

- `3001`: local app backend.
- `3002`: bot service.
- `1420`: Vite/Tauri desktop.
- `5173`: alternate Vite port in some scenarios.

## Local Data

On Windows, Discasa uses:

```text
%APPDATA%\Discasa
  auth.json
  mock-db.json

%LOCALAPPDATA%\Discasa\Cache
  files\
  thumbnails\
```

The desktop also keeps a per-server library cache in local storage.

Pending native uploads are stored separately from the normal library cache. They are never written as authoritative library items, which prevents interrupted previews from becoming permanent ghost files.

## License and Distribution

This project is still private/internal and does not define a public license in this repository.
