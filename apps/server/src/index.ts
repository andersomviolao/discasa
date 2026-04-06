import cors from "cors";
import express from "express";
import session from "express-session";
import { hydrateSessionFromPersistedAuth } from "./lib/auth-store";
import { apiRouter } from "./routes/api";
import { authRouter } from "./routes/auth";
import { env } from "./lib/env";

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
  response.json({ ok: true, mockMode: env.mockMode });
});

app.use("/auth", authRouter);
app.use("/api", apiRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({
    error: error instanceof Error ? error.message : "Unexpected server error",
  });
});

app.listen(env.port, () => {
  console.log(`Discasa server running on http://localhost:${env.port}`);
  console.log(`Mock mode: ${env.mockMode}`);
});
