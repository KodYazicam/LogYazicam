# `src/` — how LogYazicam is wired

Operator docs (invite, `/log`, env): [../README.md](../README.md).  
Locale files: [locales/README.md](./locales/README.md).  
Tests: [../tests/README.md](../tests/README.md).

This folder is the **runtime**. Every guild event Discord actually emits is bound in `events.js`. Config is SQLite + env. Identifiers are English.

## Boot

```
index.js
  loadEnvFile + processConfig     → process-level defaults
  buildIntents                    → conditional GuildPresences
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
| `retry.js` | Parse webhook `Retry-After` deltas/HTTP-dates, cap waits, choose the retry delay | Discord API calls |
| `commands.js` | Slash builder + execute + autocomplete | Gateway |
| `db.js` | Schema + prepared statements. `setGuild` **whitelists** column names | Business copy |
| `config.js` | Env parse, `mergeGuild` (env → row → extra_json colors/strings) | Discord API |
| `configTransfer.js` | `/log export` snapshot + validated `/log import` into SQLite | Discord API |
| `dashboard.js` | Optional read-only HTTP view of `history` rows | Config mutation |
| `retention.js` | History cutoff, per-guild override, and prune sweeps | Other tables |
| `intents.js` | Base gateway intents + opt-in `GuildPresences` | Event handling |
| `doctor.js` | Offline preflight checks: Node, token shape, intents, data dir, SQLite integrity, `.env` mode | Network calls, writes |
| `backupRestore.js` | Online WAL-safe SQLite backup plus integrity-checked atomic restore for the CLI | Runtime gateway or scheduled backups |
| `cli.js` | `logyazicam doctor`, `backup`, and `restore` entry point and exit codes | Runtime gateway |
| `util.js` | `buildEmbed`, audit fetch, ignore match, truncate | Persistence |
| `logger.js` | stdout + optional file; never throws | |
| `deploy-commands.js` | REST `applicationCommands` put | Runtime |
| `index.js` | Client wiring, partials, shutdown, error plumbing | Event formatting |

## Data flow for one delete

1. `messageDelete` in `events.js` (wrapped in `safe()` — throw cannot kill the process).
2. `formatMessageDelete` → `{ embeds, files, bot, webhook, userId, ignore }`.
3. `dispatcher.enqueue`:
   - event must be **on** in `event_routes`
   - channel = override \|\| `default_channel`
   - drop self / bots / webhooks / ignore list
   - optional `history` row (`summary` only, not full body); guild `storeHistory` applies unless `eventHistory[eventKey]` overrides it
   - push queue (`MAX_QUEUE_PER_CHANNEL`, drop oldest)
4. Timer (`SEND_INTERVAL_MS`) sends webhook or `channel.send`. Tests call the
   exposed `tick()` with an injected webhook client and clock. A 429/503 sets
   `retryAt` on the item (using a valid `Retry-After` value, capped at 5
   minutes) and re-queues it without sleeping; `RETRY_MAX` bounds attempts, and
   a `flushing` guard prevents overlapping ticks.

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
  "colors": { "delete": 16711680 },
  "eventColors": { "messageDelete": 0 },
  "eventCooldown": { "messageUpdate": 30 },
  "eventDigest": { "messageUpdate": { "ms": 8000, "min": 3 } },
  "eventActors": { "messageDelete": "humans" },
  "quietBypass": { "guildBanAdd": true },
  "eventIncludeChannels": { "messageDelete": ["123456789012345678"] },
  "eventDelivery": { "messageCreate": "plain", "guildBanAdd": "webhook" },
  "eventHistory": { "messageCreate": false, "guildBanAdd": true },
  "eventRedact": { "messageCreate": { "url": true }, "guildBanAdd": { "mention": false } }
}
```

Set via `/log string`, `/log color`, `/log event color`, `/log event cooldown`, `/log event digest`, `/log event actors`, `/log event bypass`, `/log event watch`, `/log event delivery`, `/log event history`, `/log event redact`, `/log set`, `/log watch`. `mergeGuild` applies `extra.colors` on top of columns / env. `buildEmbed` prefers `extra.eventColors[eventKey]`, then the slot color, and passes `extra.strings` into `t()`. The dispatcher uses `extra.eventCooldown[eventKey]` before the guild `cooldownSec`, `extra.eventDigest[eventKey]` before the guild `digestMs`/`DIGEST_MIN`, `extra.eventActors[eventKey]` before the guild `actors`, `extra.quietBypass[eventKey]` before dropping events for quiet hours, and `extra.eventIncludeChannels[eventKey]` before the guild `includeChannels` list. A non-empty per-event channel list replaces the guild list for that event only; an empty or missing entry falls back to the guild list. `extra.eventDelivery[eventKey]` (`embed`, `plain`, `webhook`) wins over guild `delivery` and `plainText`; `plain` flattens that event, `embed` keeps embeds, and both force `channel.send` even when the guild has webhook credentials. `webhook` sets the webhook preference. `extra.eventHistory[eventKey]` (`true`/`false`) wins over guild `storeHistory` for `db.pushHistory`; a missing entry follows the guild setting. `eventRedactFlags` applies `extra.eventRedact[eventKey][flag]` over `flagsFrom` for optional flags only, so always-on secret patterns stay enabled.

Other `extra_json` knobs: `eventColors`, `eventCooldown`, `eventDigest`, `eventActors`, `quietBypass`, `eventIncludeChannels`, `eventDelivery`, `eventHistory`, `eventRedact`, `paused`, `plainText`, `showThumbnails`, `showTimestamp`, `attachLong`, `quietStart`, `quietEnd`, `quietDays`, `minAccountDays`, `cooldownSec`, `actors`, `includeChannels`, `webhookName`, `webhookAvatar`, `delivery` (`embed|plain|webhook`), `prefix`, `prefixOn`, `slashOn`.

Control plane: slash `/log` and prefix `{PREFIX}{COMMAND_NAME} …` share `commands.execute`. `COMMAND_NAME` (default `log`) needs `npm run deploy` if you change it. `CONFIG_PERMISSION` is the Discord permission name (`ManageGuild` default). `SLASH_EPHEMERAL` / guild `ephemeral` hide slash replies. `SHOW_CREDIT` / guild `credit` toggle the footer credit. `/log set` accepts only `SETTING_NAMES`, validates numeric/time/boolean ranges, and cannot write internal maps such as `eventColors` or `hiddenFields`. Apache-2.0 does not require attribution. Truncation: `EMBED_*_MAX`, `PLAIN_MAX`, `ATTACH_MIN_CHARS`, `AUDIT_FETCH_LIMIT`, `BULK_LINE_LIMIT`.

## Product add-ons (not gateway events)

| Module | Role |
| --- | --- |
| `packs.js` | Named key lists for `/log pack` / `/log setup` |
| `sinks.js` | File JSONL + HTTP POST + SQLite copy |
| snapshots table | Fills `messageDelete` when cache is empty |
| invites table | Diffs uses on `guildMemberAdd` |

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

Built by `intents.js` and passed to the client in `index.js`. Portal must match (Members, Message Content; Presence only when `PRESENCE_INTENT=true` and you enable `presenceUpdate`). `GuildMessageTyping` is required for `typingStart` and is already requested. Intents are fixed when the client connects, so toggling `PRESENCE_INTENT` needs a restart.

## Errors

`safe()` around every listener. Slash failures reply ephemeral. Webhook failure → channel fallback. `unhandledRejection` → log + optional `ERROR_CHANNEL_ID` + optional owner DM. `uncaughtException` reports and then exits 1 after closing the dashboard, gateway client, and SQLite. `SIGTERM` / `SIGINT` shut down cleanly. Missing `TOKEN` / failed login → exit 1.
