# Discasa

Discasa is a desktop file and media library that uses Discord as its storage and synchronization layer. The interface runs locally, the app coordinates the main product state, and the Discord bot is a small HTTP adapter for operations that require bot identity in Discord.

The project is organized into two main packages:

- `discasa_app`: desktop app, local backend, and shared app contracts.
- `discasa_bot`: monolithic Discord bot service, kept small for online hosting and predictable resource usage.
- `art`: source artwork and asset-generation scripts shared by the app and bot.

For full architecture and flow details, see [documentation.md](documentation.md).

## Current State

Discasa currently includes:

- a Tauri 2, React 19, and Vite desktop app;
- a local Node.js/Express backend for OAuth, local APIs, persistence, cache, and synchronization coordination;
- a Node.js/Express Discord bot service with `discord.js`;
- file synchronization through the `discasa-drive` channel;
- automatic import of files manually added to `discasa-drive`;
- optional local mirroring, with automatic import of files placed directly in the mirror folder;
- a fixed `10 MiB` limit for each upload sent to Discord;
- automatic chunking for files larger than `10 MiB`;
- index, folder, and config snapshots stored in Discord;
- runtime language switching between English and Portuguese;
- local app and hosted bot diagnostics in Settings;
- a login/install flow with a dynamic synchronization screen;
- local cache for the library, files, and thumbnails.

## Architecture Summary

```text
Discasa
  art
    app              App source artwork
    bot              Bot source artwork
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

  discasa_bot
    src/index.ts     Bot service entrypoint
    src/server.ts    HTTP routes and diagnostics
    src/discord-service.ts  Discord storage operations
    src/config.ts    Environment loading
    src/logger.ts    Standardized logs
    src/errors.ts    Standardized error responses

  start-all.bat      Start the full local stack
  stop-all.bat       Stop the full local stack
  start-app.bat      Start only the app services
  stop-app.bat       Stop only the app services
  start-bot.bat      Start only the bot service
  stop-bot.bat       Stop only the bot service
```

The app owns product rules and coordination:

- chunking and large-file manifests;
- known attachment comparison and filtering;
- automatic external file import;
- snapshot recovery and relinking;
- trash, restore, and delete flows;
- local cache and local mirroring;
- OAuth and setup flow;
- UI language state.

The bot only owns operations that require the Discord bot identity:

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

cd ..\discasa_bot
npm install
```

Copy the environment examples:

```powershell
copy discasa_app\.env.example discasa_app\.env
copy discasa_bot\.env.example discasa_bot\.env
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

### Bot Variables

`discasa_bot\.env`:

```env
BOT_PORT=3002
MOCK_MODE=true
DISCORD_BOT_TOKEN=
```

### Run

Use the root launcher:

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

## Useful Scripts

App:

```powershell
cd discasa_app
npm run check
npm --workspace @discasa/desktop run build
npm --workspace @discasa/server run build
```

Bot:

```powershell
cd discasa_bot
npm run check
npm run build
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

## License and Distribution

This project is still private/internal and does not define a public license in this repository.
