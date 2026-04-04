import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AlbumRecord, LibraryItem } from "@discasa/shared";
import {
  createAlbum,
  deleteAlbum,
  deleteLibraryItem,
  getAlbums,
  getLibraryItems,
  getSession,
  moveToTrash,
  openDiscordLogin,
  renameAlbum,
  reorderAlbums,
  restoreFromTrash,
  toggleFavorite,
  uploadFiles,
} from "./lib/api";
import logoUrl from "./assets/discasa-logo.png";
import { AlbumContextMenu } from "./components/AlbumContextMenu";
import { AlbumModal } from "./components/AlbumModal";
import { LibraryPanel } from "./components/LibraryPanel";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { StatusToast } from "./components/StatusToast";
import { Titlebar } from "./components/Titlebar";
import { DEFAULT_PROFILE, getCurrentDescription, getCurrentTitle, getVisibleItems } from "./lib/library-helpers";
import type { AlbumContextMenuState, SettingsSection, SidebarView, WindowState } from "./ui-types";

const appWindow = getCurrentWindow();
const SIDEBAR_COLLAPSED_KEY = "discasa.sidebar.collapsed";
const MINIMIZE_TO_TRAY_KEY = "discasa.window.minimizeToTray";
const CLOSE_TO_TRAY_KEY = "discasa.window.closeToTray";
const ACCENT_COLOR_KEY = "discasa.ui.accentColor";
const DEFAULT_ACCENT_HEX = "#E9881D";

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

function readStoredString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  return raw && raw.trim().length > 0 ? raw : fallback;
}

function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("");

    return `#${expanded.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

function hexToRgbChannels(hex: string): string {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_ACCENT_HEX;
  const value = normalized.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

function tintHexColor(hex: string, amount: number): string {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_ACCENT_HEX;
  const value = normalized.slice(1);
  const channels = [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
  const tinted = channels.map((channel) => {
    const mixed = Math.round(channel + (255 - channel) * amount);
    return Math.max(0, Math.min(255, mixed)).toString(16).padStart(2, "0");
  });
  return `#${tinted.join("").toUpperCase()}`;
}

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("discord");
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [sessionAvatarUrl, setSessionAvatarUrl] = useState<string | null>(null);
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selectedView, setSelectedView] = useState<SidebarView>({ kind: "library", id: "all-files" });
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [windowState, setWindowState] = useState<WindowState>("default");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => readStoredBoolean(SIDEBAR_COLLAPSED_KEY, false));
  const [albumContextMenu, setAlbumContextMenu] = useState<AlbumContextMenuState>(null);
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => readStoredBoolean(MINIMIZE_TO_TRAY_KEY, false));
  const [closeToTray, setCloseToTray] = useState<boolean>(() => readStoredBoolean(CLOSE_TO_TRAY_KEY, false));
  const [accentColor, setAccentColor] = useState<string>(() => readStoredString(ACCENT_COLOR_KEY, DEFAULT_ACCENT_HEX));
  const [accentInput, setAccentInput] = useState<string>(() => readStoredString(ACCENT_COLOR_KEY, DEFAULT_ACCENT_HEX));
  const [accentInputError, setAccentInputError] = useState("");

  const dragDepthRef = useRef(0);
  const closeToTrayRef = useRef(closeToTray);
  const createAlbumInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const albumsRef = useRef<AlbumRecord[]>([]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    albumsRef.current = albums;
  }, [albums]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed ? "1" : "0");
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MINIMIZE_TO_TRAY_KEY, minimizeToTray ? "1" : "0");
  }, [minimizeToTray]);

  useEffect(() => {
    closeToTrayRef.current = closeToTray;

    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLOSE_TO_TRAY_KEY, closeToTray ? "1" : "0");
  }, [closeToTray]);

  useEffect(() => {
    const normalized = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_HEX;
    const root = document.documentElement;

    root.style.setProperty("--accent-color", normalized);
    root.style.setProperty("--accent-rgb", hexToRgbChannels(normalized));
    root.style.setProperty("--accent-color-hover", tintHexColor(normalized, 0.12));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_COLOR_KEY, normalized);
    }
  }, [accentColor]);

  useEffect(() => {
    if (!message && !error) return;

    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!albumContextMenu) return;

    const handlePointerDown = () => setAlbumContextMenu(null);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setAlbumContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [albumContextMenu]);

  useEffect(() => {
    if (!isCreateAlbumOpen) return;

    const timer = window.setTimeout(() => {
      createAlbumInputRef.current?.focus();
      createAlbumInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isCreateAlbumOpen]);

  useEffect(() => {
    if (!isSettingsOpen && !isCreateAlbumOpen) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (isCreateAlbumOpen) {
        closeCreateAlbumModal();
        return;
      }

      if (isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsOpen, isCreateAlbumOpen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void appWindow
      .onCloseRequested(async (event) => {
        if (!closeToTrayRef.current) return;

        event.preventDefault();

        try {
          await appWindow.hide();
          setMessage("Discasa was sent to the system tray.");
          setError("");
        } catch {
          setError("Could not send the app to the system tray.");
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  async function bootstrap(): Promise<void> {
    setIsBusy(true);
    setError("");

    try {
      const [session, nextAlbums, nextItems] = await Promise.all([getSession(), getAlbums(), getLibraryItems()]);

      setSessionName(session.user?.username ?? null);
      setSessionAvatarUrl(session.user?.avatarUrl ?? null);
      setAlbums(nextAlbums);
      setItems(nextItems);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load Discasa preview.");
    } finally {
      setIsBusy(false);
    }
  }

  const profile = useMemo(
    () => ({
      nickname: sessionName ?? DEFAULT_PROFILE.nickname,
      server: DEFAULT_PROFILE.server,
      avatarUrl: sessionAvatarUrl,
    }),
    [sessionAvatarUrl, sessionName],
  );

  const visibleItems = useMemo(() => getVisibleItems(items, selectedView), [items, selectedView]);
  const currentTitle = useMemo(() => getCurrentTitle(selectedView, albums), [albums, selectedView]);
  const currentDescription = useMemo(() => getCurrentDescription(selectedView), [selectedView]);

  function updateItemInState(nextItem: LibraryItem): void {
    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }

  function removeItemFromState(itemId: string): void {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function getAlbumIndex(albumId: string): number {
    return albumsRef.current.findIndex((album) => album.id === albumId);
  }

  function canMoveAlbum(albumId: string, direction: "up" | "down"): boolean {
    const index = getAlbumIndex(albumId);
    if (index === -1) return false;
    if (direction === "up") return index > 0;
    return index < albumsRef.current.length - 1;
  }

  function openLibraryView(nextView: SidebarView): void {
    setSelectedView(nextView);
    setAlbumContextMenu(null);
  }

  function openSettingsModal(): void {
    setAlbumContextMenu(null);
    setSettingsSection("discord");
    setIsSettingsOpen(true);
  }

  function openCreateAlbumModal(): void {
    setAlbumContextMenu(null);
    setCreateAlbumError("");
    setNewAlbumName("");
    setIsCreateAlbumOpen(true);
  }

  function closeCreateAlbumModal(): void {
    if (isCreatingAlbum) return;
    setIsCreateAlbumOpen(false);
    setCreateAlbumError("");
    setNewAlbumName("");
  }

  function requestUpload(): void {
    uploadInputRef.current?.click();
  }

  async function handleCreateAlbumSubmit(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    const trimmed = newAlbumName.trim();
    if (!trimmed) {
      setCreateAlbumError("Enter an album name.");
      return;
    }

    setIsCreatingAlbum(true);
    setCreateAlbumError("");

    try {
      const result = await createAlbum({ name: trimmed });
      const nextAlbums = [...albumsRef.current, { id: result.id, name: trimmed, itemCount: 0 }];
      albumsRef.current = nextAlbums;
      setAlbums(nextAlbums);
      setSelectedView({ kind: "album", id: result.id });
      setMessage(`Album created: ${trimmed}`);
      setError("");
      setIsCreateAlbumOpen(false);
      setNewAlbumName("");
    } catch (caughtError) {
      setCreateAlbumError(caughtError instanceof Error ? caughtError.message : "Could not create the album.");
    } finally {
      setIsCreatingAlbum(false);
    }
  }

  async function handleRenameAlbum(albumId: string, currentName: string): Promise<void> {
    const nextName = window.prompt("New album name:", currentName);
    if (!nextName || !nextName.trim()) return;

    try {
      const trimmed = nextName.trim();
      await renameAlbum(albumId, { name: trimmed });
      const nextAlbums = albumsRef.current.map((album) => (album.id === albumId ? { ...album, name: trimmed } : album));
      albumsRef.current = nextAlbums;
      setAlbums(nextAlbums);
      setAlbumContextMenu(null);
      setMessage(`Album renamed to: ${trimmed}`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not rename the album.");
    }
  }

  async function handleMoveAlbum(albumId: string, direction: "up" | "down"): Promise<void> {
    const currentIndex = getAlbumIndex(albumId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= albumsRef.current.length) return;

    const nextAlbums = [...albumsRef.current];
    const [moved] = nextAlbums.splice(currentIndex, 1);
    nextAlbums.splice(targetIndex, 0, moved);

    try {
      const orderedIds = nextAlbums.map((album) => album.id);
      const response = await reorderAlbums(orderedIds);
      albumsRef.current = response.albums;
      setAlbums(response.albums);
      setAlbumContextMenu(null);
      setMessage(`Album moved ${direction === "up" ? "up" : "down"}.`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not move the album.");
    }
  }

  async function handleDeleteAlbum(albumId: string, albumName: string): Promise<void> {
    const confirmed = window.confirm(`Delete the album "${albumName}"?`);
    if (!confirmed) return;

    try {
      await deleteAlbum(albumId);
      const nextAlbums = albumsRef.current.filter((album) => album.id !== albumId);
      albumsRef.current = nextAlbums;
      setAlbums(nextAlbums);
      setItems((current) =>
        current.map((item) => ({
          ...item,
          albumIds: item.albumIds.filter((id) => id !== albumId),
        })),
      );
      setSelectedView((current) => (current.kind === "album" && current.id === albumId ? { kind: "library", id: "all-files" } : current));
      setAlbumContextMenu(null);
      setMessage(`Album deleted: ${albumName}`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete the album.");
    }
  }

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      const targetAlbumId = selectedView.kind === "album" ? selectedView.id : undefined;
      await uploadFiles(Array.from(fileList), targetAlbumId);

      const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);
      albumsRef.current = nextAlbums;
      setItems(nextItems);
      setAlbums(nextAlbums);
      setMessage(`${fileList.length} file(s) added to the library.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleToggleFavorite(itemId: string): Promise<void> {
    try {
      const response = await toggleFavorite(itemId);
      updateItemInState(response.item);
      setMessage(response.item.isFavorite ? "File added to favorites." : "File removed from favorites.");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update the favorite state.");
    }
  }

  async function handleMoveToTrash(itemId: string): Promise<void> {
    try {
      const response = await moveToTrash(itemId);
      updateItemInState(response.item);
      setMessage("File moved to the trash.");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not move the file to the trash.");
    }
  }

  async function handleRestoreFromTrash(itemId: string): Promise<void> {
    try {
      const response = await restoreFromTrash(itemId);
      updateItemInState(response.item);
      setMessage("File restored.");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not restore the file.");
    }
  }

  async function handleDeleteItem(itemId: string): Promise<void> {
    const confirmed = window.confirm("Delete this file permanently?");
    if (!confirmed) return;

    try {
      await deleteLibraryItem(itemId);
      removeItemFromState(itemId);
      setMessage("File permanently deleted.");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete the file.");
    }
  }

  function handleAccentInputChange(nextValue: string): void {
    const uppercased = nextValue.toUpperCase();
    setAccentInput(uppercased);

    const normalized = normalizeHexColor(uppercased);
    if (normalized) {
      setAccentColor(normalized);
      setAccentInputError("");
      return;
    }

    if (uppercased.trim().length === 0) {
      setAccentInputError("");
      return;
    }

    setAccentInputError("Use a valid HEX value, such as #E9881D.");
  }

  function handleAccentInputBlur(): void {
    const normalized = normalizeHexColor(accentInput);
    if (normalized) {
      setAccentColor(normalized);
      setAccentInput(normalized);
      setAccentInputError("");
      return;
    }

    setAccentInput(accentColor);
    setAccentInputError("");
  }

  async function handleStartDragging(event: MouseEvent<HTMLElement>): Promise<void> {
    if (event.button !== 0) return;

    event.preventDefault();

    try {
      await appWindow.startDragging();
    } catch {
      // Browser preview fallback.
    }
  }

  async function handleMinimize(): Promise<void> {
    try {
      if (minimizeToTray) {
        await appWindow.hide();
        setMessage("Discasa was sent to the system tray.");
        setError("");
        return;
      }

      await appWindow.minimize();
    } catch {
      setError("Could not minimize the app.");
    }
  }

  async function handleToggleMaximize(): Promise<void> {
    try {
      await appWindow.toggleMaximize();
      const next = await appWindow.isMaximized();
      setWindowState(next ? "maximized" : "default");
    } catch {
      setWindowState((current) => (current === "maximized" ? "default" : "maximized"));
    }
  }

  async function handleClose(): Promise<void> {
    try {
      if (closeToTrayRef.current) {
        await appWindow.hide();
        setMessage("Discasa was sent to the system tray.");
        setError("");
        return;
      }

      await appWindow.destroy();
    } catch {
      setError("Could not close the app.");
    }
  }

  function handleFileDragEnter(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleFileDragLeave(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;

    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!isDraggingFiles) {
      setIsDraggingFiles(true);
    }
  }

  async function handleFileDrop(event: DragEvent<HTMLElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    await handleFiles(event.dataTransfer.files);
  }

  function handleAlbumContextMenu(event: MouseEvent<HTMLElement>, albumId: string, albumName: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAlbumContextMenu({ x: event.clientX, y: event.clientY, albumId, albumName });
  }

  return (
    <div className="app-shell">
      <div className={`app-frame ${windowState === "maximized" ? "window-maximized" : ""}`}>
        <Titlebar
          logoUrl={logoUrl}
          windowState={windowState}
          onDragStart={handleStartDragging}
          onOpenSettings={openSettingsModal}
          onMinimize={handleMinimize}
          onToggleMaximize={handleToggleMaximize}
          onClose={handleClose}
        />

        <div className="workspace">
          <Sidebar
            albums={albums}
            selectedView={selectedView}
            isSidebarCollapsed={isSidebarCollapsed}
            profile={profile}
            onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
            onOpenView={openLibraryView}
            onOpenCreateAlbum={openCreateAlbumModal}
            onOpenAlbumContextMenu={handleAlbumContextMenu}
          />

          <LibraryPanel
            title={currentTitle}
            description={currentDescription}
            items={visibleItems}
            isBusy={isBusy}
            isDraggingFiles={isDraggingFiles}
            onRequestUpload={requestUpload}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={handleFileDrop}
            onToggleFavorite={handleToggleFavorite}
            onMoveToTrash={handleMoveToTrash}
            onRestoreFromTrash={handleRestoreFromTrash}
            onDeleteItem={handleDeleteItem}
          />
        </div>
      </div>

      <input
        ref={uploadInputRef}
        id="discasa-upload-input"
        className="hidden-upload-input"
        type="file"
        multiple
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />

      {isCreateAlbumOpen ? (
        <AlbumModal
          isCreatingAlbum={isCreatingAlbum}
          newAlbumName={newAlbumName}
          createAlbumError={createAlbumError}
          inputRef={createAlbumInputRef}
          onClose={closeCreateAlbumModal}
          onSubmit={handleCreateAlbumSubmit}
          onChangeName={(value) => {
            setNewAlbumName(value);
            if (createAlbumError) {
              setCreateAlbumError("");
            }
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <SettingsModal
          profile={profile}
          settingsSection={settingsSection}
          sessionName={sessionName}
          minimizeToTray={minimizeToTray}
          closeToTray={closeToTray}
          accentColor={accentColor}
          accentInput={accentInput}
          accentInputError={accentInputError}
          onClose={() => setIsSettingsOpen(false)}
          onSelectSection={setSettingsSection}
          onOpenDiscordLogin={openDiscordLogin}
          onChangeMinimizeToTray={setMinimizeToTray}
          onChangeCloseToTray={setCloseToTray}
          onAccentInputChange={handleAccentInputChange}
          onAccentInputBlur={handleAccentInputBlur}
        />
      ) : null}

      <AlbumContextMenu
        menu={albumContextMenu}
        canMoveUp={albumContextMenu ? canMoveAlbum(albumContextMenu.albumId, "up") : false}
        canMoveDown={albumContextMenu ? canMoveAlbum(albumContextMenu.albumId, "down") : false}
        onRename={() =>
          albumContextMenu
            ? handleRenameAlbum(albumContextMenu.albumId, albumContextMenu.albumName)
            : Promise.resolve()
        }
        onMoveUp={() => (albumContextMenu ? handleMoveAlbum(albumContextMenu.albumId, "up") : Promise.resolve())}
        onMoveDown={() => (albumContextMenu ? handleMoveAlbum(albumContextMenu.albumId, "down") : Promise.resolve())}
        onDelete={() =>
          albumContextMenu
            ? handleDeleteAlbum(albumContextMenu.albumId, albumContextMenu.albumName)
            : Promise.resolve()
        }
        onPointerDown={(event) => event.stopPropagation()}
      />

      <StatusToast message={message} error={error} />
    </div>
  );
}
