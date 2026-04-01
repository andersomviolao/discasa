import { Router } from "express";
import { env } from "../lib/env";

const router = Router();

router.get("/discord/login", (request, response) => {
  if (env.mockMode) {
    request.session.authenticated = true;
    request.session.user = {
      id: "mock_user",
      username: "Mock User",
    };
    response.redirect(env.frontendUrl);
    return;
  }

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    response_type: "code",
    redirect_uri: env.discordRedirectUri,
    scope: "identify guilds",
    prompt: "consent",
  });

  response.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get("/discord/callback", (request, response) => {
  if (env.mockMode) {
    request.session.authenticated = true;
    request.session.user = {
      id: "mock_user",
      username: "Mock User",
    };
    response.redirect(env.frontendUrl);
    return;
  }

  response.status(501).json({
    error: "Real OAuth callback exchange has not been implemented yet in this starter.",
  });
});

export { router as authRouter };
