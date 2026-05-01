import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const rootEnvPath = path.resolve(currentDirPath, "../.env");

dotenv.config({ path: rootEnvPath });

type Environment = {
  port: number;
  mockMode: boolean;
  discordBotToken: string;
};

export const env: Environment = {
  port: Number(process.env.BOT_PORT ?? 3002),
  mockMode: String(process.env.MOCK_MODE ?? "true") === "true",
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
};
