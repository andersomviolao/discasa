import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { PermissionsBitField } from "discord.js";
import { clearPersistedAuthSession, setPersistedAuthSession } from "../lib/auth-store";
import { env } from "../lib/env";
import { setActiveStorageContext } from "../lib/store";

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

type SessionUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

const router = Router();
const MOCK_ACCESS_TOKEN = "mock_discord_access_token";
const MOCK_REFRESH_TOKEN = "mock_discord_refresh_token";

function createOauthState(): string {
  return randomBytes(16).toString("hex");
}

function buildDiscordAvatarUrl(user: DiscordUserResponse): string | null {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function toSessionUser(user: DiscordUserResponse): SessionUser {
  return {
    id: user.id,
    username: user.global_name ?? user.username,
    avatarUrl: buildDiscordAvatarUrl(user),
  };
}

function applyAuthenticatedSession(
  request: Request,
  token: { access_token: string; refresh_token?: string },
  user: SessionUser,
): void {
  request.session.authenticated = true;
  request.session.discordOauthState = undefined;
  request.session.discordAccessToken = token.access_token;
  request.session.discordRefreshToken = token.refresh_token;
  request.session.user = {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl ?? null,
  };

  setPersistedAuthSession({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    user,
  });
}

function applyMockAuthenticatedSession(request: Request): void {
  applyAuthenticatedSession(
    request,
    {
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: MOCK_REFRESH_TOKEN,
    },
    {
      id: "mock_user",
      username: "Mock User",
      avatarUrl: null,
    },
  );
}

function renderOauthResultPage(options: { title: string; message: string; isError?: boolean }): string {
  const title = options.title;
  const message = options.message;
  const statusLabel = options.isError ? "Login failed" : "Login complete";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: radial-gradient(circle at top, rgba(90, 95, 255, 0.22), rgba(7, 10, 18, 0.98) 58%);
        color: rgba(255, 255, 255, 0.92);
      }

      .panel {
        width: min(480px, 100%);
        padding: 28px;
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(13, 17, 27, 0.94);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.45);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 12px;
        border-radius: 999px;
        background: ${options.isError ? "rgba(123, 34, 41, 0.32)" : "rgba(88, 101, 242, 0.22)"};
        color: ${options.isError ? "#ffb1b5" : "#c7d0ff"};
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      h1 {
        margin: 18px 0 10px;
        font-size: 24px;
        font-weight: 600;
      }

      p {
        margin: 0;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.55;
      }

      .hint {
        margin-top: 20px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.5);
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <span class="badge">${statusLabel}</span>
      <h1>${title}</h1>
      <p>${message}</p>
      <p class="hint">You can close this browser window and return to Discasa.</p>
    </main>
    <script>
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // Ignore browser restrictions.
        }
      }, 1200);
    </script>
  </body>
</html>`;
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

function buildBotPermissionInteger(): string {
  const permissions = new PermissionsBitField([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
  ]);

  return permissions.bitfield.toString();
}

router.get("/discord/login", (request, response) => {
  if (env.mockMode) {
    applyMockAuthenticatedSession(request);
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "The mock Discord session was connected successfully.",
      }),
    );
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
    response.send(
      renderOauthResultPage({
        title: "Discasa ready to apply",
        message: "Mock mode is enabled, so the bot step was skipped.",
      }),
    );
    return;
  }

  const guildId = typeof request.query.guildId === "string" ? request.query.guildId : "";
  const params = new URLSearchParams({
    client_id: env.discordClientId,
    scope: "bot applications.commands",
    permissions: buildBotPermissionInteger(),
  });

  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.post("/discord/logout", (request, response) => {
  clearPersistedAuthSession();
  setActiveStorageContext(null);

  response.clearCookie("connect.sid");

  request.session.destroy((error) => {
    if (error) {
      response.status(500).json({ error: "Could not logout from Discord." });
      return;
    }

    response.json({ loggedOut: true });
  });
});

router.get("/discord/callback", async (request, response) => {
  if (env.mockMode) {
    applyMockAuthenticatedSession(request);
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "The mock Discord session was connected successfully.",
      }),
    );
    return;
  }

  try {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";

    if (!code) {
      response.status(400).send(
        renderOauthResultPage({
          title: "Discasa login failed",
          message: "The Discord authorization code was not returned. Please try again from the app.",
          isError: true,
        }),
      );
      return;
    }

    if (!state || state !== request.session.discordOauthState) {
      response.status(400).send(
        renderOauthResultPage({
          title: "Discasa login failed",
          message: "The Discord OAuth state did not match. Please start the login again from Discasa.",
          isError: true,
        }),
      );
      return;
    }

    const token = await exchangeDiscordCode(code);
    const user = await getCurrentDiscordUser(token.access_token);

    applyAuthenticatedSession(request, token, toSessionUser(user));
    response.send(
      renderOauthResultPage({
        title: "Discasa login complete",
        message: "Discord authentication succeeded. Return to Discasa to choose your server.",
      }),
    );
  } catch (error) {
    console.error("Discord OAuth callback failed", error);
    clearPersistedAuthSession();
    response.status(500).send(
      renderOauthResultPage({
        title: "Discasa login failed",
        message: "Discasa could not finish the Discord login. Please try again from the app.",
        isError: true,
      }),
    );
  }
});

export { router as authRouter };
