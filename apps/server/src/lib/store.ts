import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { CollectionRecord, GuildSummary, LibraryItem } from "@discasa/shared";
import { DEFAULT_COLLECTIONS, DISCASA_CHANNELS } from "@discasa/shared";

type PersistedCollection = {
  id: string;
  name: string;
};

type MockDatabase = {
  collections: PersistedCollection[];
  items: LibraryItem[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../../.discasa-data");
const dataFile = path.join(dataDir, "mock-db.json");

const mockGuilds: GuildSummary[] = [
  {
    id: "guild_1",
    name: "Overwatch 2 Brasil",
    owner: true,
    permissions: ["ADMINISTRATOR"],
  },
  {
    id: "guild_2",
    name: "Discasa Test Lab",
    owner: false,
    permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS"],
  },
];

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDefaultDatabase(): MockDatabase {
  return {
    collections: DEFAULT_COLLECTIONS.map(({ id, name }) => ({ id, name })),
    items: [],
  };
}

function normalizeDatabase(raw: Partial<MockDatabase> | null | undefined): MockDatabase {
  const fallback = createDefaultDatabase();

  const collections = Array.isArray(raw?.collections)
    ? raw!.collections
        .filter((entry): entry is PersistedCollection => Boolean(entry && typeof entry.id === "string" && typeof entry.name === "string"))
        .map((entry) => ({ id: entry.id, name: entry.name }))
    : fallback.collections;

  const items = Array.isArray(raw?.items)
    ? raw!.items.filter((entry): entry is LibraryItem => Boolean(entry && typeof entry.id === "string" && typeof entry.name === "string"))
    : fallback.items;

  return {
    collections: collections.length > 0 ? collections : fallback.collections,
    items,
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

export function getMockGuilds(): GuildSummary[] {
  return mockGuilds;
}

export function getCollections(): CollectionRecord[] {
  return database.collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    itemCount: database.items.filter((item) => item.collectionIds.includes(collection.id)).length,
  }));
}

export function addCollection(name: string): CollectionRecord {
  const next = { id: nanoid(10), name };
  database.collections.push(next);
  saveDatabase();

  return {
    ...next,
    itemCount: 0,
  };
}

export function reorderCollections(orderedIds: string[]): CollectionRecord[] {
  if (!orderedIds.length) {
    return getCollections();
  }

  const byId = new Map(database.collections.map((collection) => [collection.id, collection]));
  const reordered: PersistedCollection[] = [];

  for (const id of orderedIds) {
    const collection = byId.get(id);
    if (collection) {
      reordered.push(collection);
      byId.delete(id);
    }
  }

  for (const collection of database.collections) {
    if (byId.has(collection.id)) {
      reordered.push(collection);
      byId.delete(collection.id);
    }
  }

  database.collections.splice(0, database.collections.length, ...reordered);
  saveDatabase();
  return getCollections();
}

export function deleteCollection(collectionId: string): boolean {
  const index = database.collections.findIndex((collection) => collection.id === collectionId);
  if (index === -1) return false;

  database.collections.splice(index, 1);

  for (const item of database.items) {
    item.collectionIds = item.collectionIds.filter((id) => id !== collectionId);
  }

  saveDatabase();
  return true;
}

export function initializeMockDiscasa(guildId: string) {
  return {
    guildId,
    categoryName: "Discasa",
    channels: DISCASA_CHANNELS,
  };
}

export function addMockFiles(files: Express.Multer.File[], collectionId: string): LibraryItem[] {
  const created = files.map((file) => ({
    id: nanoid(12),
    name: file.originalname,
    size: file.size,
    mimeType: file.mimetype || "application/octet-stream",
    status: "stored",
    guildId: "mock_active_guild",
    collectionIds: collectionId === "all" ? [] : [collectionId],
    uploadedAt: new Date().toISOString(),
    attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
  } satisfies LibraryItem));

  database.items.unshift(...created);
  saveDatabase();
  return created;
}

export function getLibraryItems(collectionId?: string): LibraryItem[] {
  if (!collectionId || collectionId === "all") {
    return database.items;
  }

  return database.items.filter((item) => item.collectionIds.includes(collectionId));
}
