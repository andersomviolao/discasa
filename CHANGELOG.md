# Changelog

All notable changes to **Discasa** are documented in this file.

## [2026-05-01]

### Changed

- Moved the desktop app workspace into the main `Discasa` repository.
- Updated local launchers so app commands run from this repository root.
- Kept the hosted Discord bot as the sibling `Discasa_bot` repository.
- Updated app diagnostics service names from `discasa_app` to `discasa`.
- Preserved the local `.env` and ignored generated `node_modules`.

### Added

- Tauri desktop app under `apps/desktop`.
- Local Express backend under `apps/server`.
- Shared TypeScript contracts under `packages/shared`.
- App artwork, fonts, and source assets under `art`.
