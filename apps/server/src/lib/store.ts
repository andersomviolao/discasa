import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { AlbumRecord, LibraryItem } from "@discasa/shared";

export type PersistedAlbum = {
  id: string;
  name: string;
};

export type PersistedIndexState = {
  albums: PersistedAlbum[];
  items: LibraryItem[];
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
};

type LocalDatabase = PersistedIndexState & {
  activeStorage: ActiveStorageContext | null;
  indexMessageId: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../../.discasa-data");
const dataFile = path.join(dataDir, "mock-db.json");

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDefaultDatabase(): LocalDatabase {
  return {
    albums: [],
    items: [],
    activeStorage: null,
    indexMessageId: null,
  };
}

function isValidAlbum(raw: unknown): raw is PersistedAlbum {
  return Boolean(raw && typeof raw === "object" && typeof (raw as PersistedAlbum).id === "string" && typeof (raw as PersistedAlbum).name === "string");
}

function normalizeAlbums(raw: unknown): PersistedAlbum[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isValidAlbum).map((entry) => ({
    id: entry.id,
    name: entry.name,
  }));
}

function normalizeItems(raw: unknown): LibraryItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry): entry is LibraryItem => Boolean(entry && typeof entry === "object" && typeof (entry as LibraryItem).id === "string" && typeof (entry as LibraryItem).name === "string"))
    .map((entry) => ({
      ...entry,
      albumIds: Array.isArray(entry.albumIds) ? entry.albumIds.filter((albumId): albumId is string => typeof albumId === "string") : [],
      attachmentUrl: typeof entry.attachmentUrl === "string" ? entry.attachmentUrl : "",
      guildId: typeof entry.guildId === "string" ? entry.guildId : "",
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "application/octet-stream",
      status: typeof entry.status === "string" ? entry.status : "stored",
      uploadedAt: typeof entry.uploadedAt === "string" ? entry.uploadedAt : new Date().toISOString(),
      size: typeof entry.size === "number" ? entry.size : 0,
      isFavorite: Boolean(entry.isFavorite),
      isTrashed: Boolean(entry.isTrashed),
    }));
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

function normalizeDatabase(raw: Partial<LocalDatabase> | null | undefined): LocalDatabase {
  return {
    albums: normalizeAlbums(raw?.albums),
    items: normalizeItems(raw?.items),
    activeStorage: isValidActiveStorage(raw?.activeStorage) ? raw.activeStorage : null,
    indexMessageId: typeof raw?.indexMessageId === "string" && raw.indexMessageId.length > 0 ? raw.indexMessageId : null,
  };
}

function loadDatabase(): LocalDatabase {
  ensureDataDir();

  if (!fs.existsSync(dataFile)) {
    const next = createDefaultDatabase();
    fs.writeFileSync(dataFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
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

export function getActiveStorageContext(): ActiveStorageContext | null {
  return database.activeStorage;
}

export function setActiveStorageContext(nextContext: ActiveStorageContext | null): void {
  database.activeStorage = nextContext;
  saveDatabase();
}

export function getIndexMessageId(): string | null {
  return database.indexMessageId;
}

export function setIndexMessageId(nextMessageId: string | null): void {
  database.indexMessageId = nextMessageId;
  saveDatabase();
}

export function getPersistedIndexState(): PersistedIndexState {
  return {
    albums: database.albums.map((album) => ({ ...album })),
    items: database.items.map((item) => ({
      ...item,
      albumIds: [...item.albumIds],
    })),
  };
}

export function applyPersistedIndexState(
  nextState: PersistedIndexState,
  nextContext: ActiveStorageContext | null,
  nextIndexMessageId: string | null = database.indexMessageId,
): void {
  const normalizedAlbums = normalizeAlbums(nextState.albums);
  const normalizedItems = normalizeItems(nextState.items);

  database.albums.splice(0, database.albums.length, ...normalizedAlbums);
  database.items.splice(0, database.items.length, ...normalizedItems);
  database.activeStorage = nextContext;
  database.indexMessageId = nextIndexMessageId;
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

export function addMockFiles(files: Express.Multer.File[], albumId?: string): LibraryItem[] {
  const created = files.map((file) => ({
    id: nanoid(12),
    name: file.originalname,
    size: file.size,
    mimeType: file.mimetype || "application/octet-stream",
    status: "stored",
    guildId: "mock_active_guild",
    albumIds: albumId ? [albumId] : [],
    uploadedAt: new Date().toISOString(),
    attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
    isFavorite: false,
    isTrashed: false,
  } satisfies LibraryItem));

  database.items.unshift(...created);
  saveDatabase();
  return created;
}

export function addUploadedFiles(files: UploadedFileRecord[], albumId?: string): LibraryItem[] {
  const created = files.map((file) => ({
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
  } satisfies LibraryItem));

  database.items.unshift(...created);
  saveDatabase();
  return created;
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
