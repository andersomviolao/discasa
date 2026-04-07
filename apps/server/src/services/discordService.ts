import {
  DISCASA_CATEGORY_NAME,
  DISCASA_CHANNELS,
  type DiscasaConfig,
  type FolderMembership,
  type FolderNode,
  type GuildSummary,
  type LibraryItem,
  type PersistedConfigSnapshot,
  type PersistedFolderSnapshot,
  type PersistedIndexSnapshot,
} from "@discasa/shared";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Message,
  PermissionsBitField,
  type GuildTextBasedChannel,
} from "discord.js";
import type { ActiveStorageContext, UploadedFileRecord } from "../lib/store";
import { env } from "../lib/env";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
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

const INDEX_SNAPSHOT_FILENAME = "discasa-index.snapshot.json";
const LEGACY_INDEX_SNAPSHOT_FILENAME = "discasa-index.json";
const FOLDER_SNAPSHOT_FILENAME = "discasa-folder.snapshot.json";
const CONFIG_SNAPSHOT_FILENAME = "discasa-config.snapshot.json";
let botClient: Client | null = null;

async function getBotClient(): Promise<Client | null> {
  if (env.mockMode || !env.discordBotToken) {
    return null;
  }

  if (!botClient) {
    botClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    await botClient.login(env.discordBotToken);
  }

  return botClient;
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
    const errorDetails = {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      body: parsedBody,
      headers: {
        contentType: response.headers.get("content-type"),
        wwwAuthenticate: response.headers.get("www-authenticate"),
        xRateLimitLimit: response.headers.get("x-ratelimit-limit"),
        xRateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
        xRateLimitReset: response.headers.get("x-ratelimit-reset"),
        retryAfter: response.headers.get("retry-after"),
      },
      tokenPreview: `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}`,
    };

    console.error("[Discord API] Failed to fetch user guilds.", errorDetails);

    throw new Error(
      `Failed to fetch the user guild list from Discord (${response.status} ${response.statusText}).`,
    );
  }

  if (!Array.isArray(parsedBody)) {
    console.error("[Discord API] Unexpected payload while fetching user guilds.", {
      endpoint,
      status: response.status,
      body: parsedBody,
    });

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

async function getGuildTextChannel(channelId: string): Promise<GuildTextBasedChannel> {
  const client = await getBotClient();
  if (!client) {
    throw new Error("Bot client is not configured.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isTextBased() || !("send" in channel) || !("messages" in channel)) {
    throw new Error("Discasa storage channel is not available.");
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

async function findMessageForItem(
  context: ActiveStorageContext,
  item: LibraryItem,
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
    const channel = await getGuildTextChannel(channelId);
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const message of messages.values()) {
      if (botUserId && message.author.id !== botUserId) {
        continue;
      }

      for (const attachment of message.attachments.values()) {
        const sameUrl = attachment.url === item.attachmentUrl || attachment.proxyURL === item.attachmentUrl;
        const sameName = attachment.name === item.name;

        if (sameUrl || sameName) {
          return {
            channelId,
            message,
            attachmentUrl: attachment.url,
          };
        }
      }
    }
  }

  return null;
}

async function resolveStoredMessage(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<{ channelId: string; messageId: string; attachmentUrl: string }> {
  if (item.storageChannelId && item.storageMessageId) {
    return {
      channelId: item.storageChannelId,
      messageId: item.storageMessageId,
      attachmentUrl: item.attachmentUrl,
    };
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

async function transferItemBetweenChannels(
  context: ActiveStorageContext,
  item: LibraryItem,
  targetChannelId: string,
): Promise<UploadedFileRecord> {
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

function convertLegacyIndexToCurrent(raw: LegacyPersistedIndexSnapshot): PersistedIndexSnapshot {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    items: raw.items.map((item) => {
      const { albumIds: _albumIds, ...indexItem } = item;
      return indexItem;
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
  const found = await readSnapshotMessage(channelId, fileNames);
  if (!found) {
    return null;
  }

  const response = await fetch(found.attachmentUrl);
  if (!response.ok) {
    return null;
  }

  try {
    return {
      payload: JSON.parse(await response.text()) as unknown,
      fileName: found.fileName,
    };
  } catch {
    return null;
  }
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

export async function initializeDiscasaInGuild(guildId: string): Promise<ActiveStorageContext> {
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
      folderChannelId: "mock-folder",
      folderChannelName: DISCASA_CHANNELS[2],
      trashChannelId: "mock-trash",
      trashChannelName: DISCASA_CHANNELS[3],
      configChannelId: "mock-config",
      configChannelName: DISCASA_CHANNELS[4],
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

  if (!hasManageChannels) {
    throw new Error("The bot is missing Manage Channels permission in the selected guild.");
  }

  const existingCategory = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === DISCASA_CATEGORY_NAME,
  );

  const category =
    existingCategory ??
    (await guild.channels.create({
      name: DISCASA_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Initialize Discasa category",
    }));

  const resolvedChannels = new Map<string, { id: string; name: string }>();

  for (const channelName of DISCASA_CHANNELS) {
    const existing = guild.channels.cache.find(
      (channel) => channel.parentId === category.id && channel.name === channelName,
    );

    const nextChannel =
      existing ??
      (await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: "Initialize Discasa channels",
      }));

    resolvedChannels.set(channelName, {
      id: nextChannel.id,
      name: nextChannel.name,
    });
  }

  const driveChannel = resolvedChannels.get(DISCASA_CHANNELS[0]);
  const indexChannel = resolvedChannels.get(DISCASA_CHANNELS[1]);
  const folderChannel = resolvedChannels.get(DISCASA_CHANNELS[2]);
  const trashChannel = resolvedChannels.get(DISCASA_CHANNELS[3]);
  const configChannel = resolvedChannels.get(DISCASA_CHANNELS[4]);

  if (!driveChannel || !indexChannel || !folderChannel || !trashChannel || !configChannel) {
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
    folderChannelId: folderChannel.id,
    folderChannelName: folderChannel.name,
    trashChannelId: trashChannel.id,
    trashChannelName: trashChannel.name,
    configChannelId: configChannel.id,
    configChannelName: configChannel.name,
  };
}

export async function uploadFilesToDiscordDrive(
  files: Express.Multer.File[],
  context: ActiveStorageContext,
): Promise<UploadedFileRecord[]> {
  if (env.mockMode) {
    return files.map((file) => ({
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype || "application/octet-stream",
      guildId: context.guildId,
      attachmentUrl: `mock://uploads/${encodeURIComponent(file.originalname)}`,
    }));
  }

  const uploaded: UploadedFileRecord[] = [];

  for (const file of files) {
    const nextRecord = await sendBufferToChannel(
      context.driveChannelId,
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

export async function hasCurrentIndexSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  return Boolean(await readSnapshotMessage(context.indexChannelId, [INDEX_SNAPSHOT_FILENAME]));
}

export async function hasCurrentFolderSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  return Boolean(await readSnapshotMessage(context.folderChannelId, [FOLDER_SNAPSHOT_FILENAME]));
}

export async function hasCurrentConfigSnapshot(context: ActiveStorageContext): Promise<boolean> {
  if (env.mockMode) {
    return false;
  }

  return Boolean(await readSnapshotMessage(context.configChannelId, [CONFIG_SNAPSHOT_FILENAME]));
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

  const legacy = await readJsonSnapshot(context.indexChannelId, [LEGACY_INDEX_SNAPSHOT_FILENAME]);
  if (legacy && isLegacyIndexSnapshot(legacy.payload)) {
    return deriveFolderSnapshotFromLegacyIndex(legacy.payload);
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
  const source = await resolveStoredMessage(context, item);
  await deleteDiscordMessage(source.channelId, source.messageId);
}
