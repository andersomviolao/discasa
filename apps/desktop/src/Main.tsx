import React from "react";
import ReactDOM from "react-dom/client";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow, type DragDropEvent } from "@tauri-apps/api/window";
import logoUrl from "./assets/discasa-logo.png";
import "./styles.css";
import {
  AlbumContextMenu,
  AlbumModal,
  AuthSetupModal,
  type AuthSetupStep,
  DeleteAlbumModal,
  DeleteFileModal,
  Gallery,
  SettingsModal,
  Sidebar,
  StatusToast,
  Titlebar,
} from "./components/Components";
import {
  createAlbum,
  deleteAlbum,
  deleteLibraryItem,
  getAlbums,
  getAppConfig,
  getDiscasaSetupStatus,
  getGuilds,
  getLibraryItems,
  getSession,
  initializeDiscasa,
  moveToTrash,
  openDiscordBotInstall,
  openDiscordLogin,
  renameAlbum,
  reorderAlbums,
  restoreFromTrash,
  restoreLibraryItemOriginal as restoreLibraryItemOriginalRequest,
  saveLibraryItemMediaEdit as saveLibraryItemMediaEditRequest,
  toggleFavorite,
  updateAppConfig,
  uploadFiles,
  DEFAULT_PROFILE,
  getCurrentDescription,
  getCurrentTitle,
  getVisibleItems,
  clampNumber,
  hexToRgbChannels,
  normalizeHexColor,
  tintHexColor,
  readStoredBoolean,
  readStoredNumber,
  readStoredString,
  type AlbumContextMenuState,
  type SettingsSection,
  type SidebarView,
  type WindowState,
} from "./lib/Lib";

const appWindow = getCurrentWindow();
const SIDEBAR_COLLAPSED_KEY = "discasa.sidebar.collapsed";
const MINIMIZE_TO_TRAY_KEY = "discasa.window.minimizeToTray";
const CLOSE_TO_TRAY_KEY = "discasa.window.closeToTray";
const ACCENT_COLOR_KEY = "discasa.ui.accentColor";
const SELECTED_GUILD_KEY = "discasa.discord.selectedGuildId";
const ACTIVE_GUILD_ID_KEY = "discasa.discord.activeGuildId";
const ACTIVE_GUILD_NAME_KEY = "discasa.discord.activeGuildName";
const THUMBNAIL_ZOOM_KEY = "discasa.library.thumbnailZoomPercent";
const DEFAULT_ACCENT_HEX = DISCASA_DEFAULT_CONFIG.accentColor;
const THUMBNAIL_BASE_SIZE = 400;
const THUMBNAIL_ZOOM_LEVELS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80] as const;
const DEFAULT_THUMBNAIL_ZOOM_PERCENT = DISCASA_DEFAULT_CONFIG.thumbnailZoomPercent;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getClosestThumbnailZoomIndex(value: number): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  THUMBNAIL_ZOOM_LEVELS.forEach((level, index) => {
    const distance = Math.abs(level - value);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function getThumbnailSizeFromZoomPercent(value: number): number {
  return Math.round((THUMBNAIL_BASE_SIZE * value) / 100);
}

function getRequiredAuthSetupStep(session: AppSession): AuthSetupStep | null {
  if (!session.authenticated) {
    return "login";
  }

  if (!session.activeGuild) {
    return "select-server";
  }

  return null;
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
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>(() => readStoredString(SELECTED_GUILD_KEY, ""));
  const [activeGuildId, setActiveGuildId] = useState<string>(() => readStoredString(ACTIVE_GUILD_ID_KEY, ""));
  const [activeGuildName, setActiveGuildName] = useState<string | null>(() => {
    const value = readStoredString(ACTIVE_GUILD_NAME_KEY, "");
    return value || null;
  });
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [isApplyingGuild, setIsApplyingGuild] = useState(false);
  const [authSetupStep, setAuthSetupStep] = useState<AuthSetupStep | null>(null);
  const [authSetupError, setAuthSetupError] = useState("");
  const [isCheckingSetup, setIsCheckingSetup] = useState(false);
  const [hasOpenedBotInvite, setHasOpenedBotInvite] = useState(false);
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
  const [deleteAlbumTarget, setDeleteAlbumTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [deleteAlbumError, setDeleteAlbumError] = useState("");
  const [deleteFileTarget, setDeleteFileTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [attachmentWarnings, setAttachmentWarnings] = useState<DiscasaAttachmentRecoveryWarning[]>([]);
  const [thumbnailZoomIndex, setThumbnailZoomIndex] = useState<number>(() => {
    const storedPercent = readStoredNumber(THUMBNAIL_ZOOM_KEY, DEFAULT_THUMBNAIL_ZOOM_PERCENT);
    return getClosestThumbnailZoomIndex(storedPercent);
  });

  const dragDepthRef = useRef(0);
  const closeToTrayRef = useRef(closeToTray);
  const createAlbumInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const albumsRef = useRef<AlbumRecord[]>([]);
  const selectedViewRef = useRef<SidebarView>(selectedView);
  const selectionAnchorRef = useRef<string | null>(null);
  const hasBootstrappedRef = useRef(false);

  const thumbnailZoomPercent = THUMBNAIL_ZOOM_LEVELS[thumbnailZoomIndex] ?? DEFAULT_THUMBNAIL_ZOOM_PERCENT;
  const thumbnailSize = getThumbnailSizeFromZoomPercent(thumbnailZoomPercent);

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;
    void bootstrap();
  }, []);

  useEffect(() => {
    albumsRef.current = albums;
  }, [albums]);

  useEffect(() => {
    selectedViewRef.current = selectedView;
  }, [selectedView]);

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
    if (typeof window === "undefined") return;

    if (selectedGuildId) {
      window.localStorage.setItem(SELECTED_GUILD_KEY, selectedGuildId);
      return;
    }

    window.localStorage.removeItem(SELECTED_GUILD_KEY);
  }, [selectedGuildId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (activeGuildId) {
      window.localStorage.setItem(ACTIVE_GUILD_ID_KEY, activeGuildId);
    } else {
      window.localStorage.removeItem(ACTIVE_GUILD_ID_KEY);
    }

    if (activeGuildName) {
      window.localStorage.setItem(ACTIVE_GUILD_NAME_KEY, activeGuildName);
    } else {
      window.localStorage.removeItem(ACTIVE_GUILD_NAME_KEY);
    }
  }, [activeGuildId, activeGuildName]);

  useEffect(() => {
    const normalized = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_HEX;
    const root = document.documentElement;

    root.style.setProperty("--accent-color", normalized);
    root.style.setProperty("--accent-rgb", hexToRgbChannels(normalized, DEFAULT_ACCENT_HEX));
    root.style.setProperty("--accent-color-hover", tintHexColor(normalized, 0.12, DEFAULT_ACCENT_HEX));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_COLOR_KEY, normalized);
    }
  }, [accentColor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THUMBNAIL_ZOOM_KEY, String(thumbnailZoomPercent));
  }, [thumbnailZoomPercent]);

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
    if (!isSettingsOpen && !isCreateAlbumOpen && !deleteAlbumTarget && !deleteFileTarget) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (deleteFileTarget) {
        if (!isDeletingFile) {
          closeDeleteFileModal();
        }
        return;
      }

      if (deleteAlbumTarget) {
        if (!isDeletingAlbum) {
          closeDeleteAlbumModal();
        }
        return;
      }

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
  }, [isSettingsOpen, isCreateAlbumOpen, deleteAlbumTarget, isDeletingAlbum, deleteFileTarget, isDeletingFile]);

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void appWindow
      .onDragDropEvent(async ({ payload }: { payload: DragDropEvent }) => {
        if (payload.type === "over") {
          setIsDraggingFiles(true);
          return;
        }

        dragDepthRef.current = 0;
        setIsDraggingFiles(false);

        if (payload.type !== "drop") {
          return;
        }

        await handleNativeFileDrop(payload.paths);
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }

        unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (authSetupStep !== "waiting") {
      return;
    }

    let disposed = false;

    const pollSession = async () => {
      try {
        const session = await getSession();
        if (disposed || !session.authenticated) {
          return;
        }

        setSessionName(session.user?.username ?? null);
        setSessionAvatarUrl(session.user?.avatarUrl ?? null);
        setActiveGuildId(session.activeGuild?.id ?? "");
        setActiveGuildName(session.activeGuild?.name ?? null);
        setAuthSetupError("");

        if (session.activeGuild) {
          await bootstrap();
          return;
        }

        await loadEligibleGuilds(session.activeGuild?.id ?? undefined);
        if (!disposed) {
          setAuthSetupStep("select-server");
        }
      } catch {
        return;
      }
    };

    void pollSession();
    const timer = window.setInterval(() => {
      void pollSession();
    }, 1200);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [authSetupStep]);

  function applyRemoteConfig(nextConfig: DiscasaConfig): void {
    const normalizedAccent = normalizeHexColor(nextConfig.accentColor) ?? DEFAULT_ACCENT_HEX;
    setIsSidebarCollapsed(nextConfig.sidebarCollapsed);
    setMinimizeToTray(nextConfig.minimizeToTray);
    setCloseToTray(nextConfig.closeToTray);
    setAccentColor(normalizedAccent);
    setThumbnailZoomIndex(getClosestThumbnailZoomIndex(nextConfig.thumbnailZoomPercent));
  }

  async function loadRemoteConfig(): Promise<void> {
    const nextConfig = await getAppConfig();
    applyRemoteConfig(nextConfig);
  }

  async function persistConfigPatch(patch: Partial<DiscasaConfig>): Promise<void> {
    if (!activeGuildId) {
      return;
    }

    try {
      const nextConfig = await updateAppConfig(patch);
      applyRemoteConfig(nextConfig);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save the settings.");
    }
  }

  function syncGuildSelection(nextGuilds: GuildSummary[], preferredGuildId?: string): void {
    setSelectedGuildId((current) => {
      if (current && nextGuilds.some((guild) => guild.id === current)) {
        return current;
      }

      if (preferredGuildId && nextGuilds.some((guild) => guild.id === preferredGuildId)) {
        return preferredGuildId;
      }

      if (activeGuildId && nextGuilds.some((guild) => guild.id === activeGuildId)) {
        return activeGuildId;
      }

      return nextGuilds[0]?.id ?? "";
    });

    const matchedGuild = nextGuilds.find((guild) => guild.id === preferredGuildId || guild.id === activeGuildId);
    if (matchedGuild) {
      setActiveGuildName(matchedGuild.name);
    }
  }

  async function loadEligibleGuilds(preferredGuildId?: string): Promise<GuildSummary[]> {
    setIsLoadingGuilds(true);

    try {
      const nextGuilds = await getGuilds();
      setGuilds(nextGuilds);
      syncGuildSelection(nextGuilds, preferredGuildId);
      return nextGuilds;
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not load the Discord server list.";
      setGuilds([]);
      setAuthSetupError(nextError);
      return [];
    } finally {
      setIsLoadingGuilds(false);
    }
  }

  async function bootstrap(): Promise<void> {
    setIsBusy(true);
    setError("");

    try {
      const [session, nextAlbums, nextItems] = await Promise.all([getSession(), getAlbums(), getLibraryItems()]);

      setSessionName(session.user?.username ?? null);
      setSessionAvatarUrl(session.user?.avatarUrl ?? null);
      setActiveGuildId(session.activeGuild?.id ?? "");
      setActiveGuildName(session.activeGuild?.name ?? null);
      setAlbums(nextAlbums);
      setItems(nextItems);

      if (!session.authenticated || !session.activeGuild) {
        setAttachmentWarnings([]);
      }

      try {
        await loadRemoteConfig();
      } catch {
        // Keep local defaults when cloud settings are unavailable.
      }

      if (session.authenticated) {
        await loadEligibleGuilds(session.activeGuild?.id ?? undefined);
      } else {
        setGuilds([]);
      }

      setAuthSetupError("");
      setIsCheckingSetup(false);
      setHasOpenedBotInvite(false);
      setAuthSetupStep(getRequiredAuthSetupStep(session));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load Discasa preview.");
    } finally {
      setIsBusy(false);
    }
  }

  const profile = useMemo(
    () => ({
      nickname: sessionName ?? DEFAULT_PROFILE.nickname,
      server: activeGuildName ?? DEFAULT_PROFILE.server,
      avatarUrl: sessionAvatarUrl,
    }),
    [activeGuildName, sessionAvatarUrl, sessionName],
  );

  const visibleItems = useMemo(() => getVisibleItems(items, selectedView), [items, selectedView]);
  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const currentTitle = useMemo(() => getCurrentTitle(selectedView, albums), [albums, selectedView]);
  const currentDescription = useMemo(() => getCurrentDescription(selectedView), [selectedView]);
  const selectedGuildName = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuildId)?.name ?? null,
    [guilds, selectedGuildId],
  );

  useEffect(() => {
    setSelectedItemIds([]);
    selectionAnchorRef.current = null;
  }, [selectedView]);

  useEffect(() => {
    const visibleIdSet = new Set(visibleItemIds);

    setSelectedItemIds((current) => current.filter((itemId) => visibleIdSet.has(itemId)));

    if (selectionAnchorRef.current && !visibleIdSet.has(selectionAnchorRef.current)) {
      selectionAnchorRef.current = visibleItemIds[0] ?? null;
    }
  }, [visibleItemIds]);

  function orderSelectionByVisibleItems(itemIds: string[]): string[] {
    const uniqueIds = new Set(itemIds);
    return visibleItemIds.filter((itemId) => uniqueIds.has(itemId));
  }

  function handleClearSelectedItems(): void {
    setSelectedItemIds([]);
    selectionAnchorRef.current = null;
  }

  function handleSelectItem(itemId: string, options: { range: boolean; toggle: boolean }): void {
    if (!visibleItemIds.includes(itemId)) {
      return;
    }

    if (options.range) {
      const anchorId = selectionAnchorRef.current && visibleItemIds.includes(selectionAnchorRef.current)
        ? selectionAnchorRef.current
        : itemId;
      const anchorIndex = visibleItemIds.indexOf(anchorId);
      const itemIndex = visibleItemIds.indexOf(itemId);
      const start = Math.min(anchorIndex, itemIndex);
      const end = Math.max(anchorIndex, itemIndex);
      const rangeIds = visibleItemIds.slice(start, end + 1);

      setSelectedItemIds((current) => {
        if (options.toggle) {
          return orderSelectionByVisibleItems([...current, ...rangeIds]);
        }

        return rangeIds;
      });

      selectionAnchorRef.current = anchorId;
      return;
    }

    if (options.toggle) {
      setSelectedItemIds((current) => {
        if (current.includes(itemId)) {
          return current.filter((entry) => entry !== itemId);
        }

        return orderSelectionByVisibleItems([...current, itemId]);
      });
      selectionAnchorRef.current = itemId;
      return;
    }

    setSelectedItemIds([itemId]);
    selectionAnchorRef.current = itemId;
  }

  function handleApplySelectionRect(itemIds: string[], mode: "replace" | "add"): void {
    const orderedItemIds = orderSelectionByVisibleItems(itemIds);

    setSelectedItemIds((current) => {
      if (mode === "add") {
        return orderSelectionByVisibleItems([...current, ...orderedItemIds]);
      }

      return orderedItemIds;
    });

    if (orderedItemIds.length > 0) {
      selectionAnchorRef.current = orderedItemIds[0] ?? selectionAnchorRef.current;
    }
  }

  function updateItemInState(nextItem: LibraryItem): void {
    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }

  function removeItemFromState(itemId: string): void {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedItemIds((current) => current.filter((id) => id !== itemId));

    if (selectionAnchorRef.current === itemId) {
      selectionAnchorRef.current = null;
    }
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

  function openDeleteAlbumModal(albumId: string, albumName: string): void {
    setAlbumContextMenu(null);
    setDeleteAlbumError("");
    setDeleteAlbumTarget({ id: albumId, name: albumName });
  }

  function closeDeleteAlbumModal(): void {
    if (isDeletingAlbum) return;
    setDeleteAlbumTarget(null);
    setDeleteAlbumError("");
  }

  function openDeleteFileModal(itemId: string): void {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    setDeleteFileError("");
    setDeleteFileTarget({ id: item.id, name: item.name });
  }

  function closeDeleteFileModal(): void {
    if (isDeletingFile) return;
    setDeleteFileTarget(null);
    setDeleteFileError("");
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

  async function handleDeleteAlbumConfirm(): Promise<void> {
    if (!deleteAlbumTarget) return;

    const { id: albumId, name: albumName } = deleteAlbumTarget;
    setIsDeletingAlbum(true);
    setDeleteAlbumError("");

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
      setDeleteAlbumTarget(null);
      setAlbumContextMenu(null);
      setMessage(`Album deleted: ${albumName}`);
      setError("");
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not delete the album.";
      setDeleteAlbumError(nextError);
      setError(nextError);
    } finally {
      setIsDeletingAlbum(false);
    }
  }

  async function commitUploadedFiles(files: File[]): Promise<void> {
    const targetAlbumId = selectedViewRef.current.kind === "album" ? selectedViewRef.current.id : undefined;
    await uploadFiles(files, targetAlbumId);

    const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);
    albumsRef.current = nextAlbums;
    setItems(nextItems);
    setAlbums(nextAlbums);
    setMessage(`${files.length} file(s) added to the library.`);
    setError("");
  }

  async function createFileFromNativePath(filePath: string): Promise<File> {
    const response = await fetch(convertFileSrc(filePath));

    if (!response.ok) {
      throw new Error(`Failed to read dropped file: ${filePath}`);
    }

    const blob = await response.blob();
    const name = filePath.split(/[\\/]/).pop() ?? "file";
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  }

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      await commitUploadedFiles(Array.from(fileList));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleNativeFileDrop(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      const files = await Promise.all(filePaths.map((filePath) => createFileFromNativePath(filePath)));
      await commitUploadedFiles(files);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    } finally {
      setIsBusy(false);
    }
  }

  async function applyGuildSelection(guildIdToApply: string, successMessage?: string): Promise<void> {
    const nextGuildName = guilds.find((guild) => guild.id === guildIdToApply)?.name ?? "Selected server";

    try {
      setIsApplyingGuild(true);
      setAuthSetupError("");
      const initialization = await initializeDiscasa(guildIdToApply);
      setSelectedGuildId(guildIdToApply);
      setActiveGuildId(guildIdToApply);
      setActiveGuildName(nextGuildName);
      await bootstrap();
      setAttachmentWarnings(initialization.recovery.unresolvedItems);

      const messageParts = [successMessage ?? `Discasa applied to ${nextGuildName}.`];
      if (initialization.recovery.relinkedItemCount > 0) {
        messageParts.push(`${initialization.recovery.relinkedItemCount} file link(s) refreshed.`);
      }

      setMessage(messageParts.join(" "));
      setError("");
      setAuthSetupStep(null);
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not apply the selected server.";
      setAuthSetupError(nextError);
    } finally {
      setIsApplyingGuild(false);
    }
  }

  async function handleOpenDiscordLoginFlow(): Promise<void> {
    setIsSettingsOpen(false);
    setAuthSetupError("");
    setIsCheckingSetup(false);
    setHasOpenedBotInvite(false);
    setAttachmentWarnings([]);
    setAuthSetupStep("waiting");

    try {
      await openDiscordLogin();
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not open the Discord login in the browser.";
      setAuthSetupError(nextError);
      setAuthSetupStep("login");
    }
  }

  async function handleRefreshGuildSetup(): Promise<void> {
    setAuthSetupError("");
    await loadEligibleGuilds(activeGuildId || undefined);
  }

  async function handleConfirmSetupGuildSelection(): Promise<void> {
    if (!selectedGuildId) {
      setAuthSetupError("Select a server first.");
      return;
    }

    setIsCheckingSetup(true);
    setAuthSetupError("");

    try {
      const status = await getDiscasaSetupStatus(selectedGuildId);

      if (status.isApplied) {
        setHasOpenedBotInvite(true);
        await applyGuildSelection(
          selectedGuildId,
          `Discasa detected in ${selectedGuildName ?? "the selected server"}.`,
        );
        return;
      }

      if (status.botPresent) {
        setHasOpenedBotInvite(true);
        setAuthSetupStep("apply-server");
        return;
      }

      setHasOpenedBotInvite(false);
      setAuthSetupStep("invite-bot");
    } catch (caughtError) {
      setAuthSetupError(
        caughtError instanceof Error ? caughtError.message : "Could not inspect the selected server.",
      );
    } finally {
      setIsCheckingSetup(false);
    }
  }

  function handleOpenBotInviteFromSetup(): void {
    if (!selectedGuildId) {
      setAuthSetupError("Select a server first.");
      return;
    }

    setAuthSetupError("");
    openDiscordBotInstall(selectedGuildId);
    setHasOpenedBotInvite(true);
  }

  async function handleContinueToApplyFromSetup(): Promise<void> {
    if (!selectedGuildId) {
      setAuthSetupError("Select a server first.");
      return;
    }

    if (!hasOpenedBotInvite) {
      setAuthSetupError("Invite the bot before continuing.");
      return;
    }

    setIsCheckingSetup(true);
    setAuthSetupError("");

    try {
      const status = await getDiscasaSetupStatus(selectedGuildId);

      if (!status.botPresent) {
        setAuthSetupError("The bot was not detected in the selected server yet. Finish the invite and try again.");
        return;
      }

      if (status.isApplied) {
        await applyGuildSelection(
          selectedGuildId,
          `Discasa detected in ${selectedGuildName ?? "the selected server"}.`,
        );
        return;
      }

      setAuthSetupStep("apply-server");
    } catch (caughtError) {
      setAuthSetupError(
        caughtError instanceof Error ? caughtError.message : "Could not confirm the bot installation.",
      );
    } finally {
      setIsCheckingSetup(false);
    }
  }

  async function handleApplyGuildFromSetup(): Promise<void> {
    if (!selectedGuildId) {
      setAuthSetupError("Select a server first.");
      return;
    }

    await applyGuildSelection(selectedGuildId, `Discasa applied to ${selectedGuildName ?? "the selected server"}.`);
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

  async function handleSaveMediaEdit(itemId: string, input: SaveLibraryItemMediaEditInput): Promise<LibraryItem> {
    const response = await saveLibraryItemMediaEditRequest(itemId, input);
    updateItemInState(response.item);
    return response.item;
  }

  async function handleRestoreMediaEditOriginal(itemId: string): Promise<LibraryItem> {
    const response = await restoreLibraryItemOriginalRequest(itemId);
    updateItemInState(response.item);
    return response.item;
  }

  function handleDeleteItem(itemId: string): Promise<void> {
    openDeleteFileModal(itemId);
    return Promise.resolve();
  }

  async function handleDeleteFileConfirm(): Promise<void> {
    if (!deleteFileTarget) return;

    setIsDeletingFile(true);
    setDeleteFileError("");

    try {
      await deleteLibraryItem(deleteFileTarget.id);
      removeItemFromState(deleteFileTarget.id);
      setMessage("File permanently deleted.");
      setError("");
      setDeleteFileTarget(null);
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not delete the file.";
      setDeleteFileError(nextError);
      setError(nextError);
    } finally {
      setIsDeletingFile(false);
    }
  }

  function handleToggleSidebar(): void {
    const nextCollapsed = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextCollapsed);
    void persistConfigPatch({ sidebarCollapsed: nextCollapsed });
  }

  function handleChangeMinimizeToTray(nextValue: boolean): void {
    setMinimizeToTray(nextValue);
    void persistConfigPatch({ minimizeToTray: nextValue });
  }

  function handleChangeCloseToTray(nextValue: boolean): void {
    setCloseToTray(nextValue);
    void persistConfigPatch({ closeToTray: nextValue });
  }

  function handleThumbnailZoomIndexChange(nextIndex: number): void {
    const clampedIndex = clampNumber(nextIndex, 0, THUMBNAIL_ZOOM_LEVELS.length - 1);
    setThumbnailZoomIndex(clampedIndex);
    const nextPercent = THUMBNAIL_ZOOM_LEVELS[clampedIndex] ?? DEFAULT_THUMBNAIL_ZOOM_PERCENT;
    void persistConfigPatch({ thumbnailZoomPercent: nextPercent });
  }

  function handleCommitAccentColor(nextValue: string): void {
    const normalized = normalizeHexColor(nextValue) ?? DEFAULT_ACCENT_HEX;
    setAccentColor(normalized);
    void persistConfigPatch({ accentColor: normalized });
  }

  async function handleStartDragging(event: MouseEvent<HTMLElement>): Promise<void> {
    if (event.button !== 0) return;

    event.preventDefault();

    try {
      await appWindow.startDragging();
    } catch {
      return;
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

    if (isTauriRuntime()) {
      return;
    }

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
            onToggleSidebar={handleToggleSidebar}
            onOpenView={openLibraryView}
            onOpenCreateAlbum={openCreateAlbumModal}
            onOpenAlbumContextMenu={handleAlbumContextMenu}
          />

          <Gallery
            title={currentTitle}
            description={currentDescription}
            items={visibleItems}
            attachmentWarnings={attachmentWarnings}
            selectedItemIds={selectedItemIds}
            isBusy={isBusy}
            isDraggingFiles={isDraggingFiles}
            thumbnailSize={thumbnailSize}
            thumbnailZoomIndex={thumbnailZoomIndex}
            thumbnailZoomLevelCount={THUMBNAIL_ZOOM_LEVELS.length}
            thumbnailZoomPercent={thumbnailZoomPercent}
            onThumbnailZoomIndexChange={handleThumbnailZoomIndexChange}
            onSelectItem={handleSelectItem}
            onClearSelection={handleClearSelectedItems}
            onApplySelectionRect={handleApplySelectionRect}
            onRequestUpload={requestUpload}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={handleFileDrop}
            onToggleFavorite={handleToggleFavorite}
            onMoveToTrash={handleMoveToTrash}
            onRestoreFromTrash={handleRestoreFromTrash}
            onSaveMediaEdit={handleSaveMediaEdit}
            onRestoreMediaEdit={handleRestoreMediaEditOriginal}
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

      {authSetupStep ? (
        <AuthSetupModal
          step={authSetupStep}
          guilds={guilds}
          selectedGuildId={selectedGuildId}
          selectedGuildName={selectedGuildName}
          error={authSetupError}
          isLoadingGuilds={isLoadingGuilds}
          isApplyingGuild={isApplyingGuild}
          isCheckingSetup={isCheckingSetup}
          hasOpenedBotInvite={hasOpenedBotInvite}
          onStartLogin={() => {
            void handleOpenDiscordLoginFlow();
          }}
          onSelectGuild={(guildId) => {
            setSelectedGuildId(guildId);
            setHasOpenedBotInvite(false);
            setAuthSetupError("");
          }}
          onConfirmGuild={() => {
            void handleConfirmSetupGuildSelection();
          }}
          onBackToLogin={() => {
            setHasOpenedBotInvite(false);
            setIsCheckingSetup(false);
            setAuthSetupError("");
            setAuthSetupStep("login");
          }}
          onBackToServerSelection={() => {
            setHasOpenedBotInvite(false);
            setIsCheckingSetup(false);
            setAuthSetupError("");
            setAuthSetupStep("select-server");
          }}
          onRetryGuilds={() => {
            void handleRefreshGuildSetup();
          }}
          onOpenBotInvite={handleOpenBotInviteFromSetup}
          onContinueToApply={() => {
            void handleContinueToApplyFromSetup();
          }}
          onApplyGuild={() => {
            void handleApplyGuildFromSetup();
          }}
        />
      ) : null}

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

      {deleteFileTarget ? (
        <DeleteFileModal
          fileName={deleteFileTarget.name}
          isDeleting={isDeletingFile}
          error={deleteFileError}
          onClose={closeDeleteFileModal}
          onConfirm={handleDeleteFileConfirm}
        />
      ) : null}

      {deleteAlbumTarget ? (
        <DeleteAlbumModal
          albumName={deleteAlbumTarget.name}
          isDeleting={isDeletingAlbum}
          error={deleteAlbumError}
          onClose={closeDeleteAlbumModal}
          onConfirm={handleDeleteAlbumConfirm}
        />
      ) : null}

      {isSettingsOpen ? (
        <SettingsModal
          profile={profile}
          settingsSection={settingsSection}
          sessionName={sessionName}
          activeGuildName={activeGuildName}
          minimizeToTray={minimizeToTray}
          closeToTray={closeToTray}
          accentColor={accentColor}
          onClose={() => setIsSettingsOpen(false)}
          onSelectSection={setSettingsSection}
          onChangeMinimizeToTray={handleChangeMinimizeToTray}
          onChangeCloseToTray={handleChangeCloseToTray}
          onCommitAccentColor={handleCommitAccentColor}
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
        onDelete={() => {
          if (albumContextMenu) {
            openDeleteAlbumModal(albumContextMenu.albumId, albumContextMenu.albumName);
          }
          return Promise.resolve();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      />

      <StatusToast message={message} error={error} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
