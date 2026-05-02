import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type {
  DiscasaAttachmentRecoveryWarning,
  DiscasaExternalImportResult,
  DiscasaDriveImportResult,
  DiscasaLocalMirrorImportResult,
  DiscasaWatchedFolderImportResult,
  LibraryItem,
  SaveLibraryItemMediaEditInput,
} from "@discasa/shared";
import { env } from "./config";
import { logger } from "./logger";
import {
  addAlbum,
  addLibraryItemsToAlbum,
  addMockFiles,
  addUploadedFiles,
  adoptLocalMirrorImportedFiles,
  cacheUploadedLocalFilesForLocalAccess,
  cacheUploadedFilesForLocalAccess,
  clearPersistedAuthSession,
  createConfigSnapshot,
  createFolderSnapshot,
  createIndexSnapshot,
  deleteAlbum,
  deleteLibraryItem,
  completePendingRemoteOperation,
  enqueuePendingMoveItemStorageOperations,
  failPendingRemoteOperation,
  getActiveStorageContext,
  getAlbums,
  getDiscasaConfig,
  getLocalSourceFileForLibraryItem,
  getLibraryItemContentSource,
  getLibraryItemThumbnailSource,
  getLibraryItem,
  getLibraryItems,
  getLocalStorageStatus,
  getPendingRemoteOperation,
  getPendingRemoteOperations,
  type PendingRemoteOperation,
  type LocalSourceFile,
  moveLibraryItemsToAlbum,
  renameAlbum,
  reconcilePendingRemoteOperations,
  removeLibraryItemsFromAlbum,
  reorderAlbums,
  replaceConfigFromSnapshot,
  replaceDatabaseFromFolderSnapshot,
  replaceDatabaseFromIndexSnapshot,
  resetDiscasaConfig,
  restoreLibraryItem,
  restoreLibraryItemOriginal,
  saveLibraryItemMediaEdit,
  setActiveStorageContext,
  setPersistedAuthSession,
  scanLocalMirrorImportCandidates,
  scanWatchedFolderImportCandidates,
  toggleFavoriteState,
  trashLibraryItem,
  trashLibraryItems,
  updateDiscasaConfig,
  updateLibraryItemStorage,
} from "./persistence";
import {
  deleteStoredItemFromDiscord,
  getDiscasaBotDiagnostics,
  getDiscasaBotStatus,
  hasCurrentConfigSnapshot,
  hasCurrentFolderSnapshot,
  hasCurrentIndexSnapshot,
  initializeDiscasaInGuild,
  inspectDiscasaSetup,
  moveStoredItemToTrash,
  readLatestConfigSnapshot,
  readLatestFolderSnapshot,
  readLatestIndexSnapshot,
  refreshIndexSnapshotAttachmentUrls,
  restoreStoredItemFromTrash,
  scanDiscordDriveForNewFiles,
  syncConfigSnapshot,
  syncFolderSnapshot,
  syncIndexSnapshot,
  uploadFilesToDiscordDrive,
  uploadLocalFilesToDiscordDrive,
} from "./bot-client";
import {
  DiscordAuthorizationError,
  listEligibleGuilds,
} from "./discord";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
let remoteLibraryHydrationKey: string | null = null;
let remoteLibraryHydrationPromise: Promise<void> | null = null;
const BOT_INVITE_PERMISSIONS =
  0x400n + // View Channel
  0x800n + // Send Messages
  0x8000n + // Attach Files
  0x10000n + // Read Message History
  0x10n + // Manage Channels
  0x10000000n; // Manage Roles

function inferMimeTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const knownTypes: Record<string, string> = {
    ".apng": "image/apng",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
  };

  return knownTypes[extension] ?? "application/octet-stream";
}

function readClientUploadIds(rawIds: unknown, expectedLength: number): Array<string | undefined> {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  return rawIds.slice(0, expectedLength).map((rawId) => {
    if (typeof rawId !== "string") {
      return undefined;
    }

    const trimmed = rawId.trim();
    return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : undefined;
  });
}

type LocalUploadBatch = {
  files: LocalSourceFile[];
  albumId?: string;
  albumName?: string;
  parentAlbumId?: string;
  clientUploadIds?: Array<string | undefined>;
};

type LocalFolderUploadTarget = {
  path: string;
  albumId: string;
};

function readFolderUploadTargets(rawTargets: unknown): Map<string, string> {
  const targets = new Map<string, string>();

  if (!Array.isArray(rawTargets)) {
    return targets;
  }

  for (const rawTarget of rawTargets) {
    if (!rawTarget || typeof rawTarget !== "object") {
      continue;
    }

    const entry = rawTarget as Partial<LocalFolderUploadTarget>;
    if (typeof entry.path !== "string" || typeof entry.albumId !== "string" || !entry.path || !entry.albumId) {
      continue;
    }

    targets.set(path.resolve(entry.path), entry.albumId);
  }

  return targets;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashLocalFile(filePath: string): Promise<string | undefined> {
  try {
    return hashBuffer(await fs.readFile(filePath));
  } catch {
    return undefined;
  }
}

async function readLocalSourceFile(filePath: string): Promise<LocalSourceFile | null> {
  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    return null;
  }

  const fileName = path.basename(filePath);
  return {
    filePath,
    fileName,
    fileSize: stat.size,
    mimeType: inferMimeTypeFromFileName(fileName),
    modifiedAt: stat.mtime.toISOString(),
    contentHash: await hashLocalFile(filePath),
  };
}

async function collectLocalSourceFilesFromDirectory(directoryPath: string): Promise<LocalSourceFile[]> {
  const files: LocalSourceFile[] = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectLocalSourceFilesFromDirectory(entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const file = await readLocalSourceFile(entryPath);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

async function readLocalUploadBatches(
  rawPaths: unknown,
  options: { albumId?: string; clientUploadIds?: Array<string | undefined>; folderTargets?: Map<string, string> } = {},
): Promise<LocalUploadBatch[]> {
  if (!Array.isArray(rawPaths)) {
    throw new Error("filePaths must be an array.");
  }

  const directFiles: LocalSourceFile[] = [];
  const directClientUploadIds: Array<string | undefined> = [];
  const batches: LocalUploadBatch[] = [];

  for (const [index, rawPath] of rawPaths.entries()) {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      continue;
    }

    const filePath = path.resolve(rawPath);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      const files = await collectLocalSourceFilesFromDirectory(filePath);
      if (files.length > 0) {
        const targetAlbumId = options.folderTargets?.get(filePath);
        batches.push({
          files,
          albumId: targetAlbumId,
          albumName: targetAlbumId ? undefined : path.basename(filePath),
          parentAlbumId: targetAlbumId ? undefined : options.albumId,
        });
      }
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    const file = await readLocalSourceFile(filePath);
    if (file) {
      directFiles.push(file);
      directClientUploadIds.push(options.clientUploadIds?.[index]);
    }
  }

  if (directFiles.length > 0) {
    batches.unshift({
      files: directFiles,
      albumId: options.albumId,
      clientUploadIds: directClientUploadIds,
    });
  }

  return batches;
}

function getRemoteLibraryHydrationKey(context: NonNullable<ReturnType<typeof getActiveStorageContext>>): string {
  return [
    context.guildId,
    context.driveChannelId,
    context.indexChannelId,
    context.folderChannelId,
    context.trashChannelId,
    context.configChannelId,
  ].join(":");
}

async function syncRemoteIndexState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncIndexSnapshot(context, createIndexSnapshot());
}

async function syncRemoteFolderState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncFolderSnapshot(context, createFolderSnapshot());
}

async function syncRemoteConfigState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncConfigSnapshot(context, createConfigSnapshot());
}

async function syncRemoteLibraryState(): Promise<void> {
  await Promise.all([syncRemoteIndexState(), syncRemoteFolderState()]);
}

const remoteSyncQueues = new Map<string, { running: boolean; pending: boolean }>();

function queueRemoteSync(label: string, task: () => Promise<void>): void {
  const queue = remoteSyncQueues.get(label) ?? { running: false, pending: false };
  remoteSyncQueues.set(label, queue);

  if (queue.running) {
    queue.pending = true;
    return;
  }

  queue.running = true;

  const run = async () => {
    do {
      queue.pending = false;

      try {
        await task();
      } catch (error) {
        logger.warn(`[Discasa sync] Background ${label} sync failed.`, error);
      }
    } while (queue.pending);

    queue.running = false;
  };

  void run();
}

function queueRemoteIndexSync(): void {
  queueRemoteSync("index", syncRemoteIndexState);
}

function queueRemoteFolderSync(): void {
  queueRemoteSync("folder", syncRemoteFolderState);
}

function queueRemoteConfigSync(): void {
  queueRemoteSync("config", syncRemoteConfigState);
}

function queueRemoteLibrarySync(): void {
  queueRemoteIndexSync();
  queueRemoteFolderSync();
}

let pendingRemoteOperationDrainRunning = false;
let pendingRemoteOperationDrainRequested = false;

function readItemIds(rawItemIds: unknown): string[] {
  if (!Array.isArray(rawItemIds)) {
    return [];
  }

  return Array.from(
    new Set(
      rawItemIds
        .map((itemId) => (typeof itemId === "string" ? itemId.trim() : ""))
        .filter((itemId) => itemId.length > 0),
    ),
  );
}

async function processPendingRemoteOperation(operation: PendingRemoteOperation): Promise<void> {
  const currentOperation = getPendingRemoteOperation(operation.id);
  if (!currentOperation) {
    return;
  }

  const item = getLibraryItem(currentOperation.itemId);
  if (!item) {
    completePendingRemoteOperation(currentOperation.id);
    return;
  }

  if (
    (currentOperation.target === "trash" && !item.isTrashed) ||
    (currentOperation.target === "drive" && item.isTrashed)
  ) {
    completePendingRemoteOperation(currentOperation.id);
    return;
  }

  const localFile = getLocalSourceFileForLibraryItem(item.id);
  const movedRecord =
    currentOperation.target === "trash"
      ? await moveStoredItemToTrash(currentOperation.context, item, { localFile })
      : await restoreStoredItemFromTrash(currentOperation.context, item, { localFile });

  updateLibraryItemStorage(item.id, {
    guildId: movedRecord.guildId,
    attachmentUrl: movedRecord.attachmentUrl,
    storageChannelId: movedRecord.storageChannelId,
    storageMessageId: movedRecord.storageMessageId,
    storageManifest: movedRecord.storageManifest,
  });
  completePendingRemoteOperation(currentOperation.id);
  queueRemoteIndexSync();
}

async function drainPendingRemoteOperations(): Promise<void> {
  if (env.mockMode) {
    return;
  }

  if (pendingRemoteOperationDrainRunning) {
    pendingRemoteOperationDrainRequested = true;
    return;
  }

  pendingRemoteOperationDrainRunning = true;

  try {
    do {
      pendingRemoteOperationDrainRequested = false;

      for (const operation of getPendingRemoteOperations()) {
        try {
          await processPendingRemoteOperation(operation);
        } catch (error) {
          failPendingRemoteOperation(operation.id, error);
          logger.warn(`[Discasa remote operations] Could not finish ${operation.type} for ${operation.itemId}.`, error);
        }
      }
    } while (pendingRemoteOperationDrainRequested);
  } finally {
    pendingRemoteOperationDrainRunning = false;
  }
}

export function resumePendingRemoteOperations(): void {
  reconcilePendingRemoteOperations();
  void drainPendingRemoteOperations();
}

async function importNewDiscordDriveFiles(options: { syncRemote?: boolean } = {}): Promise<DiscasaDriveImportResult> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return {
      imported: [],
      scannedAttachmentCount: 0,
      skippedAttachmentCount: 0,
      skippedGroupedMessageCount: 0,
    };
  }

  const scan = await scanDiscordDriveForNewFiles(context, createIndexSnapshot());
  const imported = scan.records.length > 0 ? addUploadedFiles(scan.records) : [];

  if (imported.length > 0 && options.syncRemote !== false) {
    await syncRemoteIndexState();
  }

  return {
    imported,
    scannedAttachmentCount: scan.scannedAttachmentCount,
    skippedAttachmentCount: scan.skippedAttachmentCount,
    skippedGroupedMessageCount: scan.skippedGroupedMessageCount,
  };
}

async function importNewLocalMirrorFiles(options: { syncRemote?: boolean } = {}): Promise<DiscasaLocalMirrorImportResult> {
  const scan = scanLocalMirrorImportCandidates();
  if (scan.candidates.length === 0) {
    return {
      imported: [],
      scannedFileCount: scan.scannedFileCount,
      skippedFileCount: scan.skippedFileCount,
    };
  }

  const context = getActiveStorageContext();
  const records = env.mockMode
    ? scan.candidates.map((file) => ({
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        guildId: context?.guildId ?? "mock_active_guild",
        attachmentUrl: `mock://local-mirror/${encodeURIComponent(file.fileName)}`,
        uploadedAt: file.modifiedAt,
        contentHash: file.contentHash,
      }))
    : context
      ? await uploadLocalFilesToDiscordDrive(scan.candidates, context)
      : [];
  const recordsWithLocalMetadata = records.map((record, index) => ({
    ...record,
    contentHash: scan.candidates[index]?.contentHash,
  }));

  if (recordsWithLocalMetadata.length === 0) {
    return {
      imported: [],
      scannedFileCount: scan.scannedFileCount,
      skippedFileCount: scan.skippedFileCount + scan.candidates.length,
    };
  }

  const imported = addUploadedFiles(recordsWithLocalMetadata);
  adoptLocalMirrorImportedFiles(imported, scan.candidates);

  if (imported.length > 0 && options.syncRemote !== false) {
    await syncRemoteIndexState();
  }

  return {
    imported,
    scannedFileCount: scan.scannedFileCount,
    skippedFileCount: scan.skippedFileCount,
  };
}

async function importNewWatchedFolderFiles(options: { syncRemote?: boolean } = {}): Promise<DiscasaWatchedFolderImportResult> {
  const scan = scanWatchedFolderImportCandidates();
  if (scan.candidates.length === 0) {
    return {
      imported: [],
      scannedFileCount: scan.scannedFileCount,
      skippedFileCount: scan.skippedFileCount,
    };
  }

  const context = getActiveStorageContext();
  const records = env.mockMode
    ? scan.candidates.map((file) => ({
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        guildId: context?.guildId ?? "mock_active_guild",
        attachmentUrl: `mock://watched/${encodeURIComponent(file.fileName)}`,
        uploadedAt: file.modifiedAt,
        contentHash: file.contentHash,
        sourceCollection: file.sourceCollection,
        sourceFingerprint: file.sourceFingerprint,
      }))
    : context
      ? await uploadLocalFilesToDiscordDrive(scan.candidates, context)
      : [];
  const recordsWithWatchedMetadata = records.map((record, index) => ({
    ...record,
    contentHash: scan.candidates[index]?.contentHash,
    sourceCollection: "watched" as const,
    sourceFingerprint: scan.candidates[index]?.sourceFingerprint,
  }));

  if (recordsWithWatchedMetadata.length === 0) {
    return {
      imported: [],
      scannedFileCount: scan.scannedFileCount,
      skippedFileCount: scan.skippedFileCount + scan.candidates.length,
    };
  }

  const imported = addUploadedFiles(recordsWithWatchedMetadata);
  cacheUploadedLocalFilesForLocalAccess(imported, scan.candidates);

  if (imported.length > 0 && options.syncRemote !== false) {
    await syncRemoteIndexState();
  }

  return {
    imported,
    scannedFileCount: scan.scannedFileCount,
    skippedFileCount: scan.skippedFileCount,
  };
}

async function importExternalLibraryFiles(options: { syncRemote?: boolean } = {}): Promise<DiscasaExternalImportResult> {
  const discordDrive = await importNewDiscordDriveFiles({ syncRemote: false });
  const localMirror = await importNewLocalMirrorFiles({ syncRemote: false });
  const watchedFolder = await importNewWatchedFolderFiles({ syncRemote: false });
  const imported = [...discordDrive.imported, ...localMirror.imported, ...watchedFolder.imported];

  if (imported.length > 0 && options.syncRemote !== false) {
    await syncRemoteIndexState();
  }

  return {
    imported,
    discordDrive,
    localMirror,
    watchedFolder,
  };
}

async function hydrateRemoteLibraryState(options: { importExternalFiles?: boolean } = {}): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  const hydrationKey = getRemoteLibraryHydrationKey(context);
  if (remoteLibraryHydrationKey === hydrationKey) {
    return;
  }

  if (remoteLibraryHydrationPromise) {
    await remoteLibraryHydrationPromise;
    return;
  }

  remoteLibraryHydrationPromise = (async () => {
    const [remoteIndexSnapshot, folderSnapshot] = await Promise.all([
      readLatestIndexSnapshot(context),
      readLatestFolderSnapshot(context),
    ]);
    const indexSnapshot = remoteIndexSnapshot ?? createIndexSnapshot();

    const refreshedIndex = await refreshIndexSnapshotAttachmentUrls(context, indexSnapshot);
    replaceDatabaseFromIndexSnapshot(refreshedIndex.snapshot);

    if (refreshedIndex.didChange) {
      try {
        await syncRemoteIndexState();
      } catch (error) {
        logger.warn("[Discasa recovery] Could not sync the refreshed index snapshot to Discord.", error);
      }
    }

    if (folderSnapshot) {
      replaceDatabaseFromFolderSnapshot(folderSnapshot);
    }

    reconcilePendingRemoteOperations();

    if (options.importExternalFiles !== false) {
      try {
        const importResult = await importExternalLibraryFiles();
        if (importResult.imported.length > 0) {
          console.info(`[Discasa import] Imported ${importResult.imported.length} external file(s).`);
        }
      } catch (error) {
        logger.warn("[Discasa import] Could not import external files during hydration.", error);
      }
    }

    void drainPendingRemoteOperations();
    remoteLibraryHydrationKey = hydrationKey;
  })()
    .catch((error) => {
      logger.warn("[Discasa recovery] Could not hydrate the library from Discord snapshots.", error);
    })
    .finally(() => {
      remoteLibraryHydrationPromise = null;
    });

  await remoteLibraryHydrationPromise;
}

function normalizeMediaEditInput(raw: unknown): SaveLibraryItemMediaEditInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.rotationDegrees !== "number" ||
    !Number.isFinite(entry.rotationDegrees) ||
    typeof entry.hasCrop !== "boolean"
  ) {
    return null;
  }

  return {
    rotationDegrees: entry.rotationDegrees,
    hasCrop: entry.hasCrop,
  };
}

function expireRequestDiscordSession(request: Request): void {
  request.session.authenticated = false;
  request.session.discordAccessToken = undefined;
  request.session.discordRefreshToken = undefined;
  request.session.discordOauthState = undefined;
  request.session.user = undefined;
  clearPersistedAuthSession();
}

function sendLibraryFileSource(
  response: Response,
  source: { type: "file"; filePath: string; mimeType: string; fileName: string } | { type: "redirect"; url: string },
): void {
  if (source.type === "redirect") {
    response.setHeader("Cache-Control", "private, max-age=86400");
    response.redirect(source.url);
    return;
  }

  response.type(source.mimeType);
  response.sendFile(source.filePath, {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${encodeURIComponent(source.fileName)}"`,
    },
  });
}

async function refreshDiscordToken(refreshToken: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new DiscordAuthorizationError("Discord login expired. Please login again.", response.status);
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function refreshRequestDiscordSession(request: Request): Promise<boolean> {
  const refreshToken = request.session.discordRefreshToken;
  const user = request.session.user;

  if (!refreshToken || !user) {
    return false;
  }

  try {
    const token = await refreshDiscordToken(refreshToken);
    applyAuthenticatedSession(
      request,
      {
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? refreshToken,
      },
      user,
    );
    return true;
  } catch (error) {
    logger.warn("[Discord OAuth] Could not refresh the stored Discord session.", error);
    expireRequestDiscordSession(request);
    return false;
  }
}

async function listEligibleGuildsForRequest(request: Request) {
  try {
    return await listEligibleGuilds(request.session.discordAccessToken);
  } catch (error) {
    if (!(error instanceof DiscordAuthorizationError)) {
      throw error;
    }

    const didRefresh = await refreshRequestDiscordSession(request);
    if (!didRefresh) {
      throw error;
    }

    return listEligibleGuilds(request.session.discordAccessToken);
  }
}

router.get("/session", (request, response) => {
  const authenticated = Boolean(request.session.authenticated);
  const activeStorage = getActiveStorageContext();

  response.json({
    authenticated,
    user: authenticated
      ? request.session.user ?? {
          id: "mock_user",
          username: "Mock User",
          avatarUrl: null,
        }
      : null,
    activeGuild: activeStorage
      ? {
          id: activeStorage.guildId,
          name: activeStorage.guildName,
        }
      : null,
  });
});

router.get("/bot/status", async (_request, response, next) => {
  try {
    response.json(await getDiscasaBotStatus());
  } catch (error) {
    next(error);
  }
});

router.get("/diagnostics", async (request, response, next) => {
  try {
    const botStatus = await getDiscasaBotStatus();
    const botDiagnostics = await getDiscasaBotDiagnostics();
    const activeStorage = getActiveStorageContext();
    const config = getDiscasaConfig();
    const items = getLibraryItems();
    const albums = getAlbums();
    const localStorage = getLocalStorageStatus();

    response.json({
      ok: botStatus.ok,
      checkedAt: new Date().toISOString(),
      service: "discasa",
      app: {
        serverPort: env.port,
        frontendUrl: env.frontendUrl,
        mockMode: env.mockMode,
        authenticated: Boolean(request.session.authenticated),
        activeGuild: activeStorage
          ? {
              id: activeStorage.guildId,
              name: activeStorage.guildName,
            }
          : null,
      },
      bot: {
        status: botStatus,
        diagnostics: botDiagnostics,
      },
      library: {
        itemCount: items.length,
        activeItemCount: items.filter((item) => !item.isTrashed).length,
        trashedItemCount: items.filter((item) => item.isTrashed).length,
        albumCount: albums.length,
        pendingRemoteOperationCount: getPendingRemoteOperations().length,
      },
      storage: {
        remoteApplied: Boolean(activeStorage),
        local: localStorage,
      },
      config: {
        language: config.language,
        localMirrorEnabled: config.localMirrorEnabled,
        watchedFolderEnabled: config.watchedFolderEnabled,
        galleryDisplayMode: config.galleryDisplayMode,
        thumbnailZoomPercent: config.thumbnailZoomPercent,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/guilds", async (request, response, next) => {
  try {
    if (!request.session.authenticated) {
      response.status(401).json({ error: "Discord login required." });
      return;
    }

    const guilds = await listEligibleGuildsForRequest(request);
    response.json(guilds);
  } catch (error) {
    if (error instanceof DiscordAuthorizationError) {
      expireRequestDiscordSession(request);
      response.status(401).json({ error: "Discord login expired. Please login again." });
      return;
    }

    next(error);
  }
});

router.get("/discasa/status", async (request, response, next) => {
  try {
    if (!request.session.authenticated) {
      response.status(401).json({ error: "Discord login required." });
      return;
    }

    const guildId = String(request.query.guildId ?? "");

    if (!guildId) {
      response.status(400).json({ error: "guildId is required" });
      return;
    }

    const status = await inspectDiscasaSetup(guildId);
    response.json(status);
  } catch (error) {
    next(error);
  }
});

router.post("/discasa/initialize", async (request, response, next) => {
  try {
    const guildId = String(request.body.guildId ?? "");

    if (!guildId) {
      response.status(400).json({ error: "guildId is required" });
      return;
    }

    const result = await initializeDiscasaInGuild(guildId, request.session.user?.id);
    setActiveStorageContext(result);
    remoteLibraryHydrationKey = null;

    const [remoteIndexSnapshot, folderSnapshot, configSnapshot, hasCurrentIndex, hasCurrentFolder, hasCurrentConfig] = await Promise.all([
      readLatestIndexSnapshot(result),
      readLatestFolderSnapshot(result),
      readLatestConfigSnapshot(result),
      hasCurrentIndexSnapshot(result),
      hasCurrentFolderSnapshot(result),
      hasCurrentConfigSnapshot(result),
    ]);

    let unresolvedItems: DiscasaAttachmentRecoveryWarning[] = [];
    let relinkedItemCount = 0;
    let indexDidChange = false;

    if (remoteIndexSnapshot) {
      const refreshedIndex = await refreshIndexSnapshotAttachmentUrls(result, remoteIndexSnapshot);
      unresolvedItems = refreshedIndex.unresolvedItems;
      relinkedItemCount = refreshedIndex.relinkedItemCount;
      indexDidChange = refreshedIndex.didChange;
      replaceDatabaseFromIndexSnapshot(refreshedIndex.snapshot);
    } else {
      replaceDatabaseFromIndexSnapshot({
        version: 2,
        updatedAt: new Date().toISOString(),
        items: [],
      });
    }

    if (folderSnapshot) {
      replaceDatabaseFromFolderSnapshot(folderSnapshot);
    } else {
      replaceDatabaseFromFolderSnapshot({
        version: 1,
        updatedAt: new Date().toISOString(),
        folders: [],
        memberships: [],
      });
    }

    if (configSnapshot) {
      replaceConfigFromSnapshot(configSnapshot);
    } else {
      resetDiscasaConfig();
    }

    const externalImport = await importExternalLibraryFiles({ syncRemote: false });
    if (externalImport.imported.length > 0) {
      indexDidChange = true;
    }

    if (!hasCurrentIndex || indexDidChange) {
      await syncRemoteIndexState();
    }

    if (!hasCurrentFolder) {
      await syncRemoteFolderState();
    }

    if (!hasCurrentConfig) {
      await syncRemoteConfigState();
    }

    remoteLibraryHydrationKey = getRemoteLibraryHydrationKey(result);

    response.json({
      guildId: result.guildId,
      categoryName: result.categoryName,
      channels: Array.from(
        new Set([
          result.driveChannelName,
          result.indexChannelName,
          result.folderChannelName,
          result.trashChannelName,
          result.configChannelName,
        ]),
      ),
      recovery: {
        relinkedItemCount,
        unresolvedItems,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/config", async (_request, response, next) => {
  try {
    const activeStorage = getActiveStorageContext();

    if (!activeStorage) {
      response.json(resetDiscasaConfig());
      return;
    }

    if (env.mockMode) {
      response.json(getDiscasaConfig());
      return;
    }

    const snapshot = await readLatestConfigSnapshot(activeStorage);

    if (snapshot) {
      replaceConfigFromSnapshot(snapshot);
    } else {
      try {
        await syncRemoteConfigState();
      } catch (error) {
        logger.warn("[Discasa config] Could not sync the local config snapshot to Discord.", error);
      }
    }

    response.json(getDiscasaConfig());
  } catch (error) {
    next(error);
  }
});

router.patch("/config", async (request, response, next) => {
  try {
    const nextConfig = updateDiscasaConfig(request.body ?? {});
    queueRemoteConfigSync();
    response.json(nextConfig);
  } catch (error) {
    next(error);
  }
});

router.get("/local-storage", (_request, response) => {
  response.json(getLocalStorageStatus());
});

router.post("/local-paths/inspect", async (request, response, next) => {
  try {
    const rawFilePaths = Array.isArray(request.body.filePaths) ? request.body.filePaths : [];
    const inspected = await Promise.all(
      rawFilePaths.map(async (rawPath: unknown) => {
        if (typeof rawPath !== "string" || rawPath.length === 0) {
          return null;
        }

        const filePath = path.resolve(rawPath);
        try {
          const stat = await fs.stat(filePath);
          return {
            path: filePath,
            name: path.basename(filePath),
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
          };
        } catch {
          return {
            path: filePath,
            name: path.basename(filePath),
            isDirectory: false,
            isFile: false,
          };
        }
      }),
    );

    response.json({
      paths: inspected.filter(
        (entry): entry is { path: string; name: string; isDirectory: boolean; isFile: boolean } => Boolean(entry),
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/albums", async (_request, response, next) => {
  try {
    await hydrateRemoteLibraryState();
    response.json(getAlbums());
  } catch (error) {
    next(error);
  }
});

router.post("/albums", async (request, response, next) => {
  try {
    const name = String(request.body.name ?? "").trim();
    const parentId = typeof request.body.parentId === "string" && request.body.parentId.length > 0 ? request.body.parentId : null;

    if (!name) {
      response.status(400).json({ error: "Album name is required" });
      return;
    }

    const created = addAlbum(name, parentId);
    queueRemoteFolderSync();
    response.status(201).json({ id: created.id, album: created });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const name = String(request.body.name ?? "").trim();

    if (!albumId || !name) {
      response.status(400).json({ error: "albumId and name are required" });
      return;
    }

    const updated = renameAlbum(albumId, name);

    if (!updated) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    queueRemoteFolderSync();
    response.json(updated);
  } catch (error) {
    next(error);
  }
});

router.put("/albums/reorder", async (request, response, next) => {
  try {
    const rawBody = request.body as { orderedIds?: unknown };
    const orderedIds = Array.isArray(rawBody.orderedIds)
      ? rawBody.orderedIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!orderedIds.length) {
      response.status(400).json({ error: "orderedIds is required" });
      return;
    }

    const albums = reorderAlbums(orderedIds);
    queueRemoteFolderSync();
    response.json({ albums });
  } catch (error) {
    next(error);
  }
});

router.delete("/albums/:albumId", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");

    if (!albumId) {
      response.status(400).json({ error: "albumId is required" });
      return;
    }

    const deleted = deleteAlbum(albumId);

    if (!deleted) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    queueRemoteFolderSync();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

router.put("/albums/:albumId/items", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = addLibraryItemsToAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    queueRemoteFolderSync();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId/items/move", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = moveLibraryItemsToAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    queueRemoteFolderSync();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId/items/remove", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = removeLibraryItemsFromAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    queueRemoteFolderSync();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.get("/library", async (_request, response, next) => {
  try {
    await hydrateRemoteLibraryState();
    response.json(getLibraryItems());
  } catch (error) {
    next(error);
  }
});

router.post("/library/import-external-files", async (_request, response, next) => {
  try {
    if (!env.mockMode && !getActiveStorageContext()) {
      response.status(400).json({ error: "Apply a Discord server in Settings before syncing external files." });
      return;
    }

    await hydrateRemoteLibraryState({ importExternalFiles: false });
    response.json(await importExternalLibraryFiles());
  } catch (error) {
    next(error);
  }
});

router.get("/library/:itemId/content", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const source = await getLibraryItemContentSource(itemId);

    if (!source) {
      response.status(404).json({ error: "Library item content is not available." });
      return;
    }

    sendLibraryFileSource(response, source);
  } catch (error) {
    next(error);
  }
});

router.get("/library/:itemId/thumbnail", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const source = await getLibraryItemThumbnailSource(itemId);

    if (!source) {
      response.status(404).json({ error: "Library item thumbnail is not available." });
      return;
    }

    sendLibraryFileSource(response, source);
  } catch (error) {
    next(error);
  }
});

router.post("/upload", upload.array("files"), async (request, response, next) => {
  try {
    const files = request.files as Express.Multer.File[] | undefined;
    const albumId = typeof request.body.albumId === "string" && request.body.albumId.length > 0 ? request.body.albumId : undefined;

    if (!files?.length) {
      response.status(400).json({ error: "At least one file is required" });
      return;
    }

    if (env.mockMode) {
      const uploaded = addMockFiles(files, albumId);
      cacheUploadedFilesForLocalAccess(uploaded, files);
      queueRemoteLibrarySync();
      response.status(201).json({ uploaded });
      return;
    }

    const activeStorage = getActiveStorageContext();

    if (!activeStorage) {
      response.status(400).json({ error: "Apply a Discord server in Settings before uploading files." });
      return;
    }

    const uploadedRecords = await uploadFilesToDiscordDrive(files, activeStorage);
    const uploadedRecordsWithHashes = uploadedRecords.map((record, index) => ({
      ...record,
      contentHash: files[index] ? hashBuffer(files[index].buffer) : undefined,
    }));
    const uploaded = addUploadedFiles(uploadedRecordsWithHashes, albumId);
    cacheUploadedFilesForLocalAccess(uploaded, files);
    queueRemoteLibrarySync();
    response.status(201).json({ uploaded });
  } catch (error) {
    next(error);
  }
});

router.post("/upload-local", async (request, response, next) => {
  try {
    const albumId = typeof request.body.albumId === "string" && request.body.albumId.length > 0 ? request.body.albumId : undefined;
    const rawFilePaths = Array.isArray(request.body.filePaths) ? request.body.filePaths : [];
    const clientUploadIds = readClientUploadIds(request.body.clientUploadIds, rawFilePaths.length);
    const folderTargets = readFolderUploadTargets(request.body.folderTargets);
    const batches = await readLocalUploadBatches(rawFilePaths, { albumId, clientUploadIds, folderTargets });
    const fileCount = batches.reduce((count, batch) => count + batch.files.length, 0);

    if (!fileCount) {
      response.status(400).json({ error: "At least one readable local file is required" });
      return;
    }

    const activeStorage = getActiveStorageContext();
    if (!env.mockMode && !activeStorage) {
      throw new Error("Apply a Discord server in Settings before uploading files.");
    }

    const uploaded: LibraryItem[] = [];
    for (const batch of batches) {
      const targetAlbumId = batch.albumName ? addAlbum(batch.albumName, batch.parentAlbumId ?? null).id : batch.albumId;
      const records = env.mockMode
        ? batch.files.map((file) => ({
            fileName: file.fileName,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            guildId: activeStorage?.guildId ?? "mock_active_guild",
            attachmentUrl: `mock://uploads/${encodeURIComponent(file.fileName)}`,
            uploadedAt: file.modifiedAt,
            contentHash: file.contentHash,
          }))
        : await uploadLocalFilesToDiscordDrive(batch.files, activeStorage!);
      const recordsWithLocalMetadata = records.map((record, index) => ({
        ...record,
        itemId: batch.clientUploadIds?.[index],
        contentHash: batch.files[index]?.contentHash,
      }));
      const uploadedBatch = addUploadedFiles(recordsWithLocalMetadata, targetAlbumId);
      cacheUploadedLocalFilesForLocalAccess(uploadedBatch, batch.files);
      uploaded.push(...uploadedBatch);
    }

    queueRemoteLibrarySync();
    response.status(201).json({ uploaded, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/favorite", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const item = toggleFavoriteState(itemId);

    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    queueRemoteIndexSync();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/trash", async (request, response, next) => {
  try {
    const itemIds = readItemIds(request.body?.itemIds);
    if (itemIds.length === 0) {
      response.status(400).json({ error: "itemIds must include at least one item." });
      return;
    }

    let activeStorage = getActiveStorageContext();
    if (!env.mockMode) {
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before using the trash." });
        return;
      }
    }

    const items = trashLibraryItems(itemIds);
    if (items.length === 0) {
      response.status(404).json({ error: "Library items not found" });
      return;
    }

    if (!env.mockMode && activeStorage) {
      enqueuePendingMoveItemStorageOperations(
        items.map((item) => item.id),
        "trash",
        activeStorage,
      );
      resumePendingRemoteOperations();
    }

    queueRemoteIndexSync();
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/trash", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    let activeStorage = getActiveStorageContext();
    if (!env.mockMode && !activeStorage) {
      response.status(400).json({ error: "Apply a Discord server in Settings before using the trash." });
      return;
    }

    const item = trashLibraryItem(itemId);
    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode && activeStorage) {
      enqueuePendingMoveItemStorageOperations([item.id], "trash", activeStorage);
      resumePendingRemoteOperations();
    }

    queueRemoteIndexSync();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/restore", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode) {
      const activeStorage = getActiveStorageContext();
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before restoring files." });
        return;
      }

      const movedRecord = await restoreStoredItemFromTrash(activeStorage, originalItem);
      updateLibraryItemStorage(itemId, {
        guildId: movedRecord.guildId,
        attachmentUrl: movedRecord.attachmentUrl,
        storageChannelId: movedRecord.storageChannelId,
        storageMessageId: movedRecord.storageMessageId,
      });
    }

    const item = restoreLibraryItem(itemId);

    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    queueRemoteIndexSync();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/media-edit", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const input = normalizeMediaEditInput(request.body);

    if (!itemId || !input) {
      response.status(400).json({ error: "rotationDegrees and hasCrop are required" });
      return;
    }

    const originalItem = getLibraryItem(itemId);
    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!originalItem.mimeType.startsWith("image/")) {
      response.status(400).json({ error: "Only image items currently support saved edits." });
      return;
    }

    const item = saveLibraryItemMediaEdit(itemId, input);
    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    queueRemoteIndexSync();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/library/:itemId/media-edit", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!itemId) {
      response.status(400).json({ error: "itemId is required" });
      return;
    }

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!originalItem.mimeType.startsWith("image/")) {
      response.status(400).json({ error: "Only image items currently support restoring the original." });
      return;
    }

    const item = restoreLibraryItemOriginal(itemId);
    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    queueRemoteIndexSync();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/library/:itemId", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode) {
      const activeStorage = getActiveStorageContext();
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before deleting files." });
        return;
      }

      await deleteStoredItemFromDiscord(activeStorage, originalItem);
    }

    const deleted = deleteLibraryItem(itemId);

    if (!deleted) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    queueRemoteLibrarySync();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

type SessionUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

const authRouter = Router();
const MOCK_ACCESS_TOKEN = "mock_discord_access_token";
const MOCK_REFRESH_TOKEN = "mock_discord_refresh_token";

function createOauthState(): string {
  return randomBytes(16).toString("hex");
}

function buildDiscordAvatarUrl(user: DiscordUserResponse): string | null {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function toSessionUser(user: DiscordUserResponse): SessionUser {
  return {
    id: user.id,
    username: user.global_name ?? user.username,
    avatarUrl: buildDiscordAvatarUrl(user),
  };
}

function applyAuthenticatedSession(
  request: Request,
  token: { access_token: string; refresh_token?: string },
  user: SessionUser,
): void {
  request.session.authenticated = true;
  request.session.discordOauthState = undefined;
  request.session.discordAccessToken = token.access_token;
  request.session.discordRefreshToken = token.refresh_token;
  request.session.user = {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl ?? null,
  };

  setPersistedAuthSession({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    user,
  });
}

function applyMockAuthenticatedSession(request: Request): void {
  applyAuthenticatedSession(
    request,
    {
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: MOCK_REFRESH_TOKEN,
    },
    {
      id: "mock_user",
      username: "Mock User",
      avatarUrl: null,
    },
  );
}

function renderOauthResultPage(options: { title: string; message: string; isError?: boolean }): string {
  const title = options.title;
  const message = options.message;
  const statusLabel = options.isError ? "Login failed" : "Login complete";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: radial-gradient(circle at top, rgba(90, 95, 255, 0.22), rgba(7, 10, 18, 0.98) 58%);
        color: rgba(255, 255, 255, 0.92);
      }

      .panel {
        width: min(480px, 100%);
        padding: 28px;
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(13, 17, 27, 0.94);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.45);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        background: ${options.isError ? "rgba(123, 34, 41, 0.32)" : "rgba(88, 101, 242, 0.22)"};
        color: ${options.isError ? "#ffb1b5" : "#c7d0ff"};
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      h1 {
        margin: 18px 0 10px;
        font-size: 24px;
        font-weight: 600;
      }

      p {
        margin: 0;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.55;
      }

      .hint {
        margin-top: 20px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <span class="badge">${statusLabel}</span>
      <h1>${title}</h1>
      <p>${message}</p>
      <p class="hint">You can close this browser window and return to Discasa.</p>
    </main>
    <script>
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // Ignore browser restrictions.
        }
      }, 1200);
    </script>
  </body>
</html>`;
}

async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.discordRedirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to exchange the Discord authorization code.");
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function getCurrentDiscordUser(accessToken: string): Promise<DiscordUserResponse> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch the current Discord user.");
  }

  return (await response.json()) as DiscordUserResponse;
}

function buildBotPermissionInteger(): string {
  return BOT_INVITE_PERMISSIONS.toString();
}

authRouter.get("/discord/login", (request, response) => {
  if (env.mockMode) {
    applyMockAuthenticatedSession(request);
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "The mock Discord session was connected successfully.",
      }),
    );
    return;
  }

  const state = createOauthState();
  request.session.discordOauthState = state;

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    response_type: "code",
    redirect_uri: env.discordRedirectUri,
    scope: "identify guilds",
    state,
    prompt: "consent",
  });

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

authRouter.get("/discord/install", (request, response) => {
  if (env.mockMode) {
    response.send(
      renderOauthResultPage({
        title: "Discasa ready to apply",
        message: "Mock mode is enabled, so the bot step was skipped.",
      }),
    );
    return;
  }

  const guildId = typeof request.query.guildId === "string" ? request.query.guildId : "";
  const params = new URLSearchParams({
    client_id: env.discordClientId,
    scope: "bot applications.commands",
    permissions: buildBotPermissionInteger(),
  });

  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

authRouter.post("/discord/logout", (request, response) => {
  clearPersistedAuthSession();
  setActiveStorageContext(null);

  response.clearCookie("connect.sid");

  request.session.destroy((error) => {
    if (error) {
      response.status(500).json({ error: "Could not logout from Discord." });
      return;
    }

    response.json({ loggedOut: true });
  });
});

authRouter.get("/discord/callback", async (request, response) => {
  if (env.mockMode) {
    applyMockAuthenticatedSession(request);
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "The mock Discord session was connected successfully.",
      }),
    );
    return;
  }

  try {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";

    if (!code) {
      response.status(400).send(
        renderOauthResultPage({
          title: "Discasa login failed",
          message: "The Discord authorization code was not returned. Please try again from the app.",
          isError: true,
        }),
      );
      return;
    }

    if (!state || state !== request.session.discordOauthState) {
      response.status(400).send(
        renderOauthResultPage({
          title: "Discasa login failed",
          message: "The Discord OAuth state did not match. Please start the login again from Discasa.",
          isError: true,
        }),
      );
      return;
    }

    const token = await exchangeDiscordCode(code);
    const user = await getCurrentDiscordUser(token.access_token);

    applyAuthenticatedSession(request, token, toSessionUser(user));
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "Discord authentication succeeded. Return to Discasa to choose your server.",
      }),
    );
  } catch (error) {
    logger.error("Discord OAuth callback failed", error);
    clearPersistedAuthSession();
    response.status(500).send(
      renderOauthResultPage({
        title: "Discasa login failed",
        message: "Discasa could not finish the Discord login. Please try again from the app.",
        isError: true,
      }),
    );
  }
});

export { router as apiRouter, authRouter };
