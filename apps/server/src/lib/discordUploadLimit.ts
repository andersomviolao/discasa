import { env } from "./env";

const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const LEVEL_TWO_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const LEVEL_THREE_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

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

export function getUploadTooLargeMessage(files: Array<{ originalname: string; size: number }>, uploadLimitBytes: number): string {
  const fileList = files
    .map((file) => `${file.originalname} (${formatBytes(file.size)})`)
    .join(", ");

  return `File too large for Discord on this server. Limit: ${formatBytes(uploadLimitBytes)}. Rejected: ${fileList}.`;
}
