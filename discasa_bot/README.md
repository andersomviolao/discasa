# Discasa Bot

Local Discord bot service used by Discasa for Discord-backed storage operations.

The bot runs as its own Node.js process and exposes a local HTTP API for the Discasa app backend. By default it listens on `http://localhost:3002`.

Bot-specific icon and banner artwork live in `art/`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_BOT_TOKEN`.
3. Run `npm install`.
4. Start with `start.bat` or `npm run dev`.

## Scripts

- `npm run dev` starts the bot service in watch mode.
- `npm run check` runs TypeScript checks.
- `npm run build` runs the TypeScript build check.
- `start.bat` starts the bot in a separate Windows terminal.
- `stop.bat` stops the local process listening on port `3002`.
