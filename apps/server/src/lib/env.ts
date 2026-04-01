import dotenv from "dotenv";

dotenv.config({ path: new URL("../../../../.env", import.meta.url).pathname });

type Environment = {
  port: number;
  frontendUrl: string;
  sessionSecret: string;
  mockMode: boolean;
  discordClientId: string;
  discordClientSecret: string;
  discordBotToken: string;
  discordRedirectUri: string;
};

export const env: Environment = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:1420",
  sessionSecret: process.env.SESSION_SECRET ?? "discasa-dev-session-secret",
  mockMode: String(process.env.MOCK_MODE ?? "true") === "true",
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:3001/auth/discord/callback",
};
