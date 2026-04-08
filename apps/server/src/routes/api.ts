import { Router } from "express";
import multer from "multer";
import type { LibraryItem, SaveLibraryItemMediaEditInput } from "@discasa/shared";
import { env } from "../lib/env";
import { getDiscordUploadLimitForGuild, getUploadTooLargeMessage } from "../lib/discordUploadLimit";
import {
  addAlbum,
  addMockFiles,
  addUploadedFiles,
  createConfigSnapshot,
  createFolderSnapshot,
  createIndexSnapshot,
  deleteAlbum,
  deleteLibraryItem,
  getActiveStorageContext,
  getAlbums,
  getDiscasaConfig,
  getLibraryItem,
  getLibraryItems,
  replaceConfigFromSnapshot,
  replaceDatabaseFromFolderSnapshot,
  replaceDatabaseFromIndexSnapshot,
  renameAlbum,
  reorderAlbums,
  resetDiscasaConfig,
  restoreLibraryItem,
  setActiveStorageContext,
  toggleFavoriteState,
  trashLibraryItem,
  updateDiscasaConfig,
  updateLibraryItemStorage,
} from "../lib/store";
import {
  attachMediaEditToLibraryItem,
  attachMediaEditsToLibraryItems,
  deleteLibraryItemMediaEdit,
  saveLibraryItemMediaEdit,
} from "../lib/mediaEditStore";
import {
  deleteStoredItemFromDiscord,
  hasCurrentConfigSnapshot,
  hasCurrentFolderSnapshot,
  hasCurrentIndexSnapshot,
  initializeDiscasaInGuild,
  inspectDiscasaSetup,
  listEligibleGuilds,
  moveStoredItemToTrash,
  readLatestConfigSnapshot,
  readLatestFolderSnapshot,
  readLatestIndexSnapshot,
  restoreStoredItemFromTrash,
  syncConfigSnapshot,
  syncFolderSnapshot,
  syncIndexSnapshot,
  uploadFilesToDiscordDrive,
} from "../services/discordService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function withMediaEdit(item: LibraryItem | null): LibraryItem | null {
  if (!item) {
    return null;
  }

  return attachMediaEditToLibraryItem(item);
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

router.get("/guilds", async (request, response, next) => {
  try {
    if (!request.session.authenticated) {
      response.status(401).json({ error: "Discord login required." });
      return;
    }

    const guilds = await listEligibleGuilds(request.session.discordAccessToken);
    response.json(guilds);
  } catch (error) {
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

    const [indexSnapshot, folderSnapshot, configSnapshot, hasCurrentIndex, hasCurrentFolder, hasCurrentConfig] = await Promise.all([
      readLatestIndexSnapshot(result),
      readLatestFolderSnapshot(result),
      readLatestConfigSnapshot(result),
      hasCurrentIndexSnapshot(result),
      hasCurrentFolderSnapshot(result),
      hasCurrentConfigSnapshot(result),
    ]);

    if (indexSnapshot) {
      replaceDatabaseFromIndexSnapshot(indexSnapshot);
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

    if (!hasCurrentIndex) {
      await syncRemoteIndexState();
    }

    if (!hasCurrentFolder) {
      await syncRemoteFolderState();
    }

    if (!hasCurrentConfig) {
      await syncRemoteConfigState();
    }

    response.json({
      guildId: result.guildId,
      categoryName: result.categoryName,
      channels: [
        result.driveChannelName,
        result.indexChannelName,
        result.folderChannelName,
        result.trashChannelName,
        result.configChannelName,
      ],
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
      resetDiscasaConfig();
      await syncRemoteConfigState();
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

router.get("/albums", (_request, response) => {
  response.json(getAlbums());
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
    const orderedIds = Array.isArray(request.body.orderedIds)
      ? request.body.orderedIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
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

router.get("/library", (_request, response) => {
  response.json(attachMediaEditsToLibraryItems(getLibraryItems()));
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
      await syncRemoteLibraryState();
      response.status(201).json({ uploaded: attachMediaEditsToLibraryItems(uploaded) });
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
    await syncRemoteLibraryState();
    response.status(201).json({ uploaded: attachMediaEditsToLibraryItems(uploaded) });
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
    response.json({ item: withMediaEdit(item) });
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
    response.json({ item: withMediaEdit(item) });
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
    response.json({ item: withMediaEdit(item) });
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

    const item = saveLibraryItemMediaEdit(originalItem, input);
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

    deleteLibraryItemMediaEdit(itemId);
    response.json({
      item: {
        ...originalItem,
        originalSource: null,
        savedMediaEdit: null,
      },
    });
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

    deleteLibraryItemMediaEdit(itemId);

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

export { router as apiRouter };
