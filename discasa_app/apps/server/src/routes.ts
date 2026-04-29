import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { DiscasaAttachmentRecoveryWarning, SaveLibraryItemMediaEditInput } from "@discasa/shared";
import { env } from "./config";
import {
  addAlbum,
  addLibraryItemsToAlbum,
  addMockFiles,
  addUploadedFiles,
  cacheUploadedFilesForLocalAccess,
  clearPersistedAuthSession,
  createConfigSnapshot,
  createFolderSnapshot,
  createIndexSnapshot,
  deleteAlbum,
  deleteLibraryItem,
  getActiveStorageContext,
  getAlbums,
  getDiscasaConfig,
  getLibraryItemContentSource,
  getLibraryItemThumbnailSource,
  getLibraryItem,
  getLibraryItems,
  getLocalStorageStatus,
  moveLibraryItemsToAlbum,
  renameAlbum,
  removeLibraryItemsFromAlbum,
  reorderAlbums,
  replaceConfigFromSnapshot,
  replaceDatabaseFromFolderSnapshot,
  replaceDatabaseFromIndexSnapshot,
  resetDiscasaConfig,
  restoreLibraryItem,
  restoreLibraryItemOriginal,
  saveLibraryItemMediaEdit,
  setActiveStorageContext,
  setPersistedAuthSession,
  toggleFavoriteState,
  trashLibraryItem,
  updateDiscasaConfig,
  updateLibraryItemStorage,
} from "./persistence";
import {
  deleteStoredItemFromDiscord,
  getDiscasaBotStatus,
  getDiscordUploadLimitForGuild,
  hasCurrentConfigSnapshot,
  hasCurrentFolderSnapshot,
  hasCurrentIndexSnapshot,
  initializeDiscasaInGuild,
  inspectDiscasaSetup,
  moveStoredItemToTrash,
  readLatestConfigSnapshot,
  readLatestFolderSnapshot,
  readLatestIndexSnapshot,
  refreshIndexSnapshotAttachmentUrls,
  restoreStoredItemFromTrash,
  syncConfigSnapshot,
  syncFolderSnapshot,
  syncIndexSnapshot,
  uploadFilesToDiscordDrive,
} from "./bot-client";
import {
  DiscordAuthorizationError,
  getUploadTooLargeMessage,
  listEligibleGuilds,
} from "./discord";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
let remoteLibraryHydrationKey: string | null = null;
let remoteLibraryHydrationPromise: Promise<void> | null = null;
const BOT_INVITE_PERMISSIONS =
  0x400n + // View Channel
  0x800n + // Send Messages
  0x8000n + // Attach Files
  0x10000n + // Read Message History
  0x10n + // Manage Channels
  0x10000000n; // Manage Roles

function getRemoteLibraryHydrationKey(context: NonNullable<ReturnType<typeof getActiveStorageContext>>): string {
  return [
    context.guildId,
    context.driveChannelId,
    context.indexChannelId,
    context.folderChannelId,
    context.trashChannelId,
    context.configChannelId,
  ].join(":");
}

async function syncRemoteIndexState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncIndexSnapshot(context, createIndexSnapshot());
}

async function syncRemoteFolderState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncFolderSnapshot(context, createFolderSnapshot());
}

async function syncRemoteConfigState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncConfigSnapshot(context, createConfigSnapshot());
}

async function syncRemoteLibraryState(): Promise<void> {
  await Promise.all([syncRemoteIndexState(), syncRemoteFolderState()]);
}

async function hydrateRemoteLibraryState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  const hydrationKey = getRemoteLibraryHydrationKey(context);
  if (remoteLibraryHydrationKey === hydrationKey) {
    return;
  }

  if (remoteLibraryHydrationPromise) {
    await remoteLibraryHydrationPromise;
    return;
  }

  remoteLibraryHydrationPromise = (async () => {
    const [remoteIndexSnapshot, folderSnapshot] = await Promise.all([
      readLatestIndexSnapshot(context),
      readLatestFolderSnapshot(context),
    ]);
    const indexSnapshot = remoteIndexSnapshot ?? createIndexSnapshot();

    const refreshedIndex = await refreshIndexSnapshotAttachmentUrls(context, indexSnapshot);
    replaceDatabaseFromIndexSnapshot(refreshedIndex.snapshot);

    if (refreshedIndex.didChange) {
      try {
        await syncRemoteIndexState();
      } catch (error) {
        console.warn("[Discasa recovery] Could not sync the refreshed index snapshot to Discord.", error);
      }
    }

    if (folderSnapshot) {
      replaceDatabaseFromFolderSnapshot(folderSnapshot);
    }

    remoteLibraryHydrationKey = hydrationKey;
  })()
    .catch((error) => {
      console.warn("[Discasa recovery] Could not hydrate the library from Discord snapshots.", error);
    })
    .finally(() => {
      remoteLibraryHydrationPromise = null;
    });

  await remoteLibraryHydrationPromise;
}

function normalizeMediaEditInput(raw: unknown): SaveLibraryItemMediaEditInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.rotationDegrees !== "number" ||
    !Number.isFinite(entry.rotationDegrees) ||
    typeof entry.hasCrop !== "boolean"
  ) {
    return null;
  }

  return {
    rotationDegrees: entry.rotationDegrees,
    hasCrop: entry.hasCrop,
  };
}

function expireRequestDiscordSession(request: Request): void {
  request.session.authenticated = false;
  request.session.discordAccessToken = undefined;
  request.session.discordRefreshToken = undefined;
  request.session.discordOauthState = undefined;
  request.session.user = undefined;
  clearPersistedAuthSession();
}

function sendLibraryFileSource(
  response: Response,
  source: { type: "file"; filePath: string; mimeType: string; fileName: string } | { type: "redirect"; url: string },
): void {
  if (source.type === "redirect") {
    response.setHeader("Cache-Control", "private, max-age=86400");
    response.redirect(source.url);
    return;
  }

  response.type(source.mimeType);
  response.sendFile(source.filePath, {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${encodeURIComponent(source.fileName)}"`,
    },
  });
}

async function refreshDiscordToken(refreshToken: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new DiscordAuthorizationError("Discord login expired. Please login again.", response.status);
  }

  return (await response.json()) as DiscordTokenResponse;
}

async function refreshRequestDiscordSession(request: Request): Promise<boolean> {
  const refreshToken = request.session.discordRefreshToken;
  const user = request.session.user;

  if (!refreshToken || !user) {
    return false;
  }

  try {
    const token = await refreshDiscordToken(refreshToken);
    applyAuthenticatedSession(
      request,
      {
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? refreshToken,
      },
      user,
    );
    return true;
  } catch (error) {
    console.warn("[Discord OAuth] Could not refresh the stored Discord session.", error);
    expireRequestDiscordSession(request);
    return false;
  }
}

async function listEligibleGuildsForRequest(request: Request) {
  try {
    return await listEligibleGuilds(request.session.discordAccessToken);
  } catch (error) {
    if (!(error instanceof DiscordAuthorizationError)) {
      throw error;
    }

    const didRefresh = await refreshRequestDiscordSession(request);
    if (!didRefresh) {
      throw error;
    }

    return listEligibleGuilds(request.session.discordAccessToken);
  }
}

router.get("/session", (request, response) => {
  const authenticated = Boolean(request.session.authenticated);
  const activeStorage = getActiveStorageContext();

  response.json({
    authenticated,
    user: authenticated
      ? request.session.user ?? {
          id: "mock_user",
          username: "Mock User",
          avatarUrl: null,
        }
      : null,
    activeGuild: activeStorage
      ? {
          id: activeStorage.guildId,
          name: activeStorage.guildName,
        }
      : null,
  });
});

router.get("/bot/status", async (_request, response, next) => {
  try {
    response.json(await getDiscasaBotStatus());
  } catch (error) {
    next(error);
  }
});

router.get("/guilds", async (request, response, next) => {
  try {
    if (!request.session.authenticated) {
      response.status(401).json({ error: "Discord login required." });
      return;
    }

    const guilds = await listEligibleGuildsForRequest(request);
    response.json(guilds);
  } catch (error) {
    if (error instanceof DiscordAuthorizationError) {
      expireRequestDiscordSession(request);
      response.status(401).json({ error: "Discord login expired. Please login again." });
      return;
    }

    next(error);
  }
});

router.get("/discasa/status", async (request, response, next) => {
  try {
    if (!request.session.authenticated) {
      response.status(401).json({ error: "Discord login required." });
      return;
    }

    const guildId = String(request.query.guildId ?? "");

    if (!guildId) {
      response.status(400).json({ error: "guildId is required" });
      return;
    }

    const status = await inspectDiscasaSetup(guildId);
    response.json(status);
  } catch (error) {
    next(error);
  }
});

router.post("/discasa/initialize", async (request, response, next) => {
  try {
    const guildId = String(request.body.guildId ?? "");

    if (!guildId) {
      response.status(400).json({ error: "guildId is required" });
      return;
    }

    const result = await initializeDiscasaInGuild(guildId, request.session.user?.id);
    setActiveStorageContext(result);
    remoteLibraryHydrationKey = null;

    const [remoteIndexSnapshot, folderSnapshot, configSnapshot, hasCurrentIndex, hasCurrentFolder, hasCurrentConfig] = await Promise.all([
      readLatestIndexSnapshot(result),
      readLatestFolderSnapshot(result),
      readLatestConfigSnapshot(result),
      hasCurrentIndexSnapshot(result),
      hasCurrentFolderSnapshot(result),
      hasCurrentConfigSnapshot(result),
    ]);

    let unresolvedItems: DiscasaAttachmentRecoveryWarning[] = [];
    let relinkedItemCount = 0;
    let indexDidChange = false;

    if (remoteIndexSnapshot) {
      const refreshedIndex = await refreshIndexSnapshotAttachmentUrls(result, remoteIndexSnapshot);
      unresolvedItems = refreshedIndex.unresolvedItems;
      relinkedItemCount = refreshedIndex.relinkedItemCount;
      indexDidChange = refreshedIndex.didChange;
      replaceDatabaseFromIndexSnapshot(refreshedIndex.snapshot);
    } else {
      replaceDatabaseFromIndexSnapshot({
        version: 2,
        updatedAt: new Date().toISOString(),
        items: [],
      });
    }

    if (folderSnapshot) {
      replaceDatabaseFromFolderSnapshot(folderSnapshot);
    } else {
      replaceDatabaseFromFolderSnapshot({
        version: 1,
        updatedAt: new Date().toISOString(),
        folders: [],
        memberships: [],
      });
    }

    if (configSnapshot) {
      replaceConfigFromSnapshot(configSnapshot);
    } else {
      resetDiscasaConfig();
    }

    if (!hasCurrentIndex || indexDidChange) {
      await syncRemoteIndexState();
    }

    if (!hasCurrentFolder) {
      await syncRemoteFolderState();
    }

    if (!hasCurrentConfig) {
      await syncRemoteConfigState();
    }

    remoteLibraryHydrationKey = getRemoteLibraryHydrationKey(result);

    response.json({
      guildId: result.guildId,
      categoryName: result.categoryName,
      channels: Array.from(
        new Set([
          result.driveChannelName,
          result.indexChannelName,
          result.folderChannelName,
          result.trashChannelName,
          result.configChannelName,
        ]),
      ),
      recovery: {
        relinkedItemCount,
        unresolvedItems,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/config", async (_request, response, next) => {
  try {
    const activeStorage = getActiveStorageContext();

    if (!activeStorage) {
      response.json(resetDiscasaConfig());
      return;
    }

    if (env.mockMode) {
      response.json(getDiscasaConfig());
      return;
    }

    const snapshot = await readLatestConfigSnapshot(activeStorage);

    if (snapshot) {
      replaceConfigFromSnapshot(snapshot);
    } else {
      try {
        await syncRemoteConfigState();
      } catch (error) {
        console.warn("[Discasa config] Could not sync the local config snapshot to Discord.", error);
      }
    }

    response.json(getDiscasaConfig());
  } catch (error) {
    next(error);
  }
});

router.patch("/config", async (request, response, next) => {
  try {
    const nextConfig = updateDiscasaConfig(request.body ?? {});
    await syncRemoteConfigState();
    response.json(nextConfig);
  } catch (error) {
    next(error);
  }
});

router.get("/local-storage", (_request, response) => {
  response.json(getLocalStorageStatus());
});

router.get("/albums", async (_request, response, next) => {
  try {
    await hydrateRemoteLibraryState();
    response.json(getAlbums());
  } catch (error) {
    next(error);
  }
});

router.post("/albums", async (request, response, next) => {
  try {
    const name = String(request.body.name ?? "").trim();

    if (!name) {
      response.status(400).json({ error: "Album name is required" });
      return;
    }

    const created = addAlbum(name);
    await syncRemoteFolderState();
    response.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const name = String(request.body.name ?? "").trim();

    if (!albumId || !name) {
      response.status(400).json({ error: "albumId and name are required" });
      return;
    }

    const updated = renameAlbum(albumId, name);

    if (!updated) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    await syncRemoteFolderState();
    response.json(updated);
  } catch (error) {
    next(error);
  }
});

router.put("/albums/reorder", async (request, response, next) => {
  try {
    const rawBody = request.body as { orderedIds?: unknown };
    const orderedIds = Array.isArray(rawBody.orderedIds)
      ? rawBody.orderedIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!orderedIds.length) {
      response.status(400).json({ error: "orderedIds is required" });
      return;
    }

    const albums = reorderAlbums(orderedIds);
    await syncRemoteFolderState();
    response.json({ albums });
  } catch (error) {
    next(error);
  }
});

router.delete("/albums/:albumId", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");

    if (!albumId) {
      response.status(400).json({ error: "albumId is required" });
      return;
    }

    const deleted = deleteAlbum(albumId);

    if (!deleted) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    await syncRemoteFolderState();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

router.put("/albums/:albumId/items", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = addLibraryItemsToAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    await syncRemoteFolderState();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId/items/move", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = moveLibraryItemsToAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    await syncRemoteFolderState();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.patch("/albums/:albumId/items/remove", async (request, response, next) => {
  try {
    const albumId = String(request.params.albumId ?? "");
    const rawBody = request.body as { itemIds?: unknown };
    const itemIds = Array.isArray(rawBody.itemIds)
      ? rawBody.itemIds.filter((entry: unknown): entry is string => typeof entry === "string" && entry.length > 0)
      : [];

    if (!albumId || !itemIds.length) {
      response.status(400).json({ error: "albumId and itemIds are required" });
      return;
    }

    const items = removeLibraryItemsFromAlbum(albumId, itemIds);

    if (!items) {
      response.status(404).json({ error: "Album not found" });
      return;
    }

    await syncRemoteFolderState();
    response.json({ items, albums: getAlbums() });
  } catch (error) {
    next(error);
  }
});

router.get("/library", async (_request, response, next) => {
  try {
    await hydrateRemoteLibraryState();
    response.json(getLibraryItems());
  } catch (error) {
    next(error);
  }
});

router.get("/library/:itemId/content", (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const source = getLibraryItemContentSource(itemId);

    if (!source) {
      response.status(404).json({ error: "Library item content is not available." });
      return;
    }

    sendLibraryFileSource(response, source);
  } catch (error) {
    next(error);
  }
});

router.get("/library/:itemId/thumbnail", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const source = await getLibraryItemThumbnailSource(itemId);

    if (!source) {
      response.status(404).json({ error: "Library item thumbnail is not available." });
      return;
    }

    sendLibraryFileSource(response, source);
  } catch (error) {
    next(error);
  }
});

router.post("/upload", upload.array("files"), async (request, response, next) => {
  try {
    const files = request.files as Express.Multer.File[] | undefined;
    const albumId = typeof request.body.albumId === "string" && request.body.albumId.length > 0 ? request.body.albumId : undefined;

    if (!files?.length) {
      response.status(400).json({ error: "At least one file is required" });
      return;
    }

    if (env.mockMode) {
      const uploaded = addMockFiles(files, albumId);
      cacheUploadedFilesForLocalAccess(uploaded, files);
      await syncRemoteLibraryState();
      response.status(201).json({ uploaded });
      return;
    }

    const activeStorage = getActiveStorageContext();

    if (!activeStorage) {
      response.status(400).json({ error: "Apply a Discord server in Settings before uploading files." });
      return;
    }

    const uploadLimitBytes = await getDiscordUploadLimitForGuild(activeStorage.guildId);
    const oversizedFiles = files.filter((file) => file.size > uploadLimitBytes);

    if (oversizedFiles.length > 0) {
      response.status(413).json({
        error: getUploadTooLargeMessage(oversizedFiles, uploadLimitBytes),
      });
      return;
    }

    const uploadedRecords = await uploadFilesToDiscordDrive(files, activeStorage);
    const uploaded = addUploadedFiles(uploadedRecords, albumId);
    cacheUploadedFilesForLocalAccess(uploaded, files);
    await syncRemoteLibraryState();
    response.status(201).json({ uploaded });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/favorite", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const item = toggleFavoriteState(itemId);

    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteIndexState();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/trash", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode) {
      const activeStorage = getActiveStorageContext();
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before using the trash." });
        return;
      }

      const movedRecord = await moveStoredItemToTrash(activeStorage, originalItem);
      updateLibraryItemStorage(itemId, {
        guildId: movedRecord.guildId,
        attachmentUrl: movedRecord.attachmentUrl,
        storageChannelId: movedRecord.storageChannelId,
        storageMessageId: movedRecord.storageMessageId,
      });
    }

    const item = trashLibraryItem(itemId);

    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteIndexState();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/restore", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode) {
      const activeStorage = getActiveStorageContext();
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before restoring files." });
        return;
      }

      const movedRecord = await restoreStoredItemFromTrash(activeStorage, originalItem);
      updateLibraryItemStorage(itemId, {
        guildId: movedRecord.guildId,
        attachmentUrl: movedRecord.attachmentUrl,
        storageChannelId: movedRecord.storageChannelId,
        storageMessageId: movedRecord.storageMessageId,
      });
    }

    const item = restoreLibraryItem(itemId);

    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteIndexState();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.patch("/library/:itemId/media-edit", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const input = normalizeMediaEditInput(request.body);

    if (!itemId || !input) {
      response.status(400).json({ error: "rotationDegrees and hasCrop are required" });
      return;
    }

    const originalItem = getLibraryItem(itemId);
    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!originalItem.mimeType.startsWith("image/")) {
      response.status(400).json({ error: "Only image items currently support saved edits." });
      return;
    }

    const item = saveLibraryItemMediaEdit(itemId, input);
    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteIndexState();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/library/:itemId/media-edit", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!itemId) {
      response.status(400).json({ error: "itemId is required" });
      return;
    }

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!originalItem.mimeType.startsWith("image/")) {
      response.status(400).json({ error: "Only image items currently support restoring the original." });
      return;
    }

    const item = restoreLibraryItemOriginal(itemId);
    if (!item) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteIndexState();
    response.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/library/:itemId", async (request, response, next) => {
  try {
    const itemId = String(request.params.itemId ?? "");
    const originalItem = getLibraryItem(itemId);

    if (!originalItem) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    if (!env.mockMode) {
      const activeStorage = getActiveStorageContext();
      if (!activeStorage) {
        response.status(400).json({ error: "Apply a Discord server in Settings before deleting files." });
        return;
      }

      await deleteStoredItemFromDiscord(activeStorage, originalItem);
    }

    const deleted = deleteLibraryItem(itemId);

    if (!deleted) {
      response.status(404).json({ error: "Library item not found" });
      return;
    }

    await syncRemoteLibraryState();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

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

const authRouter = Router();
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
  return BOT_INVITE_PERMISSIONS.toString();
}

authRouter.get("/discord/login", (request, response) => {
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

authRouter.get("/discord/install", (request, response) => {
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

authRouter.post("/discord/logout", (request, response) => {
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

authRouter.get("/discord/callback", async (request, response) => {
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

export { router as apiRouter, authRouter };
