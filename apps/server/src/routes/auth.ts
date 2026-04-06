import { randomBytes } from "node:crypto";
import { Router } from "express";
import { PermissionsBitField } from "discord.js";
import { env } from "../lib/env";

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

const router = Router();

function createOauthState(): string {
  return randomBytes(16).toString("hex");
}

function buildDiscordAvatarUrl(user: DiscordUserResponse): string | null {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function buildBotPermissionInteger(): string {
  const permissions = new PermissionsBitField([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.ManageChannels,
  ]);

  return permissions.bitfield.toString();
}

async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.discordRedirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to exchange the Discord authorization code.");
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function getCurrentDiscordUser(accessToken: string): Promise<DiscordUserResponse> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch the current Discord user.");
  }

  return (await response.json()) as DiscordUserResponse;
}

router.get("/discord/login", (request, response) => {
  if (env.mockMode) {
    request.session.authenticated = true;
    request.session.user = {
      id: "mock_user",
      username: "Mock User",
      avatarUrl: null,
    };
    response.redirect(env.frontendUrl);
    return;
  }

  const state = createOauthState();
  request.session.discordOauthState = state;

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    response_type: "code",
    redirect_uri: env.discordRedirectUri,
    scope: "identify guilds",
    state,
    prompt: "consent",
  });

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get("/discord/install", (request, response) => {
  if (env.mockMode) {
    response.redirect(env.frontendUrl);
    return;
  }

  const guildId = typeof request.query.guildId === "string" ? request.query.guildId : "";
  const params = new URLSearchParams({
    client_id: env.discordClientId,
    scope: "bot",
    permissions: buildBotPermissionInteger(),
  });

  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get("/discord/callback", async (request, response, next) => {
  if (env.mockMode) {
    request.session.authenticated = true;
    request.session.user = {
      id: "mock_user",
      username: "Mock User",
      avatarUrl: null,
    };
    response.redirect(env.frontendUrl);
    return;
  }

  try {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";

    if (!code) {
      response.status(400).json({ error: "Missing Discord authorization code." });
      return;
    }

    if (!state || state !== request.session.discordOauthState) {
      response.status(400).json({ error: "Invalid Discord OAuth state." });
      return;
    }

    const token = await exchangeDiscordCode(code);
    const user = await getCurrentDiscordUser(token.access_token);

    request.session.authenticated = true;
    request.session.discordOauthState = undefined;
    request.session.discordAccessToken = token.access_token;
    request.session.discordRefreshToken = token.refresh_token;
    request.session.user = {
      id: user.id,
      username: user.global_name ?? user.username,
      avatarUrl: buildDiscordAvatarUrl(user),
    };

    response.redirect(env.frontendUrl);
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
