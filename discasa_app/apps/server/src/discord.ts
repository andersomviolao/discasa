import type { GuildSummary } from "@discasa/shared";
import { env } from "./config";

type DiscordUserGuild = {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
};

const DISCORD_PERMISSION_ADMINISTRATOR = 0x8n;
const DISCORD_PERMISSION_MANAGE_GUILD = 0x20n;
const DISCORD_PERMISSION_MANAGE_CHANNELS = 0x10n;

export class DiscordAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordAuthorizationError";
  }
}

function formatBytes(value: number): string {
  const megabytes = value / (1024 * 1024);

  if (megabytes >= 100) {
    return `${Math.round(megabytes)} MB`;
  }

  return `${megabytes.toFixed(1)} MB`;
}

export function getUploadTooLargeMessage(
  files: Array<{ originalname: string; size: number }>,
  uploadLimitBytes: number,
): string {
  const fileList = files.map((file) => `${file.originalname} (${formatBytes(file.size)})`).join(", ");

  return `File too large for Discord on this server. Limit: ${formatBytes(uploadLimitBytes)}. Rejected: ${fileList}.`;
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
  return (
    (resolved & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n ||
    (resolved & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n ||
    (resolved & DISCORD_PERMISSION_MANAGE_CHANNELS) !== 0n
  );
}

function getPermissionLabels(permissions: string, owner: boolean): string[] {
  const labels: string[] = [];
  const resolved = BigInt(permissions || "0");

  if (owner) {
    labels.push("OWNER");
  }

  if ((resolved & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n) {
    labels.push("ADMINISTRATOR");
  }

  if ((resolved & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n) {
    labels.push("MANAGE_GUILD");
  }

  if ((resolved & DISCORD_PERMISSION_MANAGE_CHANNELS) !== 0n) {
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
