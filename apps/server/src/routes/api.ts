import { Router } from "express";
import multer from "multer";
import { addCollection, addMockFiles, deleteCollection, getCollections, getLibraryItems, reorderCollections } from "../lib/store";
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
        }
      : null,
  });
});

router.get("/guilds", async (_request, response, next) => {
  try {
    const guilds = await listEligibleGuilds();
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

router.get("/collections", (_request, response) => {
  response.json(getCollections());
});

router.post("/collections", (request, response) => {
  const name = String(request.body.name ?? "").trim();

  if (!name) {
    response.status(400).json({ error: "Collection name is required" });
    return;
  }

  const created = addCollection(name);
  response.status(201).json({ id: created.id });
});

router.put("/collections/reorder", (request, response) => {
  const orderedIds = Array.isArray(request.body.orderedIds)
    ? request.body.orderedIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];

  if (!orderedIds.length) {
    response.status(400).json({ error: "orderedIds is required" });
    return;
  }

  response.json({ collections: reorderCollections(orderedIds) });
});

router.delete("/collections/:collectionId", (request, response) => {
  const collectionId = String(request.params.collectionId ?? "");

  if (!collectionId) {
    response.status(400).json({ error: "collectionId is required" });
    return;
  }

  const deleted = deleteCollection(collectionId);

  if (!deleted) {
    response.status(404).json({ error: "Collection not found" });
    return;
  }

  response.json({ deleted: true });
});

router.get("/library", (request, response) => {
  const collectionId = typeof request.query.collectionId === "string" ? request.query.collectionId : undefined;
  response.json(getLibraryItems(collectionId));
});

router.post("/upload", upload.array("files"), (request, response) => {
  const files = request.files as Express.Multer.File[] | undefined;
  const collectionId = String(request.body.collectionId ?? "all");

  if (!files?.length) {
    response.status(400).json({ error: "At least one file is required" });
    return;
  }

  const uploaded = addMockFiles(files, collectionId);
  response.status(201).json({ uploaded });
});

export { router as apiRouter };
