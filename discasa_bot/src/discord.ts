import {
  DISCASA_CATEGORY_NAME,
  DISCASA_CHANNELS,
  type DiscasaAttachmentRecoveryWarning,
  type DiscasaConfig,
  type FolderMembership,
  type FolderNode,
  type GuildSummary,
  type LibraryItem,
  type LibraryItemIndex,
  type LibraryItemStorageManifest,
  type LibraryItemStoragePart,
  type PersistedConfigSnapshot,
  type PersistedFolderSnapshot,
  type PersistedIndexSnapshot,
} from "@discasa/shared";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Message,
  PermissionsBitField,
  type Guild,
  type GuildTextBasedChannel,
  type OverwriteResolvable,
} from "discord.js";
import { env } from "./config";
import type { ActiveStorageContext, UploadedFileRecord } from "./storage-types";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
};

export class DiscordAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordAuthorizationError";
  }
}

export class DiscordStorageUnavailableError extends Error {
  constructor(readonly channelId: string) {
    super(`Discasa storage channel is not available: ${channelId}`);
    this.name = "DiscordStorageUnavailableError";
  }
}

type LegacyPersistedAlbum = {
  id: string;
  name: string;
};

type LegacyPersistedIndexSnapshot = {
  version: 1;
  albums: LegacyPersistedAlbum[];
  items: LibraryItem[];
};

type DiscasaInstallMarker = {
  app: "discasa";
  version: 1;
  guildId: string;
  categoryName: string;
  channels: readonly string[];
  installedAt: string;
  updatedAt: string;
};

type DiscasaSetupStatus = {
  botPresent: boolean;
  categoryPresent: boolean;
  channelsPresent: boolean;
  configMarkerPresent: boolean;
  isApplied: boolean;
  missingChannels: string[];
};

type StoredAttachmentPointer = {
  channelId: string;
  messageId: string;
  attachmentUrl: string;
};

type AttachmentResolution = {
  attachmentUrl: string;
  storageChannelId?: string;
  storageMessageId?: string;
  storageManifest?: LibraryItemStorageManifest | null;
  method: "message-reference" | "history-scan";
};

export type RefreshIndexSnapshotResult = {
  snapshot: PersistedIndexSnapshot;
  relinkedItemCount: number;
  unresolvedItems: DiscasaAttachmentRecoveryWarning[];
  didChange: boolean;
};

const INDEX_SNAPSHOT_FILENAME = "discasa-index.snapshot.json";
const LEGACY_INDEX_SNAPSHOT_FILENAME = "discasa-index.json";
const FOLDER_SNAPSHOT_FILENAME = "discasa-folder.snapshot.json";
const CONFIG_SNAPSHOT_FILENAME = "discasa-config.snapshot.json";
const INSTALL_MARKER_FILENAME = "discasa-install.marker.json";
const LEGACY_FOLDER_CHANNEL_NAME = "discasa-folder";
const LEGACY_CONFIG_CHANNEL_NAME = "discasa-config";
const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const LEVEL_TWO_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const LEVEL_THREE_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
let botClient: Client | null = null;
let botClientReadyPromise: Promise<Client> | null = null;

type DiscordGuildMetadata = {
  premium_tier?: number;
};

function formatBytes(value: number): string {
  const megabytes = value / (1024 * 1024);

  if (megabytes >= 100) {
    return `${Math.round(megabytes)} MB`;
  }

  return `${megabytes.toFixed(1)} MB`;
}

function getUploadLimitFromPremiumTier(premiumTier: number): number {
  if (premiumTier >= 3) {
    return LEVEL_THREE_UPLOAD_LIMIT_BYTES;
  }

  if (premiumTier >= 2) {
    return LEVEL_TWO_UPLOAD_LIMIT_BYTES;
  }

  return DEFAULT_UPLOAD_LIMIT_BYTES;
}

function hasChunkedStorage(
  item: Pick<LibraryItemIndex, "storageManifest">,
): item is Pick<LibraryItemIndex, "storageManifest"> & { storageManifest: LibraryItemStorageManifest } {
  return item.storageManifest?.mode === "chunked";
}

export async function getDiscordUploadLimitForGuild(guildId: string): Promise<number> {
  if (env.mockMode || !env.discordBotToken) {
    return DEFAULT_UPLOAD_LIMIT_BYTES;
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${env.discordBotToken}`,
      },
    });

    if (!response.ok) {
      console.error("[Discord API] Failed to fetch guild metadata for upload limit.", {
        guildId,
        status: response.status,
        statusText: response.statusText,
      });
      return DEFAULT_UPLOAD_LIMIT_BYTES;
    }

    const payload = (await response.json()) as DiscordGuildMetadata;
    const premiumTier = typeof payload.premium_tier === "number" ? payload.premium_tier : 0;
    return getUploadLimitFromPremiumTier(premiumTier);
  } catch (error) {
    console.error("[Discord API] Could not resolve guild upload limit.", {
      guildId,
      error,
    });
    return DEFAULT_UPLOAD_LIMIT_BYTES;
  }
}

export function getUploadTooLargeMessage(
  files: Array<{ originalname: string; size: number }>,
  uploadLimitBytes: number,
): string {
  const fileList = files.map((file) => `${file.originalname} (${formatBytes(file.size)})`).join(", ");

  return `File too large for Discord on this server. Limit: ${formatBytes(uploadLimitBytes)}. Rejected: ${fileList}.`;
}

async function getBotClient(): Promise<Client | null> {
  if (env.mockMode || !env.discordBotToken) {
    return null;
  }

  if (!botClient) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    botClient = client;
    botClientReadyPromise = client
      .login(env.discordBotToken)
      .then(() => waitForBotClientReady(client))
      .catch((error) => {
        if (botClient === client) {
          botClient = null;
          botClientReadyPromise = null;
        }

        throw error;
      });
  }

  return botClientReadyPromise ?? botClient;
}

async function waitForBotClientReady(client: Client): Promise<Client> {
  if (client.isReady()) {
    return client;
  }

  return new Promise((resolve, reject) => {
    const handleReady = (readyClient: Client<true>) => {
      cleanup();
      resolve(readyClient);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      client.off(Events.ClientReady, handleReady);
      client.off(Events.Error, handleError);
    };

    client.once(Events.ClientReady, handleReady);
    client.once(Events.Error, handleError);
  });
}

export async function getDiscordBotRuntimeStatus(): Promise<{
  mockMode: boolean;
  botConfigured: boolean;
  botLoggedIn: boolean;
  botUserId: string | null;
}> {
  if (env.mockMode) {
    return {
      mockMode: true,
      botConfigured: true,
      botLoggedIn: true,
      botUserId: "mock-bot",
    };
  }

  if (!env.discordBotToken) {
    return {
      mockMode: false,
      botConfigured: false,
      botLoggedIn: false,
      botUserId: null,
    };
  }

  const client = await getBotClient();

  return {
    mockMode: false,
    botConfigured: true,
    botLoggedIn: Boolean(client?.isReady()),
    botUserId: client?.user?.id ?? null,
  };
}

async function fetchDiscordUserGuilds(accessToken: string): Promise<DiscordUserGuild[]> {
  const endpoint = "https://discord.com/api/v10/users/@me/guilds";
  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    console.error("[Discord API] Network failure while fetching user guilds.", {
      endpoint,
      error,
    });
    throw new Error("Failed to reach Discord while fetching the user guild list.");
  }

  const rawBody = await response.text();

  let parsedBody: unknown = null;
  if (rawBody.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      parsedBody = rawBody;
    }
  }

  if (!response.ok) {
    const logPayload = {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      body: parsedBody,
    };

    if (response.status === 401 || response.status === 403) {
      console.warn("[Discord API] Stored Discord user token is no longer valid.", logPayload);
      throw new DiscordAuthorizationError("Discord login expired. Please login again.", response.status);
    }

    console.error("[Discord API] Failed to fetch user guilds.", logPayload);

    throw new Error(
      `Failed to fetch the user guild list from Discord (${response.status} ${response.statusText}).`,
    );
  }

  if (!Array.isArray(parsedBody)) {
    throw new Error("Discord returned an unexpected guild list payload.");
  }

  return parsedBody as DiscordUserGuild[];
}

function hasManageAccess(permissions: string): boolean {
  const resolved = BigInt(permissions || "0");
  const admin = BigInt(PermissionsBitField.Flags.Administrator.toString());
  const manageGuild = BigInt(PermissionsBitField.Flags.ManageGuild.toString());
  const manageChannels = BigInt(PermissionsBitField.Flags.ManageChannels.toString());
  return (resolved & admin) !== 0n || (resolved & manageGuild) !== 0n || (resolved & manageChannels) !== 0n;
}

function getPermissionLabels(permissions: string, owner: boolean): string[] {
  const labels: string[] = [];
  const resolved = BigInt(permissions || "0");

  if (owner) {
    labels.push("OWNER");
  }

  if ((resolved & BigInt(PermissionsBitField.Flags.Administrator.toString())) !== 0n) {
    labels.push("ADMINISTRATOR");
  }

  if ((resolved & BigInt(PermissionsBitField.Flags.ManageGuild.toString())) !== 0n) {
    labels.push("MANAGE_GUILD");
  }

  if ((resolved & BigInt(PermissionsBitField.Flags.ManageChannels.toString())) !== 0n) {
    labels.push("MANAGE_CHANNELS");
  }

  return labels;
}

async function resolveAuthenticatedUserOverwrite(guild: Guild, authenticatedUserId?: string): Promise<OverwriteResolvable | null> {
  if (!authenticatedUserId) {
    return null;
  }

  try {
    const member = await guild.members.fetch(authenticatedUserId);
    return {
      id: member.user,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    };
  } catch {
    return null;
  }
}

async function buildDiscasaPermissionOverwrites(
  guild: Guild,
  botMemberId: string,
  authenticatedUserId?: string,
): Promise<OverwriteResolvable[]> {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: botMemberId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
      ],
    },
  ];

  const authenticatedUserOverwrite = await resolveAuthenticatedUserOverwrite(guild, authenticatedUserId);
  if (authenticatedUserOverwrite) {
    overwrites.push(authenticatedUserOverwrite);
  }

  return overwrites;
}

async function getGuildTextChannel(channelId: string): Promise<GuildTextBasedChannel> {
  const client = await getBotClient();
  if (!client) {
    throw new Error("Bot client is not configured.");
  }

  let channel: Awaited<ReturnType<Client["channels"]["fetch"]>>;

  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    throw new DiscordStorageUnavailableError(channelId);
  }

  if (!channel || !channel.isTextBased() || !("send" in channel) || !("messages" in channel)) {
    throw new DiscordStorageUnavailableError(channelId);
  }

  return channel as GuildTextBasedChannel;
}

async function deleteDiscordMessage(channelId: string, messageId: string): Promise<void> {
  const channel = await getGuildTextChannel(channelId);

  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch {
    // Ignore missing messages so the index can still recover.
  }
}

async function downloadAttachmentBuffer(attachmentUrl: string): Promise<Buffer> {
  const response = await fetch(attachmentUrl);

  if (!response.ok) {
    throw new Error("Failed to download the stored Discord attachment.");
  }

  return Buffer.from(await response.arrayBuffer());
}

async function sendBufferToChannel(
  channelId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  guildId: string,
): Promise<UploadedFileRecord> {
  const channel = await getGuildTextChannel(channelId);
  const sentMessage = await channel.send({
    files: [
      {
        attachment: fileBuffer,
        name: fileName,
      },
    ],
  });

  const attachment =
    [...sentMessage.attachments.values()].find((entry) => entry.name === fileName) ??
    [...sentMessage.attachments.values()][0];

  if (!attachment) {
    throw new Error(`Discord did not return an attachment URL for ${fileName}.`);
  }

  return {
    fileName,
    fileSize: attachment.size,
    mimeType: attachment.contentType || mimeType || "application/octet-stream",
    guildId,
    attachmentUrl: attachment.url,
    storageChannelId: channelId,
    storageMessageId: sentMessage.id,
  };
}

function getAttachmentPointerFromMessage(
  message: Message<boolean>,
  preferredFileName?: string,
): StoredAttachmentPointer | null {
  const attachments = [...message.attachments.values()];
  const attachment =
    (preferredFileName ? attachments.find((entry) => entry.name === preferredFileName) : null) ??
    attachments[0];

  if (!attachment) {
    return null;
  }

  return {
    channelId: message.channelId,
    messageId: message.id,
    attachmentUrl: attachment.url,
  };
}

async function fetchMessageAttachmentByReference(
  channelId: string,
  messageId: string,
  preferredFileName?: string,
): Promise<StoredAttachmentPointer | null> {
  try {
    const channel = await getGuildTextChannel(channelId);
    const message = await channel.messages.fetch(messageId);
    return getAttachmentPointerFromMessage(message, preferredFileName);
  } catch {
    return null;
  }
}

async function findAttachmentInChannelHistory(
  channelId: string,
  options: {
    preferredFileName: string;
    currentAttachmentUrl?: string;
    botUserId?: string | null;
  },
): Promise<StoredAttachmentPointer | null> {
  const channel = await getGuildTextChannel(channelId);
  let beforeMessageId: string | undefined;

  while (true) {
    const messages = await channel.messages.fetch(beforeMessageId ? { limit: 100, before: beforeMessageId } : { limit: 100 });

    if (messages.size === 0) {
      return null;
    }

    for (const message of messages.values()) {
      if (options.botUserId && message.author.id !== options.botUserId) {
        continue;
      }

      const matchingAttachment = [...message.attachments.values()].find((attachment) => {
        const sameName = attachment.name === options.preferredFileName;
        const sameUrl = Boolean(options.currentAttachmentUrl) && (
          attachment.url === options.currentAttachmentUrl ||
          attachment.proxyURL === options.currentAttachmentUrl
        );

        return sameName || sameUrl;
      });

      if (matchingAttachment) {
        return {
          channelId,
          messageId: message.id,
          attachmentUrl: matchingAttachment.url,
        };
      }
    }

    const oldestMessage = [...messages.values()].at(-1);
    if (!oldestMessage || messages.size < 100) {
      return null;
    }

    beforeMessageId = oldestMessage.id;
  }
}

async function findMessageForItem(
  context: ActiveStorageContext,
  item: Pick<LibraryItemIndex, "name" | "attachmentUrl" | "storageChannelId" | "isTrashed">,
): Promise<{ channelId: string; message: Message<boolean>; attachmentUrl: string } | null> {
  const client = await getBotClient();
  const botUserId = client?.user?.id ?? null;
  const candidateChannelIds = [
    item.storageChannelId,
    item.isTrashed ? context.trashChannelId : context.driveChannelId,
    context.driveChannelId,
    context.trashChannelId,
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

  for (const channelId of candidateChannelIds) {
    let locatedAttachment: StoredAttachmentPointer | null = null;

    try {
      locatedAttachment = await findAttachmentInChannelHistory(channelId, {
        preferredFileName: item.name,
        currentAttachmentUrl: item.attachmentUrl,
        botUserId,
      });
    } catch (error) {
      if (error instanceof DiscordStorageUnavailableError) {
        console.warn(`[Discasa recovery] Skipping unavailable storage channel ${channelId} while relinking "${item.name}".`);
        continue;
      }

      throw error;
    }

    if (!locatedAttachment) {
      continue;
    }

    try {
      const channel = await getGuildTextChannel(locatedAttachment.channelId);
      const message = await channel.messages.fetch(locatedAttachment.messageId);
      return {
        channelId: locatedAttachment.channelId,
        message,
        attachmentUrl: locatedAttachment.attachmentUrl,
      };
    } catch {
      // Continue with the next channel candidate.
    }
  }

  return null;
}

async function resolveStoredMessage(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<{ channelId: string; messageId: string; attachmentUrl: string }> {
  if (item.storageChannelId && item.storageMessageId) {
    const directAttachment = await fetchMessageAttachmentByReference(item.storageChannelId, item.storageMessageId, item.name);
    if (directAttachment) {
      return directAttachment;
    }
  }

  const located = await findMessageForItem(context, item);
  if (!located) {
    throw new Error(`Could not locate the Discord message for "${item.name}".`);
  }

  return {
    channelId: located.channelId,
    messageId: located.message.id,
    attachmentUrl: located.attachmentUrl,
  };
}

async function findAttachmentForStoragePart(
  context: ActiveStorageContext,
  item: Pick<LibraryItemIndex, "name" | "isTrashed">,
  part: LibraryItemStoragePart,
): Promise<StoredAttachmentPointer | null> {
  const client = await getBotClient();
  const botUserId = client?.user?.id ?? null;
  const candidateChannelIds = [
    part.storageChannelId,
    item.isTrashed ? context.trashChannelId : context.driveChannelId,
    context.driveChannelId,
    context.trashChannelId,
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

  for (const channelId of candidateChannelIds) {
    try {
      const locatedAttachment = await findAttachmentInChannelHistory(channelId, {
        preferredFileName: part.fileName,
        currentAttachmentUrl: part.attachmentUrl,
        botUserId,
      });

      if (locatedAttachment) {
        return locatedAttachment;
      }
    } catch (error) {
      if (error instanceof DiscordStorageUnavailableError) {
        console.warn(`[Discasa recovery] Skipping unavailable storage channel ${channelId} while relinking "${item.name}" chunk ${part.index + 1}.`);
        continue;
      }

      throw error;
    }
  }

  return null;
}

async function resolveStoredPart(
  context: ActiveStorageContext,
  item: Pick<LibraryItemIndex, "name" | "isTrashed">,
  part: LibraryItemStoragePart,
): Promise<StoredAttachmentPointer> {
  const directAttachment = await fetchMessageAttachmentByReference(part.storageChannelId, part.storageMessageId, part.fileName);
  if (directAttachment) {
    return directAttachment;
  }

  const fallbackAttachment = await findAttachmentForStoragePart(context, item, part);
  if (!fallbackAttachment) {
    throw new Error(`Could not locate chunk ${part.index + 1} for "${item.name}".`);
  }

  return fallbackAttachment;
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
    const resolved = await resolveStoredPart(context, item, part);
    parts.push({
      ...part,
      attachmentUrl: resolved.attachmentUrl,
      storageChannelId: resolved.channelId,
      storageMessageId: resolved.messageId,
    });
  }

  return {
    ...item.storageManifest,
    parts,
  };
}

async function transferItemBetweenChannels(
  context: ActiveStorageContext,
  item: LibraryItem,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
  if (hasChunkedStorage(item)) {
    throw new Error("Chunked file movement is coordinated by the Discasa app service.");
  }

  const source = await resolveStoredMessage(context, item);

  if (source.channelId === targetChannelId) {
    return {
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      guildId: context.guildId,
      attachmentUrl: source.attachmentUrl,
      storageChannelId: source.channelId,
      storageMessageId: source.messageId,
      storageManifest: null,
    };
  }

  const fileBuffer = await downloadAttachmentBuffer(source.attachmentUrl);
  const moved = await sendBufferToChannel(targetChannelId, item.name, fileBuffer, item.mimeType, context.guildId);
  await deleteDiscordMessage(source.channelId, source.messageId);
  return moved;
}

function isIndexSnapshot(raw: unknown): raw is PersistedIndexSnapshot {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return entry.version === 2 && Array.isArray(entry.items);
}

function isLegacyIndexSnapshot(raw: unknown): raw is LegacyPersistedIndexSnapshot {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return entry.version === 1 && Array.isArray(entry.albums) && Array.isArray(entry.items);
}

function isFolderSnapshot(raw: unknown): raw is PersistedFolderSnapshot {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return entry.version === 1 && Array.isArray(entry.folders) && Array.isArray(entry.memberships);
}

function isDiscasaConfig(raw: unknown): raw is DiscasaConfig {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return (
    typeof entry.accentColor === "string" &&
    typeof entry.minimizeToTray === "boolean" &&
    typeof entry.closeToTray === "boolean" &&
    typeof entry.thumbnailZoomPercent === "number" &&
    (entry.viewerMouseWheelBehavior === undefined ||
      entry.viewerMouseWheelBehavior === "zoom" ||
      entry.viewerMouseWheelBehavior === "navigate") &&
    typeof entry.sidebarCollapsed === "boolean"
  );
}

function isConfigSnapshot(raw: unknown): raw is PersistedConfigSnapshot {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return entry.version === 1 && isDiscasaConfig(entry.config);
}

function isInstallMarker(raw: unknown): raw is DiscasaInstallMarker {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const entry = raw as Record<string, unknown>;
  return (
    entry.app === "discasa" &&
    entry.version === 1 &&
    typeof entry.guildId === "string" &&
    typeof entry.categoryName === "string" &&
    Array.isArray(entry.channels)
  );
}

function convertLegacyIndexToCurrent(raw: LegacyPersistedIndexSnapshot): PersistedIndexSnapshot {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    items: raw.items.map((item) => {
      const { albumIds: _albumIds, ...indexItem } = item;
      return {
        ...indexItem,
        attachmentStatus: item.attachmentStatus === "missing" ? "missing" : "ready",
      };
    }),
  };
}

function deriveFolderSnapshotFromLegacyIndex(raw: LegacyPersistedIndexSnapshot): PersistedFolderSnapshot {
  const timestamp = new Date().toISOString();
  const folders: FolderNode[] = raw.albums.map((album, position) => ({
    id: album.id,
    type: "album",
    name: album.name,
    parentId: null,
    position,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const memberships: FolderMembership[] = [];

  for (const item of raw.items) {
    for (const folderId of item.albumIds) {
      memberships.push({
        folderId,
        itemId: item.id,
        addedAt: item.uploadedAt,
      });
    }
  }

  return {
    version: 1,
    updatedAt: timestamp,
    folders,
    memberships,
  };
}

async function readSnapshotMessage(
  channelId: string,
  fileNames: string[],
): Promise<{ attachmentUrl: string; fileName: string } | null> {
  const channel = await getGuildTextChannel(channelId);
  const messages = await channel.messages.fetch({ limit: 100 });
  const orderedMessages = [...messages.values()].sort((left, right) => right.createdTimestamp - left.createdTimestamp);

  for (const message of orderedMessages) {
    const attachment = [...message.attachments.values()].find((entry) => fileNames.includes(entry.name ?? ""));
    if (attachment) {
      return {
        attachmentUrl: attachment.url,
        fileName: attachment.name ?? fileNames[0] ?? "snapshot.json",
      };
    }
  }

  return null;
}

async function readJsonSnapshot(channelId: string, fileNames: string[]): Promise<{ payload: unknown; fileName: string } | null> {
  let found: { attachmentUrl: string; fileName: string } | null = null;

  try {
    found = await readSnapshotMessage(channelId, fileNames);
  } catch (error) {
    if (error instanceof DiscordStorageUnavailableError) {
      console.warn(
        `[Discasa snapshot] Channel ${channelId} is unavailable while looking for ${fileNames.join(", ")}.`,
      );
      return null;
    }

    throw error;
  }

  if (!found) {
    return null;
  }

  const response = await fetch(found.attachmentUrl);
  if (!response.ok) {
    console.warn(
      `[Discasa snapshot] Failed to download ${found.fileName} from channel ${channelId}: ${response.status} ${response.statusText}.`,
    );
    return null;
  }

  try {
    return {
      payload: JSON.parse(await response.text()) as unknown,
      fileName: found.fileName,
    };
  } catch {
    console.warn(`[Discasa snapshot] Failed to parse ${found.fileName} from channel ${channelId}.`);
    return null;
  }
}

async function readInstallMarker(channelId: string): Promise<DiscasaInstallMarker | null> {
  const current = await readJsonSnapshot(channelId, [INSTALL_MARKER_FILENAME]);
  if (current && isInstallMarker(current.payload)) {
    return current.payload;
  }

  return null;
}

function resolveDiscasaStructure(guild: Guild): {
  category: any | null;
  channels: Map<string, { id: string; name: string }>;
  legacyChannels: Map<string, { id: string; name: string }>;
  missingChannels: string[];
} {
  const category = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === DISCASA_CATEGORY_NAME,
  );

  const channels = new Map<string, { id: string; name: string }>();
  const legacyChannels = new Map<string, { id: string; name: string }>();

  if (category) {
    for (const channelName of DISCASA_CHANNELS) {
      const matchedChannel = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.parentId === category.id &&
          channel.name === channelName,
      );

      if (matchedChannel) {
        channels.set(channelName, {
          id: matchedChannel.id,
          name: matchedChannel.name,
        });
      }
    }

    for (const channelName of [LEGACY_FOLDER_CHANNEL_NAME, LEGACY_CONFIG_CHANNEL_NAME]) {
      const matchedChannel = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.parentId === category.id &&
          channel.name === channelName,
      );

      if (matchedChannel) {
        legacyChannels.set(channelName, {
          id: matchedChannel.id,
          name: matchedChannel.name,
        });
      }
    }
  }

  const missingChannels = DISCASA_CHANNELS.filter((channelName) => !channels.has(channelName));

  return {
    category,
    channels,
    legacyChannels,
    missingChannels,
  };
}

function buildActiveStorageContext(
  guild: Guild,
  category: { id: string; name: string },
  channels: Map<string, { id: string; name: string }>,
): ActiveStorageContext {
  const driveChannel = channels.get(DISCASA_CHANNELS[0]);
  const indexChannel = channels.get(DISCASA_CHANNELS[1]);
  const trashChannel = channels.get(DISCASA_CHANNELS[2]);

  if (!driveChannel || !indexChannel || !trashChannel) {
    throw new Error("Discasa storage channels could not be resolved.");
  }

  return {
    guildId: guild.id,
    guildName: guild.name,
    categoryId: category.id,
    categoryName: category.name,
    driveChannelId: driveChannel.id,
    driveChannelName: driveChannel.name,
    indexChannelId: indexChannel.id,
    indexChannelName: indexChannel.name,
    folderChannelId: indexChannel.id,
    folderChannelName: indexChannel.name,
    trashChannelId: trashChannel.id,
    trashChannelName: trashChannel.name,
    configChannelId: indexChannel.id,
    configChannelName: indexChannel.name,
  };
}

async function syncInstallMarker(context: ActiveStorageContext): Promise<void> {
  const marker: DiscasaInstallMarker = {
    app: "discasa",
    version: 1,
    guildId: context.guildId,
    categoryName: context.categoryName,
    channels: DISCASA_CHANNELS,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeSnapshotToChannel(
    context.configChannelId,
    INSTALL_MARKER_FILENAME,
    JSON.stringify(marker, null, 2),
    "Discasa install marker",
    [INSTALL_MARKER_FILENAME],
  );
}

async function writeSnapshotToChannel(
  channelId: string,
  fileName: string,
  content: string,
  label: string,
  cleanupFileNames: string[] = [fileName],
): Promise<void> {
  const channel = await getGuildTextChannel(channelId);
  const existingMessages = await channel.messages.fetch({ limit: 100 });
  const staleMessages = [...existingMessages.values()].filter((message) =>
    [...message.attachments.values()].some((attachment) => cleanupFileNames.includes(attachment.name ?? "")),
  );

  await channel.send({
    content: `${label} ${new Date().toISOString()}`,
    files: [
      {
        attachment: Buffer.from(content, "utf8"),
        name: fileName,
      },
    ],
  });

  for (const message of staleMessages) {
    try {
      await message.delete();
    } catch {
      // Ignore stale cleanup failures so the latest snapshot still wins.
    }
  }
}

async function migrateLegacyMetadataSnapshots(
  context: ActiveStorageContext,
  legacyChannels: Map<string, { id: string; name: string }>,
): Promise<void> {
  const legacyFolderChannel = legacyChannels.get(LEGACY_FOLDER_CHANNEL_NAME);
  const legacyConfigChannel = legacyChannels.get(LEGACY_CONFIG_CHANNEL_NAME);

  if (legacyFolderChannel && !(await hasCurrentFolderSnapshot(context))) {
    const legacyFolderSnapshot = await readJsonSnapshot(legacyFolderChannel.id, [FOLDER_SNAPSHOT_FILENAME]);
    if (legacyFolderSnapshot && isFolderSnapshot(legacyFolderSnapshot.payload)) {
      await syncFolderSnapshot(context, legacyFolderSnapshot.payload);
    }
  }

  if (legacyConfigChannel && !(await hasCurrentConfigSnapshot(context))) {
    const legacyConfigSnapshot = await readJsonSnapshot(legacyConfigChannel.id, [CONFIG_SNAPSHOT_FILENAME]);
    if (legacyConfigSnapshot && isConfigSnapshot(legacyConfigSnapshot.payload)) {
      await syncConfigSnapshot(context, legacyConfigSnapshot.payload);
    }
  }
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

  if (item.storageChannelId && item.storageMessageId) {
    const directAttachment = await fetchMessageAttachmentByReference(item.storageChannelId, item.storageMessageId, item.name);
    if (directAttachment) {
      return {
        attachmentUrl: directAttachment.attachmentUrl,
        storageChannelId: directAttachment.channelId,
        storageMessageId: directAttachment.messageId,
        storageManifest: null,
        method: "message-reference",
      };
    }
  }

  const fallbackMessage = await findMessageForItem(context, item);
  if (fallbackMessage) {
    return {
      attachmentUrl: fallbackMessage.attachmentUrl,
      storageChannelId: fallbackMessage.channelId,
      storageMessageId: fallbackMessage.message.id,
      storageManifest: null,
      method: "history-scan",
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
  if (env.mockMode || snapshot.items.length === 0) {
    return {
      snapshot,
      relinkedItemCount: 0,
      unresolvedItems: [],
      didChange: false,
    };
  }

  console.info(
    `[Discasa recovery] Starting attachment relink for ${snapshot.items.length} indexed item(s) in guild ${context.guildName} (${context.guildId}).`,
  );

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

export async function listEligibleGuilds(accessToken?: string): Promise<GuildSummary[]> {
  if (env.mockMode) {
    return [
      {
        id: "guild_1",
        name: "Discasa Server",
        owner: true,
        permissions: ["ADMINISTRATOR"],
      },
      {
        id: "guild_2",
        name: "Archive Lab",
        owner: false,
        permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS"],
      },
    ];
  }

  if (!accessToken) {
    return [];
  }

  const guilds = await fetchDiscordUserGuilds(accessToken);

  return guilds
    .filter((guild) => guild.owner || hasManageAccess(guild.permissions))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      owner: guild.owner,
      permissions: getPermissionLabels(guild.permissions, guild.owner),
    }));
}

export async function inspectDiscasaSetup(guildId: string): Promise<DiscasaSetupStatus> {
  if (env.mockMode) {
    return {
      botPresent: true,
      categoryPresent: true,
      channelsPresent: true,
      configMarkerPresent: true,
      isApplied: true,
      missingChannels: [],
    };
  }

  const client = await getBotClient();
  if (!client) {
    return {
      botPresent: false,
      categoryPresent: false,
      channelsPresent: false,
      configMarkerPresent: false,
      isApplied: false,
      missingChannels: [...DISCASA_CHANNELS],
    };
  }

  let guild: Guild;

  try {
    guild = await client.guilds.fetch(guildId);
  } catch {
    return {
      botPresent: false,
      categoryPresent: false,
      channelsPresent: false,
      configMarkerPresent: false,
      isApplied: false,
      missingChannels: [...DISCASA_CHANNELS],
    };
  }

  await guild.channels.fetch();
  const structure = resolveDiscasaStructure(guild);
  const metadataChannel = structure.channels.get(DISCASA_CHANNELS[1]);
  const legacyConfigChannel = structure.legacyChannels.get(LEGACY_CONFIG_CHANNEL_NAME);
  const configMarkerPresent =
    Boolean(metadataChannel && (await readInstallMarker(metadataChannel.id))) ||
    Boolean(legacyConfigChannel && (await readInstallMarker(legacyConfigChannel.id)));
  const categoryPresent = Boolean(structure.category);
  const channelsPresent = structure.missingChannels.length === 0;
  const isApplied = categoryPresent && channelsPresent && configMarkerPresent;

  return {
    botPresent: true,
    categoryPresent,
    channelsPresent,
    configMarkerPresent,
    isApplied,
    missingChannels: structure.missingChannels,
  };
}

export async function initializeDiscasaInGuild(guildId: string, authenticatedUserId?: string): Promise<ActiveStorageContext> {
  if (env.mockMode) {
    return {
      guildId,
      guildName: "Discasa Server",
      categoryId: "mock-category",
      categoryName: DISCASA_CATEGORY_NAME,
      driveChannelId: "mock-drive",
      driveChannelName: DISCASA_CHANNELS[0],
      indexChannelId: "mock-index",
      indexChannelName: DISCASA_CHANNELS[1],
      folderChannelId: "mock-index",
      folderChannelName: DISCASA_CHANNELS[1],
      trashChannelId: "mock-trash",
      trashChannelName: DISCASA_CHANNELS[2],
      configChannelId: "mock-index",
      configChannelName: DISCASA_CHANNELS[1],
    };
  }

  const client = await getBotClient();
  if (!client) {
    throw new Error("Bot client is not configured.");
  }

  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();

  const botMember = await guild.members.fetchMe();
  const hasManageChannels = botMember.permissions.has(PermissionsBitField.Flags.ManageChannels);
  const hasManageRoles = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);

  if (!hasManageChannels) {
    throw new Error("The bot is missing Manage Channels permission in the selected guild.");
  }

  if (!hasManageRoles) {
    throw new Error("To make Discasa private, grant the bot the Manage Roles permission in this server.");
  }

  const discasaOverwrites = await buildDiscasaPermissionOverwrites(guild, botMember.id, authenticatedUserId);
  const initialStructure = resolveDiscasaStructure(guild);

  const category =
    initialStructure.category ??
    (await guild.channels.create({
      name: DISCASA_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: discasaOverwrites,
      reason: "Initialize private Discasa category",
    }));

  await category.edit({
    permissionOverwrites: discasaOverwrites,
    reason: "Secure Discasa category permissions",
  });

  const resolvedChannels = new Map(initialStructure.channels);

  for (const channelName of DISCASA_CHANNELS) {
    const existing = resolvedChannels.get(channelName);

    if (existing) {
      const existingChannel = await guild.channels.fetch(existing.id);
      if (existingChannel && existingChannel.type === ChannelType.GuildText) {
        await existingChannel.edit({
          parent: category.id,
          permissionOverwrites: discasaOverwrites,
          reason: "Secure Discasa channel permissions",
        });
      }
      continue;
    }

    const nextChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: discasaOverwrites,
      reason: "Initialize private Discasa channels",
    });

    resolvedChannels.set(channelName, {
      id: nextChannel.id,
      name: nextChannel.name,
    });
  }

  const context = buildActiveStorageContext(guild, { id: category.id, name: category.name }, resolvedChannels);
  await migrateLegacyMetadataSnapshots(context, initialStructure.legacyChannels);
  await syncInstallMarker(context);
  return context;
}

export async function uploadFilesToDiscordDrive(
  files: Express.Multer.File[],
  context: ActiveStorageContext,
): Promise<UploadedFileRecord[]> {
  return uploadFilesToDiscordChannel(files, context, context.driveChannelId);
}

function assertWritableFileStorageChannel(context: ActiveStorageContext, channelId: string): void {
  if (channelId !== context.driveChannelId && channelId !== context.trashChannelId) {
    throw new Error("Target storage channel is not writable for file content.");
  }
}

export async function uploadFilesToDiscordChannel(
  files: Express.Multer.File[],
  context: ActiveStorageContext,
  targetChannelId: string,
): Promise<UploadedFileRecord[]> {
  if (env.mockMode) {
    return files.map((file) => ({
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype || "application/octet-stream",
      guildId: context.guildId,
      attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
      storageChannelId: targetChannelId,
      storageMessageId: `mock-message-${encodeURIComponent(file.originalname)}`,
    }));
  }

  assertWritableFileStorageChannel(context, targetChannelId);
  const uploadLimitBytes = await getDiscordUploadLimitForGuild(context.guildId);
  const oversizedFiles = files.filter((file) => file.size > uploadLimitBytes);
  if (oversizedFiles.length > 0) {
    throw new Error(getUploadTooLargeMessage(oversizedFiles, uploadLimitBytes));
  }

  const uploaded: UploadedFileRecord[] = [];

  for (const file of files) {
    const nextRecord = await sendBufferToChannel(
      targetChannelId,
      file.originalname,
      Buffer.from(file.buffer),
      file.mimetype || "application/octet-stream",
      context.guildId,
    );

    uploaded.push({
      ...nextRecord,
      fileSize: file.size,
    });
  }

  return uploaded;
}

export async function deleteStorageMessagesFromDiscord(
  context: ActiveStorageContext,
  messages: Array<{ channelId: string; messageId: string }>,
): Promise<void> {
  for (const message of messages) {
    assertWritableFileStorageChannel(context, message.channelId);
  }

  for (const message of messages) {
    await deleteDiscordMessage(message.channelId, message.messageId);
  }
}

export async function hasCurrentIndexSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  try {
    return Boolean(await readSnapshotMessage(context.indexChannelId, [INDEX_SNAPSHOT_FILENAME]));
  } catch (error) {
    if (error instanceof DiscordStorageUnavailableError) {
      return false;
    }

    throw error;
  }
}

export async function hasCurrentFolderSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  try {
    return Boolean(await readSnapshotMessage(context.folderChannelId, [FOLDER_SNAPSHOT_FILENAME]));
  } catch (error) {
    if (error instanceof DiscordStorageUnavailableError) {
      return false;
    }

    throw error;
  }
}

export async function hasCurrentConfigSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  try {
    return Boolean(await readSnapshotMessage(context.configChannelId, [CONFIG_SNAPSHOT_FILENAME]));
  } catch (error) {
    if (error instanceof DiscordStorageUnavailableError) {
      return false;
    }

    throw error;
  }
}

export async function readLatestIndexSnapshot(
  context: ActiveStorageContext,
): Promise<PersistedIndexSnapshot | null> {
  if (env.mockMode) {
    return null;
  }

  const found = await readJsonSnapshot(context.indexChannelId, [INDEX_SNAPSHOT_FILENAME, LEGACY_INDEX_SNAPSHOT_FILENAME]);
  if (!found) {
    return null;
  }

  if (isIndexSnapshot(found.payload)) {
    return found.payload;
  }

  if (isLegacyIndexSnapshot(found.payload)) {
    return convertLegacyIndexToCurrent(found.payload);
  }

  console.warn(
    `[Discasa snapshot] ${found.fileName} in channel ${context.indexChannelId} is not a valid Discasa index snapshot.`,
  );
  return null;
}

export async function readLatestFolderSnapshot(
  context: ActiveStorageContext,
): Promise<PersistedFolderSnapshot | null> {
  if (env.mockMode) {
    return null;
  }

  const current = await readJsonSnapshot(context.folderChannelId, [FOLDER_SNAPSHOT_FILENAME]);
  if (current && isFolderSnapshot(current.payload)) {
    return current.payload;
  }

  if (current) {
    console.warn(
      `[Discasa snapshot] ${current.fileName} in channel ${context.folderChannelId} is not a valid Discasa folder snapshot.`,
    );
  }

  const legacy = await readJsonSnapshot(context.indexChannelId, [LEGACY_INDEX_SNAPSHOT_FILENAME]);
  if (legacy && isLegacyIndexSnapshot(legacy.payload)) {
    return deriveFolderSnapshotFromLegacyIndex(legacy.payload);
  }

  if (legacy) {
    console.warn(
      `[Discasa snapshot] ${legacy.fileName} in channel ${context.indexChannelId} is not a valid legacy Discasa index snapshot for folder recovery.`,
    );
  }

  return null;
}

export async function readLatestConfigSnapshot(
  context: ActiveStorageContext,
): Promise<PersistedConfigSnapshot | null> {
  if (env.mockMode) {
    return null;
  }

  const current = await readJsonSnapshot(context.configChannelId, [CONFIG_SNAPSHOT_FILENAME]);
  if (current && isConfigSnapshot(current.payload)) {
    return current.payload;
  }

  if (current) {
    console.warn(
      `[Discasa snapshot] ${current.fileName} in channel ${context.configChannelId} is not a valid Discasa config snapshot.`,
    );
  }

  return null;
}

export async function syncIndexSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<void> {
  if (env.mockMode) {
    return;
  }

  await writeSnapshotToChannel(
    context.indexChannelId,
    INDEX_SNAPSHOT_FILENAME,
    JSON.stringify(snapshot, null, 2),
    "Discasa index snapshot",
    [INDEX_SNAPSHOT_FILENAME, LEGACY_INDEX_SNAPSHOT_FILENAME],
  );
}

export async function syncFolderSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedFolderSnapshot,
): Promise<void> {
  if (env.mockMode) {
    return;
  }

  await writeSnapshotToChannel(
    context.folderChannelId,
    FOLDER_SNAPSHOT_FILENAME,
    JSON.stringify(snapshot, null, 2),
    "Discasa folder snapshot",
    [FOLDER_SNAPSHOT_FILENAME],
  );
}

export async function syncConfigSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedConfigSnapshot,
): Promise<void> {
  if (env.mockMode) {
    return;
  }

  await writeSnapshotToChannel(
    context.configChannelId,
    CONFIG_SNAPSHOT_FILENAME,
    JSON.stringify(snapshot, null, 2),
    "Discasa config snapshot",
    [CONFIG_SNAPSHOT_FILENAME],
  );
}

export async function moveStoredItemToTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  return transferItemBetweenChannels(context, item, context.trashChannelId);
}

export async function restoreStoredItemFromTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  return transferItemBetweenChannels(context, item, context.driveChannelId);
}

export async function deleteStoredItemFromDiscord(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<void> {
  if (hasChunkedStorage(item)) {
    await deleteStorageMessagesFromDiscord(
      context,
      item.storageManifest.parts.map((part) => ({
        channelId: part.storageChannelId,
        messageId: part.storageMessageId,
      })),
    );
    return;
  }

  const source = await resolveStoredMessage(context, item);
  await deleteDiscordMessage(source.channelId, source.messageId);
}
