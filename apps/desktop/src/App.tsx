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
import { getCurrentWindow, PhysicalPosition, type DragDropEvent } from "@tauri-apps/api/window";
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
import "./styles.css";
import {
  applyInterfaceLanguage,
  readStoredLanguage,
  supportedLanguages,
  writeStoredLanguage,
  type InterfaceLanguage,
} from "./i18n/index.ts";
import {
  logoutDiscord,
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
  inspectLocalFilePaths,
  initializeDiscasa,
  moveLibraryItemsToAlbum,
  moveItemsToTrash,
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
  uploadLocalFilePaths,
  chooseLocalMirrorFolder,
  chooseWatchedFolder,
  downloadLibraryItems,
  DEFAULT_PROFILE,
  getCurrentDescription,
  getCurrentTitle,
  getLibraryItemContentUrl,
  getLibraryItemThumbnailUrl,
  getVisibleItems,
  getDuplicateLibraryItemIds,
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
  type LocalFolderUploadTarget,
  type LocalPathInspection,
  type SettingsSection,
  type SidebarView,
  type ViewerDraftState,
  type ViewerState,
  type WindowState,
} from "./lib/app-logic.ts";
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
} from "./components/app-components.tsx";

const logoUrl = "./discasa-logo.png";
const defaultAvatarUrl = "./discasa-default-avatar.png";
const PENDING_UPLOAD_ID_PREFIX = "pending-upload:";

type PendingUploadItem = LibraryItem & {
  uploadState: "processing";
  uploadSourcePath?: string;
  uploadPreviewObjectUrl?: string;
};

type PendingUploadRecord = {
  id: string;
  guildId: string;
  filePath: string;
  name: string;
  size: number;
  mimeType: string;
  albumIds: string[];
  isFavorite: boolean;
  isTrashed: boolean;
  createdAt: string;
  updatedAt: string;
};

function isPendingUploadItem(item: LibraryItem): item is PendingUploadItem {
  return item.id.startsWith(PENDING_UPLOAD_ID_PREFIX);
}

function getFileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function inferMimeTypeFromName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const knownTypes: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
  };

  return knownTypes[extension] ?? "application/octet-stream";
}

function canUseInstantPreview(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/");
}

function isTopLevelAlbum(album: AlbumRecord): boolean {
  return album.type === "album" && album.parentId === null;
}

function mergeAlbumRecords(currentAlbums: AlbumRecord[], nextRecords: AlbumRecord[]): AlbumRecord[] {
  if (nextRecords.length === 0) {
    return currentAlbums;
  }

  const nextById = new Map(currentAlbums.map((album) => [album.id, album]));
  for (const album of nextRecords) {
    nextById.set(album.id, album);
  }

  return Array.from(nextById.values());
}

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
const PENDING_UPLOAD_QUEUE_KEY = "discasa.upload.pendingQueue.v1";
const THUMBNAIL_ZOOM_KEY = "discasa.library.thumbnailZoomPercent";
const DEFAULT_ACCENT_HEX = DISCASA_DEFAULT_CONFIG.accentColor;
const THUMBNAIL_BASE_SIZE = 400;
const THUMBNAIL_ZOOM_LEVELS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80] as const;
const DEFAULT_THUMBNAIL_ZOOM_PERCENT = DISCASA_DEFAULT_CONFIG.thumbnailZoomPercent;
const DEFAULT_GALLERY_DISPLAY_MODE = DISCASA_DEFAULT_CONFIG.galleryDisplayMode;
const CONFIG_SAVE_DEBOUNCE_MS = 700;
const DRIVE_IMPORT_INTERVAL_MS = 30000;
const DUPLICATE_SCAN_INTERVAL_MS = 300000;
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

function normalizeCachedAlbumRecord(value: unknown): AlbumRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.itemCount !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    type: value.type === "folder" ? "folder" : "album",
    name: value.name,
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    itemCount: value.itemCount,
    childFolderCount: typeof value.childFolderCount === "number" ? value.childFolderCount : 0,
  };
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

function isPendingUploadRecord(value: unknown): value is PendingUploadRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.guildId === "string" &&
    typeof value.filePath === "string" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.mimeType === "string" &&
    Array.isArray(value.albumIds) &&
    typeof value.isFavorite === "boolean" &&
    typeof value.isTrashed === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function readPendingUploadRecords(): PendingUploadRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PENDING_UPLOAD_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPendingUploadRecord) : [];
  } catch {
    return [];
  }
}

function writePendingUploadRecords(records: PendingUploadRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (records.length === 0) {
      window.localStorage.removeItem(PENDING_UPLOAD_QUEUE_KEY);
      return;
    }

    window.localStorage.setItem(PENDING_UPLOAD_QUEUE_KEY, JSON.stringify(records));
  } catch {
    // The visible queue still works even when localStorage is unavailable.
  }
}

function upsertPendingUploadRecords(nextRecords: PendingUploadRecord[]): void {
  if (nextRecords.length === 0) {
    return;
  }

  const recordsById = new Map(readPendingUploadRecords().map((record) => [record.id, record]));
  for (const record of nextRecords) {
    recordsById.set(record.id, record);
  }

  writePendingUploadRecords(Array.from(recordsById.values()));
}

function patchPendingUploadRecord(itemId: string, patch: Partial<Pick<PendingUploadRecord, "albumIds" | "isFavorite" | "isTrashed">>): void {
  const records = readPendingUploadRecords();
  let didChange = false;
  const nextRecords = records.map((record) => {
    if (record.id !== itemId) {
      return record;
    }

    didChange = true;
    return {
      ...record,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  });

  if (didChange) {
    writePendingUploadRecords(nextRecords);
  }
}

function removePendingUploadRecords(itemIds: string[]): void {
  if (itemIds.length === 0) {
    return;
  }

  const idSet = new Set(itemIds);
  writePendingUploadRecords(readPendingUploadRecords().filter((record) => !idSet.has(record.id)));
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
      albums: parsed.albums.map(normalizeCachedAlbumRecord).filter((album): album is AlbumRecord => Boolean(album)),
      items: parsed.items.filter(isCachedLibraryItem).filter((item) => !isPendingUploadItem(item)),
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
      items: input.items.filter((item) => !isPendingUploadItem(item)),
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
  const [createAlbumParentId, setCreateAlbumParentId] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [createAlbumError, setCreateAlbumError] = useState("");
  const [renameAlbumTarget, setRenameAlbumTarget] = useState<{ id: string; currentName: string } | null>(null);
  const [renameAlbumName, setRenameAlbumName] = useState("");
  const [isRenamingAlbum, setIsRenamingAlbum] = useState(false);
  const [renameAlbumError, setRenameAlbumError] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("storage");
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
  const [watchedFolderEnabled, setWatchedFolderEnabled] = useState(DISCASA_DEFAULT_CONFIG.watchedFolderEnabled);
  const [watchedFolderPath, setWatchedFolderPath] = useState<string>(DISCASA_DEFAULT_CONFIG.watchedFolderPath ?? "");
  const [mediaPreviewVolume, setMediaPreviewVolume] = useState(DISCASA_DEFAULT_CONFIG.mediaPreviewVolume);
  const [localStorageStatus, setLocalStorageStatus] = useState<LocalStorageStatus | null>(null);
  const [isChoosingMirrorFolder, setIsChoosingMirrorFolder] = useState(false);
  const [duplicateItemIds, setDuplicateItemIds] = useState<string[]>([]);
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
  const folderUploadInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<LibraryItem[]>(initialCachedLibrary?.items ?? []);
  const albumsRef = useRef<AlbumRecord[]>(initialCachedLibrary?.albums ?? []);
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
  const isLibraryInteractionBusy = isBusy && items.length === 0 && albums.length === 0;

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

  function commitItemsState(nextItems: LibraryItem[]): void {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }

  function updateItemsState(updater: (current: LibraryItem[]) => LibraryItem[]): LibraryItem[] {
    const nextItems = updater(itemsRef.current);
    commitItemsState(nextItems);
    return nextItems;
  }

  function commitAlbumsState(nextAlbums: AlbumRecord[]): void {
    albumsRef.current = nextAlbums;
    setAlbums(nextAlbums);
  }

  function recalculateAlbumItemCounts(nextAlbums: AlbumRecord[], nextItems: LibraryItem[]): AlbumRecord[] {
    const countsByAlbumId = new Map<string, number>();

    for (const item of nextItems) {
      if (item.isTrashed) {
        continue;
      }

      for (const albumId of item.albumIds) {
        countsByAlbumId.set(albumId, (countsByAlbumId.get(albumId) ?? 0) + 1);
      }
    }

    return nextAlbums.map((album) => ({
      ...album,
      itemCount: countsByAlbumId.get(album.id) ?? 0,
    }));
  }

  function clearLibraryDragState(): void {
    draggingLibraryItemIdsRef.current = [];
    setDraggingLibraryItemIds([]);
    setSidebarDropAlbumId(null);
    nativeDropAlbumIdRef.current = null;
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
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setDuplicateItemIds(getDuplicateLibraryItemIds(items));
  }, [items]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDuplicateItemIds(getDuplicateLibraryItemIds(itemsRef.current));
    }, DUPLICATE_SCAN_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedViewRef.current = selectedView;
  }, [selectedView]);

  useEffect(() => {
    if (selectedView.kind !== "collection") {
      return;
    }

    if (selectedView.id === "watched" && !watchedFolderEnabled) {
      setSelectedView({ kind: "library", id: "all-files" });
    }

    if (selectedView.id === "duplicates" && duplicateItemIds.length === 0) {
      setSelectedView({ kind: "library", id: "all-files" });
    }
  }, [duplicateItemIds.length, selectedView, watchedFolderEnabled]);

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
    setWatchedFolderEnabled(nextConfig.watchedFolderEnabled);
    setWatchedFolderPath(nextConfig.watchedFolderPath ?? "");
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
        commitItemsState(await getLibraryItems());
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
      activeGuildIdRef.current = session.activeGuild?.id ?? "";

      const recoverablePendingUploads = session.activeGuild
        ? getRecoverablePendingUploadRecords(session.activeGuild.id, nextItems)
        : [];
      const recoveredPendingItems = recoverablePendingUploads.map(createPendingUploadItemFromRecord);
      const hydratedItems = recoveredPendingItems.length > 0 ? [...recoveredPendingItems, ...nextItems] : nextItems;
      commitItemsState(hydratedItems);
      commitAlbumsState(recalculateAlbumItemCounts(nextAlbums, hydratedItems));

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

        if (recoverablePendingUploads.length > 0) {
          setMessage(`${recoverablePendingUploads.length} interrupted upload(s) recovered. Discasa is retrying them.`);
          void resumePendingLocalUploads(recoverablePendingUploads);
        }
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
  const visibleItems = useMemo(
    () => getVisibleItems(deferredItems, selectedView, duplicateItemIds),
    [deferredItems, duplicateItemIds, selectedView],
  );
  const currentFolder = useMemo(
    () => (selectedView.kind === "album" ? albums.find((album) => album.id === selectedView.id) ?? null : null),
    [albums, selectedView],
  );
  const visibleFolders = useMemo(
    () =>
      selectedView.kind === "album"
        ? albums.filter((album) => album.parentId === selectedView.id).sort((left, right) => left.name.localeCompare(right.name))
        : [],
    [albums, selectedView],
  );
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
    const validItemIds = new Set(itemsRef.current.filter((item) => !item.isTrashed).map((item) => item.id));
    const uniqueItemIds = Array.from(new Set(itemIds)).filter((itemId) => validItemIds.has(itemId));

    if (!uniqueItemIds.length) {
      return;
    }

    setError("");

    const previousItems = itemsRef.current;
    const previousAlbums = albumsRef.current;
    const pendingItemIds = uniqueItemIds.filter((itemId) =>
      itemsRef.current.some((item) => item.id === itemId && isPendingUploadItem(item)),
    );
    const pendingItemIdSet = new Set(pendingItemIds);
    const persistedItemIds = uniqueItemIds.filter((itemId) => !pendingItemIdSet.has(itemId));
    const previousPendingAlbumIds = new Map(
      pendingItemIds.map((itemId) => [
        itemId,
        itemsRef.current.find((item) => item.id === itemId)?.albumIds ?? [],
      ]),
    );
    const targetAlbumName = albumsRef.current.find((album) => album.id === albumId)?.name ?? "the album";
    const uniqueItemIdSet = new Set(uniqueItemIds);

    const optimisticItems = updateItemsState((current) =>
      current.map((item) => (uniqueItemIdSet.has(item.id) ? { ...item, albumIds: [albumId] } : item)),
    );
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, optimisticItems));

    for (const pendingItemId of pendingItemIds) {
      patchPendingUploadRecord(pendingItemId, { albumIds: [albumId] });
    }

    setMessage(`${uniqueItemIds.length} file(s) moved to ${targetAlbumName}.`);
    clearLibraryDragState();

    if (persistedItemIds.length === 0) {
      return;
    }

    try {
      const result = await moveLibraryItemsToAlbum(albumId, persistedItemIds);
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const finalItems = updateItemsState((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));

      commitAlbumsState(recalculateAlbumItemCounts(result.albums, finalItems));
    } catch (caughtError) {
      commitItemsState(previousItems);
      commitAlbumsState(previousAlbums);
      for (const [pendingItemId, albumIds] of previousPendingAlbumIds) {
        patchPendingUploadRecord(pendingItemId, { albumIds });
      }
      setError(caughtError instanceof Error ? caughtError.message : "Could not move the files to the album.");
    }
  }

  function updateItemInState(nextItem: LibraryItem): void {
    updateItemsState((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }

  function removeItemFromState(itemId: string): void {
    const nextItems = updateItemsState((current) => current.filter((item) => item.id !== itemId));
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    setSelectedItemIds((current) => current.filter((id) => id !== itemId));

    if (selectionAnchorRef.current === itemId) {
      selectionAnchorRef.current = null;
    }
  }

  function getAlbumIndex(albumId: string): number {
    return albumsRef.current.filter(isTopLevelAlbum).findIndex((album) => album.id === albumId);
  }

  function canMoveAlbum(albumId: string, direction: "up" | "down"): boolean {
    const index = getAlbumIndex(albumId);
    if (index === -1) return false;
    if (direction === "up") return index > 0;
    return index < albumsRef.current.filter(isTopLevelAlbum).length - 1;
  }

  function openLibraryView(nextView: SidebarView): void {
    setSelectedView(nextView);
    setAlbumContextMenu(null);
  }

  function openSettingsModal(): void {
    setAlbumContextMenu(null);
    setSettingsSection("storage");
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

  function openCreateAlbumModal(parentId: string | null = null): void {
    setAlbumContextMenu(null);
    setCreateAlbumError("");
    setCreateAlbumParentId(parentId);
    setNewAlbumName("");
    setIsCreateAlbumOpen(true);
  }

  function closeCreateAlbumModal(): void {
    if (isCreatingAlbum) return;
    setIsCreateAlbumOpen(false);
    setCreateAlbumError("");
    setCreateAlbumParentId(null);
    setNewAlbumName("");
  }

  function openCreateFolderModal(): void {
    if (selectedViewRef.current.kind !== "album") {
      return;
    }

    openCreateAlbumModal(selectedViewRef.current.id);
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

  async function requestUpload(): Promise<void> {
    if (isTauriRuntime()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        directory: false,
      });
      const filePaths = Array.isArray(selected) ? selected : selected ? [selected] : [];

      if (filePaths.length > 0) {
        await handleNativeFileDrop(filePaths);
      }

      return;
    }

    uploadInputRef.current?.click();
  }

  async function requestFolderUpload(): Promise<void> {
    if (isTauriRuntime()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        directory: true,
        recursive: true,
        title: "Choose folder to upload",
      });
      const folderPaths = Array.isArray(selected) ? selected : selected ? [selected] : [];

      if (folderPaths.length > 0) {
        await handleNativeFileDrop(folderPaths);
      }

      return;
    }

    folderUploadInputRef.current?.click();
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
    if (selectedItemIds.length === 0 || albums.length === 0) {
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
      setCreateAlbumError(createAlbumParentId ? "Enter a folder name." : "Enter an album name.");
      return;
    }

    setIsCreatingAlbum(true);
    setCreateAlbumError("");

    try {
      const result = await createAlbum({ name: trimmed, parentId: createAlbumParentId });
      const nextAlbums = mergeAlbumRecords(albumsRef.current, [result.album]);
      commitAlbumsState(nextAlbums);
      if (!createAlbumParentId) {
        setSelectedView({ kind: "album", id: result.id });
      }
      setMessage(createAlbumParentId ? `Folder created: ${trimmed}` : `Album created: ${trimmed}`);
      setError("");
      setIsCreateAlbumOpen(false);
      setCreateAlbumParentId(null);
      setNewAlbumName("");
    } catch (caughtError) {
      setCreateAlbumError(caughtError instanceof Error ? caughtError.message : "Could not create the folder.");
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

    const targetId = renameAlbumTarget.id;
    const previousAlbums = albumsRef.current;

    setIsRenamingAlbum(true);
    setRenameAlbumError("");
    commitAlbumsState(albumsRef.current.map((album) => (album.id === targetId ? { ...album, name: trimmed } : album)));
    setMessage(`Album renamed to: ${trimmed}`);
    setError("");
    setRenameAlbumTarget(null);
    setRenameAlbumName("");

    try {
      await renameAlbum(targetId, { name: trimmed });
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not rename the album.";
      commitAlbumsState(previousAlbums);
      setRenameAlbumError(nextError);
      setError(nextError);
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
    const targets = itemsRef.current.filter((item) => selectedItemIdSet.has(item.id) && !item.isTrashed);

    if (!targets.length) {
      setMoveItemsError("Select at least one active file.");
      return;
    }

    const targetAlbumId = moveItemsTargetAlbumId;
    const previousItems = itemsRef.current;
    const previousAlbums = albumsRef.current;
    const previousView = selectedViewRef.current;
    const previousSelectedItemIds = selectedItemIds;
    const pendingTargets = targets.filter(isPendingUploadItem);
    const persistedTargets = targets.filter((item) => !isPendingUploadItem(item));
    const previousPendingAlbumIds = new Map(pendingTargets.map((item) => [item.id, item.albumIds]));
    const targetItemIdSet = new Set(targets.map((item) => item.id));
    const targetAlbumName = albumsRef.current.find((album) => album.id === targetAlbumId)?.name ?? "the selected folder";

    setIsMovingItems(true);
    setMoveItemsError("");
    setError("");

    const optimisticItems = updateItemsState((current) =>
      current.map((item) => (targetItemIdSet.has(item.id) ? { ...item, albumIds: [targetAlbumId] } : item)),
    );
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, optimisticItems));

    for (const pendingItem of pendingTargets) {
      patchPendingUploadRecord(pendingItem.id, { albumIds: [targetAlbumId] });
    }

    setSelectedView({ kind: "album", id: targetAlbumId });
    setMessage(`${targets.length} file(s) moved to ${targetAlbumName}.`);
    setSelectedItemIds([]);
    selectionAnchorRef.current = null;
    setIsMoveItemsOpen(false);

    if (persistedTargets.length === 0) {
      setIsMovingItems(false);
      return;
    }

    try {
      const result = await moveLibraryItemsToAlbum(targetAlbumId, persistedTargets.map((item) => item.id));
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const finalItems = updateItemsState((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));

      commitAlbumsState(recalculateAlbumItemCounts(result.albums, finalItems));
      setError("");
    } catch (caughtError) {
      commitItemsState(previousItems);
      commitAlbumsState(previousAlbums);
      setSelectedView(previousView);
      setSelectedItemIds(previousSelectedItemIds);
      selectionAnchorRef.current = previousSelectedItemIds[0] ?? null;
      for (const [pendingItemId, albumIds] of previousPendingAlbumIds) {
        patchPendingUploadRecord(pendingItemId, { albumIds });
      }
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not move the selected files.";
      setMoveItemsError(nextError);
      setError(nextError);
    } finally {
      setIsMovingItems(false);
    }
  }

  async function handleRemoveItemsFromAlbum(albumId: string, itemIds: string[]): Promise<void> {
    const uniqueItemIds = Array.from(new Set(itemIds));
    if (!albumId || !uniqueItemIds.length) {
      return;
    }

    setError("");

    const previousItems = itemsRef.current;
    const previousAlbums = albumsRef.current;
    const pendingItemIds = uniqueItemIds.filter((itemId) =>
      itemsRef.current.some((item) => item.id === itemId && isPendingUploadItem(item)),
    );
    const pendingItemIdSet = new Set(pendingItemIds);
    const persistedItemIds = uniqueItemIds.filter((itemId) => !pendingItemIdSet.has(itemId));
    const previousPendingAlbumIds = new Map(
      pendingItemIds.map((itemId) => [
        itemId,
        itemsRef.current.find((item) => item.id === itemId)?.albumIds ?? [],
      ]),
    );
    const uniqueItemIdSet = new Set(uniqueItemIds);
    const targetAlbumName = albumsRef.current.find((album) => album.id === albumId)?.name ?? "the folder";

    const optimisticItems = updateItemsState((current) =>
      current.map((item) =>
        uniqueItemIdSet.has(item.id) ? { ...item, albumIds: item.albumIds.filter((id) => id !== albumId) } : item,
      ),
    );
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, optimisticItems));

    for (const pendingItemId of pendingItemIds) {
      patchPendingUploadRecord(pendingItemId, {
        albumIds: previousPendingAlbumIds.get(pendingItemId)?.filter((id) => id !== albumId) ?? [],
      });
    }

    setSelectedItemIds([]);
    selectionAnchorRef.current = null;
    setMessage(`${uniqueItemIds.length} file(s) removed from ${targetAlbumName}.`);

    if (persistedItemIds.length === 0) {
      return;
    }

    try {
      const result = await removeLibraryItemsFromAlbum(albumId, persistedItemIds);
      const updatedItemsById = new Map(result.items.map((item) => [item.id, item]));
      const finalItems = updateItemsState((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));

      commitAlbumsState(recalculateAlbumItemCounts(result.albums, finalItems));
    } catch (caughtError) {
      commitItemsState(previousItems);
      commitAlbumsState(previousAlbums);
      for (const [pendingItemId, albumIds] of previousPendingAlbumIds) {
        patchPendingUploadRecord(pendingItemId, { albumIds });
      }
      setError(caughtError instanceof Error ? caughtError.message : "Could not remove the selected files from the folder.");
    }
  }

  async function handleMoveAlbum(albumId: string, direction: "up" | "down"): Promise<void> {
    const topLevelAlbums = albumsRef.current.filter(isTopLevelAlbum);
    const currentIndex = topLevelAlbums.findIndex((album) => album.id === albumId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= topLevelAlbums.length) return;

    const nextAlbums = [...topLevelAlbums];
    const [moved] = nextAlbums.splice(currentIndex, 1);
    nextAlbums.splice(targetIndex, 0, moved);

    const previousAlbums = albumsRef.current;
    let topLevelIndex = 0;
    const optimisticAlbums = previousAlbums.map((album) => {
      if (!isTopLevelAlbum(album)) {
        return album;
      }

      const nextAlbum = nextAlbums[topLevelIndex] ?? album;
      topLevelIndex += 1;
      return nextAlbum;
    });
    const orderedIds = nextAlbums.map((album) => album.id);

    commitAlbumsState(optimisticAlbums);
    setAlbumContextMenu(null);
    setMessage(`Album moved ${direction === "up" ? "up" : "down"}.`);
    setError("");

    try {
      const response = await reorderAlbums(orderedIds);
      commitAlbumsState(response.albums);
    } catch (caughtError) {
      commitAlbumsState(previousAlbums);
      setError(caughtError instanceof Error ? caughtError.message : "Could not move the album.");
    }
  }

  async function handleDeleteAlbumConfirm(): Promise<void> {
    if (!deleteAlbumTarget) return;

    const { id: albumId, name: albumName } = deleteAlbumTarget;
    const deletedFolderIds = new Set<string>([albumId]);
    let didGrow = true;
    while (didGrow) {
      didGrow = false;
      for (const album of albumsRef.current) {
        if (album.parentId && deletedFolderIds.has(album.parentId) && !deletedFolderIds.has(album.id)) {
          deletedFolderIds.add(album.id);
          didGrow = true;
        }
      }
    }

    const previousItems = itemsRef.current;
    const previousAlbums = albumsRef.current;
    const previousView = selectedViewRef.current;
    const previousPendingAlbumIds = new Map(
      previousItems
        .filter((item) => isPendingUploadItem(item) && item.albumIds.some((id) => deletedFolderIds.has(id)))
        .map((item) => [item.id, item.albumIds]),
    );
    const nextAlbums = albumsRef.current.filter((album) => !deletedFolderIds.has(album.id));
    const nextItems = updateItemsState((current) =>
      current.map((item) => ({
        ...item,
        albumIds: item.albumIds.filter((id) => !deletedFolderIds.has(id)),
      })),
    );

    for (const [pendingItemId, albumIds] of previousPendingAlbumIds) {
      patchPendingUploadRecord(pendingItemId, {
        albumIds: albumIds.filter((id) => !deletedFolderIds.has(id)),
      });
    }

    commitAlbumsState(recalculateAlbumItemCounts(nextAlbums, nextItems));
    setSelectedView((current) => (current.kind === "album" && deletedFolderIds.has(current.id) ? { kind: "library", id: "all-files" } : current));
    setDeleteAlbumTarget(null);
    setAlbumContextMenu(null);
    setMessage(`Album deleted: ${albumName}`);
    setError("");
    setDeleteAlbumError("");

    try {
      await deleteAlbum(albumId);
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not delete the album.";
      commitItemsState(previousItems);
      commitAlbumsState(previousAlbums);
      setSelectedView(previousView);
      for (const [pendingItemId, albumIds] of previousPendingAlbumIds) {
        patchPendingUploadRecord(pendingItemId, { albumIds });
      }
      setDeleteAlbumError(nextError);
      setError(nextError);
    }
  }

  function createPendingUploadItem(input: {
    id?: string;
    name: string;
    size: number;
    mimeType: string;
    targetAlbumId?: string;
    albumIds?: string[];
    previewUrl?: string;
    previewObjectUrl?: string;
    sourcePath?: string;
    isFavorite?: boolean;
    isTrashed?: boolean;
  }): PendingUploadItem {
    const id = input.id ?? `${PENDING_UPLOAD_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return {
      id,
      name: input.name,
      size: input.size,
      mimeType: input.mimeType,
      status: "Processing upload",
      guildId: activeGuildIdRef.current || "local",
      albumIds: input.albumIds ?? (input.targetAlbumId ? [input.targetAlbumId] : []),
      uploadedAt: new Date().toISOString(),
      attachmentUrl: input.previewUrl ?? id,
      attachmentStatus: "ready",
      isFavorite: input.isFavorite ?? false,
      isTrashed: input.isTrashed ?? false,
      contentUrl: input.previewUrl,
      thumbnailUrl: input.previewUrl,
      uploadState: "processing",
      uploadSourcePath: input.sourcePath,
      uploadPreviewObjectUrl: input.previewObjectUrl,
    };
  }

  function createPendingUploadRecord(pendingItem: PendingUploadItem, filePath: string): PendingUploadRecord {
    return {
      id: pendingItem.id,
      guildId: activeGuildIdRef.current || "local",
      filePath,
      name: pendingItem.name,
      size: pendingItem.size,
      mimeType: pendingItem.mimeType,
      albumIds: pendingItem.albumIds,
      isFavorite: pendingItem.isFavorite,
      isTrashed: pendingItem.isTrashed,
      createdAt: pendingItem.uploadedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  function createPendingUploadItemFromRecord(record: PendingUploadRecord): PendingUploadItem {
    const previewUrl = canUseInstantPreview(record.mimeType) ? convertFileSrc(record.filePath) : undefined;
    return createPendingUploadItem({
      id: record.id,
      name: record.name,
      size: record.size,
      mimeType: record.mimeType,
      albumIds: record.albumIds,
      previewUrl,
      sourcePath: record.filePath,
      isFavorite: record.isFavorite,
      isTrashed: record.isTrashed,
    });
  }

  async function refreshLibraryAfterUpload(uploadedCount: number, targetAlbumId?: string): Promise<void> {
    const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);
    const targetAlbumName = targetAlbumId ? nextAlbums.find((album) => album.id === targetAlbumId)?.name : "";
    commitItemsState(nextItems);
    commitAlbumsState(nextAlbums);
    void loadLocalStorageStatus();
    setMessage(`${uploadedCount} file(s) added${targetAlbumName ? ` to ${targetAlbumName}` : " to the library"}.`);
    setError("");
  }

  function addPendingUploadItems(pendingItems: PendingUploadItem[]): void {
    const nextItems = updateItemsState((current) => [...pendingItems, ...current]);
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    setMessage(`${pendingItems.length} file(s) queued. You can organize them while Discasa finishes processing.`);
    setError("");
  }

  function removeFailedPendingUploadItems(pendingItems: PendingUploadItem[]): void {
    const pendingIds = new Set(pendingItems.map((item) => item.id));
    const nextItems = updateItemsState((current) => current.filter((item) => !pendingIds.has(item.id)));
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    setSelectedItemIds((current) => current.filter((itemId) => !pendingIds.has(itemId)));
    removePendingUploadRecords(pendingItems.map((item) => item.id));

    for (const pendingItem of pendingItems) {
      if (pendingItem.uploadPreviewObjectUrl) {
        URL.revokeObjectURL(pendingItem.uploadPreviewObjectUrl);
      }
    }
  }

  function markPendingUploadItemsInterrupted(pendingItems: PendingUploadItem[]): void {
    const pendingIds = new Set(pendingItems.map((item) => item.id));
    updateItemsState((current) =>
      current.map((item) => (pendingIds.has(item.id) ? { ...item, status: "Upload interrupted. Discasa will retry." } : item)),
    );
  }

  async function syncPendingUploadChoices(realItem: LibraryItem, pendingItem: LibraryItem | undefined, targetAlbumId?: string): Promise<void> {
    if (!pendingItem) {
      return;
    }

    const desiredAlbumId = pendingItem.albumIds[0];
    if (desiredAlbumId && desiredAlbumId !== targetAlbumId) {
      await moveLibraryItemsToAlbum(desiredAlbumId, [realItem.id]);
    }

    if (!desiredAlbumId && targetAlbumId) {
      await removeLibraryItemsFromAlbum(targetAlbumId, [realItem.id]);
    }

    if (pendingItem.isFavorite) {
      await toggleFavorite(realItem.id);
    }

    if (pendingItem.isTrashed) {
      await moveToTrash(realItem.id);
    }
  }

  async function finalizePendingUploadItems(
    pendingItems: PendingUploadItem[],
    uploadedItems: LibraryItem[],
    targetAlbumId?: string,
  ): Promise<void> {
    const pendingIds = new Set(pendingItems.map((item) => item.id));
    const latestPendingItems = new Map(
      pendingItems.map((pendingItem) => [
        pendingItem.id,
        itemsRef.current.find((item) => item.id === pendingItem.id) ?? pendingItem,
      ]),
    );

    const finalizedItems = uploadedItems.map((uploadedItem, index) => {
      const pendingItem = latestPendingItems.get(pendingItems[index]?.id ?? "");
      return pendingItem
        ? {
            ...uploadedItem,
            albumIds: pendingItem.albumIds,
            isFavorite: pendingItem.isFavorite,
            isTrashed: pendingItem.isTrashed,
          }
        : uploadedItem;
    });

    const nextItems = updateItemsState((current) => [...finalizedItems, ...current.filter((item) => !pendingIds.has(item.id))]);
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    setSelectedItemIds((current) =>
      current
        .map((itemId) => {
          const pendingIndex = pendingItems.findIndex((pendingItem) => pendingItem.id === itemId);
          return pendingIndex >= 0 ? uploadedItems[pendingIndex]?.id : itemId;
        })
        .filter((itemId): itemId is string => Boolean(itemId)),
    );

    for (const [index, uploadedItem] of uploadedItems.entries()) {
      try {
        await syncPendingUploadChoices(uploadedItem, latestPendingItems.get(pendingItems[index]?.id ?? ""), targetAlbumId);
      } catch (caughtError) {
        console.warn("[Discasa upload] Could not apply pending item choices after upload.", caughtError);
      }
    }

    for (const pendingItem of pendingItems) {
      if (pendingItem.uploadPreviewObjectUrl) {
        URL.revokeObjectURL(pendingItem.uploadPreviewObjectUrl);
      }
    }

    removePendingUploadRecords(pendingItems.map((item) => item.id));
    await refreshLibraryAfterUpload(uploadedItems.length, targetAlbumId);
  }

  function getRecoverablePendingUploadRecords(guildId: string, libraryItems: LibraryItem[]): PendingUploadRecord[] {
    if (!guildId) {
      return [];
    }

    const libraryItemIds = new Set(libraryItems.map((item) => item.id));
    const records = readPendingUploadRecords();
    const staleRecordIds = records
      .filter((record) => record.guildId === guildId && libraryItemIds.has(record.id))
      .map((record) => record.id);

    if (staleRecordIds.length > 0) {
      removePendingUploadRecords(staleRecordIds);
    }

    return records.filter((record) => record.guildId === guildId && !libraryItemIds.has(record.id));
  }

  async function resumePendingLocalUploads(records: PendingUploadRecord[]): Promise<void> {
    for (const record of records) {
      const pendingItem = createPendingUploadItemFromRecord(record);
      const targetAlbumId = record.albumIds[0];

      try {
        const result = await uploadLocalFilePaths([record.filePath], targetAlbumId, [record.id]);
        await finalizePendingUploadItems([pendingItem], result.uploaded, targetAlbumId);
      } catch (caughtError) {
        markPendingUploadItemsInterrupted([pendingItem]);
        console.warn("[Discasa upload] Pending local upload could not be resumed.", caughtError);
      }
    }
  }

  async function commitUploadedFiles(files: File[], albumId?: string): Promise<void> {
    const targetAlbumId = albumId ?? (selectedViewRef.current.kind === "album" ? selectedViewRef.current.id : undefined);
    const pendingItems = files.map((file) => {
      const mimeType = file.type || inferMimeTypeFromName(file.name);
      const previewObjectUrl = canUseInstantPreview(mimeType) ? URL.createObjectURL(file) : undefined;
      return createPendingUploadItem({
        name: file.name,
        size: file.size,
        mimeType,
        targetAlbumId,
        previewUrl: previewObjectUrl,
        previewObjectUrl,
      });
    });

    addPendingUploadItems(pendingItems);
    try {
      const result = await uploadFiles(files, targetAlbumId);
      await finalizePendingUploadItems(pendingItems, result.uploaded, targetAlbumId);
    } catch (caughtError) {
      removeFailedPendingUploadItems(pendingItems);
      throw caughtError;
    }
  }

  async function commitUploadedFolderFiles(files: File[]): Promise<void> {
    const groups = new Map<string, File[]>();
    const parentFolderId = selectedViewRef.current.kind === "album" ? selectedViewRef.current.id : null;

    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const folderName = relativePath.split(/[\\/]/).filter(Boolean)[0] ?? "Folder";
      const current = groups.get(folderName) ?? [];
      current.push(file);
      groups.set(folderName, current);
    }

    if (groups.size === 0) {
      return;
    }

    let uploadedCount = 0;
    for (const [folderName, groupFiles] of groups.entries()) {
      const created = await createAlbum({ name: folderName, parentId: parentFolderId });
      const targetAlbumId = created.id;
      const nextAlbums = mergeAlbumRecords(albumsRef.current, [created.album]);
      commitAlbumsState(nextAlbums);
      const pendingItems = groupFiles.map((file) => {
        const mimeType = file.type || inferMimeTypeFromName(file.name);
        const previewObjectUrl = canUseInstantPreview(mimeType) ? URL.createObjectURL(file) : undefined;
        return createPendingUploadItem({
          name: file.name,
          size: file.size,
          mimeType,
          targetAlbumId,
          previewUrl: previewObjectUrl,
          previewObjectUrl,
        });
      });

      addPendingUploadItems(pendingItems);
      try {
        const result = await uploadFiles(groupFiles, targetAlbumId);
        uploadedCount += result.uploaded.length;
        await finalizePendingUploadItems(pendingItems, result.uploaded, targetAlbumId);
      } catch (caughtError) {
        removeFailedPendingUploadItems(pendingItems);
        throw caughtError;
      }
    }

    if (uploadedCount > 0) {
      const [nextItems, nextAlbums] = await Promise.all([getLibraryItems(), getAlbums()]);
      commitItemsState(nextItems);
      commitAlbumsState(nextAlbums);
      setMessage(`${uploadedCount} file(s) added from folder upload.`);
    }
  }

  async function commitUploadedLocalPaths(filePaths: string[], albumId?: string): Promise<void> {
    const targetAlbumId = albumId ?? (selectedViewRef.current.kind === "album" ? selectedViewRef.current.id : undefined);
    const inspectedPaths = await inspectLocalFilePaths(filePaths);
    const folderTargets: LocalFolderUploadTarget[] = [];
    const pendingItems: PendingUploadItem[] = [];
    const clientUploadIds = new Array<string | undefined>(filePaths.length).fill(undefined);
    const pendingRecords: PendingUploadRecord[] = [];

    for (const [index, filePath] of filePaths.entries()) {
      const inspected: LocalPathInspection | null = inspectedPaths[index] ?? null;

      if (inspected?.isDirectory) {
        const created = await createAlbum({ name: inspected.name || getFileNameFromPath(filePath), parentId: targetAlbumId ?? null });
        folderTargets.push({ path: inspected.path, albumId: created.id });
        const nextAlbums = mergeAlbumRecords(albumsRef.current, [created.album]);
        commitAlbumsState(nextAlbums);
        continue;
      }

      if (inspected && !inspected.isFile) {
        continue;
      }

      const sourcePath = inspected?.path ?? filePath;
      const fileName = inspected?.name || getFileNameFromPath(sourcePath);
      const mimeType = inferMimeTypeFromName(fileName);
      const previewUrl = canUseInstantPreview(mimeType) ? convertFileSrc(sourcePath) : undefined;
      const pendingItem = createPendingUploadItem({
        name: fileName,
        size: 0,
        mimeType,
        targetAlbumId,
        previewUrl,
        sourcePath,
      });

      pendingItems.push(pendingItem);
      pendingRecords.push(createPendingUploadRecord(pendingItem, sourcePath));
      clientUploadIds[index] = pendingItem.id;
    }

    upsertPendingUploadRecords(pendingRecords);
    if (pendingItems.length > 0) {
      addPendingUploadItems(pendingItems);
    } else if (folderTargets.length > 0) {
      setMessage(`${folderTargets.length} folder(s) queued.`);
      setError("");
    }

    try {
      const result = await uploadLocalFilePaths(
        filePaths,
        targetAlbumId,
        clientUploadIds,
        folderTargets,
      );
      if (result.albums) {
        commitAlbumsState(result.albums);
      }

      if (pendingItems.length > 0) {
        const uploadedItemsById = new Map(result.uploaded.map((item) => [item.id, item]));
        const pendingUploads = pendingItems
          .map((pendingItem) => uploadedItemsById.get(pendingItem.id) ?? null)
          .filter((item): item is LibraryItem => Boolean(item));
        await finalizePendingUploadItems(pendingItems, pendingUploads, targetAlbumId);
      } else {
        await refreshLibraryAfterUpload(result.uploaded.length, targetAlbumId);
      }

      if (folderTargets.length > 0 && result.uploaded.length > 0) {
        setMessage(`${result.uploaded.length} file(s) added from folder upload.`);
      }
    } catch (caughtError) {
      if (pendingItems.length > 0) {
        markPendingUploadItemsInterrupted(pendingItems);
      }
      throw caughtError;
    }
  }

  async function handleFiles(fileList: FileList | File[] | null, albumId?: string): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setError("");

    try {
      await commitUploadedFiles(Array.from(fileList), albumId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
    }
  }

  async function handleFolderFiles(fileList: FileList | File[] | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setError("");

    try {
      await commitUploadedFolderFiles(Array.from(fileList));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add folder.");
    }
  }

  async function handleNativeFileDrop(filePaths: string[], albumId?: string): Promise<void> {
    if (filePaths.length === 0) return;

    setError("");

    try {
      await commitUploadedLocalPaths(filePaths, albumId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to add files.");
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

      commitItemsState(nextItems);
      commitAlbumsState(nextAlbums);
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
    const pendingItem = itemsRef.current.find((item) => item.id === itemId && isPendingUploadItem(item));

    if (pendingItem) {
      const nextIsFavorite = !pendingItem.isFavorite;
      updateItemsState((current) => current.map((item) => (item.id === itemId ? { ...item, isFavorite: nextIsFavorite } : item)));
      patchPendingUploadRecord(itemId, { isFavorite: nextIsFavorite });
      setMessage(nextIsFavorite ? "File added to favorites." : "File removed from favorites.");
      setError("");
      return;
    }

    const originalItem = itemsRef.current.find((item) => item.id === itemId);
    if (!originalItem) {
      return;
    }

    const optimisticItem = { ...originalItem, isFavorite: !originalItem.isFavorite };
    updateItemInState(optimisticItem);
    setMessage(optimisticItem.isFavorite ? "File added to favorites." : "File removed from favorites.");
    setError("");

    try {
      const response = await toggleFavorite(itemId);
      updateItemInState(response.item);
    } catch (caughtError) {
      updateItemInState(originalItem);
      setError(caughtError instanceof Error ? caughtError.message : "Could not update the favorite state.");
    }
  }

  async function handleMoveItemsToTrash(itemIds: string[]): Promise<void> {
    const uniqueItemIds = Array.from(new Set(itemIds));
    if (uniqueItemIds.length === 0) {
      return;
    }

    const currentItemsById = new Map(itemsRef.current.map((item) => [item.id, item]));
    const existingItemIds = uniqueItemIds.filter((itemId) => currentItemsById.has(itemId));
    if (existingItemIds.length === 0) {
      return;
    }

    const pendingUploadItems = existingItemIds
      .map((itemId) => currentItemsById.get(itemId))
      .filter((item): item is PendingUploadItem => Boolean(item && isPendingUploadItem(item)));
    const pendingUploadState = new Map(pendingUploadItems.map((item) => [item.id, item.isTrashed]));
    const realItemIds = existingItemIds.filter((itemId) => {
      const item = currentItemsById.get(itemId);
      return item && !isPendingUploadItem(item);
    });
    const movingItemIdSet = new Set(existingItemIds);
    const previousItems = itemsRef.current;
    const previousAlbums = albumsRef.current;

    const optimisticItems = updateItemsState((current) =>
      current.map((item) => (movingItemIdSet.has(item.id) ? { ...item, isTrashed: true } : item)),
    );
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, optimisticItems));
    for (const pendingItem of pendingUploadItems) {
      patchPendingUploadRecord(pendingItem.id, { isTrashed: true });
    }

    setMessage(`${existingItemIds.length} file(s) moved to the trash.`);
    setError("");

    if (realItemIds.length === 0) {
      return;
    }

    try {
      const response = await moveItemsToTrash(realItemIds);
      const updatedItemsById = new Map(response.items.map((item) => [item.id, item]));
      const nextItems = updateItemsState((current) => current.map((item) => updatedItemsById.get(item.id) ?? item));
      commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    } catch (caughtError) {
      commitItemsState(previousItems);
      commitAlbumsState(previousAlbums);
      for (const [pendingItemId, wasTrashed] of pendingUploadState) {
        patchPendingUploadRecord(pendingItemId, { isTrashed: wasTrashed });
      }
      setError(caughtError instanceof Error ? caughtError.message : "Could not move the files to the trash.");
    }
  }

  async function handleMoveToTrash(itemId: string): Promise<void> {
    await handleMoveItemsToTrash([itemId]);
  }

  async function handleRestoreFromTrash(itemId: string): Promise<void> {
    if (itemsRef.current.some((item) => item.id === itemId && isPendingUploadItem(item))) {
      const nextItems = updateItemsState((current) => current.map((item) => (item.id === itemId ? { ...item, isTrashed: false } : item)));
      commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
      patchPendingUploadRecord(itemId, { isTrashed: false });
      setMessage("File restored.");
      setError("");
      return;
    }

    const originalItem = itemsRef.current.find((item) => item.id === itemId);
    if (!originalItem) {
      return;
    }

    const optimisticItem = { ...originalItem, isTrashed: false };
    const optimisticItems = updateItemsState((current) => current.map((item) => (item.id === itemId ? optimisticItem : item)));
    const previousAlbums = albumsRef.current;
    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, optimisticItems));
    setMessage("File restored.");
    setError("");

    try {
      const response = await restoreFromTrash(itemId);
      updateItemInState(response.item);
      commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, itemsRef.current));
    } catch (caughtError) {
      updateItemInState(originalItem);
      commitAlbumsState(previousAlbums);
      setError(caughtError instanceof Error ? caughtError.message : "Could not restore the file.");
    }
  }

  async function handleDownloadSelectedItems(targets: LibraryItem[]): Promise<void> {
    const downloadableItems = targets.filter((item) => item.attachmentStatus !== "missing");

    if (downloadableItems.length === 0) {
      setError("Selected files are unavailable for download.");
      return;
    }

    setError("");

    try {
      await downloadLibraryItems(downloadableItems);
      setMessage(`${downloadableItems.length} file(s) sent to downloads.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not download the selected files.");
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
    const pendingItem = itemsRef.current.find(
      (item): item is PendingUploadItem => item.id === itemId && isPendingUploadItem(item),
    );

    if (pendingItem) {
      if (pendingItem.uploadPreviewObjectUrl) {
        URL.revokeObjectURL(pendingItem.uploadPreviewObjectUrl);
      }
      removePendingUploadRecords([itemId]);
      removeItemFromState(itemId);
      setMessage("Pending upload removed from the view.");
      return Promise.resolve();
    }

    openDeleteFileModal(itemId);
    return Promise.resolve();
  }

  async function handleDeleteFileConfirm(): Promise<void> {
    if (!deleteFileTarget) return;

    const originalItem = itemsRef.current.find((item) => item.id === deleteFileTarget.id);
    if (!originalItem) {
      setDeleteFileTarget(null);
      return;
    }

    const originalIndex = itemsRef.current.findIndex((item) => item.id === deleteFileTarget.id);
    const previousAlbums = albumsRef.current;
    const nextItems = updateItemsState((current) => current.filter((item) => item.id !== deleteFileTarget.id));

    commitAlbumsState(recalculateAlbumItemCounts(albumsRef.current, nextItems));
    setSelectedItemIds((current) => current.filter((id) => id !== deleteFileTarget.id));
    if (selectionAnchorRef.current === deleteFileTarget.id) {
      selectionAnchorRef.current = null;
    }
    setMessage("File permanently deleted.");
    setError("");
    setDeleteFileTarget(null);
    setDeleteFileError("");

    try {
      await deleteLibraryItem(deleteFileTarget.id);
      void loadLocalStorageStatus();
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Could not delete the file.";
      updateItemsState((current) => {
        if (current.some((item) => item.id === originalItem.id)) {
          return current;
        }

        const nextItemsWithOriginal = [...current];
        nextItemsWithOriginal.splice(Math.max(0, originalIndex), 0, originalItem);
        return nextItemsWithOriginal;
      });
      commitAlbumsState(previousAlbums);
      setDeleteFileError(nextError);
      setError(nextError);
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

  function handleChangeWatchedFolderEnabled(nextValue: boolean): void {
    setWatchedFolderEnabled(nextValue);
    void persistConfigPatch({ watchedFolderEnabled: nextValue });
  }

  function handleChangeWatchedFolderPath(nextValue: string): void {
    setWatchedFolderPath(nextValue);
    void persistConfigPatch({ watchedFolderPath: nextValue.trim().length > 0 ? nextValue : null });
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

  async function handleChooseWatchedFolder(): Promise<void> {
    setIsChoosingMirrorFolder(true);

    try {
      const selectedPath = await chooseWatchedFolder();
      if (!selectedPath) {
        return;
      }

      setWatchedFolderPath(selectedPath);
      setWatchedFolderEnabled(true);
      void persistConfigPatch({
        watchedFolderEnabled: true,
        watchedFolderPath: selectedPath,
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not choose the watched folder.");
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
      commitItemsState(await getLibraryItems());

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

  async function handleStartDragging(event: ReactPointerEvent<HTMLElement>): Promise<void> {
    if (!event.isPrimary || event.button !== 0) return;

    event.preventDefault();

    if (event.pointerType !== "mouse") {
      const startScreenX = event.screenX;
      const startScreenY = event.screenY;

      try {
        const startPosition = await appWindow.outerPosition();
        let isApplyingMove = false;

        const handlePointerMove = async (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId || isApplyingMove) {
            return;
          }

          moveEvent.preventDefault();
          isApplyingMove = true;

          try {
            await appWindow.setPosition(
              new PhysicalPosition(
                Math.round(startPosition.x + moveEvent.screenX - startScreenX),
                Math.round(startPosition.y + moveEvent.screenY - startScreenY),
              ),
            );
          } finally {
            isApplyingMove = false;
          }
        };

        const stopTouchDrag = () => {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", stopTouchDrag);
          window.removeEventListener("pointercancel", stopTouchDrag);
        };

        window.addEventListener("pointermove", handlePointerMove, { passive: false });
        window.addEventListener("pointerup", stopTouchDrag, { once: true });
        window.addEventListener("pointercancel", stopTouchDrag, { once: true });
      } catch {
        return;
      }

      return;
    }

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
            showWatchedCollection={watchedFolderEnabled}
            showDuplicateCollection={duplicateItemIds.length > 0}
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
            folders={visibleFolders}
            attachmentWarnings={attachmentWarnings}
            selectedItemIds={selectedItemIds}
            draggingItemIds={draggingLibraryItemIds}
            currentAlbumId={selectedView.kind === "album" ? selectedView.id : null}
            parentFolderId={currentFolder?.parentId ?? null}
            canMoveSelectedItems={albums.length > 0}
            isBusy={isLibraryInteractionBusy}
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
            onRequestUpload={() => {
              void requestUpload();
            }}
            onRequestFolderUpload={() => {
              void requestFolderUpload();
            }}
            onRequestCreateFolder={openCreateFolderModal}
            onOpenFolder={(folderId) => {
              setSelectedView({ kind: "album", id: folderId });
              setSelectedItemIds([]);
              selectionAnchorRef.current = null;
            }}
            onGoUpFolder={() => {
              if (currentFolder?.parentId) {
                setSelectedView({ kind: "album", id: currentFolder.parentId });
                setSelectedItemIds([]);
                selectionAnchorRef.current = null;
              }
            }}
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
            onMoveItemsToTrash={handleMoveItemsToTrash}
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

      <input
        ref={folderUploadInputRef}
        id="discasa-folder-upload-input"
        className="hidden-upload-input"
        type="file"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          void handleFolderFiles(event.currentTarget.files);
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
          title={createAlbumParentId ? "New folder" : "New album"}
          description={
            createAlbumParentId
              ? "Choose a name for the new folder inside the current album."
              : "Choose a name for the new folder in the Albums section."
          }
          label={createAlbumParentId ? "Folder name" : "Album name"}
          placeholder={createAlbumParentId ? "Enter the folder name" : "Enter the album name"}
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
          watchedFolderEnabled={watchedFolderEnabled}
          watchedFolderPath={watchedFolderPath}
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
          onChangeWatchedFolderEnabled={handleChangeWatchedFolderEnabled}
          onChangeWatchedFolderPath={handleChangeWatchedFolderPath}
          onChangeLanguage={handleChangeLanguage}
          onChooseLocalMirrorFolder={() => {
            void handleChooseLocalMirrorFolder();
          }}
          onChooseWatchedFolder={() => {
            void handleChooseWatchedFolder();
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
