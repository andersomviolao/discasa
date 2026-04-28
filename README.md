# Discasa

Discasa is a desktop-first file and media library project. It uses Discord as the cloud storage and synchronization layer while presenting files through a native desktop interface.

This repository is still an internal prototype, so this README focuses on the current architecture, runtime behavior, and development workflow.

## Project Status

Discasa currently includes:

- a Tauri desktop shell with a React interface
- a local Node.js backend for Discord OAuth, guild setup, uploads, and synchronization
- a shared package for cross-layer types and snapshot contracts
- mock mode support for UI and flow development
- Discord-backed persistence for files, folders, trash, and app configuration
- local cache and optional local file mirroring

## Architecture

```text
apps/
  desktop/   # Tauri + React desktop application
  server/    # Local Node.js service for OAuth, Discord orchestration, and persistence
packages/
  shared/    # Shared types, constants, and snapshot contracts
art/         # Visual/project assets
```

## Discord Storage Model

When Discasa is applied to a server, it creates or reuses this structure:

- `Discasa` - category used by the project
- `discasa-drive` - uploaded files and active file storage
- `discasa-index` - library index, folder membership, and app configuration snapshots
- `discasa-trash` - trash storage flow for removed items

Older Discasa setups may still contain legacy `discasa-folder` and `discasa-config` channels. The backend keeps migration/recovery handling for those channels, but new setup uses the three-channel model above.

## Local Runtime Storage

On Windows, runtime data is stored outside the project folder so the app can work correctly after being packaged with an installer:

```text
%APPDATA%\Discasa
  auth.json
  mock-db.json

%LOCALAPPDATA%\Discasa\Cache
  files\
  thumbnails\
```

`%APPDATA%\Discasa` is used for local auth/session state and runtime metadata. `%LOCALAPPDATA%\Discasa\Cache` is used for temporary files, thumbnails, and the default local mirror folder.

If a user chooses a custom local mirror folder, Discasa stores that chosen path in the Discord-backed app config. On a new PC, if local mirroring is enabled and the saved folder does not exist, the setup flow asks the user to choose a new folder or use the default Discasa cache folder. If local mirroring is disabled, that setup step is skipped.

The server still recognizes the old prototype folder at `apps\server\.discasa-data` and copies compatible data into the new AppData locations on startup when the new files do not exist.

## Implemented Areas

### Desktop Experience

- custom titlebar and window controls
- desktop library/grid workflow
- sidebar navigation
- settings modal and status/toast feedback
- thumbnail zoom handling
- gallery display mode persistence
- accent color and UI preference persistence
- minimize-to-tray and close-to-tray behavior
- native file drag and drop handling through Tauri

### Library And Organization Flow

- file upload through the local backend
- album creation, rename, reorder, and deletion
- multi-select and drag-to-folder interactions
- favorites support
- trash, restore, and permanent delete flows
- saved image edit metadata support, including crop mode and rotation state
- cached thumbnails for faster interface loading
- optional local file mirroring

### Discord Integration Flow

- Discord login flow
- eligible server listing
- selected server inspection
- bot invite/apply flow
- Discasa initialization inside the selected guild
- upload size validation against Discord limits
- synchronization of index, folder, trash, and app config snapshots back to Discord

### Local Development Support

- mock mode for disconnected development
- persisted local runtime data
- migration path for legacy metadata and storage layouts
- Windows batch launcher for the development workflow
- hard reset script for clearing generated artifacts and local Discasa app data

## Development Scripts

- `start-discasa.bat` starts the backend and Tauri desktop app for local development.
- `start-discasa-hard-reset.bat` removes generated development artifacts, current AppData runtime folders, legacy Tauri folders, and legacy prototype storage.

The hard reset script does not delete Discord server channels or cloud snapshots.

## Main Technologies

- TypeScript
- React 19
- Vite
- Tauri 2
- Node.js + Express
- discord.js
- Rust
- CSS

## Direction

Discasa is evolving from a prototype into a more complete desktop library product. The next areas of hardening are synchronization recovery, metadata/search workflows, richer preview and editing behavior, installer packaging, and clearer boundaries between the desktop client, local backend, and Discord services.
