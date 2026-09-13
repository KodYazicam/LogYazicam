# Security Policy

LogYazicam stores guild configuration and short event summaries in SQLite. Treat `data/` as sensitive.

## Before you invite it

1. Enable only the intents you need. Presence is optional and off by default as a log event.
2. Invite **without Administrator**. Send Messages, Embed Links, Attach Files, Read Message History, View Audit Log in the log channel are enough.
3. Keep `IGNORE_SELF` on so the bot cannot log its own embeds in a loop.
4. `TOKEN` belongs in `.env`, never in git.

## Reporting

Open a private advisory on [KodYazicam/LogYazicam](https://github.com/KodYazicam/LogYazicam/security/advisories/new).
