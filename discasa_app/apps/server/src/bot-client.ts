import type {
  DiscasaAttachmentRecoveryWarning,
  LibraryItem,
  PersistedConfigSnapshot,
  PersistedFolderSnapshot,
  PersistedIndexSnapshot,
} from "@discasa/shared";
import { env } from "./config";
import type { ActiveStorageContext, UploadedFileRecord } from "./persistence";

export type DiscasaBotStatus = {
  processAvailable: boolean;
  ok: boolean;
  mockMode: boolean;
  botConfigured: boolean;
  botLoggedIn: boolean;
  botUserId: string | null;
  error?: string;
};

type DiscasaSetupStatus = {
  botPresent: boolean;
  categoryPresent: boolean;
  channelsPresent: boolean;
  configMarkerPresent: boolean;
  isApplied: boolean;
  missingChannels: string[];
};

type RefreshIndexSnapshotResult = {
  snapshot: PersistedIndexSnapshot;
  relinkedItemCount: number;
  unresolvedItems: DiscasaAttachmentRecoveryWarning[];
  didChange: boolean;
};

type SnapshotKind = "index" | "folder" | "config";

type BotErrorPayload = {
  error?: string;
};

function getBotBaseUrl(): string {
  return env.discordBotUrl.replace(/\/+$/, "");
}

async function requestBotJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getBotBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    throw new Error(`Discasa bot service is unavailable at ${getBotBaseUrl()}: ${message}`);
  }

  if (!response.ok) {
    let payload: BotErrorPayload | null = null;

    try {
      payload = (await response.json()) as BotErrorPayload;
    } catch {
      payload = null;
    }

    throw new Error(payload?.error ?? `Discasa bot service request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function toJsonBody(payload: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(payload),
  };
}

export async function getDiscasaBotStatus(): Promise<DiscasaBotStatus> {
  try {
    const status = await requestBotJson<Omit<DiscasaBotStatus, "processAvailable">>("/health");
    return {
      processAvailable: true,
      ...status,
    };
  } catch (error) {
    return {
      processAvailable: false,
      ok: false,
      mockMode: false,
      botConfigured: false,
      botLoggedIn: false,
      botUserId: null,
      error: error instanceof Error ? error.message : "Discasa bot service is unavailable.",
    };
  }
}

export async function inspectDiscasaSetup(guildId: string): Promise<DiscasaSetupStatus> {
  return requestBotJson<DiscasaSetupStatus>(`/guilds/${encodeURIComponent(guildId)}/setup-status`);
}

export async function initializeDiscasaInGuild(
  guildId: string,
  authenticatedUserId?: string,
): Promise<ActiveStorageContext> {
  return requestBotJson<ActiveStorageContext>(
    `/guilds/${encodeURIComponent(guildId)}/initialize`,
    toJsonBody({ authenticatedUserId }),
  );
}

export async function getDiscordUploadLimitForGuild(guildId: string): Promise<number> {
  const payload = await requestBotJson<{ uploadLimitBytes: number }>(`/guilds/${encodeURIComponent(guildId)}/upload-limit`);
  return payload.uploadLimitBytes;
}

export async function uploadFilesToDiscordDrive(
  files: Express.Multer.File[],
  context: ActiveStorageContext,
): Promise<UploadedFileRecord[]> {
  const body = new FormData();
  body.append("context", JSON.stringify(context));

  for (const file of files) {
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], { type: file.mimetype || "application/octet-stream" });
    body.append("files", blob, file.originalname);
  }

  const payload = await requestBotJson<{ records: UploadedFileRecord[] }>("/files/upload", {
    method: "POST",
    body,
  });
  return payload.records;
}

export async function refreshIndexSnapshotAttachmentUrls(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<RefreshIndexSnapshotResult> {
  return requestBotJson<RefreshIndexSnapshotResult>("/snapshots/index/refresh-attachments", toJsonBody({ context, snapshot }));
}

export async function hasCurrentIndexSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("index", context);
}

export async function hasCurrentFolderSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("folder", context);
}

export async function hasCurrentConfigSnapshot(context: ActiveStorageContext): Promise<boolean> {
  return hasCurrentSnapshot("config", context);
}

async function hasCurrentSnapshot(kind: SnapshotKind, context: ActiveStorageContext): Promise<boolean> {
  const payload = await requestBotJson<{ current: boolean }>(`/snapshots/${kind}/current`, toJsonBody({ context }));
  return payload.current;
}

export async function readLatestIndexSnapshot(context: ActiveStorageContext): Promise<PersistedIndexSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedIndexSnapshot | null }>(`/snapshots/index/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function readLatestFolderSnapshot(context: ActiveStorageContext): Promise<PersistedFolderSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedFolderSnapshot | null }>(`/snapshots/folder/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function readLatestConfigSnapshot(context: ActiveStorageContext): Promise<PersistedConfigSnapshot | null> {
  const payload = await requestBotJson<{ snapshot: PersistedConfigSnapshot | null }>(`/snapshots/config/latest`, toJsonBody({ context }));
  return payload.snapshot;
}

export async function syncIndexSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedIndexSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/index/sync", toJsonBody({ context, snapshot }));
}

export async function syncFolderSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedFolderSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/folder/sync", toJsonBody({ context, snapshot }));
}

export async function syncConfigSnapshot(
  context: ActiveStorageContext,
  snapshot: PersistedConfigSnapshot,
): Promise<void> {
  await requestBotJson<{ synced: true }>("/snapshots/config/sync", toJsonBody({ context, snapshot }));
}

export async function moveStoredItemToTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  const payload = await requestBotJson<{ record: UploadedFileRecord }>("/files/move-to-trash", toJsonBody({ context, item }));
  return payload.record;
}

export async function restoreStoredItemFromTrash(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<UploadedFileRecord> {
  const payload = await requestBotJson<{ record: UploadedFileRecord }>("/files/restore-from-trash", toJsonBody({ context, item }));
  return payload.record;
}

export async function deleteStoredItemFromDiscord(
  context: ActiveStorageContext,
  item: LibraryItem,
): Promise<void> {
  await requestBotJson<{ deleted: true }>("/files/delete", toJsonBody({ context, item }));
}
