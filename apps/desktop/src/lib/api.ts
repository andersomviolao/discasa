import type {
  AppSession,
  CollectionRecord,
  CreateCollectionInput,
  DiscasaInitializationResponse,
  GuildSummary,
  LibraryItem,
  UploadResponse,
} from "@discasa/shared";

const API_BASE = "http://localhost:3001";

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

export async function initializeDiscasa(guildId: string): Promise<DiscasaInitializationResponse> {
  return requestJson<DiscasaInitializationResponse>("/api/discasa/initialize", {
    method: "POST",
    body: JSON.stringify({ guildId }),
  });
}

export async function getCollections(): Promise<CollectionRecord[]> {
  return requestJson<CollectionRecord[]>("/api/collections");
}

export async function createCollection(input: CreateCollectionInput): Promise<{ id: string }> {
  return requestJson<{ id: string }>("/api/collections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reorderCollectionOrder(orderedIds: string[]): Promise<{ collections: CollectionRecord[] }> {
  return requestJson<{ collections: CollectionRecord[] }>("/api/collections/reorder", {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });
}

export async function deleteCollection(collectionId: string): Promise<{ deleted: true }> {
  return requestJson<{ deleted: true }>(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "DELETE",
  });
}

export async function getLibraryItems(collectionId?: string): Promise<LibraryItem[]> {
  const query = collectionId && collectionId !== "all" ? `?collectionId=${encodeURIComponent(collectionId)}` : "";
  return requestJson<LibraryItem[]>(`/api/library${query}`);
}

export async function uploadFiles(files: File[], collectionId: string): Promise<UploadResponse> {
  const body = new FormData();
  body.append("collectionId", collectionId);

  for (const file of files) {
    body.append("files", file);
  }

  return requestJson<UploadResponse>("/api/upload", {
    method: "POST",
    body,
  });
}

export function openDiscordLogin(): void {
  window.open(`${API_BASE}/auth/discord/login`, "_self");
}
