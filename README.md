# Discasa

Discasa is a desktop-first file and media library project built around a simple idea: using Discord infrastructure as a storage and synchronization layer while delivering a native desktop experience through a custom application interface.

This repository is currently in an active internal prototype stage. The project is not packaged or presented yet as a public end-user release, so this README intentionally focuses on architecture, implemented scope, and direction rather than public usage instructions.

## Project status

Discasa is already beyond the initial scaffold phase.

At the current stage, the repository contains:

- a desktop application shell with a custom interface built on Tauri
- a local backend responsible for Discord OAuth, guild inspection, bot/application flow, uploads, and state synchronization
- a shared package for cross-layer types and constants
- mock mode support for UI and flow development without requiring the full Discord setup
- a Discord-backed persistence model for files, index snapshots, folder snapshots, trash handling, and app configuration

## Core idea

The long-term goal of Discasa is to behave like a personal desktop drive/library interface while using a Discord server as the backing environment for storage-related operations.

Instead of exposing Discord concepts directly as the user experience, the app builds its own desktop-oriented layer on top of them:

- files are presented as library items
- albums/folders are managed as Discasa metadata
- UI preferences can be persisted as part of the Discasa state
- Discord channels are treated as infrastructure, not as the product interface itself

## Current architecture

```text
apps/
  desktop/   # Tauri + React desktop application
  server/    # Local Node.js service for OAuth, Discord orchestration and persistence sync
packages/
  shared/    # Shared types, constants and snapshot contracts
art/         # Visual/project assets
docs/        # Internal documentation and architecture notes
```

## Discord storage model

When Discasa is applied to a server, the project currently works with the following structure:

- `Discasa` — category used by the project
- `discasa-drive` — uploaded files and active file storage
- `discasa-index` — item index snapshots and library state
- `discasa-folder` — folder/album structure and item membership snapshots
- `discasa-trash` — trash storage flow for removed items
- `discasa-config` — persisted app configuration snapshots

This separation reflects the current direction of the project: keeping file storage, organization metadata, and UI/app state as distinct layers.

## What already exists in the codebase

The repository already includes working pieces for the following areas:

### Desktop experience

- custom titlebar and window controls
- desktop UI built around a library/grid workflow
- sidebar-driven navigation
- settings modal and status feedback/toast flow
- thumbnail zoom handling
- accent color and UI preference persistence
- minimize-to-tray and close-to-tray behavior
- native file drag and drop handling through Tauri

### Library and organization flow

- file upload flow through the local backend
- album creation
- album rename
- album reorder
- album deletion
- favorites support
- trash / restore flow
- permanent delete flow
- saved image edit metadata support (such as rotation/crop state persistence)

### Discord integration flow

- Discord login flow
- eligible server listing
- selected server inspection
- bot invite/apply flow
- Discasa initialization inside the selected guild
- upload size validation against Discord limits
- synchronization of index, folder, and config snapshots back to Discord channels

### Local development support

- mock mode for disconnected development
- persisted local data for development/runtime state
- migration path for legacy media edit data
- Windows batch launcher for the current development workflow

## Platforms and technologies in use

### Runtime targets

- desktop application via **Tauri 2**
- local companion backend via **Node.js**
- Discord as the current storage/orchestration backbone

### Main technologies

- **TypeScript**
- **React 19**
- **Vite**
- **Node.js + Express**
- **discord.js**
- **Rust** (Tauri shell/runtime)
- **CSS** for the current interface styling

### Repository language mix

The repository is currently composed primarily of TypeScript, with CSS and Rust also playing visible roles. There are also smaller supporting scripts/assets in other languages and formats as the project evolves.

## Design priorities at this stage

At the current stage, the codebase shows a strong emphasis on:

- desktop-first UX
- local responsiveness
- Discord-backed persistence experiments
- internal consistency between UI state and stored snapshots
- gradual evolution from a prototype scaffold into a more complete product foundation

## Near- to mid-term direction

The next stages of Discasa are likely to deepen and harden the product in areas such as:

- richer media preview and editing workflows
- stronger synchronization and recovery logic between local state and Discord-backed snapshots
- broader organization and library management features
- more robust metadata handling and search-oriented workflows
- packaging, stability, and release hardening for broader distribution
- clearer operational boundaries between desktop client, local backend, and Discord services

## Notes

This repository is being shaped as an evolving product foundation rather than a finished public release. Because of that, the README intentionally does not describe public setup or end-user installation steps yet.
