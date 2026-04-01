# Discasa v0.1 Starter

Initial scaffold for Discasa: a desktop app that uses Discord as the storage backend.

## What is included

- Desktop app scaffold with **Tauri 2 + React + TypeScript**
- Backend scaffold with **Node.js + Express + TypeScript**
- Shared package with base types and constants
- Mock mode for testing the end-to-end flow before wiring real Discord credentials

## v0.1 goal

1. Login with Discord
2. List eligible guilds
3. Choose a server
4. Initialize the Discasa structure inside that server
5. Upload the first file into `discasa-drive`
6. Index the file locally inside the app

## Initial server structure

The backend/bot is expected to create:

- `Discasa` (category)
- `discasa-drive`
- `discasa-index`
- `discasa-trash`

Collections are **not** represented as channels. They are app metadata.

## Monorepo layout

```text
apps/
  desktop/   # Tauri + React desktop UI
  server/    # OAuth, Discord API orchestration, bot logic
packages/
  shared/    # Shared types, schemas, constants
```

## Environment variables

Copy `.env.example` to `.env` and fill your values.

## Development notes

This scaffold intentionally ships with a **mock mode** enabled by default.
That means you can build the UI flow and app architecture first, then plug in real Discord OAuth + bot steps.

## Suggested next implementation order

1. Wire real Discord OAuth in the backend
2. Add bot installation flow
3. Add real guild eligibility checks
4. Create the Discasa category and channels
5. Upload attachments to `discasa-drive`
6. Persist local metadata with SQLite
7. Add thumbnails and previews

## Official references used for this scaffold

- Discord OAuth2 and permissions docs
- Discord guild/channel resource docs
- Discord message resource docs
- Tauri 2 official documentation
