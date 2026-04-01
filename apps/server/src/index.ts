import cors from "cors";
import express from "express";
import session from "express-session";
import { apiRouter } from "./routes/api";
import { authRouter } from "./routes/auth";
import { env } from "./lib/env";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    user?: {
      id: string;
      username: string;
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
