# `src/` — how LogYazicam is wired

Operator docs (invite, `/log`, env): [../README.md](../README.md).  
Locale files: [locales/README.md](./locales/README.md).  
Tests: [../tests/README.md](../tests/README.md).

This folder is the **runtime**. Every guild event Discord actually emits is bound in `events.js`. Config is SQLite + env. Identifiers are English.

## Boot

```
index.js
  loadEnvFile + processConfig     → process-level defaults
  openDb                          → WAL SQLite
  createDispatcher                → per-channel send queue
  bindEvents                      → client.on(...)
  interactionCreate               → /log
  HOT_RELOAD_MS timer             → re-read .env (not TOKEN) + reloadLocales() + refreshGuild
```

`TOKEN` is the only setting that needs a process restart. `/log` writes SQLite and calls `refreshGuild` immediately.

## Modules (edit here)

| File | Owns | Do not put here |
| --- | --- | --- |
| `catalog.js` | Event **keys**, groups, default colors | Discord listeners |
| `events.js` | `client.on` for each Discord event; splits `voiceStateUpdate` / `guildMemberUpdate`; also poll, typing, soundboard, entitlements, `commandUse` | SQL |
| `format.js` | Message / member / ban / voice embed payloads | Routing |
| `dispatcher.js` | Filters, queue, webhook vs `channel.send`, history insert | Slash UX |
| `commands.js` | Slash builder + execute + autocomplete | Gateway |
| `db.js` | Schema + prepared statements. `setGuild` **whitelists** column names | Business copy |
| `config.js` | Env parse, `mergeGuild` (env → row → extra_json colors/strings) | Discord API |
| `util.js` | `buildEmbed`, audit fetch, ignore match, truncate | Persistence |
| `logger.js` | stdout + optional file; never throws | |
| `deploy-commands.js` | REST `applicationCommands` put | Runtime |
| `index.js` | Intents, partials, error plumbing | Event formatting |

## Data flow for one delete

1. `messageDelete` in `events.js` (wrapped in `safe()` — throw cannot kill the process).
2. `formatMessageDelete` → `{ embeds, files, bot, webhook, userId, ignore }`.
3. `dispatcher.enqueue`:
   - event must be **on** in `event_routes`
   - channel = override \|\| `default_channel`
   - drop self / bots / webhooks / ignore list
   - optional `history` row (`summary` only, not full body)
   - push queue (`MAX_QUEUE_PER_CHANNEL`, drop oldest)
4. Timer (`SEND_INTERVAL_MS`) sends webhook or `channel.send`.

## Adding an event

1. `{ key, group, color, audit }` in `catalog.js` — `key` is the English id used in SQL and `/log event on`.
2. `event.<key>` in `locales/en.js` (other packs fall back).
3. Real `client.on` in `events.js` (or extend an existing splitter). No stub keys.
4. `npm test` — catalog uniqueness.
5. Slash autocomplete reads the catalog at runtime; **no redeploy** for new keys.

## Guild `extra_json`

Bag for per-guild overrides without a migration:

```json
{
  "strings": { "event.messageDelete": "Message yeeted" },
  "colors": { "delete": 16711680 }
}
```

Set via `/log string`, `/log color`, `/log set`, `/log watch`. `mergeGuild` applies `extra.colors` on top of columns / env. `buildEmbed` passes `extra.strings` into `t()`.

Other `extra_json` knobs: `paused`, `plainText`, `showThumbnails`, `showTimestamp`, `attachLong`, `quietStart`, `quietEnd`, `minAccountDays`, `cooldownSec`, `actors`, `includeChannels`, `webhookName`, `webhookAvatar`, `delivery` (`embed|plain|webhook`), `prefix`, `prefixOn`, `slashOn`.

Control plane: slash `/log` and prefix `{PREFIX}{COMMAND_NAME} …` share `commands.execute`. `COMMAND_NAME` (default `log`) needs `npm run deploy` if you change it. `CONFIG_PERMISSION` is the Discord permission name (`ManageGuild` default). `SLASH_EPHEMERAL` / guild `ephemeral` hide slash replies. `SHOW_CREDIT` / guild `credit` toggle footer credit (KYAL still requires README/LICENSE attribution). Truncation: `EMBED_*_MAX`, `PLAIN_MAX`, `ATTACH_MIN_CHARS`, `AUDIT_FETCH_LIMIT`, `BULK_LINE_LIMIT`.

## Extra listeners (catalog keys → Discord)

| Catalog key | `client.on` |
| --- | --- |
| `messageCreate` | `messageCreate` (skips the bot’s own user) |
| `typingStart` | `typingStart` |
| `messagePollVoteAdd` / `Remove` | same names |
| `voiceChannelEffect` | `voiceChannelEffectSend` |
| `voiceSelfMute` `voiceSelfDeaf` `voiceSuppress` | `voiceStateUpdate` via `voiceKind()` |
| `threadMemberUpdate` | `threadMemberUpdate` |
| `soundboard*` | `guildSoundboardSoundCreate/Delete/Update` |
| `entitlement*` `subscription*` | matching names; guild from `guildId` |
| `commandUse` | `interactionCreate` (ignores `COMMAND_NAME`) |
| `guildAvailable` / `guildUnavailable` | same |
| `guildMemberPending` | `guildMemberUpdate` when `pending` flips |

## Intents

Declared only in `index.js`. Portal must match (Members, Message Content; Presence only if you enable `presenceUpdate`). `GuildMessageTyping` is required for `typingStart` and is already requested.

## Errors

`safe()` around every listener. Slash failures reply ephemeral. Webhook failure → channel fallback. `unhandledRejection` / `uncaughtException` → log + optional `ERROR_CHANNEL_ID` + optional owner DM. Missing `TOKEN` / failed login → exit 1.
