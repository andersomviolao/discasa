import express from "express";
import multer from "multer";
import type {
  LibraryItem,
  PersistedConfigSnapshot,
  PersistedFolderSnapshot,
  PersistedIndexSnapshot,
} from "@discasa/shared";
import {
  deleteStoredItemFromDiscord,
  getDiscordBotRuntimeStatus,
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
} from "./discord";
import { env } from "./config";
import type { ActiveStorageContext } from "./storage-types";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "25mb" }));

function readContext(raw: unknown): ActiveStorageContext {
  if (!raw || typeof raw !== "object") {
    throw new Error("Active storage context is required.");
  }

  return raw as ActiveStorageContext;
}

function readMultipartContext(raw: unknown): ActiveStorageContext {
  if (typeof raw !== "string") {
    throw new Error("Active storage context is required.");
  }

  return readContext(JSON.parse(raw) as unknown);
}

function readItem(raw: unknown): LibraryItem {
  if (!raw || typeof raw !== "object") {
    throw new Error("Library item is required.");
  }

  return raw as LibraryItem;
}

app.get("/health", async (_request, response, next) => {
  try {
    const status = await getDiscordBotRuntimeStatus();
    response.json({
      ok: status.mockMode || (status.botConfigured && status.botLoggedIn),
      ...status,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/guilds/:guildId/upload-limit", async (request, response, next) => {
  try {
    const guildId = String(request.params.guildId ?? "");
    response.json({ uploadLimitBytes: await getDiscordUploadLimitForGuild(guildId) });
  } catch (error) {
    next(error);
  }
});

app.get("/guilds/:guildId/setup-status", async (request, response, next) => {
  try {
    const guildId = String(request.params.guildId ?? "");
    response.json(await inspectDiscasaSetup(guildId));
  } catch (error) {
    next(error);
  }
});

app.post("/guilds/:guildId/initialize", async (request, response, next) => {
  try {
    const guildId = String(request.params.guildId ?? "");
    const authenticatedUserId = typeof request.body.authenticatedUserId === "string" ? request.body.authenticatedUserId : undefined;
    response.json(await initializeDiscasaInGuild(guildId, authenticatedUserId));
  } catch (error) {
    next(error);
  }
});

app.post("/files/upload", upload.array("files"), async (request, response, next) => {
  try {
    const files = request.files as Express.Multer.File[] | undefined;
    const context = readMultipartContext(request.body.context);

    if (!files?.length) {
      response.status(400).json({ error: "At least one file is required." });
      return;
    }

    response.json({ records: await uploadFilesToDiscordDrive(files, context) });
  } catch (error) {
    next(error);
  }
});

app.post("/files/move-to-trash", async (request, response, next) => {
  try {
    response.json({
      record: await moveStoredItemToTrash(readContext(request.body.context), readItem(request.body.item)),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/files/restore-from-trash", async (request, response, next) => {
  try {
    response.json({
      record: await restoreStoredItemFromTrash(readContext(request.body.context), readItem(request.body.item)),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/files/delete", async (request, response, next) => {
  try {
    await deleteStoredItemFromDiscord(readContext(request.body.context), readItem(request.body.item));
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/index/current", async (request, response, next) => {
  try {
    response.json({ current: await hasCurrentIndexSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/folder/current", async (request, response, next) => {
  try {
    response.json({ current: await hasCurrentFolderSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/config/current", async (request, response, next) => {
  try {
    response.json({ current: await hasCurrentConfigSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/index/latest", async (request, response, next) => {
  try {
    response.json({ snapshot: await readLatestIndexSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/folder/latest", async (request, response, next) => {
  try {
    response.json({ snapshot: await readLatestFolderSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/config/latest", async (request, response, next) => {
  try {
    response.json({ snapshot: await readLatestConfigSnapshot(readContext(request.body.context)) });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/index/refresh-attachments", async (request, response, next) => {
  try {
    response.json(await refreshIndexSnapshotAttachmentUrls(
      readContext(request.body.context),
      request.body.snapshot as PersistedIndexSnapshot,
    ));
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/index/sync", async (request, response, next) => {
  try {
    await syncIndexSnapshot(readContext(request.body.context), request.body.snapshot as PersistedIndexSnapshot);
    response.json({ synced: true });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/folder/sync", async (request, response, next) => {
  try {
    await syncFolderSnapshot(readContext(request.body.context), request.body.snapshot as PersistedFolderSnapshot);
    response.json({ synced: true });
  } catch (error) {
    next(error);
  }
});

app.post("/snapshots/config/sync", async (request, response, next) => {
  try {
    await syncConfigSnapshot(readContext(request.body.context), request.body.snapshot as PersistedConfigSnapshot);
    response.json({ synced: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("[Discasa bot]", error);
  response.status(500).json({
    error: error instanceof Error ? error.message : "Unexpected Discord bot service error",
  });
});

app.listen(env.port, async () => {
  console.log(`Discasa Discord bot service running on http://localhost:${env.port}`);

  try {
    const status = await getDiscordBotRuntimeStatus();
    console.log(`Mock mode: ${status.mockMode}`);
    console.log(`Bot configured: ${status.botConfigured}`);
    console.log(`Bot logged in: ${status.botLoggedIn}`);
  } catch (error) {
    console.warn("[Discasa bot] Bot status could not be resolved at startup.", error);
  }
});
