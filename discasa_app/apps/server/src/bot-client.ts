import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import type {
  DiscasaAttachmentRecoveryWarning,
  LibraryItem,
  LibraryItemStorageManifest,
  LibraryItemStoragePart,
  PersistedConfigSnapshot,
  PersistedFolderSnapshot,
  PersistedIndexSnapshot,
} from "@discasa/shared";
import { env } from "./config";
import type { ActiveStorageContext, UploadedFileRecord } from "./persistence";

export type DiscasaBotStatus = {
  processAvailable: boolean;
  ok: boolean;
  mockMode: boolean;
  botConfigured: boolean;
  botLoggedIn: boolean;
  botUserId: string | null;
  error?: string;
};

type DiscasaSetupStatus = {
  botPresent: boolean;
  categoryPresent: boolean;
  channelsPresent: boolean;
  configMarkerPresent: boolean;
  isApplied: boolean;
  missingChannels: string[];
};

type RefreshIndexSnapshotResult = {
  snapshot: PersistedIndexSnapshot;
  relinkedItemCount: number;
  unresolvedItems: DiscasaAttachmentRecoveryWarning[];
  didChange: boolean;
};

type DiscordDriveScanResult = {
  records: UploadedFileRecord[];
  scannedAttachmentCount: number;
  skippedAttachmentCount: number;
  skippedGroupedMessageCount: number;
};

type SnapshotKind = "index" | "folder" | "config";

type BotErrorPayload = {
  error?: string;
};

type UploadableFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

export type LocalUploadableFile = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  modifiedAt: string;
};

const CHUNK_UPLOAD_SAFETY_BYTES = 512 * 1024;
const MIN_CHUNK_SIZE_BYTES = 1024 * 1024;

function getBotBaseUrl(): string {
  return env.discordBotUrl.replace(/\/+$/, "");
}

async function requestBotJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getBotBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    throw new Error(`Discasa bot service is unavailable at ${getBotBaseUrl()}: ${message}`);
  }

  if (!response.ok) {
    let payload: BotErrorPayload | null = null;

    try {
      payload = (await response.json()) as BotErrorPayload;
    } catch {
      payload = null;
    }

    throw new Error(payload?.error ?? `Discasa bot service request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function toJsonBody(payload: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(payload),
  };
}

function getChunkSize(uploadLimitBytes: number): number {
  return Math.min(uploadLimitBytes, Math.max(MIN_CHUNK_SIZE_BYTES, uploadLimitBytes - CHUNK_UPLOAD_SAFETY_BYTES));
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashLocalFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function readLocalFileChunk(filePath: string, start: number, size: number): Promise<Buffer> {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(size);
    const result = await handle.read(buffer, 0, size, start);
    return result.bytesRead === size ? buffer : buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function formatChunkFileName(fileName: string, index: number, totalChunks: number): string {
  const width = Math.max(4, String(totalChunks).length);
  return `${fileName}.discasa.part${String(index + 1).padStart(width, "0")}`;
}

function hasChunkedStorage(item: Pick<LibraryItem, "storageManifest">): item is Pick<LibraryItem, "storageManifest"> & {
  storageManifest: LibraryItemStorageManifest;
} {
  return item.storageManifest?.mode === "chunked";
}

function toUploadableFile(file: Express.Multer.File): UploadableFile {
  return {
    originalname: file.originalname,
    mimetype: file.mimetype || "application/octet-stream",
    buffer: Buffer.from(file.buffer),
    size: file.size,
  };
}

async function downloadAttachmentBuffer(attachmentUrl: string): Promise<Buffer> {
  const response = await fetch(attachmentUrl);
  if (!response.ok) {
    throw new Error("Failed to download the stored Discord attachment.");
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function getDiscasaBotStatus(): Promise<DiscasaBotStatus> {
  try {
    const status = await requestBotJson<Omit<DiscasaBotStatus, "processAvailable">>("/health");
    return {
      processAvailable: true,
      ...status,
    };
  } catch (error) {
    return {
      processAvailable: false,
      ok: false,
      mockMode: false,
      botConfigured: false,
      botLoggedIn: false,
      botUserId: null,
      error: error instanceof Error ? error.message : "Discasa bot service is unavailable.",
    };
  }
}

export async function inspectDiscasaSetup(guildId: string): Promise<DiscasaSetupStatus> {
  return requestBotJson<DiscasaSetupStatus>(`/guilds/${encodeURIComponent(guildId)}/setup-status`);
}

export async function initializeDiscasaInGuild(
  guildId: string,
  authenticatedUserId?: string,
): Promise<ActiveStorageContext> {
  return requestBotJson<ActiveStorageContext>(
    `/guilds/${encodeURIComponent(guildId)}/initialize`,
    toJsonBody({ authenticatedUserId }),
  );
}

export async function getDiscordUploadLimitForGuild(guildId: string): Promise<number> {
  const payload = await requestBotJson<{ uploadLimitBytes: number }>(`/guilds/${encodeURIComponent(guildId)}/upload-limit`);
  return payload.uploadLimitBytes;
}

async function uploadFilesToDiscordChannel(
  files: UploadableFile[],
  context: ActiveStorageContext,
  targetChannelId: string,
): Promise<UploadedFileRecord[]> {
  const body = new FormData();
  body.append("context", JSON.stringify(context));
  body.append("targetChannelId", targetChannelId);

  for (const file of files) {
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], { type: file.mimetype || "application/octet-stream" });
    body.append("files", blob, file.originalname);
  }

  const payload = await requestBotJson<{ records: UploadedFileRecord[] }>("/files/upload", {
    method: "POST",
    body,
  });
  return payload.records;
}

async function uploadSingleFileToDiscordChannel(
  file: UploadableFile,
  context: ActiveStorageContext,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  const [record] = await uploadFilesToDiscordChannel([file], context, targetChannelId);
  if (!record) {
    throw new Error(`Discord did not return an upload record for ${file.originalname}.`);
  }

  return {
    ...record,
    fileSize: file.size,
    storageManifest: null,
  };
}

async function uploadChunkedFileToDiscordChannel(
  file: UploadableFile,
  context: ActiveStorageContext,
  targetChannelId: string,
  uploadLimitBytes: number,
): Promise<UploadedFileRecord> {
  const chunkSize = getChunkSize(uploadLimitBytes);
  const totalChunks = Math.ceil(file.buffer.byteLength / chunkSize);
  const parts: LibraryItemStoragePart[] = [];

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.buffer.byteLength);
    const chunkBuffer = file.buffer.subarray(start, end);
    const partName = formatChunkFileName(file.originalname, index, totalChunks);
    const uploadedPart = await uploadSingleFileToDiscordChannel(
      {
        originalname: partName,
        mimetype: "application/octet-stream",
        buffer: chunkBuffer,
        size: chunkBuffer.byteLength,
      },
      context,
      targetChannelId,
    );

    if (!uploadedPart.storageChannelId || !uploadedPart.storageMessageId) {
      throw new Error(`Discord did not return storage metadata for ${partName}.`);
    }

    parts.push({
      index,
      fileName: partName,
      size: chunkBuffer.byteLength,
      sha256: hashBuffer(chunkBuffer),
      attachmentUrl: uploadedPart.attachmentUrl,
      storageChannelId: uploadedPart.storageChannelId,
      storageMessageId: uploadedPart.storageMessageId,
    });
  }

  const firstPart = parts[0];
  if (!firstPart) {
    throw new Error(`Cannot upload an empty chunked file: ${file.originalname}.`);
  }

  return {
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype || "application/octet-stream",
    guildId: context.guildId,
    attachmentUrl: firstPart.attachmentUrl,
    storageChannelId: firstPart.storageChannelId,
    storageMessageId: firstPart.storageMessageId,
    storageManifest: {
      mode: "chunked",
      version: 1,
      chunkSize,
      totalChunks,
      totalSize: file.size,
      sha256: hashBuffer(file.buffer),
      parts,
    },
  };
}

export async function uploadFilesToDiscordDrive(
  files: Express.Multer.File[],
  context: ActiveStorageContext,
): Promise<UploadedFileRecord[]> {
  const uploadLimitBytes = await getDiscordUploadLimitForGuild(context.guildId);
  const uploaded: UploadedFileRecord[] = [];

  for (const file of files.map(toUploadableFile)) {
    const record =
      file.size <= uploadLimitBytes
        ? await uploadSingleFileToDiscordChannel(file, context, context.driveChannelId)
        : await uploadChunkedFileToDiscordChannel(file, context, context.driveChannelId, uploadLimitBytes);

    uploaded.push(record);
  }

  return uploaded;
}

async function uploadSingleLocalFileToDiscordChannel(
  file: LocalUploadableFile,
  context: ActiveStorageContext,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  const buffer = await fs.readFile(file.filePath);
  const record = await uploadSingleFileToDiscordChannel(
    {
      originalname: file.fileName,
      mimetype: file.mimeType || "application/octet-stream",
      buffer,
      size: file.fileSize,
    },
    context,
    targetChannelId,
  );

  return {
    ...record,
    fileSize: file.fileSize,
    uploadedAt: file.modifiedAt,
  };
}

async function uploadChunkedLocalFileToDiscordChannel(
  file: LocalUploadableFile,
  context: ActiveStorageContext,
  targetChannelId: string,
  uploadLimitBytes: number,
): Promise<UploadedFileRecord> {
  const chunkSize = getChunkSize(uploadLimitBytes);
  const totalChunks = Math.ceil(file.fileSize / chunkSize);
  const fullHash = await hashLocalFile(file.filePath);
  const parts: LibraryItemStoragePart[] = [];

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const size = Math.min(chunkSize, file.fileSize - start);
    const chunkBuffer = await readLocalFileChunk(file.filePath, start, size);
    const partName = formatChunkFileName(file.fileName, index, totalChunks);
    const uploadedPart = await uploadSingleFileToDiscordChannel(
      {
        originalname: partName,
        mimetype: "application/octet-stream",
        buffer: chunkBuffer,
        size: chunkBuffer.byteLength,
      },
      context,
      targetChannelId,
    );

    if (!uploadedPart.storageChannelId || !uploadedPart.storageMessageId) {
      throw new Error(`Discord did not return storage metadata for ${partName}.`);
    }

    parts.push({
      index,
      fileName: partName,
      size: chunkBuffer.byteLength,
      sha256: hashBuffer(chunkBuffer),
      attachmentUrl: uploadedPart.attachmentUrl,
      storageChannelId: uploadedPart.storageChannelId,
      storageMessageId: uploadedPart.storageMessageId,
    });
  }

  const firstPart = parts[0];
  if (!firstPart) {
    throw new Error(`Cannot upload an empty chunked file: ${file.fileName}.`);
  }

  return {
    fileName: file.fileName,
    fileSize: file.fileSize,
    mimeType: file.mimeType || "application/octet-stream",
    guildId: context.guildId,
    attachmentUrl: firstPart.attachmentUrl,
    uploadedAt: file.modifiedAt,
    storageChannelId: firstPart.storageChannelId,
    storageMessageId: firstPart.storageMessageId,
    storageManifest: {
      mode: "chunked",
      version: 1,
      chunkSize,
      totalChunks,
      totalSize: file.fileSize,
      sha256: fullHash,
      parts,
    },
  };
}

export async function uploadLocalFilesToDiscordDrive(
  files: LocalUploadableFile[],
  context: ActiveStorageContext,
): Promise<UploadedFileRecord[]> {
  const uploadLimitBytes = await getDiscordUploadLimitForGuild(context.guildId);
  const uploaded: UploadedFileRecord[] = [];

  for (const file of files) {
    const record =
      file.fileSize <= uploadLimitBytes
        ? await uploadSingleLocalFileToDiscordChannel(file, context, context.driveChannelId)
        : await uploadChunkedLocalFileToDiscordChannel(file, context, context.driveChannelId, uploadLimitBytes);

    uploaded.push(record);
  }

  return uploaded;
}

export async function scanDiscordDriveForNewFiles(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<DiscordDriveScanResult> {
  return requestBotJson<DiscordDriveScanResult>(
    "/files/drive/scan",
    toJsonBody({ context, knownItems: snapshot.items }),
  );
}

export async function refreshIndexSnapshotAttachmentUrls(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<RefreshIndexSnapshotResult> {
  return requestBotJson<RefreshIndexSnapshotResult>("/snapshots/index/refresh-attachments", toJsonBody({ context, snapshot }));
}

export async function hasCurrentIndexSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("index", context);
}

export async function hasCurrentFolderSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("folder", context);
}

export async function hasCurrentConfigSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("config", context);
}

async function hasCurrentSnapshot(kind: SnapshotKind, context: ActiveStorageContext): Promise<boolean> {
  const payload = await requestBotJson<{ current: boolean }>(`/snapshots/${kind}/current`, toJsonBody({ context }));
  return payload.current;
}

export async function readLatestIndexSnapshot(context: ActiveStorageContext): Promise<PersistedIndexSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedIndexSnapshot | null }>(`/snapshots/index/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function readLatestFolderSnapshot(context: ActiveStorageContext): Promise<PersistedFolderSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedFolderSnapshot | null }>(`/snapshots/folder/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function readLatestConfigSnapshot(context: ActiveStorageContext): Promise<PersistedConfigSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedConfigSnapshot | null }>(`/snapshots/config/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function syncIndexSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/index/sync", toJsonBody({ context, snapshot }));
}

export async function syncFolderSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedFolderSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/folder/sync", toJsonBody({ context, snapshot }));
}

export async function syncConfigSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedConfigSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/config/sync", toJsonBody({ context, snapshot }));
}

async function deleteStorageMessages(
  context: ActiveStorageContext,
  messages: Array<{ channelId: string; messageId: string }>,
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  await requestBotJson<{ deleted: true }>("/files/delete-messages", toJsonBody({ context, messages }));
}

function getSingleStorageMessage(item: LibraryItem): { channelId: string; messageId: string } | null {
  if (!item.storageChannelId || !item.storageMessageId) {
    return null;
  }

  return {
    channelId: item.storageChannelId,
    messageId: item.storageMessageId,
  };
}

function createRecordFromChunkedManifest(
  item: Pick<LibraryItem, "name" | "size" | "mimeType">,
  guildId: string,
  storageManifest: LibraryItemStorageManifest,
): UploadedFileRecord {
  const firstPart = storageManifest.parts[0];
  if (!firstPart) {
    throw new Error(`Chunked storage manifest for "${item.name}" has no parts.`);
  }

  return {
    fileName: item.name,
    fileSize: item.size,
    mimeType: item.mimeType,
    guildId,
    attachmentUrl: firstPart.attachmentUrl,
    storageChannelId: firstPart.storageChannelId,
    storageMessageId: firstPart.storageMessageId,
    storageManifest,
  };
}

async function moveSingleStoredItemToChannel(
  context: ActiveStorageContext,
  item: LibraryItem,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  if (item.storageChannelId === targetChannelId && item.storageMessageId) {
    return {
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      guildId: context.guildId,
      attachmentUrl: item.attachmentUrl,
      storageChannelId: item.storageChannelId,
      storageMessageId: item.storageMessageId,
      storageManifest: null,
    };
  }

  const buffer = await downloadAttachmentBuffer(item.attachmentUrl);
  const moved = await uploadSingleFileToDiscordChannel(
    {
      originalname: item.name,
      mimetype: item.mimeType || "application/octet-stream",
      buffer,
      size: item.size,
    },
    context,
    targetChannelId,
  );
  const oldMessage = getSingleStorageMessage(item);
  if (oldMessage) {
    await deleteStorageMessages(context, [oldMessage]);
  }

  return {
    ...moved,
    fileSize: item.size,
    storageManifest: null,
  };
}

async function moveChunkedStoredItemToChannel(
  context: ActiveStorageContext,
  item: LibraryItem,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  if (!hasChunkedStorage(item)) {
    throw new Error(`"${item.name}" is not stored as a chunked file.`);
  }

  if (item.storageManifest.parts.every((part) => part.storageChannelId === targetChannelId)) {
    return createRecordFromChunkedManifest(item, context.guildId, item.storageManifest);
  }

  const nextParts: LibraryItemStoragePart[] = [];

  for (const part of item.storageManifest.parts) {
    const buffer = await downloadAttachmentBuffer(part.attachmentUrl);
    if (buffer.byteLength !== part.size || hashBuffer(buffer) !== part.sha256) {
      throw new Error(`Chunk ${part.index + 1} for "${item.name}" failed integrity validation.`);
    }

    const uploadedPart = await uploadSingleFileToDiscordChannel(
      {
        originalname: part.fileName,
        mimetype: "application/octet-stream",
        buffer,
        size: part.size,
      },
      context,
      targetChannelId,
    );

    if (!uploadedPart.storageChannelId || !uploadedPart.storageMessageId) {
      throw new Error(`Discord did not return storage metadata for ${part.fileName}.`);
    }

    nextParts.push({
      ...part,
      attachmentUrl: uploadedPart.attachmentUrl,
      storageChannelId: uploadedPart.storageChannelId,
      storageMessageId: uploadedPart.storageMessageId,
    });
  }

  await deleteStorageMessages(
    context,
    item.storageManifest.parts.map((part) => ({
      channelId: part.storageChannelId,
      messageId: part.storageMessageId,
    })),
  );

  return createRecordFromChunkedManifest(item, context.guildId, {
    ...item.storageManifest,
    parts: nextParts,
  });
}

async function moveStoredItemToChannel(
  context: ActiveStorageContext,
  item: LibraryItem,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  return hasChunkedStorage(item)
    ? moveChunkedStoredItemToChannel(context, item, targetChannelId)
    : moveSingleStoredItemToChannel(context, item, targetChannelId);
}

export async function moveStoredItemToTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  return moveStoredItemToChannel(context, item, context.trashChannelId);
}

export async function restoreStoredItemFromTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  return moveStoredItemToChannel(context, item, context.driveChannelId);
}

export async function deleteStoredItemFromDiscord(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<void> {
  if (hasChunkedStorage(item)) {
    await deleteStorageMessages(
      context,
      item.storageManifest.parts.map((part) => ({
        channelId: part.storageChannelId,
        messageId: part.storageMessageId,
      })),
    );
    return;
  }

  const message = getSingleStorageMessage(item);
  if (message) {
    await deleteStorageMessages(context, [message]);
  }
}
