# Discasa

Discasa is now split into standalone repositories:

- [Discasa_app](https://github.com/Discasa/Discasa_app): desktop app, local backend, shared contracts, and app artwork.
- [Discasa_bot](https://github.com/Discasa/Discasa_bot): hosted Discord bot service.

This repository is the lightweight coordinator for local development. It keeps shared project documentation and convenience launchers that expect both sibling repositories beside it.

## Expected Local Layout

```text
F:\scripts
  Discasa
  Discasa_app
  Discasa_bot
```

## Run

Start the full local stack:

```powershell
.\start-all.bat
```

Start only one side:

```powershell
.\start-app.bat
.\start-bot.bat
```

Stop services:

```powershell
.\stop-all.bat
.\stop-app.bat
.\stop-bot.bat
```

Run the app hard reset from this coordinator:

```powershell
.\hard-reset.bat
```

## Repository Roles

The app owns the product experience, local backend, synchronization decisions, chunking, snapshots, pending upload recovery, runtime translations, cache, and desktop UI.

The bot owns Discord bot identity operations: setup checks, channel creation, uploads, message deletion, raw attachment listing, attachment resolving, and snapshot read/write endpoints.

See [documentation.md](documentation.md) for the coordinator notes.
