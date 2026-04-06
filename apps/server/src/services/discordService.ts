import {
  DISCASA_CATEGORY_NAME,
  DISCASA_CHANNELS,
  type GuildSummary,
} from "@discasa/shared";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import type { ActiveStorageContext, PersistedIndexState, UploadedFileRecord } from "../lib/store";
import { env } from "../lib/env";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
};

type PersistedIndexEnvelope = {
  version: 1;
  savedAt: string;
  albums: PersistedIndexState["albums"];
  items: PersistedIndexState["items"];
};

const INDEX_MESSAGE_TAG = "[discasa-index]";
const INDEX_FILE_NAME = "discasa-index.json";

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

function isGuildTextChannel(channel: GuildBasedChannel | null): channel is GuildTextBasedChannel {
  return Boolean(channel && channel.isTextBased() && "send" in channel && "messages" in channel);
}

async function fetchGuildTextChannel(channelId: string, errorMessage: string): Promise<GuildTextBasedChannel> {
  const client = await getBotClient();
  if (!client) {
    throw new Error("Bot client is not configured.");
  }

  const channel = await client.channels.fetch(channelId);
  if (!isGuildTextChannel(channel)) {
    throw new Error(errorMessage);
  }

  return channel;
}

function buildIndexEnvelope(state: PersistedIndexState): PersistedIndexEnvelope {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    albums: state.albums,
    items: state.items,
  };
}

function isIndexSnapshotMessage(message: Message<true>, botUserId: string): boolean {
  if (message.author.id !== botUserId) {
    return false;
  }

  if (!message.content.startsWith(INDEX_MESSAGE_TAG)) {
    return false;
  }

  return [...message.attachments.values()].some((attachment) => attachment.name === INDEX_FILE_NAME);
}

async function readIndexEnvelopeFromMessage(message: Message<true>): Promise<PersistedIndexEnvelope | null> {
  const attachment =
    [...message.attachments.values()].find((entry) => entry.name === INDEX_FILE_NAME) ??
    [...message.attachments.values()][0];

  if (!attachment) {
    return null;
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    return null;
  }

  const parsed = (await response.json()) as Partial<PersistedIndexEnvelope>;
  if (!Array.isArray(parsed.albums) || !Array.isArray(parsed.items)) {
    return null;
  }

  return {
    version: 1,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    albums: parsed.albums,
    items: parsed.items,
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

export async function initializeDiscasaInGuild(guildId: string): Promise<ActiveStorageContext> {
  if (env.mockMode) {
    return {
      guildId,
      guildName: "Discasa Server",
      categoryId: "mock_category",
      categoryName: DISCASA_CATEGORY_NAME,
      driveChannelId: "mock_drive",
      driveChannelName: DISCASA_CHANNELS[0],
      indexChannelId: "mock_index",
      indexChannelName: DISCASA_CHANNELS[1],
      trashChannelId: "mock_trash",
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
    const existingChannel = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === channelName,
    );

    const channel =
      existingChannel ??
      (await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: "Initialize Discasa channels",
      }));

    resolvedChannels.set(channelName, {
      id: channel.id,
      name: channel.name,
    });
  }

  const driveChannel = resolvedChannels.get(DISCASA_CHANNELS[0]);
  const indexChannel = resolvedChannels.get(DISCASA_CHANNELS[1]);
  const trashChannel = resolvedChannels.get(DISCASA_CHANNELS[2]);

  if (!driveChannel || !indexChannel || !trashChannel) {
    throw new Error("Discasa channels could not be created in the selected guild.");
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

  const channel = await fetchGuildTextChannel(context.driveChannelId, "Discasa drive channel is not available.");
  const uploaded: UploadedFileRecord[] = [];

  for (const file of files) {
    const sentMessage = await channel.send({
      files: [
        {
          attachment: Buffer.from(file.buffer),
          name: file.originalname,
        },
      ],
    });

    const attachment =
      [...sentMessage.attachments.values()].find((entry) => entry.name === file.originalname) ??
      [...sentMessage.attachments.values()][0];

    if (!attachment) {
      throw new Error(`Discord did not return an attachment URL for ${file.originalname}.`);
    }

    uploaded.push({
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype || "application/octet-stream",
      guildId: context.guildId,
      attachmentUrl: attachment.url,
    });
  }

  return uploaded;
}

export async function loadPersistedIndexState(
  context: ActiveStorageContext,
): Promise<{ state: PersistedIndexState; messageId: string } | null> {
  if (env.mockMode) {
    return null;
  }

  const channel = await fetchGuildTextChannel(context.indexChannelId, "Discasa index channel is not available.");
  const botUserId = channel.client.user?.id;

  if (!botUserId) {
    return null;
  }

  const messages = await channel.messages.fetch({ limit: 50 });
  const orderedMessages = [...messages.values()].sort((left, right) => right.createdTimestamp - left.createdTimestamp);

  for (const message of orderedMessages) {
    if (!isIndexSnapshotMessage(message, botUserId)) {
      continue;
    }

    const envelope = await readIndexEnvelopeFromMessage(message);
    if (!envelope) {
      continue;
    }

    return {
      state: {
        albums: envelope.albums,
        items: envelope.items,
      },
      messageId: message.id,
    };
  }

  return null;
}

export async function persistIndexState(
  context: ActiveStorageContext,
  state: PersistedIndexState,
): Promise<string> {
  if (env.mockMode) {
    return "mock_index_message";
  }

  const channel = await fetchGuildTextChannel(context.indexChannelId, "Discasa index channel is not available.");
  const payload = JSON.stringify(buildIndexEnvelope(state), null, 2);

  const sentMessage = await channel.send({
    content: `${INDEX_MESSAGE_TAG} ${new Date().toISOString()}`,
    files: [
      {
        attachment: Buffer.from(payload, "utf8"),
        name: INDEX_FILE_NAME,
      },
    ],
  });

  return sentMessage.id;
}
