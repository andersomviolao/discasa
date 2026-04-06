import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { AlbumRecord, LibraryItem } from "@discasa/shared";

type PersistedAlbum = {
  id: string;
  name: string;
};

export type ActiveStorageContext = {
  guildId: string;
  guildName: string;
  categoryId: string;
  categoryName: string;
  driveChannelId: string;
  driveChannelName: string;
  indexChannelId: string;
  indexChannelName: string;
  trashChannelId: string;
  trashChannelName: string;
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

export type PersistedIndexSnapshot = {
  version: 1;
  albums: PersistedAlbum[];
  items: LibraryItem[];
};

type MockDatabase = {
  albums: PersistedAlbum[];
  items: LibraryItem[];
  activeStorage: ActiveStorageContext | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../../.discasa-data");
const dataFile = path.join(dataDir, "mock-db.json");

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDefaultDatabase(): MockDatabase {
  return {
    albums: [],
    items: [],
    activeStorage: null,
  };
}

function isValidActiveStorage(raw: unknown): raw is ActiveStorageContext {
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

function normalizeLibraryItem(raw: unknown): LibraryItem | null {
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
    isFavorite: entry.isFavorite,
    isTrashed: entry.isTrashed,
    storageChannelId: typeof entry.storageChannelId === "string" && entry.storageChannelId.length > 0 ? entry.storageChannelId : undefined,
    storageMessageId: typeof entry.storageMessageId === "string" && entry.storageMessageId.length > 0 ? entry.storageMessageId : undefined,
  };
}

function normalizeDatabase(raw: Partial<MockDatabase> | null | undefined): MockDatabase {
  const fallback = createDefaultDatabase();

  const albums = Array.isArray(raw?.albums)
    ? raw.albums
        .filter((entry): entry is PersistedAlbum => Boolean(entry && typeof entry.id === "string" && typeof entry.name === "string"))
        .map((entry) => ({ id: entry.id, name: entry.name }))
    : fallback.albums;

  const items = Array.isArray(raw?.items)
    ? raw.items.map((entry) => normalizeLibraryItem(entry)).filter((entry): entry is LibraryItem => Boolean(entry))
    : fallback.items;

  const activeStorage = isValidActiveStorage(raw?.activeStorage) ? raw.activeStorage : fallback.activeStorage;

  return {
    albums,
    items,
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
    const parsed = JSON.parse(raw) as Partial<MockDatabase>;
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

function toAlbumRecord(album: PersistedAlbum): AlbumRecord {
  return {
    id: album.id,
    name: album.name,
    itemCount: database.items.filter((item) => item.albumIds.includes(album.id) && !item.isTrashed).length,
  };
}

function createStoredLibraryItem(file: UploadedFileRecord, albumId?: string): LibraryItem {
  return {
    id: nanoid(12),
    name: file.fileName,
    size: file.fileSize,
    mimeType: file.mimeType || "application/octet-stream",
    status: "stored",
    guildId: file.guildId,
    albumIds: albumId ? [albumId] : [],
    uploadedAt: new Date().toISOString(),
    attachmentUrl: file.attachmentUrl,
    isFavorite: false,
    isTrashed: false,
    storageChannelId: file.storageChannelId,
    storageMessageId: file.storageMessageId,
  };
}

export function getActiveStorageContext(): ActiveStorageContext | null {
  return database.activeStorage;
}

export function setActiveStorageContext(nextContext: ActiveStorageContext | null): void {
  database.activeStorage = nextContext;
  saveDatabase();
}

export function createIndexSnapshot(): PersistedIndexSnapshot {
  return {
    version: 1,
    albums: database.albums.map((album) => ({ id: album.id, name: album.name })),
    items: database.items.map((item) => ({
      ...item,
      albumIds: [...item.albumIds],
    })),
  };
}

export function replaceDatabaseFromIndexSnapshot(snapshot: PersistedIndexSnapshot): void {
  const nextAlbums = Array.isArray(snapshot.albums)
    ? snapshot.albums
        .filter((entry): entry is PersistedAlbum => Boolean(entry && typeof entry.id === "string" && typeof entry.name === "string"))
        .map((entry) => ({ id: entry.id, name: entry.name }))
    : [];

  const nextItems = Array.isArray(snapshot.items)
    ? snapshot.items.map((entry) => normalizeLibraryItem(entry)).filter((entry): entry is LibraryItem => Boolean(entry))
    : [];

  database.albums = nextAlbums;
  database.items = nextItems;
  saveDatabase();
}

export function getAlbums(): AlbumRecord[] {
  return database.albums.map(toAlbumRecord);
}

export function addAlbum(name: string): AlbumRecord {
  const next = { id: nanoid(10), name };
  database.albums.push(next);
  saveDatabase();
  return toAlbumRecord(next);
}

export function renameAlbum(albumId: string, name: string): { id: string; name: string } | null {
  const album = database.albums.find((entry) => entry.id === albumId);
  if (!album) return null;

  album.name = name;
  saveDatabase();
  return { id: album.id, name: album.name };
}

export function reorderAlbums(orderedIds: string[]): AlbumRecord[] {
  if (!orderedIds.length) {
    return getAlbums();
  }

  const byId = new Map(database.albums.map((album) => [album.id, album]));
  const reordered: PersistedAlbum[] = [];

  for (const id of orderedIds) {
    const album = byId.get(id);
    if (album) {
      reordered.push(album);
      byId.delete(id);
    }
  }

  for (const album of database.albums) {
    if (byId.has(album.id)) {
      reordered.push(album);
      byId.delete(album.id);
    }
  }

  database.albums.splice(0, database.albums.length, ...reordered);
  saveDatabase();
  return getAlbums();
}

export function deleteAlbum(albumId: string): boolean {
  const index = database.albums.findIndex((album) => album.id === albumId);
  if (index === -1) return false;

  database.albums.splice(index, 1);

  for (const item of database.items) {
    item.albumIds = item.albumIds.filter((id) => id !== albumId);
  }

  saveDatabase();
  return true;
}

export function getLibraryItems(): LibraryItem[] {
  return database.items;
}

export function getLibraryItem(itemId: string): LibraryItem | null {
  return database.items.find((entry) => entry.id === itemId) ?? null;
}

export function addMockFiles(files: Express.Multer.File[], albumId?: string): LibraryItem[] {
  const created = files.map((file) =>
    createStoredLibraryItem(
      {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype || "application/octet-stream",
        guildId: database.activeStorage?.guildId ?? "mock_active_guild",
        attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
      },
      albumId,
    ),
  );

  database.items.unshift(...created);
  saveDatabase();
  return created;
}

export function addUploadedFiles(files: UploadedFileRecord[], albumId?: string): LibraryItem[] {
  const created = files.map((file) => createStoredLibraryItem(file, albumId));

  database.items.unshift(...created);
  saveDatabase();
  return created;
}

export function updateLibraryItemStorage(
  itemId: string,
  nextStorage: Pick<UploadedFileRecord, "attachmentUrl" | "storageChannelId" | "storageMessageId" | "guildId">,
): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) return null;

  item.guildId = nextStorage.guildId;
  item.attachmentUrl = nextStorage.attachmentUrl;
  item.storageChannelId = nextStorage.storageChannelId;
  item.storageMessageId = nextStorage.storageMessageId;
  saveDatabase();
  return item;
}

export function toggleFavoriteState(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) return null;

  item.isFavorite = !item.isFavorite;
  saveDatabase();
  return item;
}

export function trashLibraryItem(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) return null;

  item.isTrashed = true;
  saveDatabase();
  return item;
}

export function restoreLibraryItem(itemId: string): LibraryItem | null {
  const item = database.items.find((entry) => entry.id === itemId);
  if (!item) return null;

  item.isTrashed = false;
  saveDatabase();
  return item;
}

export function deleteLibraryItem(itemId: string): boolean {
  const index = database.items.findIndex((entry) => entry.id === itemId);
  if (index === -1) return false;

  database.items.splice(index, 1);
  saveDatabase();
  return true;
}
