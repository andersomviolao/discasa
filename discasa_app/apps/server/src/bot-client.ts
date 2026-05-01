import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import type {
  DiscasaAttachmentRecoveryWarning,
  LibraryItem,
  LibraryItemIndex,
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

type DiscordDriveAttachmentRecord = UploadedFileRecord & {
  proxyUrl?: string;
};

type DiscordDriveAttachmentPage = {
  records: DiscordDriveAttachmentRecord[];
  scannedAttachmentCount: number;
  nextBeforeMessageId?: string;
};

type AttachmentReferenceRequest = {
  preferredFileName: string;
  currentAttachmentUrl?: string;
  storageChannelId?: string;
  storageMessageId?: string;
  candidateChannelIds: string[];
  botAuthoredOnly?: boolean;
};

type AttachmentReferenceResolution = {
  channelId: string;
  messageId: string;
  attachmentUrl: string;
  method: "message-reference" | "history-scan";
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
const INDEX_SNAPSHOT_FILENAME = "discasa-index.snapshot.json";
const LEGACY_INDEX_SNAPSHOT_FILENAME = "discasa-index.json";
const FOLDER_SNAPSHOT_FILENAME = "discasa-folder.snapshot.json";
const CONFIG_SNAPSHOT_FILENAME = "discasa-config.snapshot.json";
const INSTALL_MARKER_FILENAME = "discasa-install.marker.json";
const DISCASA_CHUNK_PART_FILENAME_PATTERN = /\.discasa\.part\d+$/i;

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

type KnownDriveAttachmentIndex = {
  messageAttachmentKeys: Set<string>;
  attachmentUrls: Set<string>;
};

function getStorageMessageKey(channelId?: string, messageId?: string): string | null {
  if (!channelId || !messageId) {
    return null;
  }

  return `${channelId}:${messageId}`;
}

function getStorageMessageAttachmentKey(
  channelId: string | undefined,
  messageId: string | undefined,
  fileName: string | undefined,
  fileSize: number | undefined,
): string | null {
  const messageKey = getStorageMessageKey(channelId, messageId);

  if (!messageKey || !fileName || typeof fileSize !== "number") {
    return null;
  }

  return `${messageKey}:${fileName}:${fileSize}`;
}

function addKnownStorageReference(
  index: KnownDriveAttachmentIndex,
  reference: {
    fileName?: string;
    fileSize?: number;
    attachmentUrl?: string;
    storageChannelId?: string;
    storageMessageId?: string;
    storageManifest?: LibraryItemStorageManifest | null;
  },
): void {
  const messageAttachmentKey = getStorageMessageAttachmentKey(
    reference.storageChannelId,
    reference.storageMessageId,
    reference.fileName,
    reference.fileSize,
  );

  if (messageAttachmentKey) {
    index.messageAttachmentKeys.add(messageAttachmentKey);
  }

  if (reference.attachmentUrl) {
    index.attachmentUrls.add(reference.attachmentUrl);
  }

  if (reference.storageManifest?.mode === "chunked") {
    for (const part of reference.storageManifest.parts) {
      const partMessageAttachmentKey = getStorageMessageAttachmentKey(
        part.storageChannelId,
        part.storageMessageId,
        part.fileName,
        part.size,
      );

      if (partMessageAttachmentKey) {
        index.messageAttachmentKeys.add(partMessageAttachmentKey);
      }

      index.attachmentUrls.add(part.attachmentUrl);
    }
  }
}

function createKnownDriveAttachmentIndex(items: LibraryItemIndex[]): KnownDriveAttachmentIndex {
  const index: KnownDriveAttachmentIndex = {
    messageAttachmentKeys: new Set(),
    attachmentUrls: new Set(),
  };

  for (const item of items) {
    addKnownStorageReference(index, {
      ...item,
      fileName: item.name,
      fileSize: item.size,
    });

    if (item.originalSource) {
      addKnownStorageReference(index, item.originalSource);
    }
  }

  return index;
}

function isDiscasaManagedDriveAttachment(fileName: string): boolean {
  return (
    DISCASA_CHUNK_PART_FILENAME_PATTERN.test(fileName) ||
    fileName === INDEX_SNAPSHOT_FILENAME ||
    fileName === LEGACY_INDEX_SNAPSHOT_FILENAME ||
    fileName === FOLDER_SNAPSHOT_FILENAME ||
    fileName === CONFIG_SNAPSHOT_FILENAME ||
    fileName === INSTALL_MARKER_FILENAME
  );
}

function isKnownDriveAttachment(
  context: ActiveStorageContext,
  attachment: DiscordDriveAttachmentRecord,
  known: KnownDriveAttachmentIndex,
): boolean {
  const messageAttachmentKey = getStorageMessageAttachmentKey(
    context.driveChannelId,
    attachment.storageMessageId,
    attachment.fileName,
    attachment.fileSize,
  );

  return Boolean(
    (messageAttachmentKey && known.messageAttachmentKeys.has(messageAttachmentKey)) ||
      known.attachmentUrls.has(attachment.attachmentUrl) ||
      (attachment.proxyUrl ? known.attachmentUrls.has(attachment.proxyUrl) : false),
  );
}

async function listDiscordDriveAttachmentPage(
  context: ActiveStorageContext,
  beforeMessageId?: string,
): Promise<DiscordDriveAttachmentPage> {
  return requestBotJson<DiscordDriveAttachmentPage>(
    "/files/drive/attachments",
    toJsonBody({ context, beforeMessageId }),
  );
}

export async function scanDiscordDriveForNewFiles(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<DiscordDriveScanResult> {
  const known = createKnownDriveAttachmentIndex(snapshot.items);
  const records: UploadedFileRecord[] = [];
  let scannedAttachmentCount = 0;
  let skippedAttachmentCount = 0;
  let beforeMessageId: string | undefined;

  while (true) {
    const page = await listDiscordDriveAttachmentPage(context, beforeMessageId);
    scannedAttachmentCount += page.scannedAttachmentCount;

    for (const attachment of page.records) {
      if (
        isDiscasaManagedDriveAttachment(attachment.fileName) ||
        isKnownDriveAttachment(context, attachment, known)
      ) {
        skippedAttachmentCount += 1;
        continue;
      }

      const { proxyUrl: _proxyUrl, ...record } = attachment;
      records.push(record);
    }

    if (!page.nextBeforeMessageId) {
      break;
    }

    beforeMessageId = page.nextBeforeMessageId;
  }

  return {
    records,
    scannedAttachmentCount,
    skippedAttachmentCount,
    skippedGroupedMessageCount: 0,
  };
}

type AttachmentResolution = {
  attachmentUrl: string;
  storageChannelId?: string;
  storageMessageId?: string;
  storageManifest?: LibraryItemStorageManifest | null;
  method: "message-reference" | "history-scan";
};

async function resolveAttachmentReference(
  reference: AttachmentReferenceRequest,
): Promise<AttachmentReferenceResolution | null> {
  const payload = await requestBotJson<{ resolution: AttachmentReferenceResolution | null }>(
    "/files/resolve-attachment",
    toJsonBody({ reference }),
  );
  return payload.resolution;
}

function getStorageCandidateChannelIds(
  context: ActiveStorageContext,
  isTrashed: boolean,
  primaryChannelId?: string,
): string[] {
  return [
    primaryChannelId,
    isTrashed ? context.trashChannelId : context.driveChannelId,
    context.driveChannelId,
    context.trashChannelId,
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

function buildRelinkWarning(
  item: Pick<LibraryItemIndex, "id" | "name" | "isTrashed">,
  reason: string,
): DiscasaAttachmentRecoveryWarning {
  return {
    itemId: item.id,
    itemName: item.name,
    storageState: item.isTrashed ? "trash" : "drive",
    reason,
  };
}

async function resolveChunkedManifest(
  context: ActiveStorageContext,
  item: LibraryItemIndex,
): Promise<LibraryItemStorageManifest> {
  if (!hasChunkedStorage(item)) {
    throw new Error(`"${item.name}" is not stored as a chunked file.`);
  }

  const parts: LibraryItemStoragePart[] = [];

  for (const part of item.storageManifest.parts) {
    const resolution = await resolveAttachmentReference({
      preferredFileName: part.fileName,
      currentAttachmentUrl: part.attachmentUrl,
      storageChannelId: part.storageChannelId,
      storageMessageId: part.storageMessageId,
      candidateChannelIds: getStorageCandidateChannelIds(context, item.isTrashed, part.storageChannelId),
    });

    if (!resolution) {
      throw new Error(`Could not locate chunk ${part.index + 1} for "${item.name}".`);
    }

    parts.push({
      ...part,
      attachmentUrl: resolution.attachmentUrl,
      storageChannelId: resolution.channelId,
      storageMessageId: resolution.messageId,
    });
  }

  return {
    ...item.storageManifest,
    parts,
  };
}

async function resolveCurrentAttachment(
  context: ActiveStorageContext,
  item: LibraryItemIndex,
): Promise<AttachmentResolution | { reason: string }> {
  if (hasChunkedStorage(item)) {
    try {
      const storageManifest = await resolveChunkedManifest(context, item);
      const firstPart = storageManifest.parts[0];
      if (!firstPart) {
        return {
          reason: "Stored chunk manifest has no parts.",
        };
      }

      return {
        attachmentUrl: firstPart.attachmentUrl,
        storageChannelId: firstPart.storageChannelId,
        storageMessageId: firstPart.storageMessageId,
        storageManifest,
        method: "message-reference",
      };
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : "Stored chunk manifest could not be resolved.",
      };
    }
  }

  const resolution = await resolveAttachmentReference({
    preferredFileName: item.name,
    currentAttachmentUrl: item.attachmentUrl,
    storageChannelId: item.storageChannelId,
    storageMessageId: item.storageMessageId,
    candidateChannelIds: getStorageCandidateChannelIds(context, item.isTrashed, item.storageChannelId),
  });

  if (resolution) {
    return {
      attachmentUrl: resolution.attachmentUrl,
      storageChannelId: resolution.channelId,
      storageMessageId: resolution.messageId,
      storageManifest: null,
      method: resolution.method,
    };
  }

  if (!item.storageChannelId || !item.storageMessageId) {
    return {
      reason: "Stored Discord message metadata is missing, and the file was not found by fallback history scan.",
    };
  }

  return {
    reason: "Stored Discord message could not be resolved, and the file was not found by fallback history scan.",
  };
}

function didStoragePartChange(left: LibraryItemStoragePart, right: LibraryItemStoragePart): boolean {
  return (
    left.attachmentUrl !== right.attachmentUrl ||
    left.storageChannelId !== right.storageChannelId ||
    left.storageMessageId !== right.storageMessageId
  );
}

function didStorageManifestChange(
  current: LibraryItemStorageManifest | null | undefined,
  resolved: LibraryItemStorageManifest | null | undefined,
): boolean {
  if (!current && !resolved) {
    return false;
  }

  if (!current || !resolved || current.parts.length !== resolved.parts.length) {
    return true;
  }

  return resolved.parts.some((part, index) => didStoragePartChange(current.parts[index], part));
}

function didAttachmentPointerChange(item: LibraryItemIndex, resolved: AttachmentResolution): boolean {
  return (
    item.attachmentUrl !== resolved.attachmentUrl ||
    item.storageChannelId !== resolved.storageChannelId ||
    item.storageMessageId !== resolved.storageMessageId ||
    didStorageManifestChange(item.storageManifest, resolved.storageManifest) ||
    item.attachmentStatus === "missing"
  );
}

export async function refreshIndexSnapshotAttachmentUrls(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<RefreshIndexSnapshotResult> {
  if (snapshot.items.length === 0) {
    return {
      snapshot,
      relinkedItemCount: 0,
      unresolvedItems: [],
      didChange: false,
    };
  }

  const nextItems: LibraryItemIndex[] = [];
  const unresolvedItems: DiscasaAttachmentRecoveryWarning[] = [];
  const checkedItemCount = snapshot.items.length;
  let relinkedItemCount = 0;
  let didChange = false;

  for (const item of snapshot.items) {
    const resolution = await resolveCurrentAttachment(context, item);

    if ("reason" in resolution) {
      const warning = buildRelinkWarning(item, resolution.reason);
      unresolvedItems.push(warning);

      const nextItem: LibraryItemIndex = {
        ...item,
        attachmentStatus: "missing",
      };

      if (item.attachmentStatus !== "missing") {
        didChange = true;
      }

      nextItems.push(nextItem);
      console.warn(
        `[Discasa recovery] Could not relink "${item.name}" (${item.id}). ${resolution.reason}`,
      );
      continue;
    }

    const nextItem: LibraryItemIndex = {
      ...item,
      guildId: context.guildId,
      attachmentUrl: resolution.attachmentUrl,
      attachmentStatus: "ready",
      storageChannelId: resolution.storageChannelId,
      storageMessageId: resolution.storageMessageId,
      storageManifest: resolution.storageManifest ?? null,
    };

    if (didAttachmentPointerChange(item, resolution)) {
      relinkedItemCount += 1;
      didChange = true;
      console.info(
        `[Discasa recovery] Relinked "${item.name}" (${item.id}) via ${resolution.method}.`,
      );
    }

    nextItems.push(nextItem);
  }

  const alreadyValidItemCount = checkedItemCount - relinkedItemCount - unresolvedItems.length;

  console.info(
    `[Discasa recovery] Summary | Checked: ${checkedItemCount} | Relinked: ${relinkedItemCount} | Already valid: ${alreadyValidItemCount} | Unresolved: ${unresolvedItems.length}`,
  );

  return {
    snapshot: {
      version: 2,
      updatedAt: didChange ? new Date().toISOString() : snapshot.updatedAt,
      items: nextItems,
    },
    relinkedItemCount,
    unresolvedItems,
    didChange,
  };
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
