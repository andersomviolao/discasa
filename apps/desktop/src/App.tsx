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

type SettingsSection = "discord" | "appearance" | "window";
type WindowState = "default" | "maximized";

type FixedLibraryViewId = "all-files" | "favorites" | "trash";
type FixedCollectionViewId = "pictures" | "videos" | "others";

type SidebarView =
  | { kind: "library"; id: FixedLibraryViewId }
  | { kind: "collection"; id: FixedCollectionViewId }
  | { kind: "album"; id: string };

type AlbumContextMenuState = {
  x: number;
  y: number;
  albumId: string;
  albumName: string;
} | null;

const appWindow = getCurrentWindow();
const SIDEBAR_COLLAPSED_KEY = "discasa.sidebar.collapsed";
const MINIMIZE_TO_TRAY_KEY = "discasa.window.minimizeToTray";
const CLOSE_TO_TRAY_KEY = "discasa.window.closeToTray";
const ACCENT_COLOR_KEY = "discasa.ui.accentColor";
const DEFAULT_ACCENT_HEX = "#E9881D";

const DEFAULT_PROFILE = {
  nickname: "discord-nick",
  server: "discord-server",
};

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

function isImage(item: LibraryItem): boolean {
  return item.mimeType.startsWith("image/");
}

function isVideo(item: LibraryItem): boolean {
  return item.mimeType.startsWith("video/");
}

function isOther(item: LibraryItem): boolean {
  return !isImage(item) && !isVideo(item);
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h5.2c.41 0 .8.16 1.09.45l1.16 1.15c.17.17.39.27.63.27h2.92a1.75 1.75 0 0 1 1.75 1.75v6.38a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11.5h8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 14.5h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.55 10.55 19.22C5.4 14.54 2 11.46 2 7.7 2 4.76 4.3 2.5 7.2 2.5c1.64 0 3.22.76 4.25 1.96 1.03-1.2 2.61-1.96 4.25-1.96 2.9 0 5.2 2.26 5.2 5.2 0 3.76-3.4 6.84-8.55 11.52L12 20.55Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7.25h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 7.25V5.8c0-.72.58-1.3 1.3-1.3h3.4c.72 0 1.3.58 1.3 1.3v1.45" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 7.25v10.05c0 .66.54 1.2 1.2 1.2h6.4c.66 0 1.2-.54 1.2-1.2V7.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 10.25v4.5M14 10.25v4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="14.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7.8 14.75 2.28-2.6c.25-.29.7-.31.99-.05l1.58 1.42 1.49-1.78c.28-.33.8-.36 1.12-.07l2 1.82" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="10.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15.25 10.15 3.7-2.1v7.9l-3.7-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h4.1c.44 0 .85.18 1.16.48l1.06 1.03c.18.18.43.29.69.29h4a1.75 1.75 0 0 1 1.75 1.75v6.45a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13.5 6-6 6 6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10.5 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.75V6.25" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8.5 9.75 3.5-3.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 16.25v1a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("discord");
  const [sessionName, setSessionName] = useState<string | null>(null);
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
      const [session, nextAlbums, nextItems] = await Promise.all([
        getSession(),
        getAlbums(),
        getLibraryItems(),
      ]);

      setSessionName(session.user?.username ?? null);
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
    }),
    [sessionName],
  );

  const visibleItems = useMemo(() => {
    switch (selectedView.kind) {
      case "library":
        if (selectedView.id === "all-files") {
          return items.filter((item) => !item.isTrashed);
        }

        if (selectedView.id === "favorites") {
          return items.filter((item) => item.isFavorite && !item.isTrashed);
        }

        return items.filter((item) => item.isTrashed);
      case "collection":
        if (selectedView.id === "pictures") {
          return items.filter((item) => !item.isTrashed && isImage(item));
        }

        if (selectedView.id === "videos") {
          return items.filter((item) => !item.isTrashed && isVideo(item));
        }

        return items.filter((item) => !item.isTrashed && isOther(item));
      case "album":
        return items.filter((item) => !item.isTrashed && item.albumIds.includes(selectedView.id));
      default:
        return [];
    }
  }, [items, selectedView]);

  const currentTitle = useMemo(() => {
    switch (selectedView.kind) {
      case "library":
        if (selectedView.id === "all-files") return "All Files";
        if (selectedView.id === "favorites") return "Favorites";
        return "Trash";
      case "collection":
        if (selectedView.id === "pictures") return "Pictures";
        if (selectedView.id === "videos") return "Videos";
        return "Others";
      case "album":
        return albums.find((album) => album.id === selectedView.id)?.name ?? "Album";
      default:
        return "Library";
    }
  }, [albums, selectedView]);

  const currentDescription = useMemo(() => {
    switch (selectedView.kind) {
      case "library":
        if (selectedView.id === "all-files") return "All active files in the library.";
        if (selectedView.id === "favorites") return "Files marked as favorites.";
        return "Items moved to the trash.";
      case "collection":
        if (selectedView.id === "pictures") return "Image files only.";
        if (selectedView.id === "videos") return "Video files only.";
        return "Files that are neither images nor videos.";
      case "album":
        return "Files linked to this album.";
      default:
        return "";
    }
  }, [selectedView]);

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
      const nextAlbums = albumsRef.current.map((album) =>
        album.id === albumId ? { ...album, name: trimmed } : album,
      );
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
      setSelectedView((current) =>
        current.kind === "album" && current.id === albumId
          ? { kind: "library", id: "all-files" }
          : current,
      );
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

  function renderCardActions(item: LibraryItem) {
    if (item.isTrashed) {
      return (
        <div className="file-actions">
          <button type="button" className="file-action-button" onClick={() => void handleRestoreFromTrash(item.id)}>
            Restore
          </button>
          <button type="button" className="file-action-button danger" onClick={() => void handleDeleteItem(item.id)}>
            Delete
          </button>
        </div>
      );
    }

    return (
      <div className="file-actions">
        <button type="button" className={`file-action-button ${item.isFavorite ? "active" : ""}`} onClick={() => void handleToggleFavorite(item.id)}>
          {item.isFavorite ? "Unfavorite" : "Favorite"}
        </button>
        <button type="button" className="file-action-button" onClick={() => void handleMoveToTrash(item.id)}>
          Trash
        </button>
      </div>
    );
  }

  function closeSettingsModal(): void {
    setIsSettingsOpen(false);
  }

  function renderSettingsModalContent() {
    if (settingsSection === "discord") {
      return (
        <>
          <div className="settings-modal-header">
            <div>
              <h2>Discord</h2>
              <p>Connect your account to sync Discasa identity data in the future.</p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-label">Discord</div>
            <div className={`settings-status ${sessionName ? "connected" : "disconnected"}`}>
              {sessionName ? "Connected" : "Not connected"}
            </div>
            <button className="primary-button" onClick={openDiscordLogin}>
              Login with Discord
            </button>
          </div>
        </>
      );
    }

    if (settingsSection === "appearance") {
      return (
        <>
          <div className="settings-modal-header">
            <div>
              <h2>Appearance</h2>
              <p>Choose the accent color used by the colored elements across the interface.</p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-label">Appearance</div>
            <div className="settings-field-stack">
              <label className="settings-input-label" htmlFor="accent-hex">
                Accent color (HEX)
              </label>
              <div className="settings-color-row">
                <span className="settings-color-preview" aria-hidden="true" style={{ backgroundColor: accentColor }} />
                <input
                  id="accent-hex"
                  className="settings-text-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="#E9881D"
                  value={accentInput}
                  onChange={(event) => handleAccentInputChange(event.currentTarget.value)}
                  onBlur={handleAccentInputBlur}
                />
              </div>
              <span className={`settings-input-help ${accentInputError ? "error" : ""}`}>
                {accentInputError || "A nova cor é aplicada assim que o HEX fica válido."}
              </span>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="settings-modal-header">
          <div>
            <h2>Window</h2>
            <p>Choose how Discasa behaves when minimizing or closing.</p>
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-label">Window</div>

          <label className="settings-toggle" htmlFor="minimize-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Minimize to tray</span>
              <span className="settings-toggle-description">
                When minimizing, hide the app in the system tray.
              </span>
            </div>
            <input
              id="minimize-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={minimizeToTray}
              onChange={(event) => setMinimizeToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <label className="settings-toggle" htmlFor="close-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Close to tray</span>
              <span className="settings-toggle-description">
                When closing, keep the app running in the system tray.
              </span>
            </div>
            <input
              id="close-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={closeToTray}
              onChange={(event) => setCloseToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>
        </div>
      </>
    );
  }

  return (
    <div className="app-shell">
      <div className={`app-frame ${windowState === "maximized" ? "window-maximized" : ""}`}>
        <header className="titlebar">
          <div className="titlebar-drag-surface" aria-hidden="true" onMouseDown={(event) => { void handleStartDragging(event); }} />

          <div className="brand">
            <img src={logoUrl} alt="Discasa" className="brand-logo" />
            <span className="brand-name">Discasa</span>
          </div>

          <div className="window-controls">
            <button
              type="button"
              className="window-button"
              onClick={() => {
                setAlbumContextMenu(null);
                setSettingsSection("discord");
                setIsSettingsOpen(true);
              }}
              aria-label="Open settings"
              title="Open settings"
            >
              <span className="window-glyph icon-glyph">
                <SettingsIcon />
              </span>
            </button>
            <button type="button" className="window-button" onClick={() => void handleMinimize()} aria-label="Minimize">
              <span className="window-glyph minimize" />
            </button>
            <button type="button" className="window-button" onClick={() => void handleToggleMaximize()} aria-label="Maximize or restore">
              <span className="window-glyph maximize" />
            </button>
            <button type="button" className="window-button close-button" onClick={() => void handleClose()} aria-label="Close">
              <span className="window-glyph close" />
            </button>
          </div>
        </header>

        <div className="workspace">
          <aside className={`sidebar-panel ${isSidebarCollapsed ? "collapsed" : ""}`}>
            <div className="sidebar-topbar">
              <button
                type="button"
                className="sidebar-toggle-button"
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <ChevronRightDoubleIcon /> : <ChevronLeftDoubleIcon />}
              </button>
            </div>

            <div className="sidebar-scroll">
              <section className="sidebar-section">
                {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Library</h2> : null}

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === "all-files" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "library", id: "all-files" })}
                  title="All Files"
                >
                  <span className="sidebar-item-icon"><LibraryIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">All Files</span> : null}
                </button>

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === "favorites" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "library", id: "favorites" })}
                  title="Favorites"
                >
                  <span className="sidebar-item-icon"><HeartIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">Favorites</span> : null}
                </button>

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === "trash" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "library", id: "trash" })}
                  title="Trash"
                >
                  <span className="sidebar-item-icon"><TrashIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">Trash</span> : null}
                </button>
              </section>

              <section className="sidebar-section">
                {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Collections</h2> : null}

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === "pictures" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "collection", id: "pictures" })}
                  title="Pictures"
                >
                  <span className="sidebar-item-icon"><PictureIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">Pictures</span> : null}
                </button>

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === "videos" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "collection", id: "videos" })}
                  title="Videos"
                >
                  <span className="sidebar-item-icon"><VideoIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">Videos</span> : null}
                </button>

                <button
                  type="button"
                  className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === "others" ? "selected" : ""}`}
                  onClick={() => openLibraryView({ kind: "collection", id: "others" })}
                  title="Others"
                >
                  <span className="sidebar-item-icon"><FolderIcon /></span>
                  {!isSidebarCollapsed ? <span className="sidebar-item-label">Others</span> : null}
                </button>
              </section>

              <section className="sidebar-section album-section">
                {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Albums</h2> : null}

                {albums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    className={`sidebar-item ${selectedView.kind === "album" && selectedView.id === album.id ? "selected" : ""}`}
                    onClick={() => openLibraryView({ kind: "album", id: album.id })}
                    onContextMenu={(event) => handleAlbumContextMenu(event, album.id, album.name)}
                    title={album.name}
                  >
                    <span className="sidebar-item-icon"><FolderIcon /></span>
                    {!isSidebarCollapsed ? <span className="sidebar-item-label">{album.name}</span> : null}
                  </button>
                ))}

                <button
                  type="button"
                  className={`sidebar-item add-album-item ${albums.length === 0 ? "empty-slot" : ""}`}
                  onClick={openCreateAlbumModal}
                  title="Create album"
                >
                  <span className="sidebar-item-icon"><PlusIcon /></span>
                </button>
              </section>
            </div>

            <footer className="sidebar-profile">
              <div className="profile-avatar" aria-hidden="true" />
              {!isSidebarCollapsed ? (
                <div className="profile-copy">
                  <span className="profile-primary">{profile.nickname}</span>
                  <span className="profile-secondary">{profile.server}</span>
                </div>
              ) : null}
            </footer>
          </aside>

          <main
            className={`library-panel ${isDraggingFiles ? "dragging" : ""}`}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={(event) => { void handleFileDrop(event); }}
          >
            <div className="library-header">
              <div>
                <h1>{currentTitle}</h1>
                <p>{currentDescription}</p>
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => document.getElementById("discasa-upload-input")?.click()}
                aria-label="Upload"
                title="Upload"
              >
                <UploadIcon />
              </button>
              <input
                id="discasa-upload-input"
                className="hidden-upload-input"
                type="file"
                multiple
                onChange={(event) => {
                  void handleFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <div className="files-grid">
              {visibleItems.map((item) => (
                <article key={item.id} className="file-card" title={item.name}>
                  <div className="file-preview">
                    <span className="file-type-chip">
                      {item.isTrashed ? "TRASH" : isImage(item) ? "IMG" : isVideo(item) ? "VID" : "FILE"}
                    </span>
                  </div>
                  <div className="file-meta">
                    <span className="file-name">{item.name}</span>
                    <small>{new Intl.NumberFormat("en-US").format(item.size)} bytes</small>
                    {renderCardActions(item)}
                  </div>
                </article>
              ))}

              {visibleItems.length === 0 && !isBusy ? (
                <button
                  type="button"
                  className="empty-state"
                  onClick={() => document.getElementById("discasa-upload-input")?.click()}
                >
                  <span className="empty-state-title">No files yet.</span>
                  <span className="empty-state-copy">Drag files from Explorer into this area or click to upload.</span>
                </button>
              ) : null}
            </div>

            {isDraggingFiles ? (
              <div className="drop-overlay">
                <span className="drop-overlay-title">Drop files here</span>
                <span className="drop-overlay-copy">They will be added to the current view.</span>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {isCreateAlbumOpen ? (
        <div className="album-modal-root" role="dialog" aria-modal="true" aria-label="Create new album">
          <button type="button" className="album-modal-backdrop" aria-label="Cancel album creation" onClick={closeCreateAlbumModal} />
          <div className="album-modal">
            <button type="button" className="album-modal-close" onClick={closeCreateAlbumModal} aria-label="Close album creation">
              <span className="album-modal-close-glyph">×</span>
            </button>

            <form className="album-modal-content" onSubmit={(event) => void handleCreateAlbumSubmit(event)}>
              <div className="album-modal-header">
                <h2>New album</h2>
                <p>Choose a name for the new folder in the Albums section.</p>
              </div>

              <div className="album-modal-field">
                <label className="album-modal-label" htmlFor="new-album-name">
                  Album name
                </label>
                <input
                  ref={createAlbumInputRef}
                  id="new-album-name"
                  className="album-modal-input"
                  type="text"
                  value={newAlbumName}
                  onChange={(event) => {
                    setNewAlbumName(event.currentTarget.value);
                    if (createAlbumError) {
                      setCreateAlbumError("");
                    }
                  }}
                  placeholder="Enter the album name"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isCreatingAlbum}
                />
                {createAlbumError ? <span className="album-modal-error">{createAlbumError}</span> : null}
              </div>

              <div className="album-modal-actions">
                <button type="submit" className="album-modal-confirm" disabled={isCreatingAlbum}>
                  {isCreatingAlbum ? "Creating..." : "OK"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Discasa settings">
          <button type="button" className="settings-modal-backdrop" aria-label="Close settings" onClick={closeSettingsModal} />
          <div className="settings-modal">
            <aside className="settings-modal-sidebar">
              <div className="settings-modal-profile">
                <div className="settings-modal-avatar" aria-hidden="true" />
                <div className="settings-modal-profile-copy">
                  <span className="settings-profile-primary">{profile.nickname}</span>
                  <span className="settings-profile-secondary">{profile.server}</span>
                </div>
              </div>

              <div className="settings-modal-nav-group">
                <span className="settings-modal-nav-label">Settings</span>
                <button type="button" className={`settings-modal-nav-item ${settingsSection === "discord" ? "active" : ""}`} onClick={() => setSettingsSection("discord")}>
                  Discord
                </button>
                <button type="button" className={`settings-modal-nav-item ${settingsSection === "appearance" ? "active" : ""}`} onClick={() => setSettingsSection("appearance")}>
                  Appearance
                </button>
                <button type="button" className={`settings-modal-nav-item ${settingsSection === "window" ? "active" : ""}`} onClick={() => setSettingsSection("window")}>
                  Window
                </button>
              </div>
            </aside>

            <section className="settings-modal-content">
              <button type="button" className="settings-modal-close" onClick={closeSettingsModal} aria-label="Close settings">
                <span className="settings-modal-close-glyph">×</span>
              </button>
              {renderSettingsModalContent()}
            </section>
          </div>
        </div>
      ) : null}

      {albumContextMenu ? (
        <div
          className="context-menu"
          style={{ left: `${albumContextMenu.x}px`, top: `${albumContextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void handleRenameAlbum(albumContextMenu.albumId, albumContextMenu.albumName)}
          >
            Rename
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void handleMoveAlbum(albumContextMenu.albumId, "up")}
            disabled={!canMoveAlbum(albumContextMenu.albumId, "up")}
          >
            Move up
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void handleMoveAlbum(albumContextMenu.albumId, "down")}
            disabled={!canMoveAlbum(albumContextMenu.albumId, "down")}
          >
            Move down
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item danger"
            onClick={() => void handleDeleteAlbum(albumContextMenu.albumId, albumContextMenu.albumName)}
          >
            Delete album
          </button>
        </div>
      ) : null}

      {(message || error) ? (
        <div className="status-toast">
          {message ? <span>{message}</span> : null}
          {error ? <span className="status-error">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
