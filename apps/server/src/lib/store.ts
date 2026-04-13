import fs from "node:fs";
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
  type PersistedConfigSnapshot,
  type PersistedFolderSnapshot,
  type PersistedIndexSnapshot,
  type SaveLibraryItemMediaEditInput,
} from "@discasa/shared";

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

export type UploadedFileRecord = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  guildId: string;
  attachmentUrl: string;
  storageChannelId?: string;
  storageMessageId?: string;
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
const dataDir = path.resolve(__dirname, "../../.discasa-data");
const dataFile = path.join(dataDir, "mock-db.json");

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
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
    viewerMouseWheelBehavior:
      entry.viewerMouseWheelBehavior === "navigate" ? "navigate" : fallback.viewerMouseWheelBehavior,
    sidebarCollapsed: typeof entry.sidebarCollapsed === "boolean" ? entry.sidebarCollapsed : fallback.sidebarCollapsed,
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
    id: nanoid(12),
    name: file.fileName,
    size: file.fileSize,
    mimeType: file.mimeType || "application/octet-stream",
    status: "stored",
    guildId: file.guildId,
    uploadedAt: new Date().toISOString(),
    attachmentUrl: file.attachmentUrl,
    attachmentStatus: "ready",
    isFavorite: false,
    isTrashed: false,
    storageChannelId: file.storageChannelId,
    storageMessageId: file.storageMessageId,
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
  database.config = normalizeDiscasaConfig(snapshot.config);
  saveDatabase();
}

export function resetDiscasaConfig(): DiscasaConfig {
  database.config = cloneDefaultConfig();
  saveDatabase();
  return getDiscasaConfig();
}

export function updateDiscasaConfig(patch: Partial<DiscasaConfig>): DiscasaConfig {
  database.config = normalizeDiscasaConfig({
    ...database.config,
    ...patch,
  });
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
  const created = files.map((file) => createStoredLibraryItem(file));

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

export function updateLibraryItemStorage(
  itemId: string,
  nextStorage: Pick<UploadedFileRecord, "attachmentUrl" | "storageChannelId" | "storageMessageId" | "guildId">,
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

  if (item.originalSource) {
    item.originalSource = {
      attachmentUrl: nextStorage.attachmentUrl,
      storageChannelId: nextStorage.storageChannelId,
      storageMessageId: nextStorage.storageMessageId,
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

  database.items.splice(index, 1);
  database.memberships = database.memberships.filter((membership) => membership.itemId !== itemId);
  saveDatabase();
  return true;
}
