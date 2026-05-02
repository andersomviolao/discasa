# Changelog

All notable changes to **Discasa** are documented in this file.

## [2026-05-02-file-action-bar-busy-state]

### Fixed

- Fixed the selected-file action bar staying disabled after background library work by limiting the gallery busy lock to the initial empty bootstrap.
- Downloading selected files no longer blocks unrelated library selection and file actions.

## [2026-05-02-developer-docs-and-folder-sizing]

### Changed

- Expanded `documentation.md` into a developer onboarding guide with architecture, contracts, APIs, feature maps, checklists, and troubleshooting.
- Updated folder tile sizing so folder previews match file thumbnails in square gallery mode.

### Fixed

- Fixed opening nested folders by making the second click open the folder reliably.

## [2026-05-02-responsive-library-actions]

### Added

- Added optimistic UI updates for common library actions, including move, remove, favorite, trash, restore, delete, rename, reorder, and album delete.
- Added a grouped Settings layout and an About tab with app version, stack, and repository details.

### Changed

- Backend action routes now queue Discord snapshot synchronization in the background after local persistence.
- Album folder tiles now use single-click selection and double-click open behavior.

### Fixed

- Fixed folder tile hover clipping by removing the hover lift.
- Fixed native selection highlights appearing behind dragged or rectangle-selected library tiles.
- Fixed the accent color picker so clicking outside closes it inside the settings modal.

## [2026-05-01-nested-album-folders]

### Added

- Added nested folder creation inside albums and folders.
- Added gallery folder tiles with parent-folder navigation.
- Added immediate folder creation for selected local directories before upload processing finishes.

### Changed

- Folder uploads now create root albums only from the library root; uploads from inside an album become child folders.
- The sidebar now shows only root albums, while nested folders stay inside the gallery hierarchy.

## [2026-05-01-touch-titlebar-stop-fix]

### Fixed

- Fixed touchscreen dragging on the custom titlebar by using pointer events and a touch/pen window-position fallback.
- Fixed touch drag stability for library files and drag-based controls by tracking the active pointer and disabling browser touch gestures on draggable surfaces.
- Fixed `stop-all.bat` so it also closes running Tauri app instances and related Discasa processes.

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
