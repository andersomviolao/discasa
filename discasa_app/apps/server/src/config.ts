import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const rootEnvPath = path.resolve(currentDirPath, "../../../.env");

dotenv.config({ path: rootEnvPath });

type Environment = {
  port: number;
  frontendUrl: string;
  sessionSecret: string;
  mockMode: boolean;
  discordClientId: string;
  discordClientSecret: string;
  discordBotUrl: string;
  discordRedirectUri: string;
};

export const env: Environment = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:1420",
  sessionSecret: process.env.SESSION_SECRET ?? "discasa-dev-session-secret",
  mockMode: String(process.env.MOCK_MODE ?? "true") === "true",
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordBotUrl: process.env.DISCORD_BOT_URL ?? "http://localhost:3002",
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:3001/auth/discord/callback",
};
