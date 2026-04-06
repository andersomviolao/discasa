import { DISCASA_CATEGORY_NAME, DISCASA_CHANNELS, type GuildSummary } from "@discasa/shared";
import { ChannelType, Client, GatewayIntentBits, PermissionsBitField } from "discord.js";
import { env } from "../lib/env";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
};

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

export async function initializeDiscasaInGuild(guildId: string) {
  if (env.mockMode) {
    return {
      guildId,
      categoryName: DISCASA_CATEGORY_NAME,
      channels: DISCASA_CHANNELS,
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

  const createdChannels = [] as string[];

  for (const channelName of DISCASA_CHANNELS) {
    const existing = guild.channels.cache.find(
      (channel) => channel.parentId === category.id && channel.name === channelName,
    );

    if (!existing) {
      await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: "Initialize Discasa channels",
      });
    }

    createdChannels.push(channelName);
  }

  return {
    guildId,
    categoryName: DISCASA_CATEGORY_NAME,
    channels: createdChannels,
  };
}
