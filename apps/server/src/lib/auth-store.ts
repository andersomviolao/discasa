import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PersistedDiscordUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

type PersistedAuthState = {
  authenticated: boolean;
  discordAccessToken: string | null;
  discordRefreshToken: string | null;
  user: PersistedDiscordUser | null;
};

type SessionLike = {
  authenticated?: boolean;
  discordAccessToken?: string;
  discordRefreshToken?: string;
  user?: PersistedDiscordUser | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../../.discasa-data");
const authFile = path.join(dataDir, "auth.json");

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDefaultAuthState(): PersistedAuthState {
  return {
    authenticated: false,
    discordAccessToken: null,
    discordRefreshToken: null,
    user: null,
  };
}

function normalizeUser(raw: unknown): PersistedDiscordUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;

  if (typeof entry.id !== "string" || typeof entry.username !== "string") {
    return null;
  }

  return {
    id: entry.id,
    username: entry.username,
    avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : entry.avatarUrl === null ? null : null,
  };
}

function normalizeAuthState(raw: unknown): PersistedAuthState {
  const fallback = createDefaultAuthState();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const entry = raw as Record<string, unknown>;
  const user = normalizeUser(entry.user);
  const accessToken = typeof entry.discordAccessToken === "string" && entry.discordAccessToken.length > 0
    ? entry.discordAccessToken
    : null;
  const refreshToken = typeof entry.discordRefreshToken === "string" && entry.discordRefreshToken.length > 0
    ? entry.discordRefreshToken
    : null;
  const authenticated = entry.authenticated === true && Boolean(user && accessToken);

  return {
    authenticated,
    discordAccessToken: authenticated ? accessToken : null,
    discordRefreshToken: authenticated ? refreshToken : null,
    user: authenticated ? user : null,
  };
}

function loadPersistedAuthState(): PersistedAuthState {
  ensureDataDir();

  if (!fs.existsSync(authFile)) {
    const next = createDefaultAuthState();
    fs.writeFileSync(authFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  try {
    const raw = fs.readFileSync(authFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeAuthState(parsed);
    fs.writeFileSync(authFile, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  } catch {
    const next = createDefaultAuthState();
    fs.writeFileSync(authFile, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}

const persistedAuthState = loadPersistedAuthState();

function savePersistedAuthState(): void {
  ensureDataDir();
  fs.writeFileSync(authFile, JSON.stringify(persistedAuthState, null, 2), "utf8");
}

export function setPersistedAuthSession(input: {
  accessToken: string;
  refreshToken?: string;
  user: PersistedDiscordUser;
}): void {
  persistedAuthState.authenticated = true;
  persistedAuthState.discordAccessToken = input.accessToken;
  persistedAuthState.discordRefreshToken = input.refreshToken ?? null;
  persistedAuthState.user = {
    id: input.user.id,
    username: input.user.username,
    avatarUrl: input.user.avatarUrl ?? null,
  };

  savePersistedAuthState();
}

export function hydrateSessionFromPersistedAuth(session: SessionLike): boolean {
  if (!persistedAuthState.authenticated || !persistedAuthState.discordAccessToken || !persistedAuthState.user) {
    return false;
  }

  session.authenticated = true;
  session.discordAccessToken = persistedAuthState.discordAccessToken;
  session.discordRefreshToken = persistedAuthState.discordRefreshToken ?? undefined;
  session.user = {
    id: persistedAuthState.user.id,
    username: persistedAuthState.user.username,
    avatarUrl: persistedAuthState.user.avatarUrl ?? null,
  };

  return true;
}

export function clearPersistedAuthSession(): void {
  persistedAuthState.authenticated = false;
  persistedAuthState.discordAccessToken = null;
  persistedAuthState.discordRefreshToken = null;
  persistedAuthState.user = null;

  savePersistedAuthState();
}
