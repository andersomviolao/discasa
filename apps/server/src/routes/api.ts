import { Router } from "express";
import multer from "multer";
import {
  addAlbum,
  addMockFiles,
  deleteAlbum,
  deleteLibraryItem,
  getAlbums,
  getLibraryItems,
  renameAlbum,
  reorderAlbums,
  restoreLibraryItem,
  toggleFavoriteState,
  trashLibraryItem,
} from "../lib/store";
import { initializeDiscasaInGuild, listEligibleGuilds } from "../services/discordService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/session", (request, response) => {
  const authenticated = Boolean(request.session.authenticated);

  response.json({
    authenticated,
    user: authenticated
      ? request.session.user ?? {
          id: "mock_user",
          username: "Mock User",
          avatarUrl: null,
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
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/albums", (_request, response) => {
  response.json(getAlbums());
});

router.post("/albums", (request, response) => {
  const name = String(request.body.name ?? "").trim();

  if (!name) {
    response.status(400).json({ error: "Album name is required" });
    return;
  }

  const created = addAlbum(name);
  response.status(201).json({ id: created.id });
});

router.patch("/albums/:albumId", (request, response) => {
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

  response.json(updated);
});

router.put("/albums/reorder", (request, response) => {
  const orderedIds = Array.isArray(request.body.orderedIds)
    ? request.body.orderedIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];

  if (!orderedIds.length) {
    response.status(400).json({ error: "orderedIds is required" });
    return;
  }

  response.json({ albums: reorderAlbums(orderedIds) });
});

router.delete("/albums/:albumId", (request, response) => {
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

  response.json({ deleted: true });
});

router.get("/library", (_request, response) => {
  response.json(getLibraryItems());
});

router.post("/upload", upload.array("files"), (request, response) => {
  const files = request.files as Express.Multer.File[] | undefined;
  const albumId = typeof request.body.albumId === "string" && request.body.albumId.length > 0 ? request.body.albumId : undefined;

  if (!files?.length) {
    response.status(400).json({ error: "At least one file is required" });
    return;
  }

  const uploaded = addMockFiles(files, albumId);
  response.status(201).json({ uploaded });
});

router.patch("/library/:itemId/favorite", (request, response) => {
  const itemId = String(request.params.itemId ?? "");
  const item = toggleFavoriteState(itemId);

  if (!item) {
    response.status(404).json({ error: "Library item not found" });
    return;
  }

  response.json({ item });
});

router.patch("/library/:itemId/trash", (request, response) => {
  const itemId = String(request.params.itemId ?? "");
  const item = trashLibraryItem(itemId);

  if (!item) {
    response.status(404).json({ error: "Library item not found" });
    return;
  }

  response.json({ item });
});

router.patch("/library/:itemId/restore", (request, response) => {
  const itemId = String(request.params.itemId ?? "");
  const item = restoreLibraryItem(itemId);

  if (!item) {
    response.status(404).json({ error: "Library item not found" });
    return;
  }

  response.json({ item });
});

router.delete("/library/:itemId", (request, response) => {
  const itemId = String(request.params.itemId ?? "");
  const deleted = deleteLibraryItem(itemId);

  if (!deleted) {
    response.status(404).json({ error: "Library item not found" });
    return;
  }

  response.json({ deleted: true });
});

export { router as apiRouter };
