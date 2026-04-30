# Discasa Bot

Local Discord bot service used by Discasa for Discord validation and narrow Discord channel/message operations.

The bot runs as its own Node.js process and exposes a local HTTP API for the Discasa app backend. By default it listens on `http://localhost:3002`.

The Discasa app backend owns file storage orchestration, including chunking, manifests, trash/restore decisions, and local reassembly. The bot validates Discord limits and channels, then performs the small Discord API operations the app asks for. Bot-specific icon and banner artwork live in `art/`.

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
