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
  getAppDiagnostics,
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
  type AppDiagnostics,
  type DiscasaBotStatus,
  type GalleryDisplayMode,
  type MouseWheelBehavior,
  type SettingsSection,
  type SidebarView,
  type ViewerDraftState,
  type ViewerState,
  type WindowState,
} from "./lib/app-logic";
import {
  AlbumContextMenu,
  AlbumModal,
  type AuthSetupStep,
  AuthSetupModal,
  createLibraryItemDragPreview,
  DeleteAlbumModal,
  DeleteFileModal,
  Gallery,
  MoveItemsModal,
  RenameAlbumModal,
  SettingsModal,
  Sidebar,
  StatusToast,
  Titlebar,
} from "./components/app-components";

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
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
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

  async function refreshDiagnostics(): Promise<void> {
    setIsLoadingDiagnostics(true);
    setDiagnosticsError("");

    try {
      setDiagnostics(await getAppDiagnostics());
    } catch (caughtError) {
      setDiagnosticsError(caughtError instanceof Error ? caughtError.message : "Could not load diagnostics.");
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }

  useEffect(() => {
    if (!isSettingsOpen || settingsSection !== "diagnostics") {
      return;
    }

    void refreshDiagnostics();
  }, [isSettingsOpen, settingsSection]);

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
          diagnostics={diagnostics}
          isLoadingDiagnostics={isLoadingDiagnostics}
          diagnosticsError={diagnosticsError}
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
          onRefreshDiagnostics={() => {
            void refreshDiagnostics();
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
