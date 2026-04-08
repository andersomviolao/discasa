import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LibraryItemOriginalSource,
  LibraryItemSavedMediaEdit,
} from "@discasa/shared";

type PersistedMediaEditRecord = {
  originalSource: LibraryItemOriginalSource | null;
  savedMediaEdit: LibraryItemSavedMediaEdit | null;
};

type PersistedMediaEditDatabase = {
  records: Record<string, PersistedMediaEditRecord>;
};

type PersistedItem = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: string;
  guildId: string;
  uploadedAt: string;
  attachmentUrl: string;
  isFavorite: boolean;
  isTrashed: boolean;
  storageChannelId?: string;
  storageMessageId?: string;
  originalSource?: LibraryItemOriginalSource | null;
  savedMediaEdit?: LibraryItemSavedMediaEdit | null;
};

type PersistedFolderNode = {
  id: string;
  type: "album";
  name: string;
  parentId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type PersistedFolderMembership = {
  folderId: string;
  itemId: string;
  addedAt: string;
};

type DiscasaConfig = {
  accentColor: string;
  minimizeToTray: boolean;
  closeToTray: boolean;
  thumbnailZoomPercent: number;
  sidebarCollapsed: boolean;
};

type ActiveStorageContext = {
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

type MockDatabase = {
  folders: PersistedFolderNode[];
  memberships: PersistedFolderMembership[];
  items: PersistedItem[];
  config: DiscasaConfig;
  activeStorage: ActiveStorageContext | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../.discasa-data");
const mockDbPath = path.join(dataDir, "mock-db.json");
const legacyMediaEditsPath = path.join(dataDir, "media-edits.json");
const migratedBackupPath = path.join(dataDir, "media-edits.json.migrated.bak");

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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
      typeof entry.storageChannelId === "string" && entry.storageChannelId.length > 0
        ? entry.storageChannelId
        : undefined,
    storageMessageId:
      typeof entry.storageMessageId === "string" && entry.storageMessageId.length > 0
        ? entry.storageMessageId
        : undefined,
  };
}

function normalizeRotationDegrees(value: number): number {
  const rounded = Math.round(value / 90) * 90;
  return ((rounded % 360) + 360) % 360;
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
    rotationDegrees: normalizeRotationDegrees(entry.rotationDegrees),
    hasCrop: entry.hasCrop,
    savedAt: entry.savedAt,
  };
}

function normalizeLegacyDatabase(raw: unknown): PersistedMediaEditDatabase {
  if (!raw || typeof raw !== "object") {
    return { records: {} };
  }

  const entry = raw as Record<string, unknown>;
  const records = entry.records;

  if (!records || typeof records !== "object") {
    return { records: {} };
  }

  const normalizedRecords: Record<string, PersistedMediaEditRecord> = {};

  for (const [itemId, value] of Object.entries(records as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const record = value as Record<string, unknown>;
    normalizedRecords[itemId] = {
      originalSource: normalizeOriginalSource(record.originalSource),
      savedMediaEdit: normalizeSavedMediaEdit(record.savedMediaEdit),
    };
  }

  return { records: normalizedRecords };
}

function main(): void {
  if (!fs.existsSync(mockDbPath)) {
    console.error(`[Discasa] Missing file: ${mockDbPath}`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(legacyMediaEditsPath)) {
    console.log("[Discasa] No legacy media-edits.json found. Nothing to migrate.");
    return;
  }

  if (fs.existsSync(migratedBackupPath)) {
    console.error(
      "[Discasa] Found media-edits.json.migrated.bak already. Review the data folder before running this migration again.",
    );
    process.exitCode = 1;
    return;
  }

  const database = readJsonFile<MockDatabase>(mockDbPath);
  const legacyDatabase = normalizeLegacyDatabase(readJsonFile<unknown>(legacyMediaEditsPath));

  let migratedCount = 0;
  let skippedMissingItemCount = 0;
  let skippedAlreadyIntegratedCount = 0;

  const itemsById = new Map(database.items.map((item) => [item.id, item]));

  for (const [itemId, record] of Object.entries(legacyDatabase.records)) {
    const item = itemsById.get(itemId);

    if (!item) {
      skippedMissingItemCount += 1;
      continue;
    }

    const hasIntegratedData = Boolean(item.originalSource || item.savedMediaEdit);
    if (hasIntegratedData) {
      skippedAlreadyIntegratedCount += 1;
      continue;
    }

    item.originalSource = record.originalSource;
    item.savedMediaEdit = record.savedMediaEdit;
    migratedCount += 1;
  }

  writeJsonFile(mockDbPath, database);
  fs.renameSync(legacyMediaEditsPath, migratedBackupPath);

  console.log("[Discasa] Legacy media edits migration finished.");
  console.log(`[Discasa] Migrated items: ${migratedCount}`);
  console.log(`[Discasa] Skipped missing items: ${skippedMissingItemCount}`);
  console.log(`[Discasa] Skipped already integrated items: ${skippedAlreadyIntegratedCount}`);
  console.log(`[Discasa] Backup created at: ${migratedBackupPath}`);
}

main();
