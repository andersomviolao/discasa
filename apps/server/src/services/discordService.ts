import type { GuildSummary } from "@discasa/shared";
import { DISCASA_CATEGORY_NAME, DISCASA_CHANNELS } from "@discasa/shared";
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from "discord.js";
import { env } from "../lib/env";
import { getMockGuilds, initializeMockDiscasa } from "../lib/store";

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

export async function listEligibleGuilds(): Promise<GuildSummary[]> {
  if (env.mockMode) {
    return getMockGuilds();
  }

  return [];
}

export async function initializeDiscasaInGuild(guildId: string) {
  if (env.mockMode) {
    return initializeMockDiscasa(guildId);
  }

  const client = await getBotClient();
  if (!client) {
    throw new Error("Bot client is not configured.");
  }

  const guild = await client.guilds.fetch(guildId);
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
