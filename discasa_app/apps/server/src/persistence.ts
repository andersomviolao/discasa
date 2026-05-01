import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Stats } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  DISCASA_DEFAULT_CONFIG,
  type AlbumRecord,
  type DiscasaConfig,
  type FolderMembership,
  type FolderNode,
  type LibraryItem,
  type LibraryItemIndex,
  type LibraryItemOriginalSource,
  type LibraryItemSavedMediaEdit,
  type LibraryItemStorageManifest,
  type LibraryItemStoragePart,
  type LocalStorageStatus,
  type PersistedConfigSnapshot,
  type PersistedFolderSnapshot,
  type PersistedIndexSnapshot,
  type SaveLibraryItemMediaEditInput,
} from "@discasa/shared";
import { logger } from "./logger";

type PersistedFolderNode = FolderNode;
type PersistedFolderMembership = FolderMembership;
type PersistedItem = LibraryItemIndex;

export type ActiveStorageContext = {
  guildId: string;
  guildName: string;
  categoryId: string;
  categoryName: string;
  driveChannelId: string;
  driveChannelName: string;
  indexChannelId: string;
  indexChannelName: string;
  folderChannelId: string;
  folderChannelName: string;
  trashChannelId: string;
  trashChannelName: string;
  configChannelId: string;
  configChannelName: string;
};

export type LocalSourceFile = {
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  modifiedAt: string;
};

export type UploadedFileRecord = {
  itemId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  guildId: string;
  attachmentUrl: string;
  uploadedAt?: string;
  storageChannelId?: string;
  storageMessageId?: string;
  storageManifest?: LibraryItemStorageManifest | null;
};

export type LocalMirrorImportCandidate = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  modifiedAt: string;
};

export type LocalMirrorImportScan = {
  candidates: LocalMirrorImportCandidate[];
  scannedFileCount: number;
  skippedFileCount: number;
};

type LegacyPersistedAlbum = {
  id: string;
  name: string;
};

type LegacyPersistedIndexSnapshot = {
  version: 1;
  albums: LegacyPersistedAlbum[];
  items: LibraryItem[];
};

type LegacyActiveStorage = Omit<ActiveStorageContext, "folderChannelId" | "folderChannelName" | "configChannelId" | "configChannelName"> &
  Partial<Pick<ActiveStorageContext, "folderChannelId" | "folderChannelName" | "configChannelId" | "configChannelName">>;

type LegacyMockDatabase = {
  albums?: LegacyPersistedAlbum[];
  items?: LibraryItem[];
  config?: DiscasaConfig;
  activeStorage?: LegacyActiveStorage | null;
};

type MockDatabase = {
  folders: PersistedFolderNode[];
  memberships: PersistedFolderMembership[];
  items: PersistedItem[];
  config: DiscasaConfig;
  activeStorage: ActiveStorageContext | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDirectoryName = "Discasa";
const legacyDataDir = path.resolve(__dirname, "../.discasa-data");
const legacyDataFile = path.join(legacyDataDir, "mock-db.json");
const legacyAuthFile = path.join(legacyDataDir, "auth.json");
const legacyCacheDir = path.join(legacyDataDir, "cache");
const legacyDefaultLocalMirrorDir = path.join(legacyCacheDir, "files");
const legacyThumbnailCacheDir = path.join(legacyCacheDir, "thumbnails");

function getRoamingAppDataRoot(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }

  return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
}

function getLocalAppDataRoot(): string {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches");
  }

  return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
}

const dataDir = path.join(getRoamingAppDataRoot(), appDirectoryName);
const dataFile = path.join(dataDir, "mock-db.json");
const authFile = path.join(dataDir, "auth.json");
const cacheDir = path.join(getLocalAppDataRoot(), appDirectoryName, "Cache");
const defaultLocalMirrorDir = path.join(cacheDir, "files");
const thumbnailCacheDir = path.join(cacheDir, "thumbnails");
const apiBaseUrl = "http://localhost:3001";
const LOCAL_MIRROR_IMPORT_STABLE_MS = 3000;
let didAttemptLegacyStorageMigration = false;

function areSamePath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);

  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function normalizePathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function copyFileIfDestinationMissing(sourcePath: string, targetPath: string): void {
  if (!hasReadableFile(sourcePath) || hasReadableFile(targetPath)) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  } catch (error) {
    logger.warn("[Discasa storage] Could not migrate a legacy storage file.", error);
  }
}

function copyDirectoryContentsIfDestinationMissing(sourceDir: string, targetDir: string): void {
  if (!hasDirectory(sourceDir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        copyDirectoryContentsIfDestinationMissing(sourcePath, targetPath);
        continue;
      }

      if (entry.isFile()) {
        copyFileIfDestinationMissing(sourcePath, targetPath);
      }
    }
  } catch (error) {
    logger.warn("[Discasa storage] Could not migrate a legacy cache folder.", error);
  }
}

function migrateLegacyStorageIfNeeded(): void {
  if (didAttemptLegacyStorageMigration || areSamePath(legacyDataDir, dataDir)) {
    return;
  }

  didAttemptLegacyStorageMigration = true;
  copyFileIfDestinationMissing(legacyDataFile, dataFile);
  copyFileIfDestinationMissing(legacyAuthFile, authFile);
  copyDirectoryContentsIfDestinationMissing(legacyDefaultLocalMirrorDir, defaultLocalMirrorDir);
  copyDirectoryContentsIfDestinationMissing(legacyThumbnailCacheDir, thumbnailCacheDir);
}

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(thumbnailCacheDir, { recursive: true });
  migrateLegacyStorageIfNeeded();
}

type PersistedDiscordUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

type PersistedAuthState = {
  authenticated: boolean;
  discordAccessToken: string | null;
  discordRefreshToken: string | null;
  user: PersistedDiscordUser | null;
};

type SessionLike = {
  authenticated?: boolean;
  discordAccessToken?: string;
  discordRefreshToken?: string;
  user?: PersistedDiscordUser | null;
};

function createDefaultAuthState(): PersistedAuthState {
  return {
    authenticated: false,
    discordAccessToken: null,
    discordRefreshToken: null,
    user: null,
  };
}

function normalizePersistedUser(raw: unknown): PersistedDiscordUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (typeof entry.id !== "string" || typeof entry.username !== "string") {
    return null;
  }

  return {
    id: entry.id,
    username: entry.username,
    avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : null,
  };
}

function normalizeAuthState(raw: unknown): PersistedAuthState {
  const fallback = createDefaultAuthState();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const entry = raw as Record<string, unknown>;
  const user = normalizePersistedUser(entry.user);
  const accessToken =
    typeof entry.discordAccessToken === "string" && entry.discordAccessToken.length > 0
      ? entry.discordAccessToken
      : null;
  const refreshToken =
    typeof entry.discordRefreshToken === "string" && entry.discordRefreshToken.length > 0
      ? entry.discordRefreshToken
      : null;
  const authenticated = entry.authenticated === true && Boolean(user && accessToken);

  return {
    authenticated,
    discordAccessToken: authenticated ? accessToken : null,
    discordRefreshToken: authenticated ? refreshToken : null,
    user: authenticated ? user : null,
  };
}

function loadPersistedAuthState(): PersistedAuthState {
  ensureDataDir();

  if (!fs.existsSync(authFile)) {
    const next = createDefaultAuthState();
    fs.writeFileSync(authFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  try {
    const raw = fs.readFileSync(authFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeAuthState(parsed);
    fs.writeFileSync(authFile, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  } catch {
    const next = createDefaultAuthState();
    fs.writeFileSync(authFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}

const persistedAuthState = loadPersistedAuthState();

function savePersistedAuthState(): void {
  ensureDataDir();
  fs.writeFileSync(authFile, JSON.stringify(persistedAuthState, null, 2), "utf8");
}

export function setPersistedAuthSession(input: {
  accessToken: string;
  refreshToken?: string;
  user: PersistedDiscordUser;
}): void {
  persistedAuthState.authenticated = true;
  persistedAuthState.discordAccessToken = input.accessToken;
  persistedAuthState.discordRefreshToken = input.refreshToken ?? null;
  persistedAuthState.user = {
    id: input.user.id,
    username: input.user.username,
    avatarUrl: input.user.avatarUrl ?? null,
  };

  savePersistedAuthState();
}

export function hydrateSessionFromPersistedAuth(session: SessionLike): boolean {
  if (!persistedAuthState.authenticated || !persistedAuthState.discordAccessToken || !persistedAuthState.user) {
    return false;
  }

  session.authenticated = true;
  session.discordAccessToken = persistedAuthState.discordAccessToken;
  session.discordRefreshToken = persistedAuthState.discordRefreshToken ?? undefined;
  session.user = {
    id: persistedAuthState.user.id,
    username: persistedAuthState.user.username,
    avatarUrl: persistedAuthState.user.avatarUrl ?? null,
  };

  return true;
}

export function clearPersistedAuthSession(): void {
  persistedAuthState.authenticated = false;
  persistedAuthState.discordAccessToken = null;
  persistedAuthState.discordRefreshToken = null;
  persistedAuthState.user = null;

  savePersistedAuthState();
}

function cloneDefaultConfig(): DiscasaConfig {
  return { ...DISCASA_DEFAULT_CONFIG };
}

function createDefaultDatabase(): MockDatabase {
  return {
    folders: [],
    memberships: [],
    items: [],
    config: cloneDefaultConfig(),
    activeStorage: null,
  };
}

function clampRotationToRightAngles(value: number): number {
  const rounded = Math.round(value / 90) * 90;
  return ((rounded % 360) + 360) % 360;
}

function hasMeaningfulSavedMediaEdit(input: SaveLibraryItemMediaEditInput): boolean {
  return clampRotationToRightAngles(input.rotationDegrees) !== 0 || Boolean(input.hasCrop);
}

function normalizeLocalMirrorPath(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const resolved = path.resolve(trimmed);

  return areSamePath(resolved, legacyDefaultLocalMirrorDir) || areSamePath(resolved, defaultLocalMirrorDir)
    ? null
    : resolved;
}

function normalizeLanguage(raw: unknown): DiscasaConfig["language"] {
  return raw === "pt" ? "pt" : "en";
}

function normalizeDiscasaConfig(raw: unknown): DiscasaConfig {
  const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback = DISCASA_DEFAULT_CONFIG;

  return {
    accentColor:
      typeof entry.accentColor === "string" && entry.accentColor.trim().length > 0
        ? entry.accentColor.trim().toUpperCase()
        : fallback.accentColor,
    minimizeToTray: typeof entry.minimizeToTray === "boolean" ? entry.minimizeToTray : fallback.minimizeToTray,
    closeToTray: typeof entry.closeToTray === "boolean" ? entry.closeToTray : fallback.closeToTray,
    thumbnailZoomPercent:
      typeof entry.thumbnailZoomPercent === "number" && Number.isFinite(entry.thumbnailZoomPercent)
        ? Math.round(entry.thumbnailZoomPercent)
        : fallback.thumbnailZoomPercent,
    galleryDisplayMode: entry.galleryDisplayMode === "square" ? "square" : fallback.galleryDisplayMode,
    viewerMouseWheelBehavior:
      entry.viewerMouseWheelBehavior === "navigate" ? "navigate" : fallback.viewerMouseWheelBehavior,
    mediaPreviewVolume:
      typeof entry.mediaPreviewVolume === "number" && Number.isFinite(entry.mediaPreviewVolume)
        ? Math.min(1, Math.max(0, entry.mediaPreviewVolume))
        : fallback.mediaPreviewVolume,
    sidebarCollapsed: typeof entry.sidebarCollapsed === "boolean" ? entry.sidebarCollapsed : fallback.sidebarCollapsed,
    localMirrorEnabled:
      typeof entry.localMirrorEnabled === "boolean" ? entry.localMirrorEnabled : fallback.localMirrorEnabled,
    localMirrorPath: normalizeLocalMirrorPath(entry.localMirrorPath),
    language: normalizeLanguage(entry.language),
  };
}

function isLegacyActiveStorage(raw: unknown): raw is LegacyActiveStorage {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;

  return [
    "guildId",
    "guildName",
    "categoryId",
    "categoryName",
    "driveChannelId",
    "driveChannelName",
    "indexChannelId",
    "indexChannelName",
    "trashChannelId",
    "trashChannelName",
  ].every((key) => typeof entry[key] === "string" && String(entry[key]).length > 0);
}

function migrateLegacyActiveStorage(raw: LegacyActiveStorage): ActiveStorageContext {
  return {
    guildId: raw.guildId,
    guildName: raw.guildName,
    categoryId: raw.categoryId,
    categoryName: raw.categoryName,
    driveChannelId: raw.driveChannelId,
    driveChannelName: raw.driveChannelName,
    indexChannelId: raw.indexChannelId,
    indexChannelName: raw.indexChannelName,
    folderChannelId: raw.folderChannelId && raw.folderChannelId.length > 0 ? raw.folderChannelId : raw.indexChannelId,
    folderChannelName: raw.folderChannelName && raw.folderChannelName.length > 0 ? raw.folderChannelName : "discasa-folder",
    trashChannelId: raw.trashChannelId,
    trashChannelName: raw.trashChannelName,
    configChannelId: raw.configChannelId && raw.configChannelId.length > 0 ? raw.configChannelId : raw.indexChannelId,
    configChannelName: raw.configChannelName && raw.configChannelName.length > 0 ? raw.configChannelName : "discasa-config",
  };
}

function normalizeFolderNode(raw: unknown): PersistedFolderNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.position !== "number" ||
    typeof entry.createdAt !== "string" ||
    typeof entry.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: entry.id,
    type: "album",
    name: entry.name,
    parentId: typeof entry.parentId === "string" ? entry.parentId : null,
    position: entry.position,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function normalizeFolderMembership(raw: unknown): PersistedFolderMembership | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (typeof entry.folderId !== "string" || typeof entry.itemId !== "string" || typeof entry.addedAt !== "string") {
    return null;
  }

  return {
    folderId: entry.folderId,
    itemId: entry.itemId,
    addedAt: entry.addedAt,
  };
}

function normalizeStoragePart(raw: unknown): LibraryItemStoragePart | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.index !== "number" ||
    !Number.isInteger(entry.index) ||
    entry.index < 0 ||
    typeof entry.fileName !== "string" ||
    entry.fileName.length === 0 ||
    typeof entry.size !== "number" ||
    entry.size < 0 ||
    typeof entry.sha256 !== "string" ||
    typeof entry.attachmentUrl !== "string" ||
    entry.attachmentUrl.length === 0 ||
    typeof entry.storageChannelId !== "string" ||
    entry.storageChannelId.length === 0 ||
    typeof entry.storageMessageId !== "string" ||
    entry.storageMessageId.length === 0
  ) {
    return null;
  }

  return {
    index: entry.index,
    fileName: entry.fileName,
    size: entry.size,
    sha256: entry.sha256,
    attachmentUrl: entry.attachmentUrl,
    storageChannelId: entry.storageChannelId,
    storageMessageId: entry.storageMessageId,
  };
}

function normalizeStorageManifest(raw: unknown): LibraryItemStorageManifest | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (
    entry.mode !== "chunked" ||
    entry.version !== 1 ||
    typeof entry.chunkSize !== "number" ||
    entry.chunkSize <= 0 ||
    typeof entry.totalChunks !== "number" ||
    !Number.isInteger(entry.totalChunks) ||
    entry.totalChunks <= 0 ||
    typeof entry.totalSize !== "number" ||
    entry.totalSize < 0 ||
    typeof entry.sha256 !== "string" ||
    !Array.isArray(entry.parts)
  ) {
    return null;
  }

  const parts = entry.parts
    .map((part) => normalizeStoragePart(part))
    .filter((part): part is LibraryItemStoragePart => Boolean(part))
    .sort((left, right) => left.index - right.index);

  if (parts.length !== entry.totalChunks || parts.some((part, index) => part.index !== index)) {
    return null;
  }

  return {
    mode: "chunked",
    version: 1,
    chunkSize: entry.chunkSize,
    totalChunks: entry.totalChunks,
    totalSize: entry.totalSize,
    sha256: entry.sha256,
    parts,
  };
}

function normalizeOriginalSource(raw: unknown): LibraryItemOriginalSource | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (typeof entry.attachmentUrl !== "string" || entry.attachmentUrl.length === 0) {
    return null;
  }

  return {
    attachmentUrl: entry.attachmentUrl,
    storageChannelId:
      typeof entry.storageChannelId === "string" && entry.storageChannelId.length > 0 ? entry.storageChannelId : undefined,
    storageMessageId:
      typeof entry.storageMessageId === "string" && entry.storageMessageId.length > 0 ? entry.storageMessageId : undefined,
    storageManifest: normalizeStorageManifest(entry.storageManifest),
  };
}

function normalizeSavedMediaEdit(raw: unknown): LibraryItemSavedMediaEdit | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.rotationDegrees !== "number" ||
    !Number.isFinite(entry.rotationDegrees) ||
    typeof entry.hasCrop !== "boolean" ||
    typeof entry.savedAt !== "string"
  ) {
    return null;
  }

  return {
    rotationDegrees: clampRotationToRightAngles(entry.rotationDegrees),
    hasCrop: entry.hasCrop,
    savedAt: entry.savedAt,
  };
}

function normalizeAttachmentStatus(raw: unknown): "ready" | "missing" {
  return raw === "missing" ? "missing" : "ready";
}

function normalizeLibraryItemIndex(raw: unknown): PersistedItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.size !== "number" ||
    typeof entry.mimeType !== "string" ||
    typeof entry.status !== "string" ||
    typeof entry.guildId !== "string" ||
    typeof entry.uploadedAt !== "string" ||
    typeof entry.attachmentUrl !== "string" ||
    typeof entry.isFavorite !== "boolean" ||
    typeof entry.isTrashed !== "boolean"
  ) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    status: entry.status,
    guildId: entry.guildId,
    uploadedAt: entry.uploadedAt,
    attachmentUrl: entry.attachmentUrl,
    attachmentStatus: normalizeAttachmentStatus(entry.attachmentStatus),
    isFavorite: entry.isFavorite,
    isTrashed: entry.isTrashed,
    storageChannelId: typeof entry.storageChannelId === "string" && entry.storageChannelId.length > 0 ? entry.storageChannelId : undefined,
    storageMessageId: typeof entry.storageMessageId === "string" && entry.storageMessageId.length > 0 ? entry.storageMessageId : undefined,
    storageManifest: normalizeStorageManifest(entry.storageManifest),
    originalSource: normalizeOriginalSource(entry.originalSource),
    savedMediaEdit: normalizeSavedMediaEdit(entry.savedMediaEdit),
  };
}

function normalizeLegacyHydratedLibraryItem(raw: unknown): LibraryItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.size !== "number" ||
    typeof entry.mimeType !== "string" ||
    typeof entry.status !== "string" ||
    typeof entry.guildId !== "string" ||
    !Array.isArray(entry.albumIds) ||
    typeof entry.uploadedAt !== "string" ||
    typeof entry.attachmentUrl !== "string" ||
    typeof entry.isFavorite !== "boolean" ||
    typeof entry.isTrashed !== "boolean"
  ) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    status: entry.status,
    guildId: entry.guildId,
    albumIds: entry.albumIds.filter((value): value is string => typeof value === "string"),
    uploadedAt: entry.uploadedAt,
    attachmentUrl: entry.attachmentUrl,
    attachmentStatus: normalizeAttachmentStatus(entry.attachmentStatus),
    isFavorite: entry.isFavorite,
    isTrashed: entry.isTrashed,
    storageChannelId: typeof entry.storageChannelId === "string" && entry.storageChannelId.length > 0 ? entry.storageChannelId : undefined,
    storageMessageId: typeof entry.storageMessageId === "string" && entry.storageMessageId.length > 0 ? entry.storageMessageId : undefined,
    storageManifest: normalizeStorageManifest(entry.storageManifest),
    originalSource: normalizeOriginalSource(entry.originalSource),
    savedMediaEdit: normalizeSavedMediaEdit(entry.savedMediaEdit),
  };
}

function toIndexItemFromLegacyHydrated(item: LibraryItem): PersistedItem {
  const { albumIds: _albumIds, ...indexItem } = item;
  return {
    ...indexItem,
    attachmentStatus: normalizeAttachmentStatus(indexItem.attachmentStatus),
  };
}

function normalizeItemIndexFromAnyRaw(raw: unknown): PersistedItem | null {
  const direct = normalizeLibraryItemIndex(raw);
  if (direct) {
    return direct;
  }

  const legacy = normalizeLegacyHydratedLibraryItem(raw);
  return legacy ? toIndexItemFromLegacyHydrated(legacy) : null;
}

function createFolderMembershipFromLegacyData(albums: LegacyPersistedAlbum[], items: LibraryItem[]): {
  folders: PersistedFolderNode[];
  memberships: PersistedFolderMembership[];
  nextItems: PersistedItem[];
} {
  const now = new Date().toISOString();
  const folders = albums.map((album, index) => ({
    id: album.id,
    type: "album" as const,
    name: album.name,
    parentId: null,
    position: index,
    createdAt: now,
    updatedAt: now,
  }));

  const memberships: PersistedFolderMembership[] = [];
  const nextItems = items.map((item) => {
    for (const folderId of item.albumIds) {
      memberships.push({
        folderId,
        itemId: item.id,
        addedAt: item.uploadedAt,
      });
    }

    return toIndexItemFromLegacyHydrated(item);
  });

  return {
    folders,
    memberships,
    nextItems,
  };
}

function normalizeDatabase(raw: Partial<MockDatabase & LegacyMockDatabase> | null | undefined): MockDatabase {
  const fallback = createDefaultDatabase();
  const items = Array.isArray(raw?.items)
    ? raw.items.map((entry) => normalizeItemIndexFromAnyRaw(entry)).filter((entry): entry is PersistedItem => Boolean(entry))
    : [];

  const config = normalizeDiscasaConfig(raw?.config);
  const activeStorage = isLegacyActiveStorage(raw?.activeStorage) ? migrateLegacyActiveStorage(raw.activeStorage) : fallback.activeStorage;

  const foldersFromSnapshot = Array.isArray(raw?.folders)
    ? raw.folders.map((entry) => normalizeFolderNode(entry)).filter((entry): entry is PersistedFolderNode => Boolean(entry))
    : null;

  const membershipsFromSnapshot = Array.isArray(raw?.memberships)
    ? raw.memberships.map((entry) => normalizeFolderMembership(entry)).filter((entry): entry is PersistedFolderMembership => Boolean(entry))
    : null;

  if (foldersFromSnapshot && membershipsFromSnapshot) {
    const folderIds = new Set(foldersFromSnapshot.map((folder) => folder.id));
    const itemIds = new Set(items.map((item) => item.id));

    return {
      folders: foldersFromSnapshot.sort((left, right) => left.position - right.position),
      memberships: membershipsFromSnapshot.filter(
        (membership) => folderIds.has(membership.folderId) && itemIds.has(membership.itemId),
      ),
      items,
      config,
      activeStorage,
    };
  }

  const legacyAlbums = Array.isArray(raw?.albums)
    ? raw.albums
        .filter((entry): entry is LegacyPersistedAlbum => Boolean(entry && typeof entry.id === "string" && typeof entry.name === "string"))
        .map((entry) => ({ id: entry.id, name: entry.name }))
    : [];

  const legacyItems = Array.isArray(raw?.items)
    ? raw.items.map((entry) => normalizeLegacyHydratedLibraryItem(entry)).filter((entry): entry is LibraryItem => Boolean(entry))
    : [];

  if (legacyAlbums.length > 0 || legacyItems.length > 0) {
    const migrated = createFolderMembershipFromLegacyData(legacyAlbums, legacyItems);
    return {
      folders: migrated.folders,
      memberships: migrated.memberships,
      items: migrated.nextItems,
      config,
      activeStorage,
    };
  }

  return {
    folders: [],
    memberships: [],
    items,
    config,
    activeStorage,
  };
}

function loadDatabase(): MockDatabase {
  ensureDataDir();

  if (!fs.existsSync(dataFile)) {
    const next = createDefaultDatabase();
    fs.writeFileSync(dataFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<MockDatabase & LegacyMockDatabase>;
    const normalized = normalizeDatabase(parsed);
    fs.writeFileSync(dataFile, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  } catch {
    const next = createDefaultDatabase();
    fs.writeFileSync(dataFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}

const database = loadDatabase();

function saveDatabase(): void {
  ensureDataDir();
  fs.writeFileSync(dataFile, JSON.stringify(database, null, 2), "utf8");
}

function sanitizeManagedFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return (sanitized || "file").slice(0, 160);
}

function getResolvedLocalMirrorPath(config = database.config): string {
  return config.localMirrorPath ? path.resolve(config.localMirrorPath) : defaultLocalMirrorDir;
}

function getManagedLocalFileName(item: Pick<PersistedItem, "id" | "name">): string {
  return `${item.id}-${sanitizeManagedFileName(item.name)}`;
}

function getLocalMirrorFilePath(item: Pick<PersistedItem, "id" | "name">, rootPath = getResolvedLocalMirrorPath()): string {
  return path.join(rootPath, getManagedLocalFileName(item));
}

function getThumbnailCacheFilePath(item: Pick<PersistedItem, "id" | "name">): string {
  return path.join(thumbnailCacheDir, getManagedLocalFileName(item));
}

function inferMimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const knownTypes: Record<string, string> = {
    ".apng": "image/apng",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".weba": "audio/webm",
    ".avi": "video/x-msvideo",
    ".m4v": "video/x-m4v",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".ogv": "video/ogg",
    ".webm": "video/webm",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
  };

  return knownTypes[extension] ?? "application/octet-stream";
}

function hasReadableFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function hasDirectory(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function needsLocalMirrorPathSelection(config = database.config): boolean {
  return Boolean(config.localMirrorEnabled && config.localMirrorPath && !hasDirectory(getResolvedLocalMirrorPath(config)));
}

function removeFileIfExists(filePath: string): void {
  try {
    if (hasReadableFile(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.warn("[Discasa local cache] Could not remove a managed local file.", error);
  }
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeManagedFile(filePath: string, buffer: Buffer): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, buffer);
}

function copyOrMoveManagedFile(sourcePath: string, targetPath: string): void {
  if (!hasReadableFile(sourcePath)) {
    return;
  }

  ensureParentDir(targetPath);

  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : "";
    if (code !== "EXDEV") {
      throw error;
    }

    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function isPreviewCacheEligible(item: Pick<PersistedItem, "mimeType">): boolean {
  return item.mimeType.startsWith("image/");
}

function isDownloadableAttachmentUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function hasChunkedStorage(item: Pick<PersistedItem, "storageManifest">): item is Pick<PersistedItem, "storageManifest"> & {
  storageManifest: LibraryItemStorageManifest;
} {
  return item.storageManifest?.mode === "chunked";
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function findPersistedItem(itemId: string): PersistedItem | null {
  return database.items.find((item) => item.id === itemId) ?? null;
}

function createRuntimeLibraryUrls(item: PersistedItem): Pick<LibraryItem, "contentUrl" | "thumbnailUrl" | "localMirrorAvailable"> {
  const encodedId = encodeURIComponent(item.id);
  const contentUrl = `${apiBaseUrl}/api/library/${encodedId}/content`;

  return {
    contentUrl,
    thumbnailUrl: isPreviewCacheEligible(item) ? `${apiBaseUrl}/api/library/${encodedId}/thumbnail` : contentUrl,
    localMirrorAvailable: hasReadableFile(getLocalMirrorFilePath(item)),
  };
}

function removeManagedFilesForItem(item: PersistedItem): void {
  removeFileIfExists(getLocalMirrorFilePath(item));
  removeFileIfExists(getThumbnailCacheFilePath(item));
}

function deleteLocalMirrorFiles(rootPath = getResolvedLocalMirrorPath()): void {
  for (const item of database.items) {
    removeFileIfExists(getLocalMirrorFilePath(item, rootPath));
  }
}

function moveLocalMirrorFiles(previousRootPath: string, nextRootPath: string): void {
  if (path.resolve(previousRootPath) === path.resolve(nextRootPath)) {
    return;
  }

  for (const item of database.items) {
    const previousFilePath = getLocalMirrorFilePath(item, previousRootPath);
    const nextFilePath = getLocalMirrorFilePath(item, nextRootPath);

    try {
      copyOrMoveManagedFile(previousFilePath, nextFilePath);
    } catch (error) {
      logger.warn("[Discasa local cache] Could not move a mirrored file to the new folder.", error);
    }
  }
}

async function downloadAttachmentBuffer(url: string): Promise<Buffer | null> {
  if (!isDownloadableAttachmentUrl(url)) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logger.warn("[Discasa local cache] Could not download a file from Discord.", error);
    return null;
  }
}

async function downloadAttachmentToFile(url: string, filePath: string): Promise<boolean> {
  const buffer = await downloadAttachmentBuffer(url);
  if (!buffer) {
    return false;
  }

  writeManagedFile(filePath, buffer);
  return true;
}

async function materializeChunkedItemToFile(item: PersistedItem, filePath: string): Promise<boolean> {
  if (!hasChunkedStorage(item)) {
    return false;
  }

  const buffers: Buffer[] = [];

  for (const part of item.storageManifest.parts) {
    const buffer = await downloadAttachmentBuffer(part.attachmentUrl);
    if (!buffer || buffer.byteLength !== part.size || hashBuffer(buffer) !== part.sha256) {
      removeFileIfExists(filePath);
      return false;
    }

    buffers.push(buffer);
  }

  const fullBuffer = Buffer.concat(buffers);
  if (fullBuffer.byteLength !== item.storageManifest.totalSize || hashBuffer(fullBuffer) !== item.storageManifest.sha256) {
    removeFileIfExists(filePath);
    return false;
  }

  writeManagedFile(filePath, fullBuffer);
  return true;
}

async function materializeItemToFile(item: PersistedItem, filePath: string): Promise<boolean> {
  if (hasChunkedStorage(item)) {
    return materializeChunkedItemToFile(item, filePath);
  }

  return downloadAttachmentToFile(item.attachmentUrl, filePath);
}

async function synchronizeLocalMirrorFromCloud(): Promise<void> {
  if (!database.config.localMirrorEnabled) {
    return;
  }

  if (needsLocalMirrorPathSelection()) {
    return;
  }

  const mirrorRoot = getResolvedLocalMirrorPath();
  fs.mkdirSync(mirrorRoot, { recursive: true });

  for (const item of database.items) {
    if (item.attachmentStatus === "missing") {
      continue;
    }

    const filePath = getLocalMirrorFilePath(item, mirrorRoot);
    if (hasReadableFile(filePath)) {
      continue;
    }

    await materializeItemToFile(item, filePath);
  }
}

function queueLocalMirrorSynchronization(): void {
  void synchronizeLocalMirrorFromCloud().catch((error) => {
    logger.warn("[Discasa local cache] Could not synchronize mirrored files.", error);
  });
}

function isTemporaryLocalMirrorFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".tmp") || lower.endsWith(".temp") || lower.endsWith(".crdownload") || lower.endsWith(".part");
}

function createManagedLocalMirrorPathIndex(mirrorRoot: string): Set<string> {
  return new Set(database.items.map((item) => normalizePathKey(getLocalMirrorFilePath(item, mirrorRoot))));
}

export function scanLocalMirrorImportCandidates(): LocalMirrorImportScan {
  if (!database.config.localMirrorEnabled || needsLocalMirrorPathSelection()) {
    return {
      candidates: [],
      scannedFileCount: 0,
      skippedFileCount: 0,
    };
  }

  const mirrorRoot = getResolvedLocalMirrorPath();
  const managedPaths = createManagedLocalMirrorPathIndex(mirrorRoot);
  const candidates: LocalMirrorImportCandidate[] = [];
  let scannedFileCount = 0;
  let skippedFileCount = 0;

  try {
    fs.mkdirSync(mirrorRoot, { recursive: true });
    const entries = fs.readdirSync(mirrorRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(mirrorRoot, entry.name);
      if (managedPaths.has(normalizePathKey(filePath))) {
        continue;
      }

      scannedFileCount += 1;

      if (isTemporaryLocalMirrorFile(entry.name)) {
        skippedFileCount += 1;
        continue;
      }

      let stat: Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        skippedFileCount += 1;
        continue;
      }

      if (!stat.isFile() || stat.size <= 0 || Date.now() - stat.mtimeMs < LOCAL_MIRROR_IMPORT_STABLE_MS) {
        skippedFileCount += 1;
        continue;
      }

      candidates.push({
        filePath,
        fileName: entry.name,
        fileSize: stat.size,
        mimeType: inferMimeTypeFromFileName(entry.name),
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  } catch (error) {
    logger.warn("[Discasa local mirror] Could not scan the local mirror folder for imported files.", error);
  }

  return {
    candidates,
    scannedFileCount,
    skippedFileCount,
  };
}

export function adoptLocalMirrorImportedFiles(items: LibraryItem[], candidates: LocalMirrorImportCandidate[]): void {
  items.forEach((item, index) => {
    const candidate = candidates[index];
    const persistedItem = findPersistedItem(item.id);

    if (!candidate || !persistedItem) {
      return;
    }

    const targetPath = getLocalMirrorFilePath(persistedItem);

    try {
      if (!areSamePath(candidate.filePath, targetPath)) {
        copyOrMoveManagedFile(candidate.filePath, targetPath);
      }

      if (isPreviewCacheEligible(persistedItem) && hasReadableFile(targetPath)) {
        ensureParentDir(getThumbnailCacheFilePath(persistedItem));
        fs.copyFileSync(targetPath, getThumbnailCacheFilePath(persistedItem));
      }
    } catch (error) {
      logger.warn("[Discasa local mirror] Could not adopt an imported local mirror file.", error);
    }
  });
}

function applyLocalMirrorConfigChange(
  previousConfig: DiscasaConfig,
  nextConfig: DiscasaConfig,
  options?: { preserveMissingConfiguredPath?: boolean },
): void {
  const previousRootPath = getResolvedLocalMirrorPath(previousConfig);
  const nextRootPath = getResolvedLocalMirrorPath(nextConfig);

  if (!nextConfig.localMirrorEnabled) {
    if (previousConfig.localMirrorEnabled) {
      deleteLocalMirrorFiles(previousRootPath);
    }
    return;
  }

  if (options?.preserveMissingConfiguredPath && needsLocalMirrorPathSelection(nextConfig)) {
    return;
  }

  fs.mkdirSync(nextRootPath, { recursive: true });

  if (previousConfig.localMirrorEnabled && path.resolve(previousRootPath) !== path.resolve(nextRootPath)) {
    moveLocalMirrorFiles(previousRootPath, nextRootPath);
  }

  queueLocalMirrorSynchronization();
}

function countFilesInDirectory(directoryPath: string): { count: number; bytes: number } {
  try {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    let count = 0;
    let bytes = 0;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      count += 1;
      bytes += fs.statSync(path.join(directoryPath, entry.name)).size;
    }

    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

function cacheUploadedFileForItem(item: LibraryItem, file: Express.Multer.File): void {
  const persistedItem = findPersistedItem(item.id);
  if (!persistedItem) {
    return;
  }

  if (database.config.localMirrorEnabled && !needsLocalMirrorPathSelection()) {
    try {
      writeManagedFile(getLocalMirrorFilePath(persistedItem), file.buffer);
    } catch (error) {
      logger.warn("[Discasa local cache] Could not mirror an uploaded file locally.", error);
    }
  }

  if (isPreviewCacheEligible(persistedItem)) {
    try {
      writeManagedFile(getThumbnailCacheFilePath(persistedItem), file.buffer);
    } catch (error) {
      logger.warn("[Discasa local cache] Could not cache an uploaded thumbnail.", error);
    }
  }
}

function createMembershipIndex(memberships: PersistedFolderMembership[]): Map<string, string[]> {
  const membershipsByItemId = new Map<string, string[]>();

  for (const membership of memberships) {
    const current = membershipsByItemId.get(membership.itemId) ?? [];
    current.push(membership.folderId);
    membershipsByItemId.set(membership.itemId, current);
  }

  return membershipsByItemId;
}

function toHydratedLibraryItem(item: PersistedItem, membershipsByItemId: Map<string, string[]>): LibraryItem {
  return {
    ...item,
    attachmentStatus: normalizeAttachmentStatus(item.attachmentStatus),
    albumIds: membershipsByItemId.get(item.id) ?? [],
    ...createRuntimeLibraryUrls(item),
  };
}

function getHydratedLibraryItems(): LibraryItem[] {
  const membershipsByItemId = createMembershipIndex(database.memberships);
  return database.items.map((item) => toHydratedLibraryItem(item, membershipsByItemId));
}

function toAlbumRecord(folder: PersistedFolderNode, itemsById: Map<string, PersistedItem>): AlbumRecord {
  const itemCount = database.memberships.filter(
    (membership) => membership.folderId === folder.id && itemsById.has(membership.itemId) && !itemsById.get(membership.itemId)?.isTrashed,
  ).length;

  return {
    id: folder.id,
    name: folder.name,
    itemCount,
  };
}

function createStoredLibraryItem(file: UploadedFileRecord): PersistedItem {
  return {
    id: file.itemId ?? nanoid(12),
    name: file.fileName,
    size: file.fileSize,
    mimeType: file.mimeType || "application/octet-stream",
    status: "stored",
    guildId: file.guildId,
    uploadedAt: file.uploadedAt ?? new Date().toISOString(),
    attachmentUrl: file.attachmentUrl,
    attachmentStatus: "ready",
    isFavorite: false,
    isTrashed: false,
    storageChannelId: file.storageChannelId,
    storageMessageId: file.storageMessageId,
    storageManifest: file.storageManifest ?? null,
  };
}

function createAlbumMembership(folderId: string, itemId: string, addedAt: string): PersistedFolderMembership {
  return {
    folderId,
    itemId,
    addedAt,
  };
}

function hasFolder(folderId: string): boolean {
  return database.folders.some((folder) => folder.id === folderId);
}

function createOriginalSourceFromPersistedItem(item: PersistedItem): LibraryItemOriginalSource {
  return {
    attachmentUrl: item.originalSource?.attachmentUrl ?? item.attachmentUrl,
    storageChannelId: item.originalSource?.storageChannelId ?? item.storageChannelId,
    storageMessageId: item.originalSource?.storageMessageId ?? item.storageMessageId,
    storageManifest: item.originalSource?.storageManifest ?? item.storageManifest ?? null,
  };
}

function createEmptyIndexSnapshot(): PersistedIndexSnapshot {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

function createEmptyFolderSnapshot(): PersistedFolderSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders: [],
    memberships: [],
  };
}

export function getActiveStorageContext(): ActiveStorageContext | null {
  return database.activeStorage;
}

export function setActiveStorageContext(nextContext: ActiveStorageContext | null): void {
  database.activeStorage = nextContext;
  saveDatabase();
}

export function getDiscasaConfig(): DiscasaConfig {
  return { ...database.config };
}

export function createConfigSnapshot(): PersistedConfigSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: getDiscasaConfig(),
  };
}

export function replaceConfigFromSnapshot(snapshot: PersistedConfigSnapshot): void {
  const previousConfig = database.config;
  database.config = normalizeDiscasaConfig(snapshot.config);
  try {
    applyLocalMirrorConfigChange(previousConfig, database.config, { preserveMissingConfiguredPath: true });
  } catch (error) {
    database.config = previousConfig;
    throw error;
  }
  saveDatabase();
}

export function resetDiscasaConfig(): DiscasaConfig {
  const previousConfig = database.config;
  database.config = cloneDefaultConfig();
  try {
    applyLocalMirrorConfigChange(previousConfig, database.config);
  } catch (error) {
    database.config = previousConfig;
    throw error;
  }
  saveDatabase();
  return getDiscasaConfig();
}

export function updateDiscasaConfig(patch: Partial<DiscasaConfig>): DiscasaConfig {
  const previousConfig = database.config;
  database.config = normalizeDiscasaConfig({
    ...database.config,
    ...patch,
  });
  try {
    applyLocalMirrorConfigChange(previousConfig, database.config);
  } catch (error) {
    database.config = previousConfig;
    throw error;
  }
  saveDatabase();
  return getDiscasaConfig();
}

export function createIndexSnapshot(): PersistedIndexSnapshot {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    items: database.items.map((item) => ({ ...item, attachmentStatus: normalizeAttachmentStatus(item.attachmentStatus) })),
  };
}

export function createFolderSnapshot(): PersistedFolderSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folders: database.folders
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((folder) => ({ ...folder })),
    memberships: database.memberships.map((membership) => ({ ...membership })),
  };
}

export function replaceDatabaseFromIndexSnapshot(snapshot: PersistedIndexSnapshot | LegacyPersistedIndexSnapshot): void {
  if (snapshot.version === 1) {
    const legacyItems = Array.isArray(snapshot.items)
      ? snapshot.items.map((entry) => normalizeLegacyHydratedLibraryItem(entry)).filter((entry): entry is LibraryItem => Boolean(entry))
      : [];
    const migrated = createFolderMembershipFromLegacyData(snapshot.albums ?? [], legacyItems);
    database.folders = migrated.folders;
    database.memberships = migrated.memberships;
    database.items = migrated.nextItems;
    saveDatabase();
    return;
  }

  const nextItems = Array.isArray(snapshot.items)
    ? snapshot.items.map((entry) => normalizeLibraryItemIndex(entry)).filter((entry): entry is PersistedItem => Boolean(entry))
    : createEmptyIndexSnapshot().items;

  database.items = nextItems;
  const itemIds = new Set(database.items.map((item) => item.id));
  database.memberships = database.memberships.filter((membership) => itemIds.has(membership.itemId));
  saveDatabase();
}

export function replaceDatabaseFromFolderSnapshot(snapshot: PersistedFolderSnapshot): void {
  const nextFolders = Array.isArray(snapshot.folders)
    ? snapshot.folders.map((entry) => normalizeFolderNode(entry)).filter((entry): entry is PersistedFolderNode => Boolean(entry))
    : createEmptyFolderSnapshot().folders;

  const nextMemberships = Array.isArray(snapshot.memberships)
    ? snapshot.memberships.map((entry) => normalizeFolderMembership(entry)).filter((entry): entry is PersistedFolderMembership => Boolean(entry))
    : createEmptyFolderSnapshot().memberships;

  database.folders = nextFolders.sort((left, right) => left.position - right.position);
  const folderIds = new Set(database.folders.map((folder) => folder.id));
  const itemIds = new Set(database.items.map((item) => item.id));
  database.memberships = nextMemberships.filter(
    (membership) => folderIds.has(membership.folderId) && itemIds.has(membership.itemId),
  );
  saveDatabase();
}

export function getAlbums(): AlbumRecord[] {
  const itemsById = new Map(database.items.map((item) => [item.id, item]));

  return database.folders
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((folder) => toAlbumRecord(folder, itemsById));
}

export function addAlbum(name: string): AlbumRecord {
  const timestamp = new Date().toISOString();
  const next: PersistedFolderNode = {
    id: nanoid(10),
    type: "album",
    name,
    parentId: null,
    position: database.folders.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.folders.push(next);
  saveDatabase();
  return getAlbums().find((album) => album.id === next.id) ?? { id: next.id, name: next.name, itemCount: 0 };
}

export function renameAlbum(albumId: string, name: string): { id: string; name: string } | null {
  const folder = database.folders.find((entry) => entry.id === albumId);
  if (!folder) {
    return null;
  }

  folder.name = name;
  folder.updatedAt = new Date().toISOString();
  saveDatabase();
  return { id: folder.id, name: folder.name };
}

export function reorderAlbums(orderedIds: string[]): AlbumRecord[] {
  if (!orderedIds.length) {
    return getAlbums();
  }

  const byId = new Map(database.folders.map((folder) => [folder.id, folder]));
  const reordered: PersistedFolderNode[] = [];

  for (const id of orderedIds) {
    const folder = byId.get(id);
    if (folder) {
      reordered.push(folder);
      byId.delete(id);
    }
  }

  for (const folder of database.folders) {
    if (byId.has(folder.id)) {
      reordered.push(folder);
      byId.delete(folder.id);
    }
  }

  const timestamp = new Date().toISOString();
  database.folders = reordered.map((folder, position) => ({
    ...folder,
    position,
    updatedAt: timestamp,
  }));

  saveDatabase();
  return getAlbums();
}

export function deleteAlbum(albumId: string): boolean {
  const index = database.folders.findIndex((folder) => folder.id === albumId);
  if (index === -1) {
    return false;
  }

  database.folders.splice(index, 1);
  database.folders = database.folders.map((folder, position) => ({ ...folder, position }));
  database.memberships = database.memberships.filter((membership) => membership.folderId !== albumId);
  saveDatabase();
  return true;
}

export function getLibraryItems(): LibraryItem[] {
  return getHydratedLibraryItems();
}

export function getLibraryItem(itemId: string): LibraryItem | null {
  return getHydratedLibraryItems().find((item) => item.id === itemId) ?? null;
}

export function getLocalStorageStatus(): LocalStorageStatus {
  const mirrorRoot = getResolvedLocalMirrorPath();
  const thumbnailStats = countFilesInDirectory(thumbnailCacheDir);
  const mirroredFileCount = database.items.filter((item) => hasReadableFile(getLocalMirrorFilePath(item, mirrorRoot))).length;
  const localMirrorPathExists = hasDirectory(mirrorRoot);

  return {
    localMirrorEnabled: database.config.localMirrorEnabled,
    configuredMirrorPath: database.config.localMirrorPath,
    resolvedMirrorPath: mirrorRoot,
    localMirrorPathExists,
    localMirrorSetupRequired: needsLocalMirrorPathSelection(),
    defaultMirrorPath: defaultLocalMirrorDir,
    mirroredFileCount,
    thumbnailCachePath: thumbnailCacheDir,
    thumbnailCacheFileCount: thumbnailStats.count,
    thumbnailCacheBytes: thumbnailStats.bytes,
  };
}

export function cacheUploadedFilesForLocalAccess(items: LibraryItem[], files: Express.Multer.File[]): void {
  items.forEach((item, index) => {
    const file = files[index];
    if (file) {
      cacheUploadedFileForItem(item, file);
    }
  });
}

function cacheUploadedLocalFileForItem(item: LibraryItem, file: LocalSourceFile): void {
  const persistedItem = findPersistedItem(item.id);
  if (!persistedItem) {
    return;
  }

  if (database.config.localMirrorEnabled && !needsLocalMirrorPathSelection()) {
    try {
      ensureParentDir(getLocalMirrorFilePath(persistedItem));
      fs.copyFileSync(file.filePath, getLocalMirrorFilePath(persistedItem));
    } catch (error) {
      logger.warn("[Discasa local cache] Could not mirror an uploaded local file.", error);
    }
  }

  if (isPreviewCacheEligible(persistedItem)) {
    try {
      ensureParentDir(getThumbnailCacheFilePath(persistedItem));
      fs.copyFileSync(file.filePath, getThumbnailCacheFilePath(persistedItem));
    } catch (error) {
      logger.warn("[Discasa local cache] Could not cache an uploaded local thumbnail.", error);
    }
  }
}

export function cacheUploadedLocalFilesForLocalAccess(items: LibraryItem[], files: LocalSourceFile[]): void {
  items.forEach((item, index) => {
    const file = files[index];
    if (file) {
      cacheUploadedLocalFileForItem(item, file);
    }
  });
}

export async function getLibraryItemContentSource(
  itemId: string,
): Promise<{ type: "file"; filePath: string; mimeType: string; fileName: string } | { type: "redirect"; url: string } | null> {
  const item = findPersistedItem(itemId);
  if (!item) {
    return null;
  }

  const localMirrorPath = getLocalMirrorFilePath(item);
  if (hasReadableFile(localMirrorPath)) {
    return {
      type: "file",
      filePath: localMirrorPath,
      mimeType: item.mimeType,
      fileName: item.name,
    };
  }

  if (hasChunkedStorage(item) && await materializeChunkedItemToFile(item, localMirrorPath)) {
    return {
      type: "file",
      filePath: localMirrorPath,
      mimeType: item.mimeType,
      fileName: item.name,
    };
  }

  if (isDownloadableAttachmentUrl(item.attachmentUrl)) {
    return {
      type: "redirect",
      url: item.attachmentUrl,
    };
  }

  return null;
}

export async function getLibraryItemThumbnailSource(
  itemId: string,
): Promise<{ type: "file"; filePath: string; mimeType: string; fileName: string } | { type: "redirect"; url: string } | null> {
  const item = findPersistedItem(itemId);
  if (!item) {
    return null;
  }

  const cachedPath = getThumbnailCacheFilePath(item);
  if (hasReadableFile(cachedPath)) {
    return {
      type: "file",
      filePath: cachedPath,
      mimeType: item.mimeType,
      fileName: item.name,
    };
  }

  const localMirrorPath = getLocalMirrorFilePath(item);
  if (hasReadableFile(localMirrorPath)) {
    try {
      ensureParentDir(cachedPath);
      fs.copyFileSync(localMirrorPath, cachedPath);
    } catch (error) {
      logger.warn("[Discasa local cache] Could not seed the thumbnail cache from a mirrored file.", error);
    }

    if (hasReadableFile(cachedPath)) {
      return {
        type: "file",
        filePath: cachedPath,
        mimeType: item.mimeType,
        fileName: item.name,
      };
    }
  }

  if (await materializeItemToFile(item, cachedPath)) {
    return {
      type: "file",
      filePath: cachedPath,
      mimeType: item.mimeType,
      fileName: item.name,
    };
  }

  if (isDownloadableAttachmentUrl(item.attachmentUrl)) {
    return {
      type: "redirect",
      url: item.attachmentUrl,
    };
  }

  return null;
}

export function addMockFiles(files: Express.Multer.File[], albumId?: string): LibraryItem[] {
  const created = files.map((file) =>
    createStoredLibraryItem({
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype || "application/octet-stream",
      guildId: database.activeStorage?.guildId ?? "mock_active_guild",
      attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
    }),
  );

  database.items.unshift(...created);

  if (albumId && hasFolder(albumId)) {
    for (const item of created) {
      database.memberships.push(createAlbumMembership(albumId, item.id, item.uploadedAt));
    }
  }

  saveDatabase();
  const createdIds = new Set(created.map((item) => item.id));
  return getHydratedLibraryItems().filter((item) => createdIds.has(item.id));
}

export function addUploadedFiles(files: UploadedFileRecord[], albumId?: string): LibraryItem[] {
  const existingItemIds = new Set(database.items.map((item) => item.id));
  const created = files
    .filter((file) => !file.itemId || !existingItemIds.has(file.itemId))
    .map((file) => createStoredLibraryItem(file));
  const resultIds = new Set([
    ...created.map((item) => item.id),
    ...files
      .map((file) => file.itemId)
      .filter((itemId): itemId is string => Boolean(itemId && existingItemIds.has(itemId))),
  ]);

  database.items.unshift(...created);

  if (albumId && hasFolder(albumId)) {
    const membershipKeys = new Set(database.memberships.map((membership) => `${membership.folderId}:${membership.itemId}`));
    for (const itemId of resultIds) {
      const item = database.items.find((entry) => entry.id === itemId);
      const membershipKey = `${albumId}:${itemId}`;
      if (item && !membershipKeys.has(membershipKey)) {
        database.memberships.push(createAlbumMembership(albumId, item.id, item.uploadedAt));
        membershipKeys.add(membershipKey);
      }
    }
  }

  saveDatabase();
  return getHydratedLibraryItems().filter((item) => resultIds.has(item.id));
}

export function addLibraryItemsToAlbum(albumId: string, itemIds: string[]): LibraryItem[] | null {
  if (!hasFolder(albumId)) {
    return null;
  }

  const uniqueItemIds = Array.from(new Set(itemIds));
  const itemIdSet = new Set(database.items.map((item) => item.id));
  const existingMemberships = new Set(
    database.memberships
      .filter((membership) => membership.folderId === albumId)
      .map((membership) => membership.itemId),
  );
  const nextItemIds = uniqueItemIds.filter((itemId) => itemIdSet.has(itemId));

  if (!nextItemIds.length) {
    return [];
  }

  const addedAt = new Date().toISOString();
  let didChange = false;

  for (const itemId of nextItemIds) {
    if (existingMemberships.has(itemId)) {
      continue;
    }

    database.memberships.push(createAlbumMembership(albumId, itemId, addedAt));
    existingMemberships.add(itemId);
    didChange = true;
  }

  if (didChange) {
    const folder = database.folders.find((entry) => entry.id === albumId);
    if (folder) {
      folder.updatedAt = addedAt;
    }

    saveDatabase();
  }

  const updatedItemIds = new Set(nextItemIds);
  return getHydratedLibraryItems().filter((item) => updatedItemIds.has(item.id));
}

export function moveLibraryItemsToAlbum(albumId: string, itemIds: string[]): LibraryItem[] | null {
  if (!hasFolder(albumId)) {
    return null;
  }

  const uniqueItemIds = Array.from(new Set(itemIds));
  const itemIdSet = new Set(database.items.map((item) => item.id));
  const nextItemIds = uniqueItemIds.filter((itemId) => itemIdSet.has(itemId));

  if (!nextItemIds.length) {
    return [];
  }

  const nextItemIdSet = new Set(nextItemIds);
  const movedAt = new Date().toISOString();

  database.memberships = database.memberships.filter((membership) => !nextItemIdSet.has(membership.itemId));

  for (const itemId of nextItemIds) {
    database.memberships.push(createAlbumMembership(albumId, itemId, movedAt));
  }

  const folder = database.folders.find((entry) => entry.id === albumId);
  if (folder) {
    folder.updatedAt = movedAt;
  }

  saveDatabase();

  const updatedItemIds = new Set(nextItemIds);
  return getHydratedLibraryItems().filter((item) => updatedItemIds.has(item.id));
}

export function removeLibraryItemsFromAlbum(albumId: string, itemIds: string[]): LibraryItem[] | null {
  if (!hasFolder(albumId)) {
    return null;
  }

  const uniqueItemIds = Array.from(new Set(itemIds));
  const itemIdSet = new Set(database.items.map((item) => item.id));
  const nextItemIds = uniqueItemIds.filter((itemId) => itemIdSet.has(itemId));

  if (!nextItemIds.length) {
    return [];
  }

  const nextItemIdSet = new Set(nextItemIds);
  const beforeCount = database.memberships.length;
  database.memberships = database.memberships.filter(
    (membership) => membership.folderId !== albumId || !nextItemIdSet.has(membership.itemId),
  );

  if (database.memberships.length !== beforeCount) {
    const removedAt = new Date().toISOString();
    const folder = database.folders.find((entry) => entry.id === albumId);
    if (folder) {
      folder.updatedAt = removedAt;
    }

    saveDatabase();
  }

  const updatedItemIds = new Set(nextItemIds);
  return getHydratedLibraryItems().filter((item) => updatedItemIds.has(item.id));
}

export function updateLibraryItemStorage(
  itemId: string,
  nextStorage: Pick<UploadedFileRecord, "attachmentUrl" | "storageChannelId" | "storageMessageId" | "guildId" | "storageManifest">,
): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  item.guildId = nextStorage.guildId;
  item.attachmentUrl = nextStorage.attachmentUrl;
  item.attachmentStatus = "ready";
  item.storageChannelId = nextStorage.storageChannelId;
  item.storageMessageId = nextStorage.storageMessageId;
  item.storageManifest = nextStorage.storageManifest ?? null;

  if (item.originalSource) {
    item.originalSource = {
      attachmentUrl: nextStorage.attachmentUrl,
      storageChannelId: nextStorage.storageChannelId,
      storageMessageId: nextStorage.storageMessageId,
      storageManifest: nextStorage.storageManifest ?? null,
    };
  }

  saveDatabase();
  return getLibraryItem(itemId);
}

export function saveLibraryItemMediaEdit(itemId: string, input: SaveLibraryItemMediaEditInput): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  if (!hasMeaningfulSavedMediaEdit(input)) {
    item.originalSource = null;
    item.savedMediaEdit = null;
    saveDatabase();
    return getLibraryItem(itemId);
  }

  item.originalSource = createOriginalSourceFromPersistedItem(item);
  item.savedMediaEdit = {
    rotationDegrees: clampRotationToRightAngles(input.rotationDegrees),
    hasCrop: Boolean(input.hasCrop),
    savedAt: new Date().toISOString(),
  };

  saveDatabase();
  return getLibraryItem(itemId);
}

export function restoreLibraryItemOriginal(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  item.originalSource = null;
  item.savedMediaEdit = null;
  saveDatabase();
  return getLibraryItem(itemId);
}

export function toggleFavoriteState(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  item.isFavorite = !item.isFavorite;
  saveDatabase();
  return getLibraryItem(itemId);
}

export function trashLibraryItem(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  item.isTrashed = true;
  saveDatabase();
  return getLibraryItem(itemId);
}

export function restoreLibraryItem(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  item.isTrashed = false;
  saveDatabase();
  return getLibraryItem(itemId);
}

export function deleteLibraryItem(itemId: string): boolean {
  const index = database.items.findIndex((entry) => entry.id === itemId);
  if (index === -1) {
    return false;
  }

  removeManagedFilesForItem(database.items[index]);
  database.items.splice(index, 1);
  database.memberships = database.memberships.filter((membership) => membership.itemId !== itemId);
  saveDatabase();
  return true;
}
