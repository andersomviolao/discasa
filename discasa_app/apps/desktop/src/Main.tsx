import {
  StrictMode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow, type DragDropEvent } from "@tauri-apps/api/window";
import {
  DISCASA_CHANNELS,
  DISCASA_DEFAULT_CONFIG,
  type AlbumRecord,
  type AppSession,
  type DiscasaAttachmentRecoveryWarning,
  type DiscasaConfig,
  type GuildSummary,
  type LibraryItem,
  type LocalStorageStatus,
  type SaveLibraryItemMediaEditInput,
} from "@discasa/shared";
import logoUrl from "./assets/discasa-logo.png";
import defaultAvatarUrl from "./assets/discasa-default-avatar.png";
import "./styles.css";
import {
  applyInterfaceLanguage,
  readStoredLanguage,
  supportedLanguages,
  writeStoredLanguage,
  type InterfaceLanguage,
} from "./i18n";
import {
  logoutDiscord,
  addLibraryItemsToAlbum,
  createAlbum,
  deleteAlbum,
  deleteLibraryItem,
  getAlbums,
  getAppConfig,
  getDiscasaBotStatus,
  getDiscasaSetupStatus,
  getGuilds,
  getLibraryItems,
  getSession,
  initializeDiscasa,
  moveLibraryItemsToAlbum,
  moveToTrash,
  openDiscordBotInstall,
  openDiscordLogin,
  renameAlbum,
  removeLibraryItemsFromAlbum,
  reorderAlbums,
  restoreFromTrash,
  restoreLibraryItemOriginal as restoreLibraryItemOriginalRequest,
  saveLibraryItemMediaEdit as saveLibraryItemMediaEditRequest,
  toggleFavorite,
  updateAppConfig,
  uploadFiles,
  chooseLocalMirrorFolder,
  downloadLibraryItems,
  DEFAULT_PROFILE,
  getCurrentDescription,
  getCurrentTitle,
  getLibraryItemContentUrl,
  getLibraryItemThumbnailUrl,
  getVisibleItems,
  clampNumber,
  hexToHsv,
  hexToRgbChannels,
  importExternalLibraryFiles,
  hsvToHex,
  normalizeHexColor,
  tintHexColor,
  isAudio,
  isImage,
  isVideo,
  createViewerDraftStateFromItem,
  getPersistedMediaPresentation,
  hasPendingViewerSave,
  toMediaEditSaveInput,
  commitMouseWheelBehavior,
  getLocalStorageStatus,
  readStoredBoolean,
  readStoredMouseWheelBehavior,
  readStoredNumber,
  readStoredString,
  VIEWER_WHEEL_BEHAVIOR_EVENT,
  type HsvColor,
  type AlbumContextMenuState,
  type DiscasaBotStatus,
  type GalleryDisplayMode,
  type MouseWheelBehavior,
  type SettingsSection,
  type SidebarView,
  type ViewerDraftState,
  type ViewerState,
  type WindowState,
} from "./app-logic";

const appWindow = getCurrentWindow();
const SIDEBAR_COLLAPSED_KEY = "discasa.sidebar.collapsed";
const MINIMIZE_TO_TRAY_KEY = "discasa.window.minimizeToTray";
const CLOSE_TO_TRAY_KEY = "discasa.window.closeToTray";
const ACCENT_COLOR_KEY = "discasa.ui.accentColor";
const SELECTED_GUILD_KEY = "discasa.discord.selectedGuildId";
const ACTIVE_GUILD_ID_KEY = "discasa.discord.activeGuildId";
const ACTIVE_GUILD_NAME_KEY = "discasa.discord.activeGuildName";
const LIBRARY_CACHE_KEY_PREFIX = "discasa.library.cache";
const LIBRARY_CACHE_VERSION = 1;
const THUMBNAIL_ZOOM_KEY = "discasa.library.thumbnailZoomPercent";
const DEFAULT_ACCENT_HEX = DISCASA_DEFAULT_CONFIG.accentColor;
const THUMBNAIL_BASE_SIZE = 400;
const THUMBNAIL_ZOOM_LEVELS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80] as const;
const DEFAULT_THUMBNAIL_ZOOM_PERCENT = DISCASA_DEFAULT_CONFIG.thumbnailZoomPercent;
const DEFAULT_GALLERY_DISPLAY_MODE = DISCASA_DEFAULT_CONFIG.galleryDisplayMode;
const CONFIG_SAVE_DEBOUNCE_MS = 700;
const DRIVE_IMPORT_INTERVAL_MS = 30000;
const DISCASA_LIBRARY_ITEM_DRAG_MIME = "application/x-discasa-library-items";
const DISCASA_LIBRARY_ITEM_DRAG_TEXT_PREFIX = "discasa-library-items:";
const AUTH_APPLY_PROGRESS_STEP_MS = 1700;
const AUTH_APPLY_PROGRESS_STEPS = [
  {
    title: "Preparing private channels",
    detail: "Discasa is creating or reusing the drive, index, folder, trash and config channels.",
  },
  {
    title: "Reading Discord snapshots",
    detail: "Library metadata is being resolved before the interface opens.",
  },
  {
    title: "Refreshing file links",
    detail: "Stored attachments are being checked so existing files can appear correctly.",
  },
  {
    title: "Importing external files",
    detail: "Manual uploads in the Discasa drive and local mirror folder are being folded into the library.",
  },
  {
    title: "Organizing the local flow",
    detail: "Albums, mirror paths and cached previews are being prepared for the selected server.",
  },
] as const;

type CachedLibraryState = {
  version: typeof LIBRARY_CACHE_VERSION;
  guildId: string;
  guildName: string | null;
  sessionName: string | null;
  sessionAvatarUrl: string | null;
  albums: AlbumRecord[];
  items: LibraryItem[];
  savedAt: string;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getLibraryCacheKey(guildId: string): string {
  return `${LIBRARY_CACHE_KEY_PREFIX}.${guildId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCachedAlbumRecord(value: unknown): value is AlbumRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.itemCount === "number"
  );
}

function isCachedLibraryItem(value: unknown): value is LibraryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.mimeType === "string" &&
    Array.isArray(value.albumIds)
  );
}

function readCachedLibraryState(guildId: string): CachedLibraryState | null {
  if (!guildId || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getLibraryCacheKey(guildId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== LIBRARY_CACHE_VERSION ||
      parsed.guildId !== guildId ||
      !Array.isArray(parsed.albums) ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }

    return {
      version: LIBRARY_CACHE_VERSION,
      guildId,
      guildName: typeof parsed.guildName === "string" ? parsed.guildName : null,
      sessionName: typeof parsed.sessionName === "string" ? parsed.sessionName : null,
      sessionAvatarUrl: typeof parsed.sessionAvatarUrl === "string" ? parsed.sessionAvatarUrl : null,
      albums: parsed.albums.filter(isCachedAlbumRecord),
      items: parsed.items.filter(isCachedLibraryItem),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

function writeCachedLibraryState(input: Omit<CachedLibraryState, "version" | "savedAt">): void {
  if (!input.guildId || typeof window === "undefined") {
    return;
  }

  try {
    const nextCache: CachedLibraryState = {
      ...input,
      version: LIBRARY_CACHE_VERSION,
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(getLibraryCacheKey(input.guildId), JSON.stringify(nextCache));
  } catch {
    // Local cache is opportunistic; the server remains the source of truth.
  }
}

function hasDataTransferType(dataTransfer: DataTransfer, type: string): boolean {
  const normalizedType = type.toLowerCase();
  return Array.from(dataTransfer.types).some((entry) => entry.toLowerCase() === normalizedType);
}

function hasExternalFileTransfer(dataTransfer: DataTransfer): boolean {
  return hasDataTransferType(dataTransfer, "Files");
}

function readDraggedLibraryItemIds(dataTransfer: DataTransfer): string[] {
  const customPayload = dataTransfer.getData(DISCASA_LIBRARY_ITEM_DRAG_MIME);
  const textPayload = dataTransfer.getData("text/plain");
  const raw = customPayload || (textPayload.startsWith(DISCASA_LIBRARY_ITEM_DRAG_TEXT_PREFIX)
    ? textPayload.slice(DISCASA_LIBRARY_ITEM_DRAG_TEXT_PREFIX.length)
    : "");

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)));
  } catch {
    return [];
  }
}

function findAlbumDropIdAtPoint(position: { x: number; y: number }): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  const candidatePoints = [
    { x: position.x, y: position.y },
    { x: position.x / devicePixelRatio, y: position.y / devicePixelRatio },
  ];

  for (const point of candidatePoints) {
    const element = document.elementFromPoint(point.x, point.y);
    const albumElement = element?.closest<HTMLElement>("[data-album-drop-id]");
    const albumId = albumElement?.dataset.albumDropId;

    if (albumId) {
      return albumId;
    }
  }

  return null;
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

function requiresLocalMirrorSetup(status: LocalStorageStatus | null): boolean {
  return Boolean(status?.localMirrorSetupRequired);
}

export function App() {
  const initialActiveGuildId = readStoredString(ACTIVE_GUILD_ID_KEY, "");
  const initialCachedLibrary = readCachedLibraryState(initialActiveGuildId);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState("");
  const [renameAlbumTarget, setRenameAlbumTarget] = useState<{ id: string; currentName: string } | null>(null);
  const [renameAlbumName, setRenameAlbumName] = useState("");
  const [isRenamingAlbum, setIsRenamingAlbum] = useState(false);
  const [renameAlbumError, setRenameAlbumError] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("discord");
  const [sessionName, setSessionName] = useState<string | null>(initialCachedLibrary?.sessionName ?? null);
  const [sessionAvatarUrl, setSessionAvatarUrl] = useState<string | null>(initialCachedLibrary?.sessionAvatarUrl ?? null);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>(() => readStoredString(SELECTED_GUILD_KEY, ""));
  const [activeGuildId, setActiveGuildId] = useState<string>(initialActiveGuildId);
  const [activeGuildName, setActiveGuildName] = useState<string | null>(() => {
    const value = readStoredString(ACTIVE_GUILD_NAME_KEY, "");
    return value || initialCachedLibrary?.guildName || null;
  });
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [isApplyingGuild, setIsApplyingGuild] = useState(false);
  const [authSetupStep, setAuthSetupStep] = useState<AuthSetupStep | null>(null);
  const [authSetupError, setAuthSetupError] = useState("");
  const [isCheckingSetup, setIsCheckingSetup] = useState(false);
  const [hasOpenedBotInvite, setHasOpenedBotInvite] = useState(false);
  const [albums, setAlbums] = useState<AlbumRecord[]>(initialCachedLibrary?.albums ?? []);
  const [items, setItems] = useState<LibraryItem[]>(initialCachedLibrary?.items ?? []);
  const [selectedView, setSelectedView] = useState<SidebarView>({ kind: "library", id: "all-files" });
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [botStatus, setBotStatus] = useState<DiscasaBotStatus | null>(null);
  const [windowState, setWindowState] = useState<WindowState>("default");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => readStoredBoolean(SIDEBAR_COLLAPSED_KEY, false));
  const [albumContextMenu, setAlbumContextMenu] = useState<AlbumContextMenuState>(null);
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => readStoredBoolean(MINIMIZE_TO_TRAY_KEY, false));
  const [closeToTray, setCloseToTray] = useState<boolean>(() => readStoredBoolean(CLOSE_TO_TRAY_KEY, false));
  const [accentColor, setAccentColor] = useState<string>(() => readStoredString(ACCENT_COLOR_KEY, DEFAULT_ACCENT_HEX));
  const [language, setLanguage] = useState<InterfaceLanguage>(() => readStoredLanguage(DISCASA_DEFAULT_CONFIG.language));
  const [localMirrorEnabled, setLocalMirrorEnabled] = useState(DISCASA_DEFAULT_CONFIG.localMirrorEnabled);
  const [localMirrorPath, setLocalMirrorPath] = useState<string>(DISCASA_DEFAULT_CONFIG.localMirrorPath ?? "");
  const [mediaPreviewVolume, setMediaPreviewVolume] = useState(DISCASA_DEFAULT_CONFIG.mediaPreviewVolume);
  const [localStorageStatus, setLocalStorageStatus] = useState<LocalStorageStatus | null>(null);
  const [isChoosingMirrorFolder, setIsChoosingMirrorFolder] = useState(false);
  const [deleteAlbumTarget, setDeleteAlbumTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [deleteAlbumError, setDeleteAlbumError] = useState("");
  const [deleteFileTarget, setDeleteFileTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState("");
  const [isMoveItemsOpen, setIsMoveItemsOpen] = useState(false);
  const [moveItemsTargetAlbumId, setMoveItemsTargetAlbumId] = useState("");
  const [isMovingItems, setIsMovingItems] = useState(false);
  const [moveItemsError, setMoveItemsError] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [draggingLibraryItemIds, setDraggingLibraryItemIds] = useState<string[]>([]);
  const [sidebarDropAlbumId, setSidebarDropAlbumId] = useState<string | null>(null);
  const [attachmentWarnings, setAttachmentWarnings] = useState<DiscasaAttachmentRecoveryWarning[]>([]);
  const [thumbnailZoomIndex, setThumbnailZoomIndex] = useState<number>(() => {
    const storedPercent = readStoredNumber(THUMBNAIL_ZOOM_KEY, DEFAULT_THUMBNAIL_ZOOM_PERCENT);
    return getClosestThumbnailZoomIndex(storedPercent);
  });
  const [galleryDisplayMode, setGalleryDisplayMode] = useState<GalleryDisplayMode>(DEFAULT_GALLERY_DISPLAY_MODE);

  const dragDepthRef = useRef(0);
  const closeToTrayRef = useRef(closeToTray);
  const createAlbumInputRef = useRef<HTMLInputElement | null>(null);
  const renameAlbumInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const albumsRef = useRef<AlbumRecord[]>([]);
  const selectedViewRef = useRef<SidebarView>(selectedView);
  const selectionAnchorRef = useRef<string | null>(null);
  const draggingLibraryItemIdsRef = useRef<string[]>([]);
  const nativeDropAlbumIdRef = useRef<string | null>(null);
  const activeGuildIdRef = useRef(activeGuildId);
  const isExternalImportInFlightRef = useRef(false);
  const libraryCacheGuildIdRef = useRef(initialCachedLibrary ? initialActiveGuildId : "");
  const hasHydratedLibraryCacheRef = useRef(Boolean(initialCachedLibrary));
  const pendingConfigPatchRef = useRef<Partial<DiscasaConfig> | null>(null);
  const configSaveTimerRef = useRef<number | null>(null);
  const isConfigSaveInFlightRef = useRef(false);
  const hasBootstrappedRef = useRef(false);

  const thumbnailZoomPercent = THUMBNAIL_ZOOM_LEVELS[thumbnailZoomIndex] ?? DEFAULT_THUMBNAIL_ZOOM_PERCENT;
  const thumbnailSize = getThumbnailSizeFromZoomPercent(thumbnailZoomPercent);

  function cacheLibraryState(next: {
    guildId?: string | null;
    guildName?: string | null;
    sessionName?: string | null;
    sessionAvatarUrl?: string | null;
    albums: AlbumRecord[];
    items: LibraryItem[];
  }): void {
    const guildId = next.guildId ?? activeGuildIdRef.current;
    if (!guildId) {
      return;
    }

    writeCachedLibraryState({
      guildId,
      guildName: next.guildName ?? activeGuildName,
      sessionName: next.sessionName ?? sessionName,
      sessionAvatarUrl: next.sessionAvatarUrl ?? sessionAvatarUrl,
      albums: next.albums,
      items: next.items,
    });
  }

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;
    void bootstrap();
  }, []);

  useEffect(() => {
    void loadBotStatus();

    const timer = window.setInterval(() => {
      void loadBotStatus();
    }, 12000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    albumsRef.current = albums;
  }, [albums]);

  useEffect(() => {
    selectedViewRef.current = selectedView;
  }, [selectedView]);

  useEffect(() => {
    activeGuildIdRef.current = activeGuildId;
  }, [activeGuildId]);

  useEffect(() => {
    if (!activeGuildId) {
      return;
    }

    let disposed = false;
    const runImport = () => {
      if (!disposed) {
        void importExternalFilesInBackground();
      }
    };

    runImport();
    const timer = window.setInterval(runImport, DRIVE_IMPORT_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeGuildId]);

  useEffect(() => {
    if (!activeGuildId || !hasHydratedLibraryCacheRef.current || libraryCacheGuildIdRef.current !== activeGuildId) {
      return;
    }

    writeCachedLibraryState({
      guildId: activeGuildId,
      guildName: activeGuildName,
      sessionName,
      sessionAvatarUrl,
      albums,
      items,
    });
  }, [activeGuildId, activeGuildName, sessionAvatarUrl, sessionName, albums, items]);

  useEffect(() => {
    return () => {
      if (configSaveTimerRef.current !== null) {
        window.clearTimeout(configSaveTimerRef.current);
      }
    };
  }, []);

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
    writeStoredLanguage(language);
    return applyInterfaceLanguage(language);
  }, [language]);

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
    if (!renameAlbumTarget) return;

    const timer = window.setTimeout(() => {
      renameAlbumInputRef.current?.focus();
      renameAlbumInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [renameAlbumTarget]);

  useEffect(() => {
    if (!isSettingsOpen && !isCreateAlbumOpen && !renameAlbumTarget && !deleteAlbumTarget && !deleteFileTarget && !isMoveItemsOpen) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (isMoveItemsOpen) {
        closeMoveItemsModal();
        return;
      }

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

      if (renameAlbumTarget) {
        if (!isRenamingAlbum) {
          closeRenameAlbumModal();
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
  }, [
    isSettingsOpen,
    isCreateAlbumOpen,
    renameAlbumTarget,
    isRenamingAlbum,
    deleteAlbumTarget,
    isDeletingAlbum,
    deleteFileTarget,
    isDeletingFile,
    isMoveItemsOpen,
    isMovingItems,
  ]);

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
        if (payload.type === "enter" || payload.type === "over") {
          const albumId = findAlbumDropIdAtPoint(payload.position);
          nativeDropAlbumIdRef.current = albumId;
          setSidebarDropAlbumId(albumId);
          setIsDraggingFiles(true);
          return;
        }

        dragDepthRef.current = 0;
        setIsDraggingFiles(false);

        if (payload.type === "leave") {
          nativeDropAlbumIdRef.current = null;
          setSidebarDropAlbumId(null);
          return;
        }

        if (payload.type !== "drop") {
          return;
        }

        const targetAlbumId = findAlbumDropIdAtPoint(payload.position) ?? nativeDropAlbumIdRef.current ?? undefined;
        nativeDropAlbumIdRef.current = null;
        setSidebarDropAlbumId(null);
        await handleNativeFileDrop(payload.paths, targetAlbumId);
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

        await loadEligibleGuilds();
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
    setGalleryDisplayMode(nextConfig.galleryDisplayMode);
    setMediaPreviewVolume(clampNumber(nextConfig.mediaPreviewVolume, 0, 1));
    setLocalMirrorEnabled(nextConfig.localMirrorEnabled);
    setLocalMirrorPath(nextConfig.localMirrorPath ?? "");
    setLanguage(nextConfig.language);
  }

  async function loadRemoteConfig(): Promise<void> {
    const nextConfig = await getAppConfig();
    applyRemoteConfig(nextConfig);
  }

  async function loadLocalStorageStatus(): Promise<LocalStorageStatus> {
    const nextStatus = await getLocalStorageStatus();
    setLocalStorageStatus(nextStatus);
    return nextStatus;
  }

  async function loadBotStatus(): Promise<void> {
    try {
      setBotStatus(await getDiscasaBotStatus());
    } catch {
      setBotStatus({
        processAvailable: false,
        ok: false,
        mockMode: false,
        botConfigured: false,
        botLoggedIn: false,
        botUserId: null,
        error: "Could not reach the Discasa backend.",
      });
    }
  }

  function scheduleConfigSave(delay = CONFIG_SAVE_DEBOUNCE_MS): void {
    if (configSaveTimerRef.current !== null) {
      window.clearTimeout(configSaveTimerRef.current);
    }

    configSaveTimerRef.current = window.setTimeout(() => {
      configSaveTimerRef.current = null;
      void flushConfigPatch();
    }, delay);
  }

  async function flushConfigPatch(): Promise<void> {
    if (isConfigSaveInFlightRef.current) {
      return;
    }

    const patch = pendingConfigPatchRef.current;
    if (!patch || !activeGuildIdRef.current) {
      return;
    }

    pendingConfigPatchRef.current = null;
    isConfigSaveInFlightRef.current = true;

    try {
      await updateAppConfig(patch);
      if ("localMirrorEnabled" in patch || "localMirrorPath" in patch) {
        await loadLocalStorageStatus();
        setItems(await getLibraryItems());
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save the settings.");
    } finally {
      isConfigSaveInFlightRef.current = false;

      if (pendingConfigPatchRef.current) {
        scheduleConfigSave();
      }
    }
  }

  function persistConfigPatch(patch: Partial<DiscasaConfig>): void {
    if (!activeGuildIdRef.current) {
      return;
    }

    pendingConfigPatchRef.current = {
      ...(pendingConfigPatchRef.current ?? {}),
      ...patch,
    };

    scheduleConfigSave();
  }

  function handleMediaPreviewVolumeChange(nextVolume: number): void {
    const normalizedVolume = clampNumber(nextVolume, 0, 1);
    setMediaPreviewVolume(normalizedVolume);
    persistConfigPatch({ mediaPreviewVolume: normalizedVolume });
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

      if (nextError.toLowerCase().includes("login")) {
        setSessionName(null);
        setSessionAvatarUrl(null);
        setAuthSetupStep("login");
      }

      return [];
    } finally {
      setIsLoadingGuilds(false);
    }
  }

  async function bootstrap(): Promise<AuthSetupStep | null> {
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

      if (session.activeGuild) {
        libraryCacheGuildIdRef.current = session.activeGuild.id;
        hasHydratedLibraryCacheRef.current = true;
        cacheLibraryState({
          guildId: session.activeGuild.id,
          guildName: session.activeGuild.name,
          sessionName: session.user?.username ?? null,
          sessionAvatarUrl: session.user?.avatarUrl ?? null,
          albums: nextAlbums,
          items: nextItems,
        });
      } else {
        libraryCacheGuildIdRef.current = "";
        hasHydratedLibraryCacheRef.current = false;
      }

      if (!session.authenticated || !session.activeGuild) {
        setAttachmentWarnings([]);
      }

      try {
        await loadRemoteConfig();
      } catch {
        // Keep local defaults when cloud settings are unavailable.
      }

      let nextLocalStorageStatus: LocalStorageStatus | null = null;
      try {
        nextLocalStorageStatus = await loadLocalStorageStatus();
      } catch {
        // Local storage status is informational; the app can still load without it.
      }

      let nextAuthSetupStep = getRequiredAuthSetupStep(session);
      if (!nextAuthSetupStep && requiresLocalMirrorSetup(nextLocalStorageStatus)) {
        nextAuthSetupStep = "local-storage";
      }
      let shouldClearAuthSetupError = true;

      if (session.authenticated) {
        const nextGuilds = await loadEligibleGuilds(session.activeGuild?.id ?? undefined);

        if (!nextGuilds.length) {
          const refreshedSession = await getSession();

          if (!refreshedSession.authenticated) {
            setSessionName(null);
            setSessionAvatarUrl(null);
            nextAuthSetupStep = "login";
            shouldClearAuthSetupError = false;
          }
        }
      } else {
        setGuilds([]);
      }

      if (shouldClearAuthSetupError) {
        setAuthSetupError("");
      }

      setIsCheckingSetup(false);
      setHasOpenedBotInvite(false);
      setAuthSetupStep(nextAuthSetupStep);
      return nextAuthSetupStep;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load Discasa preview.");
      return null;
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

  const deferredItems = useDeferredValue(items);
  const visibleItems = useMemo(() => getVisibleItems(deferredItems, selectedView), [deferredItems, selectedView]);
  const visibleItemIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const currentTitle = useMemo(() => getCurrentTitle(selectedView, albums), [albums, selectedView]);
  const currentDescription = useMemo(() => getCurrentDescription(selectedView), [selectedView]);
  const selectedGuildName = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuildId)?.name ?? null,
    [guilds, selectedGuildId],
  );
  const botWarning = useMemo(() => {
    if (!botStatus || botStatus.mockMode || botStatus.ok) {
      return "";
    }

    if (!botStatus.processAvailable) {
      return "Discasa bot is unavailable. Synchronization is paused.";
    }

    if (!botStatus.botConfigured) {
      return "Discasa bot token is not configured. Synchronization is paused.";
    }

    if (!botStatus.botLoggedIn) {
      return "Discasa bot is not logged in. Synchronization is paused.";
    }

    return "Discasa bot is unavailable. Synchronization is paused.";
  }, [botStatus]);

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

  function handleLibraryItemDragStart(event: DragEvent<HTMLElement>, itemId: string): void {
    const sourceItem = items.find((item) => item.id === itemId);

    if (!sourceItem || sourceItem.isTrashed) {
      event.preventDefault();
      return;
    }

    const selectedIdSet = new Set(selectedItemIds);
    const candidateIds = selectedIdSet.has(itemId) ? selectedItemIds : [itemId];
    const draggableItems = candidateIds
      .map((candidateId) => items.find((item) => item.id === candidateId) ?? null)
      .filter((item): item is LibraryItem => Boolean(item && !item.isTrashed));
    const draggableIds = draggableItems.map((item) => item.id);

    if (!draggableIds.length) {
      event.preventDefault();
      return;
    }

    if (!selectedIdSet.has(itemId)) {
      setSelectedItemIds([itemId]);
      selectionAnchorRef.current = itemId;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(DISCASA_LIBRARY_ITEM_DRAG_MIME, JSON.stringify(draggableIds));
    event.dataTransfer.setData("text/plain", `${DISCASA_LIBRARY_ITEM_DRAG_TEXT_PREFIX}${JSON.stringify(draggableIds)}`);
    draggingLibraryItemIdsRef.current = draggableIds;
    setDraggingLibraryItemIds(draggableIds);

    const dragPreview = createLibraryItemDragPreview(draggableItems);
    event.dataTransfer.setDragImage(dragPreview, 36, 36);
    window.setTimeout(() => dragPreview.remove(), 0);
  }

  function handleLibraryItemDragEnd(): void {
    draggingLibraryItemIdsRef.current = [];
    setDraggingLibraryItemIds([]);
    setSidebarDropAlbumId(null);
    nativeDropAlbumIdRef.current = null;
  }

  async function handleAddLibraryItemsToAlbum(albumId: string, itemIds: string[]): Promise<void> {
    const validItemIds = new Set(items.filter((item) => !item.isTrashed).map((item) => item.id));
    const uniqueItemIds = Array.from(new Set(itemIds)).filter((itemId) => validItemIds.has(itemId));

    if (!uniqueItemIds.length) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const result = await addLibraryItemsToAlbum(albumId, uniqueItemIds);
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const targetAlbumName = result.albums.find((album) => album.id === albumId)?.name ?? "the album";

      albumsRef.current = result.albums;
      setAlbums(result.albums);
      setItems((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));
      setMessage(`${uniqueItemIds.length} file(s) added to ${targetAlbumName}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not add the files to the album.");
    } finally {
      setIsBusy(false);
      draggingLibraryItemIdsRef.current = [];
      setDraggingLibraryItemIds([]);
      setSidebarDropAlbumId(null);
      nativeDropAlbumIdRef.current = null;
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

  function openRenameAlbumModal(albumId: string, currentName: string): void {
    setAlbumContextMenu(null);
    setRenameAlbumError("");
    setRenameAlbumTarget({ id: albumId, currentName });
    setRenameAlbumName(currentName);
  }

  function closeRenameAlbumModal(): void {
    if (isRenamingAlbum) return;
    setRenameAlbumTarget(null);
    setRenameAlbumError("");
    setRenameAlbumName("");
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

  function openMoveItemsModal(): void {
    if (isBusy || selectedItemIds.length === 0 || albums.length === 0) {
      return;
    }

    setAlbumContextMenu(null);
    setMoveItemsError("");
    setMoveItemsTargetAlbumId((current) => (current && albums.some((album) => album.id === current) ? current : albums[0]?.id ?? ""));
    setIsMoveItemsOpen(true);
  }

  function closeMoveItemsModal(): void {
    if (isMovingItems) return;
    setIsMoveItemsOpen(false);
    setMoveItemsError("");
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

  async function handleRenameAlbumSubmit(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    if (!renameAlbumTarget) {
      return;
    }

    const trimmed = renameAlbumName.trim();
    if (!trimmed) {
      setRenameAlbumError("Enter an album name.");
      return;
    }

    if (trimmed === renameAlbumTarget.currentName.trim()) {
      closeRenameAlbumModal();
      return;
    }

    setIsRenamingAlbum(true);
    setRenameAlbumError("");

    try {
      await renameAlbum(renameAlbumTarget.id, { name: trimmed });
      const nextAlbums = albumsRef.current.map((album) =>
        album.id === renameAlbumTarget.id ? { ...album, name: trimmed } : album,
      );
      albumsRef.current = nextAlbums;
      setAlbums(nextAlbums);
      setMessage(`Album renamed to: ${trimmed}`);
      setError("");
      setRenameAlbumTarget(null);
      setRenameAlbumName("");
    } catch (caughtError) {
      setRenameAlbumError(caughtError instanceof Error ? caughtError.message : "Could not rename the album.");
    } finally {
      setIsRenamingAlbum(false);
    }
  }

  async function handleMoveItemsSubmit(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    if (!moveItemsTargetAlbumId) {
      setMoveItemsError("Choose a folder.");
      return;
    }

    const selectedItemIdSet = new Set(selectedItemIds);
    const targets = items.filter((item) => selectedItemIdSet.has(item.id) && !item.isTrashed);

    if (!targets.length) {
      setMoveItemsError("Select at least one active file.");
      return;
    }

    setIsMovingItems(true);
    setIsBusy(true);
    setMoveItemsError("");
    setError("");

    try {
      const result = await moveLibraryItemsToAlbum(moveItemsTargetAlbumId, targets.map((item) => item.id));
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const targetAlbumName = result.albums.find((album) => album.id === moveItemsTargetAlbumId)?.name ?? "the selected folder";

      albumsRef.current = result.albums;
      setAlbums(result.albums);
      setItems((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));
      setSelectedView({ kind: "album", id: moveItemsTargetAlbumId });
      setMessage(`${targets.length} file(s) moved to ${targetAlbumName}.`);
      setSelectedItemIds([]);
      selectionAnchorRef.current = null;
      setIsMoveItemsOpen(false);
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not move the selected files.";
      setMoveItemsError(nextError);
      setError(nextError);
    } finally {
      setIsMovingItems(false);
      setIsBusy(false);
    }
  }

  async function handleRemoveItemsFromAlbum(albumId: string, itemIds: string[]): Promise<void> {
    const uniqueItemIds = Array.from(new Set(itemIds));
    if (!albumId || !uniqueItemIds.length || isBusy) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      const result = await removeLibraryItemsFromAlbum(albumId, uniqueItemIds);
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const targetAlbumName = result.albums.find((album) => album.id === albumId)?.name ?? "the folder";

      albumsRef.current = result.albums;
      setAlbums(result.albums);
      setItems((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));
      setSelectedItemIds([]);
      selectionAnchorRef.current = null;
      setMessage(`${uniqueItemIds.length} file(s) removed from ${targetAlbumName}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not remove the selected files from the folder.");
    } finally {
      setIsBusy(false);
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

  async function commitUploadedFiles(files: File[], albumId?: string): Promise<void> {
    const targetAlbumId = albumId ?? (selectedViewRef.current.kind === "album" ? selectedViewRef.current.id : undefined);
    await uploadFiles(files, targetAlbumId);

    const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);
    const targetAlbumName = targetAlbumId ? nextAlbums.find((album) => album.id === targetAlbumId)?.name : "";
    albumsRef.current = nextAlbums;
    setItems(nextItems);
    setAlbums(nextAlbums);
    void loadLocalStorageStatus();
    setMessage(`${files.length} file(s) added${targetAlbumName ? ` to ${targetAlbumName}` : " to the library"}.`);
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

  async function handleFiles(fileList: FileList | File[] | null, albumId?: string): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      await commitUploadedFiles(Array.from(fileList), albumId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleNativeFileDrop(filePaths: string[], albumId?: string): Promise<void> {
    if (filePaths.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      const files = await Promise.all(filePaths.map((filePath) => createFileFromNativePath(filePath)));
      await commitUploadedFiles(files, albumId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    } finally {
      setIsBusy(false);
    }
  }

  async function importExternalFilesInBackground(): Promise<void> {
    if (!activeGuildIdRef.current || isExternalImportInFlightRef.current) {
      return;
    }

    isExternalImportInFlightRef.current = true;

    try {
      const result = await importExternalLibraryFiles();
      const importedCount = result.imported.length;

      if (importedCount === 0) {
        return;
      }

      const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);

      albumsRef.current = nextAlbums;
      setItems(nextItems);
      setAlbums(nextAlbums);
      void loadLocalStorageStatus();
      setMessage(`${importedCount} external file(s) imported.`);
      setError("");
    } catch (caughtError) {
      console.warn("[Discasa import] Automatic external import failed.", caughtError);
    } finally {
      isExternalImportInFlightRef.current = false;
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

  async function handleDownloadSelectedItems(targets: LibraryItem[]): Promise<void> {
    const downloadableItems = targets.filter((item) => item.attachmentStatus !== "missing");

    if (isBusy) {
      return;
    }

    if (downloadableItems.length === 0) {
      setError("Selected files are unavailable for download.");
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      await downloadLibraryItems(downloadableItems);
      setMessage(`${downloadableItems.length} file(s) sent to downloads.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not download the selected files.");
    } finally {
      setIsBusy(false);
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
      void loadLocalStorageStatus();
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

  function handleChangeLocalMirrorEnabled(nextValue: boolean): void {
    setLocalMirrorEnabled(nextValue);
    void persistConfigPatch({ localMirrorEnabled: nextValue });
  }

  function handleChangeLocalMirrorPath(nextValue: string): void {
    setLocalMirrorPath(nextValue);
    void persistConfigPatch({ localMirrorPath: nextValue.trim().length > 0 ? nextValue : null });
  }

  async function handleChooseLocalMirrorFolder(): Promise<void> {
    setIsChoosingMirrorFolder(true);

    try {
      const selectedPath = await chooseLocalMirrorFolder();
      if (!selectedPath) {
        return;
      }

      setLocalMirrorPath(selectedPath);
      void persistConfigPatch({ localMirrorPath: selectedPath });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not choose the local mirror folder.");
    } finally {
      setIsChoosingMirrorFolder(false);
    }
  }

  async function commitLocalMirrorSetupPath(nextPath: string | null): Promise<void> {
    setIsApplyingGuild(true);
    setAuthSetupError("");

    try {
      const nextConfig = await updateAppConfig({
        localMirrorEnabled: true,
        localMirrorPath: nextPath,
      });
      applyRemoteConfig(nextConfig);

      const nextStatus = await loadLocalStorageStatus();
      setItems(await getLibraryItems());

      if (requiresLocalMirrorSetup(nextStatus)) {
        setAuthSetupError("The selected local mirror folder is still not available on this computer.");
        return;
      }

      setAuthSetupStep(null);
      setMessage("Local mirror folder configured.");
      setError("");
    } catch (caughtError) {
      setAuthSetupError(caughtError instanceof Error ? caughtError.message : "Could not configure the local mirror folder.");
    } finally {
      setIsApplyingGuild(false);
    }
  }

  async function handleChooseLocalMirrorFolderFromSetup(): Promise<void> {
    setIsChoosingMirrorFolder(true);

    try {
      const selectedPath = await chooseLocalMirrorFolder();
      if (!selectedPath) {
        return;
      }

      await commitLocalMirrorSetupPath(selectedPath);
    } catch (caughtError) {
      setAuthSetupError(caughtError instanceof Error ? caughtError.message : "Could not choose the local mirror folder.");
    } finally {
      setIsChoosingMirrorFolder(false);
    }
  }

  function handleThumbnailZoomIndexChange(nextIndex: number): void {
    const clampedIndex = clampNumber(nextIndex, 0, THUMBNAIL_ZOOM_LEVELS.length - 1);
    setThumbnailZoomIndex(clampedIndex);
    const nextPercent = THUMBNAIL_ZOOM_LEVELS[clampedIndex] ?? DEFAULT_THUMBNAIL_ZOOM_PERCENT;
    void persistConfigPatch({ thumbnailZoomPercent: nextPercent });
  }

  function handleToggleGalleryDisplayMode(): void {
    setGalleryDisplayMode((current) => {
      const nextMode = current === "free" ? "square" : "free";
      void persistConfigPatch({ galleryDisplayMode: nextMode });
      return nextMode;
    });
  }

  function handleCommitAccentColor(nextValue: string): void {
    const normalized = normalizeHexColor(nextValue) ?? DEFAULT_ACCENT_HEX;
    setAccentColor(normalized);
    void persistConfigPatch({ accentColor: normalized });
  }

  function handleChangeLanguage(nextLanguage: InterfaceLanguage): void {
    setLanguage(nextLanguage);
    void persistConfigPatch({ language: nextLanguage });
  }

  async function handleStartDragging(event: ReactMouseEvent<HTMLElement>): Promise<void> {
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
    if (!hasExternalFileTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleFileDragLeave(event: DragEvent<HTMLElement>): void {
    if (!hasExternalFileTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;

    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLElement>): void {
    if (!hasExternalFileTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!isDraggingFiles) {
      setIsDraggingFiles(true);
    }
  }

  async function handleFileDrop(event: DragEvent<HTMLElement>): Promise<void> {
    if (!hasExternalFileTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);

    if (isTauriRuntime()) {
      return;
    }

    await handleFiles(event.dataTransfer.files);
  }

  function canDropOnSidebarAlbum(event: DragEvent<HTMLElement>): boolean {
    return (
      draggingLibraryItemIdsRef.current.length > 0 ||
      draggingLibraryItemIds.length > 0 ||
      hasDataTransferType(event.dataTransfer, DISCASA_LIBRARY_ITEM_DRAG_MIME) ||
      hasExternalFileTransfer(event.dataTransfer)
    );
  }

  function handleSidebarAlbumDragEnter(event: DragEvent<HTMLElement>, albumId: string): void {
    if (!canDropOnSidebarAlbum(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    nativeDropAlbumIdRef.current = albumId;
    setSidebarDropAlbumId(albumId);
  }

  function handleSidebarAlbumDragOver(event: DragEvent<HTMLElement>, albumId: string): void {
    if (!canDropOnSidebarAlbum(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    nativeDropAlbumIdRef.current = albumId;

    if (sidebarDropAlbumId !== albumId) {
      setSidebarDropAlbumId(albumId);
    }
  }

  function handleSidebarAlbumDragLeave(event: DragEvent<HTMLElement>, albumId: string): void {
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    if (nativeDropAlbumIdRef.current === albumId) {
      nativeDropAlbumIdRef.current = null;
    }

    setSidebarDropAlbumId((current) => (current === albumId ? null : current));
  }

  async function handleSidebarAlbumDrop(event: DragEvent<HTMLElement>, albumId: string): Promise<void> {
    if (!canDropOnSidebarAlbum(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    nativeDropAlbumIdRef.current = null;
    setSidebarDropAlbumId(null);

    const draggedItemIds = readDraggedLibraryItemIds(event.dataTransfer);
    const itemIds = draggedItemIds.length ? draggedItemIds : draggingLibraryItemIdsRef.current.length ? draggingLibraryItemIdsRef.current : draggingLibraryItemIds;
    draggingLibraryItemIdsRef.current = [];

    if (itemIds.length > 0) {
      await handleAddLibraryItemsToAlbum(albumId, itemIds);
      return;
    }

    if (!isTauriRuntime() && event.dataTransfer.files.length > 0) {
      await handleFiles(event.dataTransfer.files, albumId);
    }
  }

  function handleAlbumContextMenu(event: ReactMouseEvent<HTMLElement>, albumId: string, albumName: string): void {
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
            dropTargetAlbumId={sidebarDropAlbumId}
            onAlbumDragEnter={handleSidebarAlbumDragEnter}
            onAlbumDragLeave={handleSidebarAlbumDragLeave}
            onAlbumDragOver={handleSidebarAlbumDragOver}
            onAlbumDrop={handleSidebarAlbumDrop}
          />

          <Gallery
            title={currentTitle}
            description={currentDescription}
            items={visibleItems}
            attachmentWarnings={attachmentWarnings}
            selectedItemIds={selectedItemIds}
            draggingItemIds={draggingLibraryItemIds}
            currentAlbumId={selectedView.kind === "album" ? selectedView.id : null}
            canMoveSelectedItems={albums.length > 0}
            isBusy={isBusy}
            isDraggingFiles={isDraggingFiles}
            galleryDisplayMode={galleryDisplayMode}
            thumbnailSize={thumbnailSize}
            thumbnailZoomIndex={thumbnailZoomIndex}
            thumbnailZoomLevelCount={THUMBNAIL_ZOOM_LEVELS.length}
            thumbnailZoomPercent={thumbnailZoomPercent}
            mediaPreviewVolume={mediaPreviewVolume}
            onThumbnailZoomIndexChange={handleThumbnailZoomIndexChange}
            onToggleGalleryDisplayMode={handleToggleGalleryDisplayMode}
            onMediaPreviewVolumeChange={handleMediaPreviewVolumeChange}
            onSelectItem={handleSelectItem}
            onClearSelection={handleClearSelectedItems}
            onApplySelectionRect={handleApplySelectionRect}
            onRequestUpload={requestUpload}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={handleFileDrop}
            onStartItemDrag={handleLibraryItemDragStart}
            onEndItemDrag={handleLibraryItemDragEnd}
            onBeginInternalItemDrag={(itemIds) => {
              draggingLibraryItemIdsRef.current = itemIds;
              setDraggingLibraryItemIds(itemIds);
              setIsDraggingFiles(false);
            }}
            onMoveInternalItemDrag={(albumId) => {
              nativeDropAlbumIdRef.current = albumId;
              setSidebarDropAlbumId(albumId);
            }}
            onCompleteInternalItemDrag={(albumId, itemIds) => {
              if (!albumId) {
                handleLibraryItemDragEnd();
                return;
              }

              void handleAddLibraryItemsToAlbum(albumId, itemIds);
            }}
            onCancelInternalItemDrag={handleLibraryItemDragEnd}
            onToggleFavorite={handleToggleFavorite}
            onOpenMoveItemsModal={openMoveItemsModal}
            onRemoveItemsFromAlbum={handleRemoveItemsFromAlbum}
            onMoveToTrash={handleMoveToTrash}
            onRestoreFromTrash={handleRestoreFromTrash}
            onDownloadSelected={handleDownloadSelectedItems}
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
          localStorageStatus={localStorageStatus}
          isChoosingMirrorFolder={isChoosingMirrorFolder}
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
          onChooseLocalMirrorFolder={() => {
            void handleChooseLocalMirrorFolderFromSetup();
          }}
          onUseDefaultLocalMirrorFolder={() => {
            void commitLocalMirrorSetupPath(null);
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

      {renameAlbumTarget ? (
        <RenameAlbumModal
          isRenamingAlbum={isRenamingAlbum}
          albumName={renameAlbumName}
          renameAlbumError={renameAlbumError}
          inputRef={renameAlbumInputRef}
          onClose={closeRenameAlbumModal}
          onSubmit={handleRenameAlbumSubmit}
          onChangeName={(value) => {
            setRenameAlbumName(value);
            if (renameAlbumError) {
              setRenameAlbumError("");
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

      {isMoveItemsOpen ? (
        <MoveItemsModal
          albums={albums}
          selectedCount={selectedItemIds.length}
          targetAlbumId={moveItemsTargetAlbumId}
          isMoving={isMovingItems}
          error={moveItemsError}
          onChangeTargetAlbumId={(albumId) => {
            setMoveItemsTargetAlbumId(albumId);
            if (moveItemsError) {
              setMoveItemsError("");
            }
          }}
          onClose={closeMoveItemsModal}
          onSubmit={handleMoveItemsSubmit}
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
          language={language}
          localMirrorEnabled={localMirrorEnabled}
          localMirrorPath={localMirrorPath}
          localStorageStatus={localStorageStatus}
          isChoosingMirrorFolder={isChoosingMirrorFolder}
          onClose={() => setIsSettingsOpen(false)}
          onSelectSection={setSettingsSection}
          onChangeMinimizeToTray={handleChangeMinimizeToTray}
          onChangeCloseToTray={handleChangeCloseToTray}
          onChangeLocalMirrorEnabled={handleChangeLocalMirrorEnabled}
          onChangeLocalMirrorPath={handleChangeLocalMirrorPath}
          onChangeLanguage={handleChangeLanguage}
          onChooseLocalMirrorFolder={() => {
            void handleChooseLocalMirrorFolder();
          }}
          onCommitAccentColor={handleCommitAccentColor}
        />
      ) : null}

      <AlbumContextMenu
        menu={albumContextMenu}
        canMoveUp={albumContextMenu ? canMoveAlbum(albumContextMenu.albumId, "up") : false}
        canMoveDown={albumContextMenu ? canMoveAlbum(albumContextMenu.albumId, "down") : false}
        onRename={() => {
          if (albumContextMenu) {
            openRenameAlbumModal(albumContextMenu.albumId, albumContextMenu.albumName);
          }
          return Promise.resolve();
        }}
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

      <StatusToast message={message} error={error} warning={botWarning} />
    </div>
  );
}


export function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h5.2c.41 0 .8.16 1.09.45l1.16 1.15c.17.17.39.27.63.27h2.92a1.75 1.75 0 0 1 1.75 1.75v6.38a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11.5h8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 14.5h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.55 10.55 19.22C5.4 14.54 2 11.46 2 7.7 2 4.76 4.3 2.5 7.2 2.5c1.64 0 3.22.76 4.25 1.96 1.03-1.2 2.61-1.96 4.25-1.96 2.9 0 5.2 2.26 5.2 5.2 0 3.76-3.4 6.84-8.55 11.52L12 20.55Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7.25h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 7.25V5.8c0-.72.58-1.3 1.3-1.3h3.4c.72 0 1.3.58 1.3 1.3v1.45" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 7.25v10.05c0 .66.54 1.2 1.2 1.2h6.4c.66 0 1.2-.54 1.2-1.2V7.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 10.25v4.5M14 10.25v4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="14.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7.8 14.75 2.28-2.6c.25-.29.7-.31.99-.05l1.58 1.42 1.49-1.78c.28-.33.8-.36 1.12-.07l2 1.82" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="10.5" height="11.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15.25 10.15 3.7-2.1v7.9l-3.7-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.75 5.5v9.65a2.85 2.85 0 1 1-1.8-2.65V7.15l5.3-1.4v7.4a2.85 2.85 0 1 1-1.8-2.65V5.95" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 7.25A1.75 1.75 0 0 1 6.5 5.5h4.1c.44 0 .85.18 1.16.48l1.06 1.03c.18.18.43.29.69.29h4a1.75 1.75 0 0 1 1.75 1.75v6.45a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-8.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeftDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13.5 6-6 6 6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10.5 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.75V6.25" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8.5 9.75 3.5-3.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 16.25v1a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5v-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.75v9.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8.5 11.75 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.75 18.25h12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CloudUploadIcon() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <path
        d="M18.5 39.5h29.2c7.3 0 13.3-5.4 13.3-12.5 0-6.9-5.5-12.2-12.4-12.5C46.1 7.1 39.4 2.5 31.3 2.5c-8.2 0-15.1 5.6-16.9 13.3C7.9 17.2 3 22.7 3 29.3c0 5.6 4.6 10.2 10.2 10.2h5.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 34.5V18" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
      <path d="m23.8 26.2 8.2-8.2 8.2 8.2" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.5 8.1v4.8M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function GalleryModeIcon({ mode }: { mode: "free" | "square" }) {
  if (mode === "square") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6.25" width="14.5" height="11.5" rx="2.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14.75 11.2 11l2.4 2.2 2.4-2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.1" cy="9.7" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderStackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 8A1.75 1.75 0 0 1 6.5 6.25h4c.39 0 .77.14 1.07.4l1.06.93c.19.16.42.25.67.25h4.2A1.5 1.5 0 0 1 19 9.33v6.42A1.75 1.75 0 0 1 17.25 17.5h-10.5A1.75 1.75 0 0 1 5 15.75V8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path d="M3.75 11.25h9.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M11.25 9v4.5M9 11.25h4.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

export function CloseSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7 17 17M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.5 8.1v4.8M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 15 19 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.1 10.5h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function RotateLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 9A7 7 0 1 1 5 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RotateRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 5v4h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 9A7 7 0 1 0 19 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CropIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v10.25A2.25 2.25 0 0 0 9.25 17H19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 19.5V9.25A2.25 2.25 0 0 0 14.75 7H4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7H4v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12A7.5 7.5 0 1 1 12 19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.75h9.75L19.25 8v11.25H6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 4.75v5.5h6v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 19.25v-4.5h6v4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function RestoreOriginalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 10H4V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 10A8 8 0 1 0 12 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type AlbumContextMenuProps = {
  menu: AlbumContextMenuState;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
};

export function AlbumContextMenu({
  menu,
  canMoveUp,
  canMoveDown,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
  onPointerDown,
}: AlbumContextMenuProps) {
  if (!menu) return null;

  return (
    <div
      className="context-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={onPointerDown}
    >
      <button type="button" className="context-menu-item" onClick={() => void onRename()}>
        Rename
      </button>
      <div className="context-menu-separator" />
      <button type="button" className="context-menu-item" onClick={() => void onMoveUp()} disabled={!canMoveUp}>
        Move up
      </button>
      <button type="button" className="context-menu-item" onClick={() => void onMoveDown()} disabled={!canMoveDown}>
        Move down
      </button>
      <div className="context-menu-separator" />
      <button type="button" className="context-menu-item danger" onClick={() => void onDelete()}>
        Delete album
      </button>
    </div>
  );
}

type BaseModalProps = {
  rootClassName: string;
  backdropClassName: string;
  panelClassName: string;
  ariaLabel: string;
  children: ReactNode;
  showCloseButton?: boolean;
  closeButtonClassName?: string;
  closeButtonAriaLabel?: string;
  onClose?: () => void;
};

export function BaseModal({
  rootClassName,
  backdropClassName,
  panelClassName,
  ariaLabel,
  children,
  showCloseButton = false,
  closeButtonClassName = "",
  closeButtonAriaLabel = "Close modal",
  onClose,
}: BaseModalProps) {
  function handlePanelPointerDown(event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function handleCloseButtonPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  const resolvedCloseButtonClassName = [
    "icon-circle-button",
    "modal-close-button",
    closeButtonClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={backdropClassName} aria-hidden="true" />

      <div className={panelClassName} onPointerDown={handlePanelPointerDown}>
        {children}

        {showCloseButton && onClose ? (
          <button
            type="button"
            className={resolvedCloseButtonClassName}
            onPointerDown={handleCloseButtonPointerDown}
            onClick={onClose}
            aria-label={closeButtonAriaLabel}
          >
            <span className="modal-close-glyph">&times;</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AlbumModalProps = {
  isCreatingAlbum: boolean;
  newAlbumName: string;
  createAlbumError: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChangeName: (value: string) => void;
};

export function AlbumModal({
  isCreatingAlbum,
  newAlbumName,
  createAlbumError,
  inputRef,
  onClose,
  onSubmit,
  onChangeName,
}: AlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal"
      ariaLabel="Create new album"
      showCloseButton
      closeButtonClassName="album-modal-close"
      closeButtonAriaLabel="Close album creation"
      onClose={onClose}
    >
      <form className="album-modal-content" onSubmit={(event) => void onSubmit(event)}>
        <div className="album-modal-header">
          <h2>New album</h2>
          <p>Choose a name for the new folder in the Albums section.</p>
        </div>

        <div className="album-modal-field">
          <label className="album-modal-label" htmlFor="new-album-name">
            Album name
          </label>
          <input
            ref={inputRef}
            id="new-album-name"
            className="form-text-input album-modal-input"
            type="text"
            value={newAlbumName}
            onChange={(event) => onChangeName(event.currentTarget.value)}
            placeholder="Enter the album name"
            autoComplete="off"
            spellCheck={false}
            disabled={isCreatingAlbum}
          />
          {createAlbumError ? <span className="album-modal-error">{createAlbumError}</span> : null}
        </div>

        <div className="album-modal-actions">
          <button type="submit" className="pill-button accent-button album-modal-confirm" disabled={isCreatingAlbum}>
            {isCreatingAlbum ? "Creating..." : "OK"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

type RenameAlbumModalProps = {
  isRenamingAlbum: boolean;
  albumName: string;
  renameAlbumError: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onChangeName: (value: string) => void;
};

export function RenameAlbumModal({
  isRenamingAlbum,
  albumName,
  renameAlbumError,
  inputRef,
  onClose,
  onSubmit,
  onChangeName,
}: RenameAlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal"
      ariaLabel="Rename album"
      showCloseButton
      closeButtonClassName="album-modal-close"
      closeButtonAriaLabel="Close album rename"
      onClose={onClose}
    >
      <form className="album-modal-content" onSubmit={(event) => void onSubmit(event)}>
        <div className="album-modal-header">
          <h2>Rename album</h2>
          <p>Choose a new name for this album in the Albums section.</p>
        </div>

        <div className="album-modal-field">
          <label className="album-modal-label" htmlFor="rename-album-name">
            Album name
          </label>
          <input
            ref={inputRef}
            id="rename-album-name"
            className="form-text-input album-modal-input"
            type="text"
            value={albumName}
            onChange={(event) => onChangeName(event.currentTarget.value)}
            placeholder="Enter the album name"
            autoComplete="off"
            spellCheck={false}
            disabled={isRenamingAlbum}
          />
          {renameAlbumError ? <span className="album-modal-error">{renameAlbumError}</span> : null}
        </div>

        <div className="album-modal-actions">
          <button type="submit" className="pill-button accent-button album-modal-confirm" disabled={isRenamingAlbum}>
            {isRenamingAlbum ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

type MoveItemsModalProps = {
  albums: AlbumRecord[];
  selectedCount: number;
  targetAlbumId: string;
  isMoving: boolean;
  error: string;
  onChangeTargetAlbumId: (albumId: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function MoveItemsModal({
  albums,
  selectedCount,
  targetAlbumId,
  isMoving,
  error,
  onChangeTargetAlbumId,
  onClose,
  onSubmit,
}: MoveItemsModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal move-items-modal"
      ariaLabel="Move selected files"
      showCloseButton
      closeButtonClassName="album-modal-close"
      closeButtonAriaLabel="Close file move"
      onClose={onClose}
    >
      <form className="move-items-modal-content" onSubmit={(event) => void onSubmit(event)}>
        <div className="album-modal-header">
          <h2>Move files</h2>
          <p>Choose which folder should receive the selected files.</p>
        </div>

        <div className="move-items-summary">
          <span>{selectedCount} selected</span>
        </div>

        <div className="move-items-folder-list scrollable-y subtle-scrollbar content-scrollbar-host" role="radiogroup" aria-label="Destination folder">
          {albums.map((album) => (
            <label key={album.id} className={`move-items-folder ${targetAlbumId === album.id ? "selected" : ""}`}>
              <input
                type="radio"
                name="move-items-target"
                value={album.id}
                checked={targetAlbumId === album.id}
                onChange={() => onChangeTargetAlbumId(album.id)}
                disabled={isMoving}
              />
              <span className="move-items-folder-icon" aria-hidden="true">
                <FolderIcon />
              </span>
              <span className="move-items-folder-copy">
                <span className="move-items-folder-name">{album.name}</span>
                <small>{album.itemCount} file{album.itemCount === 1 ? "" : "s"}</small>
              </span>
            </label>
          ))}
        </div>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button type="button" className="pill-button secondary-button delete-album-modal-cancel" onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button type="submit" className="pill-button accent-button delete-album-modal-confirm" disabled={isMoving || !targetAlbumId}>
            {isMoving ? "Moving..." : "Move"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

export type AuthSetupStep = "login" | "waiting" | "select-server" | "invite-bot" | "apply-server" | "local-storage";

type AuthSetupModalProps = {
  step: AuthSetupStep;
  guilds: GuildSummary[];
  selectedGuildId: string;
  selectedGuildName: string | null;
  error: string;
  localStorageStatus: LocalStorageStatus | null;
  isChoosingMirrorFolder: boolean;
  isLoadingGuilds: boolean;
  isApplyingGuild: boolean;
  isCheckingSetup: boolean;
  hasOpenedBotInvite: boolean;
  onStartLogin: () => void;
  onSelectGuild: (guildId: string) => void;
  onConfirmGuild: () => void;
  onBackToLogin: () => void;
  onBackToServerSelection: () => void;
  onRetryGuilds: () => void;
  onOpenBotInvite: () => void;
  onContinueToApply: () => void;
  onApplyGuild: () => void;
  onChooseLocalMirrorFolder: () => void;
  onUseDefaultLocalMirrorFolder: () => void;
};

function WaitingSpinner() {
  return <span className="auth-setup-spinner" aria-hidden="true" />;
}

export function AuthSetupModal({
  step,
  guilds,
  selectedGuildId,
  selectedGuildName,
  error,
  localStorageStatus,
  isChoosingMirrorFolder,
  isLoadingGuilds,
  isApplyingGuild,
  isCheckingSetup,
  hasOpenedBotInvite,
  onStartLogin,
  onSelectGuild,
  onConfirmGuild,
  onBackToLogin,
  onBackToServerSelection,
  onRetryGuilds,
  onOpenBotInvite,
  onContinueToApply,
  onApplyGuild,
  onChooseLocalMirrorFolder,
  onUseDefaultLocalMirrorFolder,
}: AuthSetupModalProps) {
  const [applyProgressStepIndex, setApplyProgressStepIndex] = useState(0);

  useEffect(() => {
    if (!isApplyingGuild) {
      setApplyProgressStepIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setApplyProgressStepIndex((current) => (current + 1) % AUTH_APPLY_PROGRESS_STEPS.length);
    }, AUTH_APPLY_PROGRESS_STEP_MS);

    return () => window.clearInterval(timer);
  }, [isApplyingGuild]);

  function renderLoginStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Discord login required</span>
          <h2>Connect Discasa in your browser</h2>
          <p>
            Discasa will open your default browser so you can log in to Discord outside the app. After the login succeeds,
            Discasa will keep the flow here and guide you through the server setup.
          </p>
        </div>

        <div className="auth-setup-actions">
          <button type="button" className="pill-button accent-button primary-button" onClick={onStartLogin}>
            Login with Discord
          </button>
        </div>
      </>
    );
  }

  function renderWaitingStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Waiting for Discord</span>
          <h2>Finish the login in your browser</h2>
          <p>
            Your default browser was opened for the Discord login. Complete the authentication there. Discasa will detect the
            successful login automatically and continue to the server selection screen.
          </p>
        </div>

        <div className="auth-setup-waiting-card">
          <WaitingSpinner />
          <div className="auth-setup-waiting-copy">
            <strong>Waiting for confirmation...</strong>
            <span>Keep Discasa open while the Discord browser page completes.</span>
          </div>
        </div>

        <div className="auth-setup-actions">
          <button type="button" className="pill-button secondary-button" onClick={onBackToLogin}>
            Back
          </button>
        </div>
      </>
    );
  }

  function renderServerSelectStep() {
    const hasGuilds = guilds.length > 0;

    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Choose a server</span>
          <h2>Select where Discasa should be applied</h2>
          <p>
            Pick one of the Discord servers where you own the server or have permission to manage it. Discasa will check if
            the bot and the Discasa structure are already present before deciding the next step automatically.
          </p>
        </div>

        <div className="auth-setup-field-stack">
          <label className="auth-setup-label" htmlFor="auth-setup-server-select">
            Available servers
          </label>
          <select
            id="auth-setup-server-select"
            className="auth-setup-select"
            value={selectedGuildId}
            disabled={isLoadingGuilds || isCheckingSetup || !hasGuilds}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectGuild(event.currentTarget.value)}
          >
            {!hasGuilds ? <option value="">No eligible servers found</option> : null}
            {hasGuilds ? <option value="">Select a server</option> : null}
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
          <span className={`auth-setup-help ${error ? "error" : ""}`}>
            {error || "Select the server that should host the Discasa channels."}
          </span>
        </div>

        <div className="auth-setup-actions spaced">
          <button
            type="button"
            className="pill-button secondary-button"
            onClick={onRetryGuilds}
            disabled={isCheckingSetup}
          >
            Refresh list
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onConfirmGuild}
            disabled={!selectedGuildId || isCheckingSetup}
          >
            {isCheckingSetup ? "Checking..." : "OK"}
          </button>
        </div>
      </>
    );
  }

  function renderInviteBotStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Invite the bot</span>
          <h2>Add the Discasa bot to {selectedGuildName ?? "the selected server"}</h2>
          <p>
            Before applying Discasa, invite the bot to the selected server in your browser. After finishing the Discord
            authorization, return here and let Discasa confirm that the bot is really present before continuing.
          </p>
        </div>

        <span className={`auth-setup-help ${error ? "error" : ""}`}>
          {error || "Use the invite button below, complete the Discord authorization, then continue."}
        </span>

        <div className="auth-setup-actions spaced">
          <button type="button" className="pill-button secondary-button" onClick={onBackToServerSelection}>
            Back
          </button>
          <button type="button" className="pill-button secondary-button" onClick={onOpenBotInvite}>
            {hasOpenedBotInvite ? "Open invite again" : "Invite bot"}
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onContinueToApply}
            disabled={!selectedGuildId || !hasOpenedBotInvite || isCheckingSetup}
          >
            {isCheckingSetup ? "Checking..." : "Continue"}
          </button>
        </div>
      </>
    );
  }

  function renderApplyingGuildStep() {
    const currentProgressStep = AUTH_APPLY_PROGRESS_STEPS[applyProgressStepIndex] ?? AUTH_APPLY_PROGRESS_STEPS[0];

    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Synchronizing library</span>
          <h2>Syncing files in {selectedGuildName ?? "the selected server"}</h2>
          <p>
            Discasa is resolving the Discord drive, refreshing stored file links and organizing the library before opening
            the main interface.
          </p>
        </div>

        <div className="auth-setup-sync-stage" role="status" aria-live="polite">
          <div className="auth-setup-sync-animation" aria-hidden="true">
            <span className="auth-setup-sync-orbit outer" />
            <span className="auth-setup-sync-orbit inner" />
            <span className="auth-setup-sync-core" />
          </div>
          <div className="auth-setup-sync-copy">
            <strong>{currentProgressStep.title}</strong>
            <span>{currentProgressStep.detail}</span>
          </div>
        </div>

        <div className="auth-setup-sync-track" aria-hidden="true">
          {AUTH_APPLY_PROGRESS_STEPS.map((progressStep, index) => (
            <span
              key={progressStep.title}
              className={`auth-setup-sync-track-step ${index <= applyProgressStepIndex ? "active" : ""}`}
            />
          ))}
        </div>

        <ul className="auth-setup-sync-list">
          {AUTH_APPLY_PROGRESS_STEPS.map((progressStep, index) => (
            <li
              key={progressStep.title}
              className={index === applyProgressStepIndex ? "active" : ""}
              aria-current={index === applyProgressStepIndex ? "step" : undefined}
            >
              <span className="auth-setup-sync-list-marker" aria-hidden="true" />
              <span>{progressStep.title}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  function renderApplyStep() {
    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Apply Discasa</span>
          <h2>Ready to configure {selectedGuildName ?? "the selected server"}</h2>
          <p>
            Discasa stores your library inside Discord. When you apply it, the app creates a dedicated category and the
            channels below so your files, metadata and trash stay organized in that server.
          </p>
        </div>

        <div className="auth-setup-channel-list">
          {DISCASA_CHANNELS.map((channelName) => (
            <div key={channelName} className="auth-setup-channel-item">
              <span className="auth-setup-channel-hash">#</span>
              <span>{channelName}</span>
            </div>
          ))}
        </div>

        <span className={`auth-setup-help ${error ? "error" : ""}`}>
          {error || "Click Apply Discasa to create or reuse the required channels in the selected server."}
        </span>

        <div className="auth-setup-actions spaced">
          <button type="button" className="pill-button secondary-button" onClick={onBackToServerSelection}>
            Back
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onApplyGuild}
            disabled={!selectedGuildId || isApplyingGuild}
          >
            {isApplyingGuild ? "Applying..." : "Apply Discasa"}
          </button>
        </div>
      </>
    );
  }

  function renderLocalStorageStep() {
    const missingPath = localStorageStatus?.configuredMirrorPath ?? localStorageStatus?.resolvedMirrorPath ?? "";
    const defaultPath = localStorageStatus?.defaultMirrorPath ?? "Discasa default cache folder";

    return (
      <>
        <div className="auth-setup-header">
          <span className="auth-setup-eyebrow">Local mirror</span>
          <h2>Choose a folder for this computer</h2>
          <p>
            Your Discord settings have local mirroring enabled, but the saved folder was not found on this PC.
            Choose a new folder or continue with Discasa's default cache folder.
          </p>
        </div>

        <div className="auth-setup-storage-card">
          <span className="auth-setup-storage-label">Saved folder from Discord</span>
          <strong>{missingPath || "No custom folder saved"}</strong>
          <span className="auth-setup-storage-label">Default folder</span>
          <strong>{defaultPath}</strong>
        </div>

        <span className={`auth-setup-help ${error ? "error" : ""}`}>
          {error || "This step is skipped automatically when local mirroring is disabled."}
        </span>

        <div className="auth-setup-actions spaced">
          <button
            type="button"
            className="pill-button secondary-button"
            onClick={onUseDefaultLocalMirrorFolder}
            disabled={isApplyingGuild || isChoosingMirrorFolder}
          >
            {isApplyingGuild && !isChoosingMirrorFolder ? "Saving..." : "Use default"}
          </button>
          <button
            type="button"
            className="pill-button accent-button primary-button"
            onClick={onChooseLocalMirrorFolder}
            disabled={isApplyingGuild || isChoosingMirrorFolder}
          >
            {isChoosingMirrorFolder ? "Choosing..." : "Choose folder"}
          </button>
        </div>
      </>
    );
  }

  return (
    <BaseModal
      rootClassName="auth-setup-modal-root"
      backdropClassName="auth-setup-modal-backdrop"
      panelClassName="auth-setup-modal"
      ariaLabel="Discasa setup"
    >
      <div className="auth-setup-shell">
        {isApplyingGuild && step !== "local-storage" ? renderApplyingGuildStep() : null}
        {!isApplyingGuild && step === "login" ? renderLoginStep() : null}
        {!isApplyingGuild && step === "waiting" ? renderWaitingStep() : null}
        {!isApplyingGuild && step === "select-server" ? renderServerSelectStep() : null}
        {!isApplyingGuild && step === "invite-bot" ? renderInviteBotStep() : null}
        {!isApplyingGuild && step === "apply-server" ? renderApplyStep() : null}
        {step === "local-storage" ? renderLocalStorageStep() : null}
      </div>
    </BaseModal>
  );
}


type BulkActionBarProps = {
  selectedCount: number;
  isBusy: boolean;
  isTrashSelection: boolean;
  isAllSelectedFavorite: boolean;
  canMove: boolean;
  canRemoveFromAlbum: boolean;
  onToggleFavorite: () => void;
  onDownload: () => void;
  onMove: () => void;
  onRemoveFromAlbum: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onClearSelection: () => void;
};

export function BulkActionBar({
  selectedCount,
  isBusy,
  isTrashSelection,
  isAllSelectedFavorite,
  canMove,
  canRemoveFromAlbum,
  onToggleFavorite,
  onDownload,
  onMove,
  onRemoveFromAlbum,
  onMoveToTrash,
  onRestore,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="bulk-action-bar" aria-label={`${selectedCount} item(s) selected`}>
      <span className="bulk-selection-count">{selectedCount} selected</span>

      <button
        type="button"
        className="bulk-action-button"
        onClick={onDownload}
        disabled={isBusy}
        title="Download selected files"
      >
        <span className="bulk-action-icon" aria-hidden="true">
          <DownloadIcon />
        </span>
        <span className="bulk-action-label">Download</span>
      </button>

      {isTrashSelection ? (
        <>
          <button
            type="button"
            className="bulk-action-button"
            onClick={onRestore}
            disabled={isBusy}
            title="Restore selected"
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <RestoreIcon />
            </span>
            <span className="bulk-action-label">Restore</span>
          </button>

          <button
            type="button"
            className="bulk-action-button disabled"
            disabled
            title="Bulk permanent delete will be enabled in the next step."
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <span className="bulk-action-label">Delete</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`bulk-action-button ${isAllSelectedFavorite ? "active" : ""}`}
            onClick={onToggleFavorite}
            disabled={isBusy}
            title={isAllSelectedFavorite ? "Remove selected items from favorites" : "Add selected items to favorites"}
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <HeartIcon />
            </span>
            <span className="bulk-action-label">{isAllSelectedFavorite ? "Unfavorite" : "Favorite"}</span>
          </button>

          <button
            type="button"
            className="bulk-action-button"
            onClick={onMove}
            disabled={isBusy || !canMove}
            title={canMove ? "Move selected items to a folder" : "Create a folder before moving files"}
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <FolderStackIcon />
            </span>
            <span className="bulk-action-label">Move</span>
          </button>

          {canRemoveFromAlbum ? (
            <button
              type="button"
              className="bulk-action-button"
              onClick={onRemoveFromAlbum}
              disabled={isBusy}
              title="Remove selected items from this folder"
            >
              <span className="bulk-action-icon" aria-hidden="true">
                <CloseSmallIcon />
              </span>
              <span className="bulk-action-label">Remove</span>
            </button>
          ) : null}

          <button
            type="button"
            className="bulk-action-button danger"
            onClick={onMoveToTrash}
            disabled={isBusy}
            title="Move selected items to the trash"
          >
            <span className="bulk-action-icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <span className="bulk-action-label">Trash</span>
          </button>
        </>
      )}

      <button
        type="button"
        className="bulk-action-clear"
        onClick={onClearSelection}
        disabled={isBusy}
        aria-label="Clear selection"
        title="Clear selection"
      >
        <CloseSmallIcon />
      </button>
    </div>
  );
}

type DeleteAlbumModalProps = {
  albumName: string;
  isDeleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteAlbumModal({
  albumName,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteAlbumModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal delete-album-modal"
      ariaLabel="Delete album confirmation"
    >
      <div className="delete-album-modal-content">
        <div className="album-modal-header delete-album-modal-header">
          <h2>Delete album</h2>
          <p>Delete the album "{albumName}"?</p>
        </div>

        <p className="delete-album-modal-copy">
          This removes the album from the sidebar, but the files stay in your library.
        </p>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button
            type="button"
            className="pill-button secondary-button delete-album-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pill-button danger-button delete-album-modal-confirm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

type DeleteFileModalProps = {
  fileName: string;
  isDeleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteFileModal({
  fileName,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteFileModalProps) {
  return (
    <BaseModal
      rootClassName="album-modal-root"
      backdropClassName="album-modal-backdrop"
      panelClassName="album-modal delete-album-modal"
      ariaLabel="Delete file confirmation"
    >
      <div className="delete-album-modal-content">
        <div className="album-modal-header delete-album-modal-header">
          <h2>Delete file</h2>
          <p>Delete "{fileName}" permanently?</p>
        </div>

        <p className="delete-album-modal-copy">
          This permanently removes the file from your library. This action cannot be undone.
        </p>

        {error ? <span className="album-modal-error">{error}</span> : null}

        <div className="delete-album-modal-actions">
          <button
            type="button"
            className="pill-button secondary-button delete-album-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pill-button danger-button delete-album-modal-confirm"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

type ProfileAvatarProps = {
  avatarUrl: string | null;
  className: string;
};

export function ProfileAvatar({ avatarUrl, className }: ProfileAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [avatarUrl]);

  const showDiscordAvatar = Boolean(avatarUrl) && !hasImageError;

  return (
    <div className={`${className} avatar-base ${showDiscordAvatar ? "has-discord-avatar" : ""}`} aria-hidden="true">
      {showDiscordAvatar ? (
        <img src={avatarUrl ?? undefined} alt="" className="avatar-image" onError={() => setHasImageError(true)} />
      ) : (
        <div className="avatar-fallback">
          <span className="avatar-fallback-background" />
          <img src={defaultAvatarUrl} alt="" className="avatar-fallback-image" />
        </div>
      )}
    </div>
  );
}

type GalleryProps = {
  title: string;
  description: string;
  items: LibraryItem[];
  attachmentWarnings: DiscasaAttachmentRecoveryWarning[];
  selectedItemIds: string[];
  draggingItemIds: string[];
  currentAlbumId: string | null;
  canMoveSelectedItems: boolean;
  isBusy: boolean;
  isDraggingFiles: boolean;
  galleryDisplayMode: GalleryDisplayMode;
  thumbnailSize: number;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  mediaPreviewVolume: number;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
  onToggleGalleryDisplayMode: () => void;
  onMediaPreviewVolumeChange: (nextVolume: number) => void;
  onSelectItem: (itemId: string, options: { range: boolean; toggle: boolean }) => void;
  onClearSelection: () => void;
  onApplySelectionRect: (itemIds: string[], mode: "replace" | "add") => void;
  onRequestUpload: () => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  onStartItemDrag: (event: DragEvent<HTMLElement>, itemId: string) => void;
  onEndItemDrag: () => void;
  onBeginInternalItemDrag: (itemIds: string[]) => void;
  onMoveInternalItemDrag: (albumId: string | null) => void;
  onCompleteInternalItemDrag: (albumId: string | null, itemIds: string[]) => void;
  onCancelInternalItemDrag: () => void;
  onToggleFavorite: (itemId: string) => Promise<void>;
  onOpenMoveItemsModal: () => void;
  onRemoveItemsFromAlbum: (albumId: string, itemIds: string[]) => Promise<void>;
  onMoveToTrash: (itemId: string) => Promise<void>;
  onRestoreFromTrash: (itemId: string) => Promise<void>;
  onDownloadSelected: (items: LibraryItem[]) => Promise<void>;
  onSaveMediaEdit: (itemId: string, input: SaveLibraryItemMediaEditInput) => Promise<LibraryItem>;
  onRestoreMediaEdit: (itemId: string) => Promise<LibraryItem>;
  onDeleteItem: (itemId: string) => Promise<void>;
};

type LibraryToolbarProps = {
  galleryDisplayMode: GalleryDisplayMode;
  thumbnailZoomIndex: number;
  thumbnailZoomLevelCount: number;
  thumbnailZoomPercent: number;
  thumbnailZoomProgress: number;
  bulkActions?: ReactNode;
  onThumbnailZoomIndexChange: (nextIndex: number) => void;
  onToggleGalleryDisplayMode: () => void;
  onRequestUpload: () => void;
};

type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionSession = {
  startClientX: number;
  startClientY: number;
  additive: boolean;
  initialSelectedIds: string[];
  itemRects: Array<{ id: string; rect: DOMRect }>;
  hasExceededThreshold: boolean;
};

type InternalItemDragSession = {
  itemId: string;
  itemIds: string[];
  items: LibraryItem[];
  startClientX: number;
  startClientY: number;
  hasStarted: boolean;
  hoveredAlbumId: string | null;
};

type InternalItemDragPreviewState = {
  items: LibraryItem[];
  clientX: number;
  clientY: number;
};

type GalleryGridProps = {
  items: LibraryItem[];
  isBusy: boolean;
  displayMode: GalleryDisplayMode;
  thumbnailSize: number;
  selectedItemIds: string[];
  draggingItemIds: string[];
  onSelectItem: (itemId: string, options: { range: boolean; toggle: boolean }) => void;
  onOpenItem: (itemId: string) => void;
  onClearSelection: () => void;
  onApplySelectionRect: (itemIds: string[], mode: "replace" | "add") => void;
  renderItemActions: (item: LibraryItem) => ReactNode;
  onStartItemDrag: (event: DragEvent<HTMLElement>, itemId: string) => void;
  onEndItemDrag: () => void;
  onBeginInternalItemDrag: (itemIds: string[]) => void;
  onMoveInternalItemDrag: (albumId: string | null) => void;
  onCompleteInternalItemDrag: (albumId: string | null, itemIds: string[]) => void;
  onCancelInternalItemDrag: () => void;
  onRequestUpload: () => void;
};

type GalleryItemProps = {
  item: LibraryItem;
  isSelected: boolean;
  isDragging: boolean;
  displayMode: GalleryDisplayMode;
  actions: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLElement>, itemId: string) => void;
  onDoubleClick: (itemId: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, item: LibraryItem) => void;
  onDragStart: (event: DragEvent<HTMLElement>, itemId: string) => void;
  onDragEnd: () => void;
  onRegisterElement: (itemId: string, element: HTMLElement | null) => void;
};

const SELECTION_DRAG_THRESHOLD = 4;
const bytesFormatter = new Intl.NumberFormat("en-US");
const MIN_FREE_PREVIEW_ASPECT_RATIO = 0.82;
const MAX_FREE_PREVIEW_ASPECT_RATIO = 1.28;

const previewMediaStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  background: "rgba(3, 10, 22, 0.88)",
};

const previewShadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(5, 10, 18, 0.02) 0%, rgba(5, 10, 18, 0.01) 45%, rgba(5, 10, 18, 0.22) 100%)",
};

const previewFallbackStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  padding: "18px",
  textAlign: "center",
  background: "radial-gradient(circle at top, rgba(233, 136, 29, 0.14) 0%, rgba(8, 14, 24, 0.78) 44%, rgba(4, 8, 15, 0.96) 100%)",
};

const previewExtensionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "70px",
  minHeight: "70px",
  padding: "12px",
  borderRadius: "18px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(255, 255, 255, 0.06)",
  color: "rgba(255, 255, 255, 0.94)",
  fontSize: "18px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
};

const previewCaptionStyle: CSSProperties = {
  display: "block",
  maxWidth: "100%",
  color: "rgba(255, 255, 255, 0.58)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const editedBadgeStyle: CSSProperties = {
  position: "absolute",
  left: "10px",
  top: "10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "22px",
  padding: "0 8px",
  borderRadius: "999px",
  background: "rgba(var(--accent-rgb), 0.22)",
  color: "rgba(255, 255, 255, 0.96)",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  pointerEvents: "none",
};

function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const parts = trimmed.split(".");

  if (parts.length < 2) {
    return "FILE";
  }

  const extension = parts.pop()?.trim().toUpperCase();
  if (!extension) {
    return "FILE";
  }

  return extension.slice(0, 5);
}

function getFallbackLabel(item: LibraryItem): string {
  if (item.mimeType.startsWith("audio/")) {
    return "AUDIO";
  }

  if (item.mimeType === "application/pdf") {
    return "PDF";
  }

  if (item.mimeType.includes("zip") || item.mimeType.includes("compressed")) {
    return "ARCHIVE";
  }

  if (item.mimeType.startsWith("text/")) {
    return "TEXT";
  }

  return item.mimeType.split("/")[0]?.toUpperCase() || "FILE";
}

function createLibraryItemDragPreview(items: LibraryItem[]): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "drag-stack-preview";

  const visibleItems = items.slice(0, 4);

  visibleItems.forEach((item, index) => {
    const tile = document.createElement("div");
    tile.className = "drag-stack-preview-tile";
    tile.style.setProperty("--stack-index", String(index));
    const previewUrl = getLibraryItemThumbnailUrl(item);

    if (isImage(item) && item.attachmentStatus !== "missing" && !previewUrl.startsWith("mock://")) {
      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = "";
      tile.appendChild(image);
    } else {
      const extension = document.createElement("span");
      extension.textContent = getFileExtension(item.name);
      tile.appendChild(extension);
    }

    preview.appendChild(tile);
  });

  if (items.length > 1) {
    const count = document.createElement("span");
    count.className = "drag-stack-preview-count";
    count.textContent = String(items.length);
    preview.appendChild(count);
  }

  document.body.appendChild(preview);
  return preview;
}

function DragStackPreview({ items, clientX, clientY }: InternalItemDragPreviewState) {
  return (
    <div
      className="drag-stack-preview"
      aria-hidden="true"
      style={{
        left: `${clientX - 36}px`,
        top: `${clientY - 36}px`,
      }}
    >
      {items.slice(0, 4).map((item, index) => {
        const previewUrl = getLibraryItemThumbnailUrl(item);

        return (
          <div
            key={item.id}
            className="drag-stack-preview-tile"
            style={{ "--stack-index": String(index) } as CSSProperties}
          >
            {isImage(item) && item.attachmentStatus !== "missing" && !previewUrl.startsWith("mock://") ? (
              <img src={previewUrl} alt="" />
            ) : (
              <span>{getFileExtension(item.name)}</span>
            )}
          </div>
        );
      })}

      {items.length > 1 ? <span className="drag-stack-preview-count">{items.length}</span> : null}
    </div>
  );
}

function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function resolveFallbackAspectRatio(item: LibraryItem): number {
  if (isVideo(item)) {
    return 16 / 9;
  }

  if (isImage(item)) {
    return 4 / 3;
  }

  return 1;
}

function clampFreePreviewAspectRatio(value: number): number {
  return Math.min(MAX_FREE_PREVIEW_ASPECT_RATIO, Math.max(MIN_FREE_PREVIEW_ASPECT_RATIO, value));
}

function rectanglesIntersect(left: DOMRect, right: DOMRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

function createViewportSelectionRect(startClientX: number, startClientY: number, currentClientX: number, currentClientY: number): DOMRect {
  const left = Math.min(startClientX, currentClientX);
  const top = Math.min(startClientY, currentClientY);
  const width = Math.abs(currentClientX - startClientX);
  const height = Math.abs(currentClientY - startClientY);

  return new DOMRect(left, top, width, height);
}

function stopActionEvent(event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>): void {
  event.stopPropagation();
}

function LibraryToolbar({
  galleryDisplayMode,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  thumbnailZoomProgress,
  bulkActions,
  onThumbnailZoomIndexChange,
  onToggleGalleryDisplayMode,
  onRequestUpload,
}: LibraryToolbarProps) {
  function handleThumbnailZoomChange(event: ChangeEvent<HTMLInputElement>): void {
    onThumbnailZoomIndexChange(Number(event.currentTarget.value));
  }

  const nextModeLabel = galleryDisplayMode === "free" ? "Enable square crop mode" : "Enable free aspect mode";

  return (
    <div className="library-tools">
      <div className={`library-view-controls ${bulkActions ? "has-bulk-actions" : ""}`}>
        <label
          className="thumbnail-zoom-control compact"
          title={`Thumbnail zoom: ${thumbnailZoomPercent}%`}
          style={{ "--thumbnail-zoom-progress": `${thumbnailZoomProgress}%` } as CSSProperties}
        >
          <span className="thumbnail-zoom-icon" aria-hidden="true">
            <ZoomIcon />
          </span>
          <input
            className="thumbnail-zoom-slider"
            type="range"
            min={0}
            max={thumbnailZoomLevelCount - 1}
            step={1}
            value={thumbnailZoomIndex}
            onChange={handleThumbnailZoomChange}
            aria-label={`Thumbnail zoom ${thumbnailZoomPercent}%`}
          />
        </label>

        <button
          type="button"
          className="icon-circle-button gallery-mode-button"
          onClick={onToggleGalleryDisplayMode}
          aria-label={nextModeLabel}
          title={nextModeLabel}
        >
          <GalleryModeIcon mode={galleryDisplayMode} />
        </button>

        {bulkActions}
      </div>

      <button type="button" className="icon-circle-button upload-button" onClick={onRequestUpload} aria-label="Upload" title="Upload">
        <UploadIcon />
      </button>
    </div>
  );
}

function FileThumbnail({ item, displayMode, actions }: { item: LibraryItem; displayMode: GalleryDisplayMode; actions: ReactNode }) {
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<string>("");

  const previewUrl = getLibraryItemThumbnailUrl(item);
  const extension = useMemo(() => getFileExtension(item.name), [item.name]);
  const fallbackLabel = useMemo(() => getFallbackLabel(item), [item]);
  const canRenderImage = isImage(item) && !hasPreviewError;
  const canRenderVideo = isVideo(item) && !hasPreviewError;
  const persistedMediaPresentation = useMemo(() => getPersistedMediaPresentation(item), [item]);
  const hasSavedEdit = Boolean(item.savedMediaEdit);

  useEffect(() => {
    if (!canRenderImage || displayMode !== "free") {
      return;
    }

    let isDisposed = false;
    const image = new Image();

    image.onload = () => {
      if (isDisposed || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return;
      }

      setMediaAspectRatio(image.naturalWidth / image.naturalHeight);
    };

    image.onerror = () => {
      if (!isDisposed) {
        setMediaAspectRatio(null);
      }
    };

    image.src = previewUrl;

    return () => {
      isDisposed = true;
    };
  }, [canRenderImage, displayMode, previewUrl]);

  const previewAspectRatio =
    displayMode === "square"
      ? 1
      : clampFreePreviewAspectRatio(mediaAspectRatio ?? resolveFallbackAspectRatio(item));

  return (
    <div className="file-card" title={item.name}>
      <div className="file-preview" style={{ aspectRatio: `${previewAspectRatio}` }}>
        {canRenderImage ? (
          <>
            <img
              src={previewUrl}
              alt={item.name}
              loading="lazy"
              draggable={false}
              style={{
                ...previewMediaStyle,
                objectFit: displayMode === "square" || persistedMediaPresentation.hasCrop ? "cover" : "contain",
                transform: `rotate(${persistedMediaPresentation.rotationDegrees}deg)`,
              }}
              onError={() => setHasPreviewError(true)}
            />
            <div aria-hidden="true" style={previewShadeStyle} />
          </>
        ) : null}

        {canRenderVideo ? (
          <>
            <video
              src={previewUrl}
              preload="metadata"
              muted
              playsInline
              disablePictureInPicture
              controls={false}
              style={{
                ...previewMediaStyle,
                objectFit: displayMode === "square" ? "cover" : "contain",
              }}
              onLoadedMetadata={(event) => {
                const target = event.currentTarget;
                if (displayMode === "free" && target.videoWidth > 0 && target.videoHeight > 0) {
                  setMediaAspectRatio(target.videoWidth / target.videoHeight);
                }
                setVideoDuration(formatVideoDuration(target.duration));
              }}
              onError={() => setHasPreviewError(true)}
            />
            <div aria-hidden="true" style={previewShadeStyle} />
            <span className="file-video-duration" aria-label={`Video duration ${videoDuration || "0:00"}`}>
              {videoDuration || "0:00"}
            </span>
          </>
        ) : null}

        {!canRenderImage && !canRenderVideo ? (
          <div aria-hidden="true" style={previewFallbackStyle}>
            <span style={previewExtensionStyle}>{extension}</span>
            <span style={previewCaptionStyle}>{fallbackLabel}</span>
          </div>
        ) : null}

        {hasSavedEdit ? <span style={editedBadgeStyle}>Edited</span> : null}
        <div className="file-preview-actions">{actions}</div>
      </div>
    </div>
  );
}

function GalleryItem({
  item,
  isSelected,
  isDragging,
  displayMode,
  actions,
  onClick,
  onDoubleClick,
  onPointerDown,
  onDragStart,
  onDragEnd,
  onRegisterElement,
}: GalleryItemProps) {
  return (
    <article
      ref={(element) => onRegisterElement(item.id, element)}
      className={`file-tile mode-${displayMode} ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
      title={item.name}
      draggable={false}
      onPointerDown={(event) => onPointerDown(event, item)}
      onClick={(event) => onClick(event, item.id)}
      onDoubleClick={() => onDoubleClick(item.id)}
      onDragStart={(event) => onDragStart(event, item.id)}
      onDragEnd={onDragEnd}
    >
      <FileThumbnail item={item} displayMode={displayMode} actions={actions} />
      <div className="file-meta compact">
        <span className="file-name">{item.name}</span>
        <small className="file-size">{bytesFormatter.format(item.size)} bytes</small>
      </div>
    </article>
  );
}

function GalleryGrid({
  items,
  isBusy,
  displayMode,
  thumbnailSize,
  selectedItemIds,
  draggingItemIds,
  onSelectItem,
  onOpenItem,
  onClearSelection,
  onApplySelectionRect,
  renderItemActions,
  onStartItemDrag,
  onEndItemDrag,
  onBeginInternalItemDrag,
  onMoveInternalItemDrag,
  onCompleteInternalItemDrag,
  onCancelInternalItemDrag,
  onRequestUpload,
}: GalleryGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const itemElementMapRef = useRef(new Map<string, HTMLElement>());
  const selectionSessionRef = useRef<SelectionSession | null>(null);
  const internalDragSessionRef = useRef<InternalItemDragSession | null>(null);
  const suppressNextItemClickRef = useRef(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [internalDragPreview, setInternalDragPreview] = useState<InternalItemDragPreviewState | null>(null);

  const selectedItemIdSet = new Set(selectedItemIds);
  const draggingItemIdSet = new Set(draggingItemIds);

  function setItemElement(itemId: string, element: HTMLElement | null): void {
    if (element) {
      itemElementMapRef.current.set(itemId, element);
      return;
    }

    itemElementMapRef.current.delete(itemId);
  }

  function handleItemClick(event: ReactMouseEvent<HTMLElement>, itemId: string): void {
    if (suppressNextItemClickRef.current) {
      suppressNextItemClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onSelectItem(itemId, {
      range: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  }

  function handleItemDoubleClick(itemId: string): void {
    if (isBusy) {
      return;
    }

    onOpenItem(itemId);
  }

  function getInternalDragPayload(item: LibraryItem): { itemIds: string[]; items: LibraryItem[] } {
    const selectedIdSet = new Set(selectedItemIds);
    const candidateIds = selectedIdSet.has(item.id) ? selectedItemIds : [item.id];
    const visibleItemsById = new Map(items.map((entry) => [entry.id, entry]));
    const draggedItems = candidateIds
      .map((candidateId) => visibleItemsById.get(candidateId) ?? null)
      .filter((entry): entry is LibraryItem => Boolean(entry && !entry.isTrashed));

    return {
      itemIds: draggedItems.map((entry) => entry.id),
      items: draggedItems,
    };
  }

  function finishInternalItemDrag(albumId: string | null): void {
    const session = internalDragSessionRef.current;

    if (!session) {
      setInternalDragPreview(null);
      onCancelInternalItemDrag();
      return;
    }

    internalDragSessionRef.current = null;
    setInternalDragPreview(null);
    onMoveInternalItemDrag(null);

    if (session.hasStarted) {
      suppressNextItemClickRef.current = true;
      window.setTimeout(() => {
        suppressNextItemClickRef.current = false;
      }, 0);
    }

    if (session.hasStarted && albumId) {
      onCompleteInternalItemDrag(albumId, session.itemIds);
      return;
    }

    onCancelInternalItemDrag();
  }

  function handleItemPointerDown(event: ReactPointerEvent<HTMLElement>, item: LibraryItem): void {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (
      event.button !== 0 ||
      isBusy ||
      item.isTrashed ||
      target?.closest("button, a, input, textarea, select, [data-drag-disabled='true']")
    ) {
      return;
    }

    const payload = getInternalDragPayload(item);
    if (!payload.itemIds.length) {
      return;
    }

    const sourceElement = event.currentTarget;
    const pointerId = event.pointerId;

    try {
      sourceElement.setPointerCapture(pointerId);
    } catch {}

    internalDragSessionRef.current = {
      itemId: item.id,
      itemIds: payload.itemIds,
      items: payload.items,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasStarted: false,
      hoveredAlbumId: null,
    };

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const session = internalDragSessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = Math.abs(moveEvent.clientX - session.startClientX);
      const deltaY = Math.abs(moveEvent.clientY - session.startClientY);
      const hasExceededThreshold = deltaX >= SELECTION_DRAG_THRESHOLD || deltaY >= SELECTION_DRAG_THRESHOLD;

      if (!session.hasStarted && !hasExceededThreshold) {
        return;
      }

      if (!session.hasStarted) {
        session.hasStarted = true;
        moveEvent.preventDefault();
        suppressNextItemClickRef.current = true;

        if (!selectedItemIdSet.has(session.itemId)) {
          onSelectItem(session.itemId, { range: false, toggle: false });
        }

        onBeginInternalItemDrag(session.itemIds);
      }

      setInternalDragPreview({
        items: session.items,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      });

      const albumId = findAlbumDropIdAtPoint({ x: moveEvent.clientX, y: moveEvent.clientY });
      if (session.hoveredAlbumId !== albumId) {
        session.hoveredAlbumId = albumId;
        onMoveInternalItemDrag(albumId);
      }
    };

    const cleanupWindowListeners = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);

      try {
        if (sourceElement.hasPointerCapture(pointerId)) {
          sourceElement.releasePointerCapture(pointerId);
        }
      } catch {
        return;
      }
    };

    const handleWindowPointerUp = (upEvent: PointerEvent) => {
      const albumId = findAlbumDropIdAtPoint({ x: upEvent.clientX, y: upEvent.clientY }) ?? internalDragSessionRef.current?.hoveredAlbumId ?? null;
      cleanupWindowListeners();
      finishInternalItemDrag(albumId);
    };

    const handleWindowPointerCancel = () => {
      cleanupWindowListeners();
      finishInternalItemDrag(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
  }

  function updateSelectionBox(currentClientX: number, currentClientY: number): void {
    const gridElement = gridRef.current;
    const session = selectionSessionRef.current;

    if (!gridElement || !session) {
      return;
    }

    const viewportRect = createViewportSelectionRect(
      session.startClientX,
      session.startClientY,
      currentClientX,
      currentClientY,
    );
    const gridViewportRect = gridElement.getBoundingClientRect();
    const hitItemIds = session.itemRects
      .filter(({ rect }) => rectanglesIntersect(viewportRect, rect))
      .map(({ id }) => id);
    const nextSelectedIds = session.additive
      ? Array.from(new Set([...session.initialSelectedIds, ...hitItemIds]))
      : hitItemIds;

    setSelectionBox({
      left: viewportRect.left - gridViewportRect.left + gridElement.scrollLeft,
      top: viewportRect.top - gridViewportRect.top + gridElement.scrollTop,
      width: viewportRect.width,
      height: viewportRect.height,
    });
    onApplySelectionRect(nextSelectedIds, "replace");
  }

  function handleGridPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (
      event.button !== 0 ||
      target?.closest(".file-tile") ||
      target?.closest(".empty-state") ||
      items.length === 0
    ) {
      return;
    }

    event.preventDefault();

    selectionSessionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      initialSelectedIds: selectedItemIds,
      itemRects: items
        .map((item) => {
          const element = itemElementMapRef.current.get(item.id);
          if (!element) {
            return null;
          }

          return {
            id: item.id,
            rect: element.getBoundingClientRect(),
          };
        })
        .filter((entry): entry is { id: string; rect: DOMRect } => Boolean(entry)),
      hasExceededThreshold: false,
    };

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      const session = selectionSessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = Math.abs(moveEvent.clientX - session.startClientX);
      const deltaY = Math.abs(moveEvent.clientY - session.startClientY);
      const hasExceededThreshold = deltaX >= SELECTION_DRAG_THRESHOLD || deltaY >= SELECTION_DRAG_THRESHOLD;

      if (!hasExceededThreshold) {
        return;
      }

      session.hasExceededThreshold = true;
      updateSelectionBox(moveEvent.clientX, moveEvent.clientY);
    };

    const handleWindowPointerUp = (upEvent: PointerEvent) => {
      const session = selectionSessionRef.current;

      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);

      if (!session) {
        setSelectionBox(null);
        return;
      }

      if (session.hasExceededThreshold) {
        updateSelectionBox(upEvent.clientX, upEvent.clientY);
      } else if (!session.additive) {
        onClearSelection();
      }

      selectionSessionRef.current = null;
      setSelectionBox(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  }

  return (
    <div
      ref={gridRef}
      className={`files-grid display-${displayMode} scrollable-y subtle-scrollbar content-scrollbar-host ${selectionBox ? "selecting" : ""}`}
      style={{ "--file-card-width": `${thumbnailSize}px` } as CSSProperties}
      onPointerDown={handleGridPointerDown}
    >
      {items.map((item) => (
        <GalleryItem
          key={item.id}
          item={item}
          isSelected={selectedItemIdSet.has(item.id)}
          isDragging={draggingItemIdSet.has(item.id)}
          displayMode={displayMode}
          actions={renderItemActions(item)}
          onClick={handleItemClick}
          onDoubleClick={handleItemDoubleClick}
          onPointerDown={handleItemPointerDown}
          onDragStart={onStartItemDrag}
          onDragEnd={onEndItemDrag}
          onRegisterElement={setItemElement}
        />
      ))}

      {selectionBox ? (
        <div
          className="selection-box"
          aria-hidden="true"
          style={{
            left: `${selectionBox.left}px`,
            top: `${selectionBox.top}px`,
            width: `${selectionBox.width}px`,
            height: `${selectionBox.height}px`,
          }}
        />
      ) : null}

      {items.length === 0 && !isBusy ? (
        <button type="button" className="empty-state" onClick={onRequestUpload}>
          <span className="drop-illustration">
            <CloudUploadIcon />
          </span>
          <span className="empty-state-title">No files yet.</span>
          <span className="empty-state-copy">Drag files from Explorer into this area or click the upload button to add files.</span>
        </button>
      ) : null}

      {internalDragPreview ? <DragStackPreview {...internalDragPreview} /> : null}
    </div>
  );
}


export function Gallery({
  title,
  description,
  items,
  attachmentWarnings,
  selectedItemIds,
  draggingItemIds,
  currentAlbumId,
  canMoveSelectedItems,
  isBusy,
  isDraggingFiles,
  galleryDisplayMode,
  thumbnailSize,
  thumbnailZoomIndex,
  thumbnailZoomLevelCount,
  thumbnailZoomPercent,
  mediaPreviewVolume,
  onThumbnailZoomIndexChange,
  onToggleGalleryDisplayMode,
  onMediaPreviewVolumeChange,
  onSelectItem,
  onClearSelection,
  onApplySelectionRect,
  onRequestUpload,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onStartItemDrag,
  onEndItemDrag,
  onBeginInternalItemDrag,
  onMoveInternalItemDrag,
  onCompleteInternalItemDrag,
  onCancelInternalItemDrag,
  onToggleFavorite,
  onOpenMoveItemsModal,
  onRemoveItemsFromAlbum,
  onMoveToTrash,
  onRestoreFromTrash,
  onDownloadSelected,
  onSaveMediaEdit,
  onRestoreMediaEdit,
  onDeleteItem,
}: GalleryProps) {
  const [viewerState, setViewerState] = useState<ViewerState>(null);
  const [viewerWheelBehavior, setViewerWheelBehavior] = useState<MouseWheelBehavior>(() => readStoredMouseWheelBehavior());
  const [viewerDraftState, setViewerDraftState] = useState<ViewerDraftState>(() => createViewerDraftStateFromItem(null));
  const [isSavingViewerEdit, setIsSavingViewerEdit] = useState(false);
  const [viewerSaveError, setViewerSaveError] = useState("");
  const [viewerSaveNotice, setViewerSaveNotice] = useState("");

  const displayItems = items;

  const thumbnailZoomProgress = useMemo(() => {
    if (thumbnailZoomLevelCount <= 1) {
      return 0;
    }

    return (thumbnailZoomIndex / (thumbnailZoomLevelCount - 1)) * 100;
  }, [thumbnailZoomIndex, thumbnailZoomLevelCount]);

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedItems = useMemo(
    () => displayItems.filter((item) => selectedItemIdSet.has(item.id)),
    [displayItems, selectedItemIdSet],
  );

  const isTrashSelection = selectedItems.length > 0 && selectedItems.every((item) => item.isTrashed);
  const allSelectedAreFavorite = selectedItems.length > 0 && selectedItems.every((item) => item.isFavorite);

  const activeViewerIndex = useMemo(() => {
    if (!viewerState) {
      return -1;
    }

    return displayItems.findIndex((item) => item.id === viewerState.itemId);
  }, [displayItems, viewerState]);

  const activeViewerItem = activeViewerIndex >= 0 ? displayItems[activeViewerIndex] ?? null : null;
  const activeViewerSavedEditKey = activeViewerItem?.savedMediaEdit
    ? `${activeViewerItem.savedMediaEdit.rotationDegrees}:${activeViewerItem.savedMediaEdit.hasCrop}:${activeViewerItem.savedMediaEdit.savedAt}`
    : "none";
  const viewerHasPendingSave = hasPendingViewerSave(activeViewerItem, viewerDraftState);

  useEffect(() => {
    const handleViewerWheelBehaviorChange = (event: Event) => {
      const customEvent = event as CustomEvent<MouseWheelBehavior>;
      if (customEvent.detail === "navigate" || customEvent.detail === "zoom") {
        setViewerWheelBehavior(customEvent.detail);
      } else {
        setViewerWheelBehavior(readStoredMouseWheelBehavior());
      }
    };

    window.addEventListener(VIEWER_WHEEL_BEHAVIOR_EVENT, handleViewerWheelBehaviorChange as EventListener);
    return () => window.removeEventListener(VIEWER_WHEEL_BEHAVIOR_EVENT, handleViewerWheelBehaviorChange as EventListener);
  }, []);

  useEffect(() => {
    if (!viewerSaveNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setViewerSaveNotice("");
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [viewerSaveNotice]);

  useEffect(() => {
    if (!viewerSaveError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setViewerSaveError("");
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [viewerSaveError]);

  useEffect(() => {
    if (!viewerState) {
      setViewerDraftState(createViewerDraftStateFromItem(null));
      setViewerSaveError("");
      setViewerSaveNotice("");
      return;
    }

    if (!activeViewerItem) {
      setViewerState(null);
      return;
    }

    setViewerDraftState(createViewerDraftStateFromItem(activeViewerItem));
    setViewerSaveError("");
    setViewerSaveNotice("");
  }, [viewerState, activeViewerItem?.id, activeViewerSavedEditKey]);

  useEffect(() => {
    if (!viewerState) {
      return;
    }

    if (displayItems.length === 0) {
      setViewerState(null);
      return;
    }

    const nextIndex = displayItems.findIndex((item) => item.id === viewerState.itemId);
    if (nextIndex === -1) {
      setViewerState(null);
      return;
    }

    if (viewerState.index !== nextIndex || viewerState.total !== displayItems.length) {
      setViewerState({
        itemId: displayItems[nextIndex]?.id ?? viewerState.itemId,
        index: nextIndex,
        total: displayItems.length,
      });
    }
  }, [displayItems, viewerState]);

  async function handleBulkFavoriteToggle(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const nextFavoriteState = !allSelectedAreFavorite;
    const targets = selectedItems.filter((item) => item.isFavorite !== nextFavoriteState);

    for (const item of targets) {
      await onToggleFavorite(item.id);
    }
  }

  async function handleBulkMoveToTrash(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const targets = selectedItems.filter((item) => !item.isTrashed);

    for (const item of targets) {
      await onMoveToTrash(item.id);
    }
  }

  async function handleBulkRestore(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    const targets = selectedItems.filter((item) => item.isTrashed);

    for (const item of targets) {
      await onRestoreFromTrash(item.id);
    }
  }

  async function handleBulkDownload(): Promise<void> {
    if (isBusy || selectedItems.length === 0) {
      return;
    }

    await onDownloadSelected(selectedItems);
  }

  async function handleBulkRemoveFromAlbum(): Promise<void> {
    if (isBusy || selectedItems.length === 0 || !currentAlbumId) {
      return;
    }

    const targets = selectedItems.filter((item) => !item.isTrashed && item.albumIds.includes(currentAlbumId));
    await onRemoveItemsFromAlbum(currentAlbumId, targets.map((item) => item.id));
  }

  function handleOpenViewer(itemId: string): void {
    const index = displayItems.findIndex((item) => item.id === itemId);

    if (index === -1) {
      return;
    }

    setViewerState({
      itemId,
      index,
      total: displayItems.length,
    });
  }

  function handleCloseViewer(): void {
    setViewerState(null);
  }

  function handleNavigateViewer(direction: "previous" | "next"): void {
    if (!viewerState) {
      return;
    }

    const currentIndex = displayItems.findIndex((item) => item.id === viewerState.itemId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= displayItems.length) {
      return;
    }

    setViewerState({
      itemId: displayItems[nextIndex]?.id ?? viewerState.itemId,
      index: nextIndex,
      total: displayItems.length,
    });
  }

  async function handleSaveViewerEdit(): Promise<void> {
    if (!activeViewerItem || !activeViewerItem.mimeType.startsWith("image/") || isSavingViewerEdit || !viewerHasPendingSave) {
      return;
    }

    setIsSavingViewerEdit(true);
    setViewerSaveError("");
    setViewerSaveNotice("");

    try {
      const nextItem = await onSaveMediaEdit(activeViewerItem.id, toMediaEditSaveInput(viewerDraftState));
      setViewerDraftState(createViewerDraftStateFromItem(nextItem));
      setViewerSaveNotice(nextItem.savedMediaEdit ? "Edits saved for this image." : "Image restored to the original view.");
    } catch (caughtError) {
      setViewerSaveError(caughtError instanceof Error ? caughtError.message : "Could not save the image edits.");
    } finally {
      setIsSavingViewerEdit(false);
    }
  }

  async function handleRestoreViewerOriginal(): Promise<void> {
    if (!activeViewerItem || !activeViewerItem.mimeType.startsWith("image/") || isSavingViewerEdit || !activeViewerItem.savedMediaEdit) {
      return;
    }

    setIsSavingViewerEdit(true);
    setViewerSaveError("");
    setViewerSaveNotice("");

    try {
      const nextItem = await onRestoreMediaEdit(activeViewerItem.id);
      setViewerDraftState(createViewerDraftStateFromItem(nextItem));
      setViewerSaveNotice("Original restored for this image.");
    } catch (caughtError) {
      setViewerSaveError(caughtError instanceof Error ? caughtError.message : "Could not restore the original image.");
    } finally {
      setIsSavingViewerEdit(false);
    }
  }

  function renderThumbnailActions(item: LibraryItem) {
    if (item.isTrashed) {
      return (
        <>
          <button
            type="button"
            className="file-icon-button"
            onPointerDown={stopActionEvent}
            onClick={(event) => {
              stopActionEvent(event);
              void onRestoreFromTrash(item.id);
            }}
            aria-label="Restore"
            title="Restore"
          >
            <RestoreIcon />
          </button>
          <button
            type="button"
            className="file-icon-button danger"
            onPointerDown={stopActionEvent}
            onClick={(event) => {
              stopActionEvent(event);
              void onDeleteItem(item.id);
            }}
            aria-label="Delete permanently"
            title="Delete permanently"
          >
            <TrashIcon />
          </button>
        </>
      );
    }

    return (
      <>
        <button
          type="button"
          className={`file-icon-button ${item.isFavorite ? "active" : ""}`}
          onPointerDown={stopActionEvent}
          onClick={(event) => {
            stopActionEvent(event);
            void onToggleFavorite(item.id);
          }}
          aria-label={item.isFavorite ? "Unfavorite" : "Favorite"}
          title={item.isFavorite ? "Unfavorite" : "Favorite"}
        >
          <HeartIcon />
        </button>
        <button
          type="button"
          className="file-icon-button danger"
          onPointerDown={stopActionEvent}
          onClick={(event) => {
            stopActionEvent(event);
            void onMoveToTrash(item.id);
          }}
          aria-label="Move to trash"
          title="Move to trash"
        >
          <TrashIcon />
        </button>
      </>
    );
  }

  const bulkActions =
    selectedItems.length > 0 ? (
      <BulkActionBar
        selectedCount={selectedItems.length}
        isBusy={isBusy}
        isTrashSelection={isTrashSelection}
        isAllSelectedFavorite={allSelectedAreFavorite}
        canMove={canMoveSelectedItems}
        canRemoveFromAlbum={Boolean(currentAlbumId)}
        onToggleFavorite={() => {
          void handleBulkFavoriteToggle();
        }}
        onDownload={() => {
          void handleBulkDownload();
        }}
        onMove={onOpenMoveItemsModal}
        onRemoveFromAlbum={() => {
          void handleBulkRemoveFromAlbum();
        }}
        onMoveToTrash={() => {
          void handleBulkMoveToTrash();
        }}
        onRestore={() => {
          void handleBulkRestore();
        }}
        onClearSelection={onClearSelection}
      />
    ) : null;

  const unresolvedWarningMessage =
    attachmentWarnings.length > 0
      ? `${attachmentWarnings.length} file link${attachmentWarnings.length === 1 ? "" : "s"} could not be restored from Discord and may appear unavailable.`
      : "";

  return (
    <main
      className={`library-panel panel-surface ${isDraggingFiles ? "dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(event) => {
        void onDrop(event);
      }}
    >
      <div className="library-header">
        <div className="library-heading">
          <h1>{title}</h1>
          <p>{description}</p>
          {unresolvedWarningMessage ? <span className="auth-setup-help error">{unresolvedWarningMessage}</span> : null}
        </div>

        <LibraryToolbar
          galleryDisplayMode={galleryDisplayMode}
          thumbnailZoomIndex={thumbnailZoomIndex}
          thumbnailZoomLevelCount={thumbnailZoomLevelCount}
          thumbnailZoomPercent={thumbnailZoomPercent}
          thumbnailZoomProgress={thumbnailZoomProgress}
          bulkActions={bulkActions}
          onThumbnailZoomIndexChange={onThumbnailZoomIndexChange}
          onToggleGalleryDisplayMode={onToggleGalleryDisplayMode}
          onRequestUpload={onRequestUpload}
        />
      </div>

      <GalleryGrid
        items={displayItems}
        isBusy={isBusy}
        displayMode={galleryDisplayMode}
        thumbnailSize={thumbnailSize}
        selectedItemIds={selectedItemIds}
        draggingItemIds={draggingItemIds}
        onSelectItem={onSelectItem}
        onOpenItem={handleOpenViewer}
        onClearSelection={onClearSelection}
        onApplySelectionRect={onApplySelectionRect}
        onStartItemDrag={onStartItemDrag}
        onEndItemDrag={onEndItemDrag}
        onBeginInternalItemDrag={onBeginInternalItemDrag}
        onMoveInternalItemDrag={onMoveInternalItemDrag}
        onCompleteInternalItemDrag={onCompleteInternalItemDrag}
        onCancelInternalItemDrag={onCancelInternalItemDrag}
        onRequestUpload={onRequestUpload}
        renderItemActions={renderThumbnailActions}
      />

      {isDraggingFiles ? (
        <div className="drop-overlay">
          <span className="drop-illustration">
            <CloudUploadIcon />
          </span>
          <span className="drop-overlay-title">Drop files here</span>
          <span className="drop-overlay-copy">They will be added to the current view.</span>
        </div>
      ) : null}

      <MediaViewerModal
        item={activeViewerItem}
        currentIndex={activeViewerIndex}
        totalItems={displayItems.length}
        wheelBehavior={viewerWheelBehavior}
        mediaVolume={mediaPreviewVolume}
        draftState={viewerDraftState}
        hasPendingSave={viewerHasPendingSave}
        isSaving={isSavingViewerEdit}
        saveError={viewerSaveError}
        saveNotice={viewerSaveNotice}
        onDraftStateChange={setViewerDraftState}
        onSave={() => {
          void handleSaveViewerEdit();
        }}
        onRestoreOriginal={() => {
          void handleRestoreViewerOriginal();
        }}
        onClose={handleCloseViewer}
        onPrevious={() => {
          handleNavigateViewer("previous");
        }}
        onNext={() => {
          handleNavigateViewer("next");
        }}
        onMediaVolumeChange={onMediaPreviewVolumeChange}
      />
    </main>
  );
}

type MediaViewerModalProps = {
  item: LibraryItem | null;
  currentIndex: number;
  totalItems: number;
  wheelBehavior: MouseWheelBehavior;
  mediaVolume: number;
  draftState: ViewerDraftState;
  hasPendingSave: boolean;
  isSaving: boolean;
  saveError: string;
  saveNotice: string;
  onDraftStateChange: (nextState: ViewerDraftState) => void;
  onSave: () => void;
  onRestoreOriginal: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMediaVolumeChange: (nextVolume: number) => void;
};

function clampZoom(value: number): number {
  return Math.min(5, Math.max(1, Number(value.toFixed(2))));
}

function normalizeDraftState(nextState: Omit<ViewerDraftState, "canUndo">): ViewerDraftState {
  const zoomLevel = clampZoom(nextState.zoomLevel);
  const rotationDegrees = nextState.rotationDegrees;
  const hasCrop = nextState.hasCrop;

  return {
    zoomLevel,
    rotationDegrees,
    hasCrop,
    canUndo: zoomLevel !== 1 || rotationDegrees !== 0 || hasCrop,
  };
}

const savedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSavedAt(savedAt: string | undefined): string {
  if (!savedAt) {
    return "";
  }

  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return savedAtFormatter.format(parsed);
}

export function MediaViewerModal({
  item,
  currentIndex,
  totalItems,
  wheelBehavior,
  mediaVolume,
  draftState,
  hasPendingSave,
  isSaving,
  saveError,
  saveNotice,
  onDraftStateChange,
  onSave,
  onRestoreOriginal,
  onClose,
  onPrevious,
  onNext,
  onMediaVolumeChange,
}: MediaViewerModalProps) {
  const lastWheelNavigationAtRef = useRef(0);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const isOpen = Boolean(item);
  const imageMode = item ? isImage(item) : false;
  const videoMode = item ? isVideo(item) : false;
  const audioMode = item ? isAudio(item) : false;
  const playableMediaMode = videoMode || audioMode;
  const hasSavedEdit = Boolean(item?.savedMediaEdit);
  const hasOriginalSource = Boolean(item?.originalSource);
  const savedAtLabel = formatSavedAt(item?.savedMediaEdit?.savedAt);

  function updateDraftState(patch: Partial<Omit<ViewerDraftState, "canUndo">>): void {
    onDraftStateChange(
      normalizeDraftState({
        zoomLevel: patch.zoomLevel ?? draftState.zoomLevel,
        rotationDegrees: patch.rotationDegrees ?? draftState.rotationDegrees,
        hasCrop: patch.hasCrop ?? draftState.hasCrop,
      }),
    );
  }

  function zoomOut(): void {
    updateDraftState({ zoomLevel: draftState.zoomLevel - 0.2 });
  }

  function zoomIn(): void {
    updateDraftState({ zoomLevel: draftState.zoomLevel + 0.2 });
  }

  function rotateLeft(): void {
    updateDraftState({ rotationDegrees: draftState.rotationDegrees - 90 });
  }

  function rotateRight(): void {
    updateDraftState({ rotationDegrees: draftState.rotationDegrees + 90 });
  }

  function toggleCrop(): void {
    updateDraftState({ hasCrop: !draftState.hasCrop });
  }

  function resetDraftState(): void {
    onDraftStateChange(
      normalizeDraftState({
        zoomLevel: 1,
        rotationDegrees: item?.savedMediaEdit?.rotationDegrees ?? 0,
        hasCrop: item?.savedMediaEdit?.hasCrop ?? false,
      }),
    );
  }

  function updateMediaVolume(nextVolume: number): void {
    const normalizedVolume = clampNumber(nextVolume, 0, 1);
    if (Math.abs(normalizedVolume - mediaVolume) < 0.001) {
      return;
    }

    onMediaVolumeChange(normalizedVolume);
  }

  function handleMediaVolumeChange(event: ChangeEvent<HTMLInputElement>): void {
    updateMediaVolume(Number.parseFloat(event.target.value));
  }

  function handleNativeMediaVolumeChange(event: SyntheticEvent<HTMLMediaElement>): void {
    updateMediaVolume(event.currentTarget.volume);
  }

  function assignMediaElement(element: HTMLMediaElement | null): void {
    mediaElementRef.current = element;

    if (element) {
      element.volume = mediaVolume;
    }
  }

  useEffect(() => {
    const mediaElement = mediaElementRef.current;

    if (!mediaElement || !playableMediaMode) {
      return;
    }

    mediaElement.volume = mediaVolume;
  }, [item?.id, mediaVolume, playableMediaMode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
        return;
      }

      if (!imageMode) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();

      if (normalizedKey === "+" || normalizedKey === "=") {
        event.preventDefault();
        zoomIn();
        return;
      }

      if (normalizedKey === "-" || normalizedKey === "_") {
        event.preventDefault();
        zoomOut();
        return;
      }

      if (normalizedKey === "q") {
        event.preventDefault();
        rotateLeft();
        return;
      }

      if (normalizedKey === "e") {
        event.preventDefault();
        rotateRight();
        return;
      }

      if (normalizedKey === "c") {
        event.preventDefault();
        toggleCrop();
        return;
      }

      if (normalizedKey === "0") {
        event.preventDefault();
        resetDraftState();
        return;
      }

      if (normalizedKey === "s" && hasPendingSave && !isSaving) {
        event.preventDefault();
        onSave();
        return;
      }

      if (normalizedKey === "o" && hasSavedEdit && !isSaving) {
        event.preventDefault();
        onRestoreOriginal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    draftState.hasCrop,
    draftState.rotationDegrees,
    draftState.zoomLevel,
    hasPendingSave,
    hasSavedEdit,
    imageMode,
    isOpen,
    isSaving,
    onClose,
    onNext,
    onPrevious,
    onRestoreOriginal,
    onSave,
  ]);

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < totalItems - 1;

  const mediaTransform = useMemo(
    () => `translate(-50%, -50%) scale(${draftState.zoomLevel}) rotate(${draftState.rotationDegrees}deg)`,
    [draftState.rotationDegrees, draftState.zoomLevel],
  );

  function handleWheel(event: WheelEvent<HTMLDivElement>): void {
    if (!imageMode) {
      return;
    }

    event.preventDefault();

    if (wheelBehavior === "navigate") {
      const now = Date.now();
      if (now - lastWheelNavigationAtRef.current < 240) {
        return;
      }

      lastWheelNavigationAtRef.current = now;
      if (event.deltaY < 0) {
        onPrevious();
      } else {
        onNext();
      }
      return;
    }

    const direction = event.deltaY < 0 ? 0.14 : -0.14;
    updateDraftState({ zoomLevel: draftState.zoomLevel + direction });
  }

  if (!item) {
    return null;
  }

  const mediaUrl = getLibraryItemContentUrl(item);

  return (
    <div className="media-viewer-root" role="dialog" aria-modal="true" aria-label={`Viewer for ${item.name}`}>
      <button type="button" className="media-viewer-backdrop" aria-label="Close viewer" onClick={onClose} />

      <div className="media-viewer-modal">
        <header className="media-viewer-header">
          <div className="media-viewer-heading">
            <strong className="media-viewer-title">{item.name}</strong>
            <div className="media-viewer-heading-meta">
              <span className="media-viewer-counter">
                {currentIndex + 1} / {totalItems}
              </span>
              {hasSavedEdit ? <span className="media-viewer-edit-chip">Edited</span> : null}
              {hasOriginalSource ? <span className="media-viewer-original-chip">Original preserved</span> : null}
              {savedAtLabel ? <span className="media-viewer-saved-at">Saved {savedAtLabel}</span> : null}
            </div>
          </div>

          <div className="media-viewer-header-actions">
            <button type="button" className="media-viewer-icon-button" onClick={onClose} title="Close" aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="media-viewer-stage">
          <button
            type="button"
            className="media-viewer-nav-button left"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            aria-label="Previous item"
            title="Previous item"
          >
            <ArrowLeftIcon />
          </button>

          <div
            className={`media-viewer-viewport ${imageMode ? "image-mode" : ""} ${videoMode ? "video-mode" : ""} ${audioMode ? "audio-mode" : ""} ${draftState.hasCrop ? "crop-active" : ""}`}
            onWheel={handleWheel}
          >
            {imageMode ? (
              <img
                src={mediaUrl}
                alt={item.name}
                className="media-viewer-image"
                draggable={false}
                style={{
                  transform: mediaTransform,
                  objectFit: draftState.hasCrop ? "cover" : "contain",
                }}
              />
            ) : null}

            {videoMode ? (
              <video
                ref={assignMediaElement}
                src={mediaUrl}
                className="media-viewer-video"
                controls
                playsInline
                preload="metadata"
                onVolumeChange={handleNativeMediaVolumeChange}
              />
            ) : null}

            {audioMode ? (
              <div className="media-viewer-audio-panel">
                <span className="media-viewer-audio-art" aria-hidden="true">
                  <AudioIcon />
                </span>
                <div className="media-viewer-audio-details">
                  <span className="media-viewer-audio-title">{item.name}</span>
                  <span className="media-viewer-audio-meta">{item.mimeType}</span>
                </div>
                <audio
                  ref={assignMediaElement}
                  src={mediaUrl}
                  className="media-viewer-audio"
                  controls
                  preload="metadata"
                  onVolumeChange={handleNativeMediaVolumeChange}
                />
              </div>
            ) : null}

            {!imageMode && !videoMode && !audioMode ? (
              <div className="media-viewer-file-fallback">
                <span className="media-viewer-file-extension">
                  {(item.name.split(".").pop() || "FILE").slice(0, 5).toUpperCase()}
                </span>
                <span className="media-viewer-file-name">{item.name}</span>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="media-viewer-nav-button right"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next item"
            title="Next item"
          >
            <ArrowRightIcon />
          </button>
        </div>

        <footer className="media-viewer-toolbar">
          {imageMode ? (
            <div className="media-viewer-control-group">
              <button
                type="button"
                className="media-viewer-control-button"
                onClick={zoomOut}
                disabled={draftState.zoomLevel <= 1}
                title="Zoom out"
              >
                <span className="media-viewer-control-icon"><ZoomOutIcon /></span>
                <span className="media-viewer-control-label">Zoom out</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={zoomIn}
                disabled={draftState.zoomLevel >= 5}
                title="Zoom in"
              >
                <span className="media-viewer-control-icon"><ZoomInIcon /></span>
                <span className="media-viewer-control-label">Zoom in</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={rotateLeft}
                title="Rotate left"
              >
                <span className="media-viewer-control-icon"><RotateLeftIcon /></span>
                <span className="media-viewer-control-label">Rotate left</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={rotateRight}
                title="Rotate right"
              >
                <span className="media-viewer-control-icon"><RotateRightIcon /></span>
                <span className="media-viewer-control-label">Rotate right</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button ${draftState.hasCrop ? "active" : ""}`}
                onClick={toggleCrop}
                title={draftState.hasCrop ? "Disable crop preview" : "Enable crop preview"}
              >
                <span className="media-viewer-control-icon"><CropIcon /></span>
                <span className="media-viewer-control-label">Crop</span>
              </button>

              <button
                type="button"
                className="media-viewer-control-button"
                onClick={resetDraftState}
                disabled={!draftState.canUndo}
                title="Undo local edits"
              >
                <span className="media-viewer-control-icon"><UndoIcon /></span>
                <span className="media-viewer-control-label">Undo</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button restore-original-button ${hasSavedEdit ? "active" : ""}`}
                onClick={onRestoreOriginal}
                disabled={!hasSavedEdit || isSaving}
                title={hasSavedEdit ? "Restore the original saved image" : "No saved image edit to restore"}
              >
                <span className="media-viewer-control-icon"><RestoreOriginalIcon /></span>
                <span className="media-viewer-control-label">Original</span>
              </button>

              <button
                type="button"
                className={`media-viewer-control-button save-button ${hasPendingSave ? "active" : ""}`}
                onClick={onSave}
                disabled={!hasPendingSave || isSaving}
                title={hasPendingSave ? "Save image edits" : "No unsaved image edits"}
              >
                <span className="media-viewer-control-icon"><SaveIcon /></span>
                <span className="media-viewer-control-label">{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          ) : (
            <div className="media-viewer-non-image-controls">
              <div className="media-viewer-info-chip">
                {videoMode ? "Video preview" : audioMode ? "Audio player" : "File preview"}
              </div>

              {playableMediaMode ? (
                <label className="media-viewer-volume-control" title={`Volume: ${Math.round(mediaVolume * 100)}%`}>
                  <span className="media-viewer-volume-label">Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={mediaVolume}
                    onChange={handleMediaVolumeChange}
                    aria-label="Preview volume"
                  />
                  <span className="media-viewer-volume-value">{Math.round(mediaVolume * 100)}%</span>
                </label>
              ) : null}
            </div>
          )}

          <div className="media-viewer-footer-meta">
            {saveError ? <span className="media-viewer-save-status error">{saveError}</span> : null}
            {!saveError && saveNotice ? <span className="media-viewer-save-status success">{saveNotice}</span> : null}
            <div className="media-viewer-shortcuts-hint">
              <span>Esc Close</span>
              <span>Arrow keys Navigate</span>
              {imageMode ? <span>Q/E Rotate</span> : null}
              {imageMode ? <span>C Crop</span> : null}
              {imageMode ? <span>S Save</span> : null}
              {hasSavedEdit ? <span>O Original</span> : null}
            </div>
            <div className="media-viewer-zoom-readout" aria-live="polite">
              {imageMode ? `${Math.round(draftState.zoomLevel * 100)}% | Wheel: ${wheelBehavior === "zoom" ? "Zoom" : "Navigate"}` : audioMode ? "Player" : "Preview"}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}


type SettingsModalProps = {
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  settingsSection: SettingsSection;
  sessionName: string | null;
  activeGuildName: string | null;
  minimizeToTray: boolean;
  closeToTray: boolean;
  accentColor: string;
  language: InterfaceLanguage;
  localMirrorEnabled: boolean;
  localMirrorPath: string;
  localStorageStatus: LocalStorageStatus | null;
  isChoosingMirrorFolder: boolean;
  onClose: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onChangeMinimizeToTray: (checked: boolean) => void;
  onChangeCloseToTray: (checked: boolean) => void;
  onChangeLocalMirrorEnabled: (checked: boolean) => void;
  onChangeLocalMirrorPath: (value: string) => void;
  onChangeLanguage: (language: InterfaceLanguage) => void;
  onChooseLocalMirrorFolder: () => void;
  onCommitAccentColor: (value: string) => void;
};

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "discord", label: "Discord" },
  { id: "appearance", label: "Appearance" },
  { id: "storage", label: "Storage" },
  { id: "language", label: "Language" },
  { id: "window", label: "Window" },
];

type AccentColorPickerProps = {
  color: string;
  onCommitHex: (nextHex: string) => void;
};

function AccentColorPicker({ color, onCommitHex }: AccentColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(color);
  const [draftHsv, setDraftHsv] = useState<HsvColor>(() => hexToHsv(color));
  const [draftError, setDraftError] = useState("");
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const saturationPanelRef = useRef<HTMLDivElement | null>(null);
  const hueTrackRef = useRef<HTMLDivElement | null>(null);
  const draftHexRef = useRef(draftHex);

  useEffect(() => {
    const normalized = normalizeHexColor(color) ?? color;
    setDraftHex(normalized);
    setDraftHsv(hexToHsv(normalized));
  }, [color]);

  useEffect(() => {
    draftHexRef.current = draftHex;
  }, [draftHex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) {
        return;
      }

      resetDraft();
      setIsOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      resetDraft();
      setIsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, color]);

  const hueOnlyColor = useMemo(() => hsvToHex(draftHsv.hue, 1, 1), [draftHsv.hue]);
  const displayHex = isOpen ? draftHex : color;
  const helperText = draftError || "Click the swatch to open the picker.";

  function resetDraft(): void {
    const normalized = normalizeHexColor(color) ?? color;
    const nextHsv = hexToHsv(normalized);
    draftHexRef.current = normalized;
    setDraftHex(normalized);
    setDraftHsv(nextHsv);
    setDraftError("");
  }

  function commitHex(nextHex: string): boolean {
    const normalized = normalizeHexColor(nextHex);

    if (!normalized) {
      setDraftError("Enter a valid HEX color.");
      return false;
    }

    const nextHsv = hexToHsv(normalized);
    draftHexRef.current = normalized;
    setDraftHex(normalized);
    setDraftHsv(nextHsv);
    setDraftError("");
    onCommitHex(normalized);
    return true;
  }

  function updateDraftFromHsv(nextHue: number, nextSaturation: number, nextValue: number): void {
    const normalizedHue = clampNumber(nextHue, 0, 360);
    const normalizedSaturation = clampNumber(nextSaturation, 0, 1);
    const normalizedValue = clampNumber(nextValue, 0, 1);
    const nextHex = hsvToHex(normalizedHue, normalizedSaturation, normalizedValue);
    const nextHsv = {
      hue: normalizedHue,
      saturation: normalizedSaturation,
      value: normalizedValue,
    };

    draftHexRef.current = nextHex;
    setDraftHsv(nextHsv);
    setDraftHex(nextHex);
    setDraftError("");
  }

  function updateSaturationFromClientPoint(clientX: number, clientY: number): void {
    const panel = saturationPanelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const nextSaturation = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const nextValue = clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1);
    updateDraftFromHsv(draftHsv.hue, nextSaturation, nextValue);
  }

  function updateHueFromClientPoint(clientX: number): void {
    const track = hueTrackRef.current;
    if (!track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    updateDraftFromHsv(ratio * 360, draftHsv.saturation, draftHsv.value);
  }

  function handleSaturationPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    updateSaturationFromClientPoint(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSaturationFromClientPoint(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      void commitHex(draftHexRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleHuePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    updateHueFromClientPoint(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateHueFromClientPoint(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      void commitHex(draftHexRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleHexInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.currentTarget.value.toUpperCase();
    setDraftHex(nextValue);

    const normalized = normalizeHexColor(nextValue);
    if (!normalized) {
      setDraftError("Enter a valid HEX color.");
      return;
    }

    setDraftError("");
    setDraftHsv(hexToHsv(normalized));
  }

  function handleHexInputBlur(): void {
    if (!commitHex(draftHex)) {
      return;
    }

    setIsOpen(false);
  }

  function handleHexInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commitHex(draftHex)) {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      resetDraft();
      setIsOpen(false);
    }
  }

  function handleTogglePicker(): void {
    if (isOpen) {
      resetDraft();
      setIsOpen(false);
      return;
    }

    resetDraft();
    setIsOpen(true);
  }

  return (
    <div className="settings-field-stack">
      <label className="settings-input-label" htmlFor="accent-hex-display">
        Accent color (HEX)
      </label>

      <div className="settings-color-row">
        <div ref={anchorRef} className="settings-color-picker-anchor">
          <button
            type="button"
            className="settings-color-preview-button"
            aria-label="Open accent color picker"
            aria-expanded={isOpen}
            onClick={handleTogglePicker}
          >
            <span
              className="settings-color-preview settings-color-preview-large"
              aria-hidden="true"
              style={{ backgroundColor: displayHex }}
            />
          </button>

          {isOpen ? (
            <div className="settings-color-picker-popover" role="dialog" aria-label="Accent color picker">
              <div
                ref={saturationPanelRef}
                className="settings-color-picker-surface"
                style={{
                  backgroundColor: hueOnlyColor,
                  backgroundImage: `
                    linear-gradient(180deg, transparent 0%, #000000 100%),
                    linear-gradient(90deg, #FFFFFF 0%, transparent 100%)
                  `,
                }}
                onPointerDown={handleSaturationPointerDown}
              >
                <span
                  className="settings-color-picker-handle"
                  aria-hidden="true"
                  style={{
                    left: `calc(${draftHsv.saturation * 100}% - 8px)`,
                    top: `calc(${(1 - draftHsv.value) * 100}% - 8px)`,
                  }}
                />
              </div>

              <div ref={hueTrackRef} className="settings-color-picker-hue" onPointerDown={handleHuePointerDown}>
                <span
                  className="settings-color-picker-handle settings-color-picker-handle-horizontal"
                  aria-hidden="true"
                  style={{
                    left: `calc(${(draftHsv.hue / 360) * 100}% - 8px)`,
                  }}
                />
              </div>

              <div className="settings-color-picker-hex-block">
                <span
                  className="settings-color-preview settings-color-picker-current"
                  aria-hidden="true"
                  style={{ backgroundColor: draftHex }}
                />
                <label className="settings-color-picker-hex-field">
                  <span className="settings-color-picker-hex-label">Hex</span>
                  <input
                    className={`form-text-input settings-color-picker-hex-input ${draftError ? "invalid" : ""}`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={7}
                    value={draftHex}
                    onChange={handleHexInputChange}
                    onBlur={handleHexInputBlur}
                    onKeyDown={handleHexInputKeyDown}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <input
          id="accent-hex-display"
          className="form-text-input settings-color-display-input"
          type="text"
          value={color}
          readOnly
          aria-readonly="true"
        />
      </div>

      <span className={`settings-input-help ${draftError ? "error" : ""}`}>{helperText}</span>
    </div>
  );
}

export function SettingsModal({
  profile,
  settingsSection,
  sessionName,
  activeGuildName,
  minimizeToTray,
  closeToTray,
  accentColor,
  language,
  localMirrorEnabled,
  localMirrorPath,
  localStorageStatus,
  isChoosingMirrorFolder,
  onClose,
  onSelectSection,
  onChangeMinimizeToTray,
  onChangeCloseToTray,
  onChangeLocalMirrorEnabled,
  onChangeLocalMirrorPath,
  onChangeLanguage,
  onChooseLocalMirrorFolder,
  onCommitAccentColor,
}: SettingsModalProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mouseWheelBehavior, setMouseWheelBehavior] = useState(() => readStoredMouseWheelBehavior());
  const [localMirrorPathDraft, setLocalMirrorPathDraft] = useState(localMirrorPath);

  useEffect(() => {
    setLocalMirrorPathDraft(localMirrorPath);
  }, [localMirrorPath]);

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      await logoutDiscord();
      window.location.reload();
    } catch (caughtError) {
      setLogoutError(caughtError instanceof Error ? caughtError.message : "Could not logout from Discord.");
      setIsLoggingOut(false);
    }
  }

  function handleChangeMouseWheelBehavior(nextValue: "zoom" | "navigate"): void {
    setMouseWheelBehavior(nextValue);
    commitMouseWheelBehavior(nextValue);
  }

  function commitLocalMirrorPathDraft(): void {
    const trimmedPath = localMirrorPathDraft.trim();
    setLocalMirrorPathDraft(trimmedPath);
    onChangeLocalMirrorPath(trimmedPath);
  }

  function handleLocalMirrorPathKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitLocalMirrorPathDraft();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setLocalMirrorPathDraft(localMirrorPath);
      event.currentTarget.blur();
    }
  }

  function formatStorageBytes(value: number): string {
    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderDiscordContent() {
    const isConnected = Boolean(sessionName);

    return (
      <>
        <div className="settings-modal-header">
          <div>
            <h2>Discord</h2>
            <p>Discord authentication is handled automatically outside Discasa whenever the app needs a valid login.</p>
          </div>
        </div>

        <div className="settings-card panel-surface-secondary">
          <div className={`settings-status ${isConnected ? "connected" : "disconnected"}`}>
            {isConnected ? `Connected as ${sessionName}` : "Not connected"}
          </div>

          <span className="settings-input-help">
            {activeGuildName
              ? `Current applied server: ${activeGuildName}`
              : "No server is currently applied."}
          </span>

          {isConnected ? (
            <>
              <button
                type="button"
                className="pill-button danger-button primary-button"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Logout from Discord"}
              </button>

              <span className={`settings-input-help ${logoutError ? "error" : ""}`}>
                {logoutError || "After logout, Discasa will request a new browser login when access is needed again."}
              </span>
            </>
          ) : (
            <span className="settings-input-help">
              Discasa will start the browser login flow automatically when a Discord session is required.
            </span>
          )}
        </div>
      </>
    );
  }

  function renderStorageContent() {
    const resolvedMirrorPath = (localStorageStatus?.resolvedMirrorPath ?? localMirrorPath) || "Default cache folder";
    const defaultMirrorPath = localStorageStatus?.defaultMirrorPath ?? "Default cache folder";
    const thumbnailCachePath = localStorageStatus?.thumbnailCachePath ?? "Temporary thumbnail cache";
    const mirroredFileCount = localStorageStatus ? bytesFormatter.format(localStorageStatus.mirroredFileCount) : "0";
    const thumbnailCacheLabel = localStorageStatus
      ? `${bytesFormatter.format(localStorageStatus.thumbnailCacheFileCount)} files, ${formatStorageBytes(localStorageStatus.thumbnailCacheBytes)}`
      : "Waiting for cache status";

    return (
      <>
        <div className="settings-modal-header">
          <div>
            <h2>Storage</h2>
            <p>Choose whether Discasa keeps local copies alongside the Discord cloud library.</p>
          </div>
        </div>

        <div className="settings-card panel-surface-secondary">
          <label className="settings-toggle" htmlFor="local-mirror-enabled">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Mirror files locally</span>
              <span className="settings-toggle-description">
                Keep managed copies on this computer while Discord remains the cloud source.
              </span>
            </div>
            <input
              id="local-mirror-enabled"
              className="settings-switch-input"
              type="checkbox"
              checked={localMirrorEnabled}
              onChange={(event) => onChangeLocalMirrorEnabled(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <div className="settings-field-stack">
            <label className="settings-input-label" htmlFor="local-mirror-path">
              Local mirror folder
            </label>
            <div className="settings-path-row">
              <input
                id="local-mirror-path"
                className="form-text-input settings-path-input"
                type="text"
                spellCheck={false}
                value={localMirrorPathDraft}
                placeholder={defaultMirrorPath}
                onChange={(event) => setLocalMirrorPathDraft(event.currentTarget.value)}
                onBlur={commitLocalMirrorPathDraft}
                onKeyDown={handleLocalMirrorPathKeyDown}
              />
              <button
                type="button"
                className="pill-button secondary-button settings-path-button"
                onClick={onChooseLocalMirrorFolder}
                disabled={isChoosingMirrorFolder}
              >
                {isChoosingMirrorFolder ? "Choosing..." : "Choose"}
              </button>
              <button
                type="button"
                className="pill-button secondary-button settings-path-button"
                onClick={() => {
                  setLocalMirrorPathDraft("");
                  onChangeLocalMirrorPath("");
                }}
              >
                Default
              </button>
            </div>
            <span className="settings-input-help">Active folder: {resolvedMirrorPath}</span>
          </div>

          <div className="settings-storage-grid" aria-label="Local storage status">
            <div className="settings-storage-stat">
              <span className="settings-storage-stat-label">Mirrored files</span>
              <strong>{mirroredFileCount}</strong>
            </div>
            <div className="settings-storage-stat">
              <span className="settings-storage-stat-label">Thumbnail cache</span>
              <strong>{thumbnailCacheLabel}</strong>
            </div>
            <div className="settings-storage-stat wide">
              <span className="settings-storage-stat-label">Cache folder</span>
              <strong>{thumbnailCachePath}</strong>
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderContent() {
    if (settingsSection === "discord") {
      return renderDiscordContent();
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

          <div className="settings-card panel-surface-secondary">
            <AccentColorPicker color={accentColor} onCommitHex={onCommitAccentColor} />
          </div>
        </>
      );
    }

    if (settingsSection === "storage") {
      return renderStorageContent();
    }

    if (settingsSection === "language") {
      return (
        <>
          <div className="settings-modal-header">
            <div>
              <h2>Language</h2>
              <p>The interface updates as soon as you choose a language.</p>
            </div>
          </div>

          <div className="settings-card panel-surface-secondary">
            <div className="settings-field-stack">
              <label className="settings-input-label" htmlFor="interface-language">
                Interface language
              </label>
              <select
                id="interface-language"
                className="form-text-input settings-select-input"
                value={language}
                onChange={(event) => onChangeLanguage(event.currentTarget.value as InterfaceLanguage)}
              >
                {supportedLanguages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

        <div className="settings-card panel-surface-secondary">
          <label className="settings-toggle" htmlFor="minimize-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Minimize to tray</span>
              <span className="settings-toggle-description">When minimizing, hide the app in the system tray.</span>
            </div>
            <input
              id="minimize-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={minimizeToTray}
              onChange={(event) => onChangeMinimizeToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <label className="settings-toggle" htmlFor="close-to-tray">
            <div className="settings-toggle-copy">
              <span className="settings-toggle-title">Close to tray</span>
              <span className="settings-toggle-description">When closing, keep the app running in the system tray.</span>
            </div>
            <input
              id="close-to-tray"
              className="settings-switch-input"
              type="checkbox"
              checked={closeToTray}
              onChange={(event) => onChangeCloseToTray(event.currentTarget.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>

          <div className="settings-field-stack">
            <label className="settings-input-label" htmlFor="viewer-wheel-behavior">
              Mouse wheel in viewer
            </label>
            <select
              id="viewer-wheel-behavior"
              className="form-text-input settings-select-input"
              value={mouseWheelBehavior}
              onChange={(event) => handleChangeMouseWheelBehavior(event.currentTarget.value as "zoom" | "navigate")}
            >
              <option value="zoom">Zoom image</option>
              <option value="navigate">Go to previous / next item</option>
            </select>
            <span className="settings-input-help">
              Choose whether the mouse wheel zooms images or navigates between items in the internal viewer.
            </span>
          </div>
        </div>
      </>
    );
  }

  return (
    <BaseModal
      rootClassName="settings-modal-root"
      backdropClassName="settings-modal-backdrop"
      panelClassName="settings-modal"
      ariaLabel="Discasa settings"
      showCloseButton
      closeButtonClassName="settings-modal-close"
      closeButtonAriaLabel="Close settings"
      onClose={onClose}
    >
      <aside className="settings-modal-sidebar">
        <div className="settings-modal-profile">
          <ProfileAvatar avatarUrl={profile.avatarUrl} className="settings-modal-avatar" />
          <div className="settings-modal-profile-copy">
            <span className="settings-profile-primary">{profile.nickname}</span>
            <span className="settings-profile-secondary">{profile.server}</span>
          </div>
        </div>

        <div className="settings-modal-nav-group">
          <span className="settings-modal-nav-label">Settings</span>
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-modal-nav-item ${settingsSection === section.id ? "active" : ""}`}
              onClick={() => onSelectSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="settings-modal-content scrollable-y subtle-scrollbar content-scrollbar-host">
        {renderContent()}
      </section>
    </BaseModal>
  );
}

const libraryEntries = [
  { id: "all-files", label: "All Files", icon: LibraryIcon },
  { id: "favorites", label: "Favorites", icon: HeartIcon },
  { id: "trash", label: "Trash", icon: TrashIcon },
] as const;

const collectionEntries = [
  { id: "pictures", label: "Pictures", icon: PictureIcon },
  { id: "videos", label: "Videos", icon: VideoIcon },
  { id: "others", label: "Others", icon: FolderIcon },
] as const;

type SidebarProps = {
  albums: AlbumRecord[];
  selectedView: SidebarView;
  isSidebarCollapsed: boolean;
  profile: {
    nickname: string;
    server: string;
    avatarUrl: string | null;
  };
  onToggleSidebar: () => void;
  onOpenView: (view: SidebarView) => void;
  onOpenCreateAlbum: () => void;
  onOpenAlbumContextMenu: (event: ReactMouseEvent<HTMLElement>, albumId: string, albumName: string) => void;
  dropTargetAlbumId: string | null;
  onAlbumDragEnter: (event: DragEvent<HTMLElement>, albumId: string) => void;
  onAlbumDragLeave: (event: DragEvent<HTMLElement>, albumId: string) => void;
  onAlbumDragOver: (event: DragEvent<HTMLElement>, albumId: string) => void;
  onAlbumDrop: (event: DragEvent<HTMLElement>, albumId: string) => Promise<void>;
};

export function Sidebar({
  albums,
  selectedView,
  isSidebarCollapsed,
  profile,
  onToggleSidebar,
  onOpenView,
  onOpenCreateAlbum,
  onOpenAlbumContextMenu,
  dropTargetAlbumId,
  onAlbumDragEnter,
  onAlbumDragLeave,
  onAlbumDragOver,
  onAlbumDrop,
}: SidebarProps) {
  return (
    <aside className={`sidebar-panel panel-surface ${isSidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-topbar">
        <button
          type="button"
          className="icon-circle-button sidebar-toggle-button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRightDoubleIcon /> : <ChevronLeftDoubleIcon />}
        </button>
      </div>

      <div className="sidebar-scroll scrollable-y subtle-scrollbar sidebar-scrollbar-host">
        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Library</h2> : null}

          {libraryEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "library" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "library", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Collections</h2> : null}

          {collectionEntries.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "collection" && selectedView.id === id ? "selected" : ""}`}
              onClick={() => onOpenView({ kind: "collection", id })}
              title={label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{label}</span> : null}
            </button>
          ))}
        </section>

        <section className="sidebar-section">
          {!isSidebarCollapsed ? <h2 className="sidebar-section-title">Albums</h2> : null}

          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              className={`sidebar-item ${selectedView.kind === "album" && selectedView.id === album.id ? "selected" : ""} ${dropTargetAlbumId === album.id ? "album-drop-target" : ""}`}
              data-album-drop-id={album.id}
              onClick={() => onOpenView({ kind: "album", id: album.id })}
              onContextMenu={(event) => onOpenAlbumContextMenu(event, album.id, album.name)}
              onDragEnter={(event) => onAlbumDragEnter(event, album.id)}
              onDragLeave={(event) => onAlbumDragLeave(event, album.id)}
              onDragOver={(event) => onAlbumDragOver(event, album.id)}
              onDrop={(event) => {
                void onAlbumDrop(event, album.id);
              }}
              title={album.name}
            >
              <span className="sidebar-item-icon"><FolderIcon /></span>
              {!isSidebarCollapsed ? <span className="sidebar-item-label">{album.name}</span> : null}
            </button>
          ))}

          {!isSidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-item"
              onClick={onOpenCreateAlbum}
              title="Create album"
            >
              <span className="sidebar-item-icon"><PlusIcon /></span>
              <span className="sidebar-item-label">Create album</span>
            </button>
          ) : null}
        </section>
      </div>

      <footer className="sidebar-profile">
        <ProfileAvatar avatarUrl={profile.avatarUrl} className="profile-avatar" />
        {!isSidebarCollapsed ? (
          <div className="profile-copy">
            <span className="profile-primary">{profile.nickname}</span>
            <span className="profile-secondary">{profile.server}</span>
          </div>
        ) : null}
      </footer>
    </aside>
  );
}

type StatusToastProps = {
  message: string;
  error: string;
  warning?: string;
};

export function StatusToast({ message, error, warning = "" }: StatusToastProps) {
  if (!message && !error && !warning) return null;

  return (
    <div className="status-toast">
      {message ? <span>{message}</span> : null}
      {warning ? <span className="status-warning">{warning}</span> : null}
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}

type TitlebarProps = {
  logoUrl: string;
  windowState: WindowState;
  onDragStart: (event: ReactMouseEvent<HTMLElement>) => Promise<void>;
  onOpenSettings: () => void;
  onMinimize: () => Promise<void>;
  onToggleMaximize: () => Promise<void>;
  onClose: () => Promise<void>;
};

export function Titlebar({
  logoUrl,
  windowState,
  onDragStart,
  onOpenSettings,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TitlebarProps) {
  function handleTitlebarMouseDown(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("[data-window-control='true']")) {
      return;
    }

    void onDragStart(event);
  }

  return (
    <header className="titlebar" onMouseDown={handleTitlebarMouseDown}>
      <div className="titlebar-drag-region" aria-hidden="true">
        <div className="brand">
          <img src={logoUrl} alt="Discasa" className="brand-logo" />
          <span className="brand-name">Discasa</span>
        </div>
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Open settings"
          data-window-control="true"
        >
          <span className="window-glyph icon-glyph">
            <SettingsIcon />
          </span>
        </button>
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={() => void onMinimize()}
          aria-label="Minimize"
          data-window-control="true"
        >
          <span className="window-glyph minimize" />
        </button>
        <button
          type="button"
          className="icon-circle-button window-button"
          onClick={() => void onToggleMaximize()}
          aria-label={windowState === "maximized" ? "Restore window" : "Maximize window"}
          data-window-control="true"
        >
          <span className="window-glyph maximize" />
        </button>
        <button
          type="button"
          className="icon-circle-button window-button close-button"
          onClick={() => void onClose()}
          aria-label="Close"
          data-window-control="true"
        >
          <span className="window-glyph close" />
        </button>
      </div>
    </header>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
