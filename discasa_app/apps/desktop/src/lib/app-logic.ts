import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AlbumRecord,
  AppSession,
  CreateAlbumInput,
  DiscasaConfig,
  DiscasaExternalImportResult,
  DiscasaInitializationResponse,
  GuildSummary,
  LibraryItem,
  LocalStorageStatus,
  RenameAlbumInput,
  SaveLibraryItemMediaEditInput,
  UploadResponse,
} from "@discasa/shared";
const API_BASE = "http://localhost:3001";
const REMOTE_CONFIG_SAVE_DEBOUNCE_MS = 700;
let pendingViewerMouseWheelBehavior: MouseWheelBehavior | null = null;
let viewerMouseWheelBehaviorSaveTimer: number | null = null;

export type DiscasaSetupStatus = {
  botPresent: boolean;
  categoryPresent: boolean;
  channelsPresent: boolean;
  configMarkerPresent: boolean;
  isApplied: boolean;
  missingChannels: string[];
};

export type DiscasaBotStatus = {
  processAvailable: boolean;
  ok: boolean;
  mockMode: boolean;
  botConfigured: boolean;
  botLoggedIn: boolean;
  botUserId: string | null;
  error?: string;
};

export type AppDiagnostics = {
  ok: boolean;
  checkedAt: string;
  service: "discasa_app";
  app: {
    serverPort: number;
    frontendUrl: string;
    mockMode: boolean;
    authenticated: boolean;
    activeGuild: {
      id: string;
      name: string;
    } | null;
  };
  bot: {
    status: DiscasaBotStatus;
    diagnostics: {
      ok: boolean;
      checkedAt: string;
      service: "discasa_bot";
      runtime: {
        mockMode: boolean;
        botConfigured: boolean;
        botLoggedIn: boolean;
        botUserId: string | null;
      };
      queue: {
        pendingOrRunningWrites: number;
        completedOrStartedWrites: number;
        lastError: string | null;
        lastFinishedAt: string | null;
      };
      storage: {
        uploadLimitBytes: number;
        uploadLimitLabel: string;
      };
    } | null;
  };
  library: {
    itemCount: number;
    activeItemCount: number;
    trashedItemCount: number;
    albumCount: number;
  };
  storage: {
    remoteApplied: boolean;
    local: LocalStorageStatus;
  };
  config: {
    language: DiscasaConfig["language"];
    localMirrorEnabled: boolean;
    galleryDisplayMode: GalleryDisplayMode;
    thumbnailZoomPercent: number;
  };
};

export type HsvColor = {
  hue: number;
  saturation: number;
  value: number;
};

export type SettingsSection = "discord" | "appearance" | "storage" | "language" | "diagnostics" | "window";
export type WindowState = "default" | "maximized";

export type FixedLibraryViewId = "all-files" | "favorites" | "trash";
export type FixedCollectionViewId = "pictures" | "videos" | "others";

export type SidebarView =
  | { kind: "library"; id: FixedLibraryViewId }
  | { kind: "collection"; id: FixedCollectionViewId }
  | { kind: "album"; id: string };

export type AlbumContextMenuState = {
  x: number;
  y: number;
  albumId: string;
  albumName: string;
} | null;

export type GalleryDisplayMode = "free" | "square";
export type MouseWheelBehavior = "zoom" | "navigate";

export type ViewerDraftState = {
  zoomLevel: number;
  rotationDegrees: number;
  hasCrop: boolean;
  canUndo: boolean;
};

export type ViewerState = {
  itemId: string;
  index: number;
  total: number;
} | null;

export const DEFAULT_PROFILE = {
  nickname: "discord-nick",
  server: "discord-server",
} as const;

export const DEFAULT_MEDIA_EDIT_INPUT: SaveLibraryItemMediaEditInput = {
  rotationDegrees: 0,
  hasCrop: false,
};

export const VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY = "discasa.viewer.mouseWheelBehavior";
export const VIEWER_WHEEL_BEHAVIOR_EVENT = "discasa:viewer-wheel-behavior";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function canUseWindow(): boolean {
  return typeof window !== "undefined";
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

function normalizeRotationDegrees(value: number): number {
  const rounded = Math.round(value / 90) * 90;
  return ((rounded % 360) + 360) % 360;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("");

    return `#${expanded.toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

export function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(hex) ?? "#E9881D";
  const value = normalized.slice(1);

  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function hexToRgbChannels(hex: string, fallbackHex = "#E9881D"): string {
  const normalized = normalizeHexColor(hex) ?? fallbackHex;
  const { red, green, blue } = hexToRgb(normalized);
  return `${red}, ${green}, ${blue}`;
}

export function tintHexColor(hex: string, amount: number, fallbackHex = "#E9881D"): string {
  const normalized = normalizeHexColor(hex) ?? fallbackHex;
  const { red, green, blue } = hexToRgb(normalized);
  const tinted = [red, green, blue].map((channel) => {
    const mixed = Math.round(channel + (255 - channel) * amount);
    return clampNumber(mixed, 0, 255).toString(16).padStart(2, "0");
  });

  return `#${tinted.join("").toUpperCase()}`;
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clampNumber(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;

  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedRed) {
      hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    } else if (max === normalizedGreen) {
      hue = (normalizedBlue - normalizedRed) / delta + 2;
    } else {
      hue = (normalizedRed - normalizedGreen) / delta + 4;
    }
  }

  hue = Math.round(hue * 60);
  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hsvToRgb(hue: number, saturation: number, value: number): { red: number; green: number; blue: number } {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime >= 1 && huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime >= 2 && huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime >= 3 && huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime >= 4 && huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = value - chroma;

  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255),
  };
}

export function hexToHsv(hex: string): HsvColor {
  const { red, green, blue } = hexToRgb(hex);
  return rgbToHsv(red, green, blue);
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
  const { red, green, blue } = hsvToRgb(hue, saturation, value);
  return rgbToHex(red, green, blue);
}

export function isImage(item: LibraryItem): boolean {
  return item.mimeType.startsWith("image/");
}

export function isVideo(item: LibraryItem): boolean {
  return item.mimeType.startsWith("video/");
}

export function isAudio(item: LibraryItem): boolean {
  return item.mimeType.startsWith("audio/");
}

export function isOther(item: LibraryItem): boolean {
  return !isImage(item) && !isVideo(item);
}

export function getLibraryItemContentUrl(item: LibraryItem): string {
  return item.contentUrl ?? item.attachmentUrl;
}

function sanitizeDownloadName(name: string): string {
  const fallbackName = "discasa-file";
  const sanitized = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return sanitized || fallbackName;
}

export async function downloadLibraryItems(items: LibraryItem[]): Promise<void> {
  for (const item of items) {
    const response = await fetch(getLibraryItemContentUrl(item), { credentials: "include" });

    if (!response.ok) {
      throw new Error(`Could not download ${item.name}.`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = sanitizeDownloadName(item.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    URL.revokeObjectURL(objectUrl);
  }
}

export function getLibraryItemThumbnailUrl(item: LibraryItem): string {
  return item.thumbnailUrl ?? getLibraryItemContentUrl(item);
}

export function getVisibleItems(items: LibraryItem[], selectedView: SidebarView): LibraryItem[] {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") {
        return items.filter((item) => !item.isTrashed);
      }

      if (selectedView.id === "favorites") {
        return items.filter((item) => item.isFavorite && !item.isTrashed);
      }

      return items.filter((item) => item.isTrashed);
    case "collection":
      if (selectedView.id === "pictures") {
        return items.filter((item) => !item.isTrashed && isImage(item));
      }

      if (selectedView.id === "videos") {
        return items.filter((item) => !item.isTrashed && isVideo(item));
      }

      return items.filter((item) => !item.isTrashed && isOther(item));
    case "album":
      return items.filter((item) => !item.isTrashed && item.albumIds.includes(selectedView.id));
    default:
      return [];
  }
}

export function getCurrentTitle(selectedView: SidebarView, albums: AlbumRecord[]): string {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") return "All Files";
      if (selectedView.id === "favorites") return "Favorites";
      return "Trash";
    case "collection":
      if (selectedView.id === "pictures") return "Pictures";
      if (selectedView.id === "videos") return "Videos";
      return "Others";
    case "album":
      return albums.find((album) => album.id === selectedView.id)?.name ?? "Album";
    default:
      return "Library";
  }
}

export function getCurrentDescription(selectedView: SidebarView): string {
  switch (selectedView.kind) {
    case "library":
      if (selectedView.id === "all-files") return "All active files in the library.";
      if (selectedView.id === "favorites") return "Files marked as favorites.";
      return "Items moved to the trash.";
    case "collection":
      if (selectedView.id === "pictures") return "Image files only.";
      if (selectedView.id === "videos") return "Video files only.";
      return "Files that are neither images nor videos.";
    case "album":
      return "Files linked to this album.";
    default:
      return "";
  }
}

export function normalizeSavedMediaEditInput(input: SaveLibraryItemMediaEditInput): SaveLibraryItemMediaEditInput {
  return {
    rotationDegrees: normalizeRotationDegrees(input.rotationDegrees),
    hasCrop: Boolean(input.hasCrop),
  };
}

export function getSavedMediaEditInputFromItem(item: LibraryItem | null): SaveLibraryItemMediaEditInput {
  if (!item?.savedMediaEdit) {
    return DEFAULT_MEDIA_EDIT_INPUT;
  }

  return normalizeSavedMediaEditInput({
    rotationDegrees: item.savedMediaEdit.rotationDegrees,
    hasCrop: item.savedMediaEdit.hasCrop,
  });
}

export function createViewerDraftStateFromItem(item: LibraryItem | null): ViewerDraftState {
  const savedEdit = getSavedMediaEditInputFromItem(item);

  return {
    zoomLevel: 1,
    rotationDegrees: savedEdit.rotationDegrees,
    hasCrop: savedEdit.hasCrop,
    canUndo: savedEdit.rotationDegrees !== 0 || savedEdit.hasCrop,
  };
}

export function toMediaEditSaveInput(draftState: ViewerDraftState): SaveLibraryItemMediaEditInput {
  return normalizeSavedMediaEditInput({
    rotationDegrees: draftState.rotationDegrees,
    hasCrop: draftState.hasCrop,
  });
}

export function hasPendingViewerSave(item: LibraryItem | null, draftState: ViewerDraftState): boolean {
  const saved = getSavedMediaEditInputFromItem(item);
  const current = toMediaEditSaveInput(draftState);

  return saved.rotationDegrees !== current.rotationDegrees || saved.hasCrop !== current.hasCrop;
}

export function getPersistedMediaPresentation(item: LibraryItem): SaveLibraryItemMediaEditInput {
  return getSavedMediaEditInputFromItem(item);
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  return raw === "1";
}

export function readStoredString(key: string, fallback: string): string {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  return raw && raw.trim().length > 0 ? raw : fallback;
}

export function readStoredNumber(key: string, fallback: number): number {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMouseWheelBehavior(raw: unknown): MouseWheelBehavior {
  return raw === "navigate" ? "navigate" : "zoom";
}

function applyMouseWheelBehaviorLocally(nextValue: MouseWheelBehavior): void {
  if (!canUseWindow()) {
    return;
  }

  window.localStorage.setItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY, nextValue);
  window.dispatchEvent(new CustomEvent<MouseWheelBehavior>(VIEWER_WHEEL_BEHAVIOR_EVENT, { detail: nextValue }));
}

export function readStoredMouseWheelBehavior(): MouseWheelBehavior {
  if (!canUseWindow()) {
    return "zoom";
  }

  const raw = window.localStorage.getItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY);
  return normalizeMouseWheelBehavior(raw);
}

export function commitMouseWheelBehavior(
  nextValue: MouseWheelBehavior,
  options?: { persistRemote?: boolean },
): void {
  const normalized = normalizeMouseWheelBehavior(nextValue);

  if (!canUseWindow()) {
    return;
  }

  applyMouseWheelBehaviorLocally(normalized);

  if (options?.persistRemote === false) {
    return;
  }

  pendingViewerMouseWheelBehavior = normalized;

  if (viewerMouseWheelBehaviorSaveTimer !== null) {
    window.clearTimeout(viewerMouseWheelBehaviorSaveTimer);
  }

  viewerMouseWheelBehaviorSaveTimer = window.setTimeout(() => {
    const valueToPersist = pendingViewerMouseWheelBehavior;
    pendingViewerMouseWheelBehavior = null;
    viewerMouseWheelBehaviorSaveTimer = null;

    if (!valueToPersist) {
      return;
    }

    void requestJson<DiscasaConfig>("/api/config", {
      method: "PATCH",
      body: JSON.stringify({
        viewerMouseWheelBehavior: valueToPersist,
      }),
    }).catch(() => {
      // Keep the UI responsive even if the remote config save fails.
    });
  }, REMOTE_CONFIG_SAVE_DEBOUNCE_MS);
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

export async function getDiscasaBotStatus(): Promise<DiscasaBotStatus> {
  return requestJson<DiscasaBotStatus>("/api/bot/status");
}

export async function getAppDiagnostics(): Promise<AppDiagnostics> {
  return requestJson<AppDiagnostics>("/api/diagnostics");
}

export async function initializeDiscasa(guildId: string): Promise<DiscasaInitializationResponse> {
  return requestJson<DiscasaInitializationResponse>("/api/discasa/initialize", {
    method: "POST",
    body: JSON.stringify({ guildId }),
  });
}

export async function getAppConfig(): Promise<DiscasaConfig> {
  const config = await requestJson<DiscasaConfig>("/api/config");
  commitMouseWheelBehavior(config.viewerMouseWheelBehavior, { persistRemote: false });
  return config;
}

export async function updateAppConfig(input: Partial<DiscasaConfig>): Promise<DiscasaConfig> {
  return requestJson<DiscasaConfig>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getLocalStorageStatus(): Promise<LocalStorageStatus> {
  return requestJson<LocalStorageStatus>("/api/local-storage");
}

export async function chooseLocalMirrorFolder(): Promise<string | null> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: "Choose local mirror folder",
    });

    return typeof selectedPath === "string" ? selectedPath : null;
  }

  const fallbackPath = window.prompt("Folder path for local mirrored files");
  return fallbackPath && fallbackPath.trim().length > 0 ? fallbackPath.trim() : null;
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

export async function addLibraryItemsToAlbum(
  albumId: string,
  itemIds: string[],
): Promise<{ items: LibraryItem[]; albums: AlbumRecord[] }> {
  return requestJson<{ items: LibraryItem[]; albums: AlbumRecord[] }>(
    `/api/albums/${encodeURIComponent(albumId)}/items`,
    {
      method: "PUT",
      body: JSON.stringify({ itemIds }),
    },
  );
}

export async function moveLibraryItemsToAlbum(
  albumId: string,
  itemIds: string[],
): Promise<{ items: LibraryItem[]; albums: AlbumRecord[] }> {
  return requestJson<{ items: LibraryItem[]; albums: AlbumRecord[] }>(
    `/api/albums/${encodeURIComponent(albumId)}/items/move`,
    {
      method: "PATCH",
      body: JSON.stringify({ itemIds }),
    },
  );
}

export async function removeLibraryItemsFromAlbum(
  albumId: string,
  itemIds: string[],
): Promise<{ items: LibraryItem[]; albums: AlbumRecord[] }> {
  return requestJson<{ items: LibraryItem[]; albums: AlbumRecord[] }>(
    `/api/albums/${encodeURIComponent(albumId)}/items/remove`,
    {
      method: "PATCH",
      body: JSON.stringify({ itemIds }),
    },
  );
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

export async function uploadLocalFilePaths(
  filePaths: string[],
  albumId?: string,
  clientUploadIds?: string[],
): Promise<UploadResponse> {
  return requestJson<UploadResponse>("/api/upload-local", {
    method: "POST",
    body: JSON.stringify({ filePaths, albumId, clientUploadIds }),
  });
}

export async function importExternalLibraryFiles(): Promise<DiscasaExternalImportResult> {
  return requestJson<DiscasaExternalImportResult>("/api/library/import-external-files", {
    method: "POST",
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
