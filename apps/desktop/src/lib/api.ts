import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AlbumRecord,
  AppSession,
  CreateAlbumInput,
  DiscasaConfig,
  DiscasaInitializationResponse,
  GuildSummary,
  LibraryItem,
  RenameAlbumInput,
  SaveLibraryItemMediaEditInput,
  UploadResponse,
} from "@discasa/shared";

const API_BASE = "http://localhost:3001";

export type DiscasaSetupStatus = {
  botPresent: boolean;
  categoryPresent: boolean;
  channelsPresent: boolean;
  configMarkerPresent: boolean;
  isApplied: boolean;
  missingChannels: string[];
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;

    try {
      const data = (await response.json()) as { error?: string };
      message = data.error ?? fallback;
    } catch {
      message = fallback;
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function getSession(): Promise<AppSession> {
  return requestJson<AppSession>("/api/session");
}

export async function getGuilds(): Promise<GuildSummary[]> {
  return requestJson<GuildSummary[]>("/api/guilds");
}

export async function getDiscasaSetupStatus(guildId: string): Promise<DiscasaSetupStatus> {
  const query = new URLSearchParams({ guildId });
  return requestJson<DiscasaSetupStatus>(`/api/discasa/status?${query.toString()}`);
}

export async function initializeDiscasa(guildId: string): Promise<DiscasaInitializationResponse> {
  return requestJson<DiscasaInitializationResponse>("/api/discasa/initialize", {
    method: "POST",
    body: JSON.stringify({ guildId }),
  });
}

export async function getAppConfig(): Promise<DiscasaConfig> {
  return requestJson<DiscasaConfig>("/api/config");
}

export async function updateAppConfig(input: Partial<DiscasaConfig>): Promise<DiscasaConfig> {
  return requestJson<DiscasaConfig>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getAlbums(): Promise<AlbumRecord[]> {
  return requestJson<AlbumRecord[]>("/api/albums");
}

export async function createAlbum(input: CreateAlbumInput): Promise<{ id: string }> {
  return requestJson<{ id: string }>("/api/albums", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function renameAlbum(albumId: string, input: RenameAlbumInput): Promise<{ id: string; name: string }> {
  return requestJson<{ id: string; name: string }>(`/api/albums/${encodeURIComponent(albumId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function reorderAlbums(orderedIds: string[]): Promise<{ albums: AlbumRecord[] }> {
  return requestJson<{ albums: AlbumRecord[] }>("/api/albums/reorder", {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });
}

export async function deleteAlbum(albumId: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>(`/api/albums/${encodeURIComponent(albumId)}`, {
    method: "DELETE",
  });
}

export async function getLibraryItems(): Promise<LibraryItem[]> {
  return requestJson<LibraryItem[]>("/api/library");
}

export async function uploadFiles(files: File[], albumId?: string): Promise<UploadResponse> {
  const body = new FormData();

  if (albumId) {
    body.append("albumId", albumId);
  }

  for (const file of files) {
    body.append("files", file);
  }

  return requestJson<UploadResponse>("/api/upload", {
    method: "POST",
    body,
  });
}

export async function toggleFavorite(itemId: string): Promise<{ item: LibraryItem }> {
  return requestJson<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}/favorite`, {
    method: "PATCH",
  });
}

export async function moveToTrash(itemId: string): Promise<{ item: LibraryItem }> {
  return requestJson<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}/trash`, {
    method: "PATCH",
  });
}

export async function restoreFromTrash(itemId: string): Promise<{ item: LibraryItem }> {
  return requestJson<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}/restore`, {
    method: "PATCH",
  });
}

export async function saveLibraryItemMediaEdit(
  itemId: string,
  input: SaveLibraryItemMediaEditInput,
): Promise<{ item: LibraryItem }> {
  return requestJson<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}/media-edit`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function restoreLibraryItemOriginal(itemId: string): Promise<{ item: LibraryItem }> {
  return requestJson<{ item: LibraryItem }>(`/api/library/${encodeURIComponent(itemId)}/media-edit`, {
    method: "DELETE",
  });
}

export async function deleteLibraryItem(itemId: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>(`/api/library/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export async function openDiscordLogin(): Promise<void> {
  await openExternalUrl(`${API_BASE}/auth/discord/login`);
}

export async function logoutDiscord(): Promise<{ loggedOut: true }> {
  return requestJson<{ loggedOut: true }>("/auth/discord/logout", {
    method: "POST",
  });
}

export function openDiscordBotInstall(guildId: string): void {
  const params = new URLSearchParams();

  if (guildId) {
    params.set("guildId", guildId);
  }

  const suffix = params.toString();
  const url = `${API_BASE}/auth/discord/install${suffix ? `?${suffix}` : ""}`;

  void openExternalUrl(url);
}
