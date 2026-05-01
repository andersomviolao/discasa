import cors from "cors";
import express from "express";
import session from "express-session";
import { env } from "./config";
import { sendErrorResponse } from "./errors";
import { logger } from "./logger";
import { hydrateSessionFromPersistedAuth } from "./persistence";
import { apiRouter, authRouter } from "./routes";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    discordOauthState?: string;
    discordAccessToken?: string;
    discordRefreshToken?: string;
    user?: {
      id: string;
      username: string;
      avatarUrl?: string | null;
    };
  }
}

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use((request, response, next) => {
  const startedAt = Date.now();

  response.on("finish", () => {
    logger.info(`${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`);
  });

  next();
});
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  }),
);

app.use((request, _response, next) => {
  const needsHydration =
    !request.session.authenticated ||
    !request.session.user ||
    !request.session.discordAccessToken;

  if (needsHydration) {
    hydrateSessionFromPersistedAuth(request.session);
  }

  next();
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "discasa_app_server",
    mockMode: env.mockMode,
    checkedAt: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/api", apiRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  sendErrorResponse(response, error, "Unexpected server error");
});

app.listen(env.port, () => {
  logger.info(`Local server running on http://localhost:${env.port}`);
  logger.info(`Mock mode: ${env.mockMode}`);
});
