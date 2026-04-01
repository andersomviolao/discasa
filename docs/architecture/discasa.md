# Discasa Architecture

## Purpose of this file

This file is the single source of truth for Discasa architecture.

Rules:
- Update this document whenever the architecture changes in a meaningful way.
- Do not create versioned architecture files for normal progress tracking.
- Keep the content aligned with the current real state of the project.
- Use Git history to track how the architecture evolved over time.

---

## Core principle

Discord is the canonical remote backend and transport layer.

The local app is responsible for:
- providing the user experience
- maintaining a searchable local cache/index
- managing local-only metadata where appropriate
- orchestrating interaction with the backend/server layer

---

## Current project shape

Discasa is currently organized as a monorepo with three main parts:

### Desktop app
Responsibilities:
- Main user interface
- Library view
- Collection management
- Drag and drop upload flow
- Session status display
- Settings UI
- Window behavior controls
- Tray integration behavior

### Server app
Responsibilities:
- Discord OAuth entrypoint
- Session handling
- Mock mode support for local development
- Guild initialization flow
- Discord bot-backed category/channel setup
- Future upload orchestration and remote sync logic

### Shared package
Responsibilities:
- Shared DTOs
- Shared constants
- Shared validation and helpers
- Shared contract between desktop and server

---

## Current implementation status

This section should reflect the current real implementation, not just the target vision.

### Implemented today
- Monorepo structure is in place
- Desktop UI is running with Tauri + React + TypeScript
- Server is running with Express
- Shared package exists
- Local library/collection flow exists
- Drag and drop flow exists
- Mock mode exists for authentication and guild-related development
- Tray support exists in the desktop app
- User settings for window behavior exist:
  - minimize normally or minimize to tray
  - close normally or close to tray

### Still incomplete or partial
- Real Discord OAuth callback exchange is not fully completed
- Real guild selection flow is not fully completed in the product UX
- Real remote sync/reconciliation is not complete
- Cross-device consistency is not complete
- Real-time delete sync is not complete
- Full remote metadata/index strategy is not complete

---

## Discord structure target

Discasa should create and use a dedicated category in the selected Discord guild.

### Category
- `Discasa`

### Channels
- `discasa-drive`
- `discasa-index`
- `discasa-trash`

These channels are part of the remote backend structure and should remain stable unless there is a deliberate architectural migration.

---

## Metadata strategy

Collections should remain app-level metadata, not Discord channels.

Each uploaded file should be traceable through metadata such as:
- guild id
- drive channel id
- message id
- attachment url
- collection ids
- timestamps
- local cache references
- sync state metadata when implemented

---

## Local-first UX model

Discasa should behave as a desktop-first app, even when Discord is the remote backend.

That means:
- the user interacts with local views and local state first
- the app should feel fast even when Discord/network operations are slower
- searchable local cache/index is part of the product experience
- remote state should support the app, not dominate the UX

---

## Window and tray behavior

The desktop app supports two separate user-controlled behaviors:

### Minimize behavior
- Minimize normally
- Minimize to system tray

### Close behavior
- Close normally
- Close to system tray

This behavior is user preference, not hardcoded product behavior.

---

## Current architectural constraints

To keep development practical, the architecture currently assumes a simplified implementation path:

- one active guild at a time
- simple upload-first workflow
- local-first UX
- remote Discord structure initialized in a controlled way
- no advanced multi-device reconciliation yet
- no full real-time sync engine yet

---

## Practical update policy

Whenever Discasa changes in a way that affects architecture, this file must be updated.

Examples of changes that should update this document:
- authentication flow changes
- guild/server selection flow changes
- Discord channel/category structure changes
- metadata model changes
- sync model changes
- cache/index model changes
- responsibilities moving between desktop/server/shared
- tray/window behavior becoming a larger subsystem
- introduction of background jobs, queueing, or reconciliation logic

Examples of changes that usually do not require updating this document:
- minor visual tweaks
- spacing or CSS-only polish
- icon replacements
- text copy adjustments
- small bug fixes that do not affect architecture

---

## Near-term direction

Near-term work should continue in this order:

1. solidify real Discord authentication
2. complete guild selection and initialization UX
3. stabilize upload and metadata persistence model
4. define the first real remote index strategy
5. expand sync behavior carefully without overcomplicating v1 development

---

## Document ownership

This file should remain short enough to stay readable, but detailed enough to reflect the real architecture.

If Discasa grows significantly later, this file can continue as the top-level architecture summary, while deeper technical details can move into supporting docs inside the same folder.
