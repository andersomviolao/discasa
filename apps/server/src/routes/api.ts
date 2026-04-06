import { Router } from "express";
import multer from "multer";
import { env } from "../lib/env";
import {
  addAlbum,
  addMockFiles,
  addUploadedFiles,
  createIndexSnapshot,
  deleteAlbum,
  deleteLibraryItem,
  getActiveStorageContext,
  getAlbums,
  getLibraryItem,
  getLibraryItems,
  replaceDatabaseFromIndexSnapshot,
  renameAlbum,
  reorderAlbums,
  restoreLibraryItem,
  setActiveStorageContext,
  toggleFavoriteState,
  trashLibraryItem,
  updateLibraryItemStorage,
} from "../lib/store";
import {
  deleteStoredItemFromDiscord,
  initializeDiscasaInGuild,
  listEligibleGuilds,
  moveStoredItemToTrash,
  readLatestIndexSnapshot,
  restoreStoredItemFromTrash,
  syncIndexSnapshot,
  uploadFilesToDiscordDrive,
} from "../services/discordService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

async function syncRemoteIndexState(): Promise<void> {
  const context = getActiveStorageContext();
  if (!context || env.mockMode) {
    return;
  }

  await syncIndexSnapshot(context, createIndexSnapshot());
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

router.post("/discasa/initialize", async (request, response, next) => {
  try {
    const guildId = String(request.body.guildId ?? "");

    if (!guildId) {
      response.status(400).json({ error: "guildId is required" });
      return;
    }

    const result = await initializeDiscasaInGuild(guildId);
    setActiveStorageContext(result);

    const snapshot = await readLatestIndexSnapshot(result);

    if (snapshot) {
      replaceDatabaseFromIndexSnapshot(snapshot);
    } else {
      await syncIndexSnapshot(result, createIndexSnapshot());
    }

    response.json({
      guildId: result.guildId,
      categoryName: result.categoryName,
      channels: [result.driveChannelName, result.indexChannelName, result.trashChannelName],
    });
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
    await syncRemoteIndexState();
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

    await syncRemoteIndexState();
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
    await syncRemoteIndexState();
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

    await syncRemoteIndexState();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

router.get("/library", (_request, response) => {
  response.json(getLibraryItems());
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
      response.status(201).json({ uploaded });
      return;
    }

    const activeStorage = getActiveStorageContext();

    if (!activeStorage) {
      response.status(400).json({ error: "Apply a Discord server in Settings before uploading files." });
      return;
    }

    const uploadedRecords = await uploadFilesToDiscordDrive(files, activeStorage);
    const uploaded = addUploadedFiles(uploadedRecords, albumId);
    await syncRemoteIndexState();
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

    await syncRemoteIndexState();
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export { router as apiRouter };
