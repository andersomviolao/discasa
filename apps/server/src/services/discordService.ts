import {
  DISCASA_CATEGORY_NAME,
  DISCASA_CHANNELS,
  type GuildSummary,
  type LibraryItem,
} from "@discasa/shared";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Message,
  PermissionsBitField,
  type GuildTextBasedChannel,
} from "discord.js";
import type { ActiveStorageContext, PersistedIndexSnapshot, UploadedFileRecord } from "../lib/store";
import { env } from "../lib/env";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
};

const INDEX_SNAPSHOT_FILENAME = "discasa-index.json";
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
  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch the user guild list from Discord.");
  }

  return (await response.json()) as DiscordUserGuild[];
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
      trashChannelId: "mock-trash",
      trashChannelName: DISCASA_CHANNELS[2],
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
  const trashChannel = resolvedChannels.get(DISCASA_CHANNELS[2]);

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
    trashChannelId: trashChannel.id,
    trashChannelName: trashChannel.name,
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

export async function readLatestIndexSnapshot(
  context: ActiveStorageContext,
): Promise<PersistedIndexSnapshot | null> {
  if (env.mockMode) {
    return null;
  }

  const channel = await getGuildTextChannel(context.indexChannelId);
  const messages = await channel.messages.fetch({ limit: 100 });
  const orderedMessages = [...messages.values()].sort((left, right) => right.createdTimestamp - left.createdTimestamp);

  for (const message of orderedMessages) {
    const attachment = [...message.attachments.values()].find((entry) => entry.name === INDEX_SNAPSHOT_FILENAME);
    if (!attachment) {
      continue;
    }

    const response = await fetch(attachment.url);
    if (!response.ok) {
      continue;
    }

    try {
      const parsed = JSON.parse(await response.text()) as PersistedIndexSnapshot;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.albums) && Array.isArray(parsed.items)) {
        return parsed;
      }
    } catch {
      // Ignore malformed snapshots and continue scanning older ones.
    }
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

  const channel = await getGuildTextChannel(context.indexChannelId);
  const payload = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8");

  await channel.send({
    content: `Discasa index snapshot ${new Date().toISOString()}`,
    files: [
      {
        attachment: payload,
        name: INDEX_SNAPSHOT_FILENAME,
      },
    ],
  });
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
