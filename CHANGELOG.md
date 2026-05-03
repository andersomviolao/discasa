# Changelog

All notable changes to **Discasa** are documented in this file.

## [2026-05-03-minimal-bot-trash]

### Changed

- Changed trash and restore to app-owned logical index state instead of physically copying Discord attachments between drive and trash channels.
- Debounced background snapshot sync so rapid local actions coalesce into fewer Discord snapshot writes.
- Throttled automatic `discasa-drive` history scans separately from local watched-folder and mirror imports.
- Limited attachment recovery during hydration to missing or incomplete storage references instead of resolving every healthy item.

### Fixed

- Prevented legacy pending trash/restore storage moves from reuploading/deleting Discord messages after upgrading.

## [2026-05-03-gallery-mode-folder-move]

### Added

- Added drag-and-drop movement for nested folder tiles onto album and folder targets.
- Added a backend route for moving an album/folder under another parent while preventing self and descendant moves.

### Changed

- Gallery album and folder headers now show only the title to keep the action row aligned.
- Thumbnail zoom moved from the top action row to a floating bottom control near toast notifications.
- The gallery action controls no longer sit inside a larger wrapper pill.

### Fixed

- Fixed the selected-file action bar shifting gallery thumbnails downward when it appears.
- Fixed gallery toolbar action sizes so icon controls, selection count, action buttons, and clear controls use a consistent height.
- Fixed the floating thumbnail zoom control position so it sits in the lower-right corner on desktop.
- Removed gallery header descriptions from built-in collections so only the current view name is shown.
- Fixed gallery display mode hydration so the saved Discord config is the source of truth and stale local cache cannot override it.
- Fixed gallery display mode saves so the config patch is sent immediately and the backend syncs the config snapshot to Discord before responding.
- Adjusted the floating thumbnail zoom control to align with the gallery toolbar and use the same quieter control surface.
- Reserved real bottom space in the gallery layout for the thumbnail zoom control and moved toast notifications above it.
- Fixed thumbnail display mode persistence so square/free-proportion mode survives desktop restarts.
- Expanded Portuguese translations for recent file, folder, and zoom actions while keeping source strings in English.

## [2026-05-02-durable-trash-restore-delete]

### Added

- Added bulk restore and bulk permanent-delete API routes that update local state immediately and finish Discord storage work in the background.
- Added durable pending remote delete operations so permanent deletes resume safely after a forced shutdown.
- Added `Ctrl+A` gallery selection for all visible files.
- Added custom file context menus for active files, trashed files, and multi-file selections.

### Changed

- Restore-from-trash now uses the same resumable remote-operation journal as trash movement.
- Permanent delete now removes files from the interface immediately and deletes Discord messages asynchronously.

### Fixed

- Fixed slow trash recovery and permanent-delete actions blocking the interface during large batches.
- Fixed the disabled bulk "delete permanently" button in the trash selection action bar.
- Fixed right-clicking files opening actions that did not match Discasa's current file state.

## [2026-05-02-durable-bulk-trash]

### Added

- Added a bulk trash API that persists UI state immediately and moves Discord storage in the background.
- Added a persisted pending remote operation journal so unfinished trash storage moves resume after restart.

### Changed

- Trash storage moves can fall back to the local mirror or thumbnail cache when Discord attachment URLs are no longer downloadable.
- Duplicate detection now only uses exact content hashes and no longer groups files by metadata alone.

### Fixed

- Fixed large trash operations feeling blocked while Discord storage is copied.
- Fixed missing Discord attachments preventing locally cached files from being moved to trash.

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
