# Changelog

All notable changes to **Discasa** are documented in this file.

## [2026-05-01-vite-path-hotfix]

### Fixed

- Fixed the desktop dev/build frontend failing to resolve `/src/main.tsx` when the repository path contains `#`.
- Moved runtime desktop images and fonts to public assets so Vite does not parse them through the problematic encoded path.

## [2026-05-01-library-automation]

### Added

- Added folder uploads that create albums named after selected folders.
- Added watched-folder settings and automatic imports into the `Watched` collection.
- Added duplicate detection with a conditional `Duplicados` collection.
- Added content hashes and source metadata to library items for duplicate and watched-folder workflows.

### Changed

- Moving files between albums now removes previous album memberships and keeps files only in the destination album.

## [2026-05-01-license]

### Added

- Added an MIT `LICENSE` file.
- Updated README and documentation with license references.

## [2026-05-01-doc-refresh]

### Changed

- Refreshed README and documentation to call out the standardized `img` and `img/scripts` layout.

## [2026-05-01-docs-assets]

### Changed

- Renamed the repository image asset folder from `art` to `img`.
- Kept image-generation scripts in `img/scripts`.
- Updated documentation references to the standardized image folder.

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
- App images, fonts, source assets, and image scripts under `img`.
