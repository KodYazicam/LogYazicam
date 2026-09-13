<p align="center">
  <strong>LogYazicam</strong><br/>
  A Discord logging bot. One job: take every guild event Discord actually emits, format it, and send it where you told it to go.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/license-KYAL--1.0-7C3AED?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

---

LogYazicam is **not** a moderation suite, a music bot, or an economy. It does not warn, ban, or play audio. It watches the gateway, optionally reads the audit log for *who did it*, and posts an embed (or a webhook) into a channel you chose.

Every identifier in config, SQLite, slash options, and env is **English** (`messageDelete`, `ignore_bots`, `DEFAULT_LOCALE`). Embed titles and slash replies are translated: **en** (default), **tr**, **de**, **fr**, **es**. Change the locale with `/log locale` — no restart.

Guild config lives in SQLite. Changing a route, ignore list, footer, webhook, or filter applies on the next event. The only thing that still needs a process restart is `TOKEN` (Discord.js login).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

This project is **KYAL-1.0**: free to use and modify, **attribution is mandatory** in LICENSE, README, and any public bot that ships this code (`Powered by LogYazicam — KodYazicam`). Embed footers always append that credit.

## Table of contents

- [What it logs](#what-it-logs)
- [What Discord requires](#what-discord-requires)
- [Install](#install)
- [First boot](#first-boot)
- [Environment](#environment)
- [Slash command `/log`](#slash-command-log)
- [Per-guild SQLite](#per-guild-sqlite)
- [Hot reload](#hot-reload)
- [Routing, webhooks, queues](#routing-webhooks-queues)
- [Ignores and filters](#ignores-and-filters)
- [Audit log](#audit-log)
- [History export](#history-export)
- [Errors](#errors)
- [Locales](#locales)
- [Intents and partials](#intents-and-partials)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)
- [License](#license--kyal-10)

## What it logs

Keys below are the **English event ids** you pass to `/log event on key:`. Groups are `/log group on name:`.

| Group | Event keys (all implemented) |
| --- | --- |
| `message` | `messageDelete` `messageUpdate` `messageDeleteBulk` `messageReactionAdd` `messageReactionRemove` `messageReactionRemoveAll` `messageReactionRemoveEmoji` `messagePin` `messageUnpin` |
| `member` | `guildMemberAdd` `guildMemberRemove` `guildMemberUpdate` `guildMemberTimeout` `guildMemberNickname` `guildMemberAvatar` `guildMemberRoles` `guildMemberBoost` |
| `moderation` | `guildBanAdd` `guildBanRemove` `guildMemberTimeout` |
| `invite` | `inviteCreate` `inviteDelete` |
| `channel` | `channelCreate` `channelDelete` `channelUpdate` `channelPinsUpdate` |
| `thread` | `threadCreate` `threadDelete` `threadUpdate` `threadMembersUpdate` `threadListSync` |
| `role` | `roleCreate` `roleDelete` `roleUpdate` |
| `emoji` | `emojiCreate` `emojiDelete` `emojiUpdate` |
| `sticker` | `stickerCreate` `stickerDelete` `stickerUpdate` |
| `voice` | `voiceJoin` `voiceLeave` `voiceMove` `voiceServerMute` `voiceServerDeafen` `voiceStream` `voiceVideo` |
| `stage` | `stageInstanceCreate` `stageInstanceDelete` `stageInstanceUpdate` |
| `server` | `guildUpdate` `guildBoostLevel` |
| `webhook` | `webhookUpdate` |
| `integration` | `guildIntegrationsUpdate` |
| `event` | `guildScheduledEventCreate` `guildScheduledEventDelete` `guildScheduledEventUpdate` `guildScheduledEventUserAdd` `guildScheduledEventUserRemove` |
| `automod` | `autoModerationRuleCreate` `autoModerationRuleDelete` `autoModerationRuleUpdate` `autoModerationActionExecution` |
| `command` | `applicationCommandPermissionsUpdate` |
| `audit` | `guildAuditLogEntryCreate` |
| `presence` | `presenceUpdate` (default **off** — noisy; needs Presence intent) |
| `user` | `userUpdate` (default **off** — username/avatar globally; fan-out to guilds that share the member) |

Voice is one Discord event (`voiceStateUpdate`) split into the keys above so you can log joins without logging camera toggles.

`presenceUpdate` and `userUpdate` are **off until you enable them**. They fire often.

There is no fake “message purge transcript from a third-party API.” Bulk delete lists the messages Discord still has in cache (up to 40 lines in the embed). Deleted-message content is whatever the cache / partial fetch still holds — Discord does not give a full archive after the fact.

## What Discord requires

1. A bot application: [Developer Portal](https://discord.com/developers/applications).
2. Privileged intents **on** in the portal (same list as in `src/index.js`):
   - Server Members
   - Message Content
   - Presence (only if you enable `presenceUpdate`)
3. Invite scopes: `bot` + `applications.commands`.
4. Bot permissions in the log channel: View, Send, Embed Links, Attach Files, Read Message History. **View Audit Log** if you want executor fields. **Do not tick Administrator.**
5. The bot’s role must be able to see the log channel.

Deleted message bodies require the bot to have seen the message (cache) or a successful partial fetch. Pins come from `guildAuditLogEntryCreate` (`MessagePin` / `MessageUnpin`).

## Install

Not on npm. Clone:

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam
cp .env.example .env
# fill TOKEN and CLIENT_ID
npm install
npm test
npm run deploy
npm start
```

Node **20+**. `better-sqlite3` is native; if install fails, use Node 20 or 22 LTS, not a random nightly.

## First boot

1. Put the bot in your server.
2. `npm run deploy` with `GUILD_ID` set (guild commands appear in seconds). Without `GUILD_ID`, commands are global (up to an hour).
3. `/log channel set channel:#mod-log`
4. `/log group on name:message` (and `member`, `moderation`, `voice`, …)
5. `/log test` — you should see an embed whose footer contains **Powered by LogYazicam — KodYazicam**.
6. Delete a message in a channel the bot can see. You should get `messageDelete` in `#mod-log`.

Until a route is **on**, that event is silent. Nothing is “on by default” except process-level env fallbacks (ignore bots, etc.).

## Environment

All keys are English. Copy `.env.example`. Guild `/log` values **override** these per server except `TOKEN`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOKEN` | — | Bot token. **Restart required** to change. |
| `CLIENT_ID` | — | Application id for `deploy`. |
| `GUILD_ID` | empty | Dev guild for instant slash deploy. |
| `OWNER_IDS` | empty | Comma-separated snowflakes that can `/log` even without Manage Guild. |
| `DATABASE_PATH` | `./data/logyazicam.sqlite` | SQLite file. |
| `DEFAULT_LOCALE` | `en` | `en` `tr` `de` `fr` `es`. Invalid → `en`. |
| `DEFAULT_TIMEZONE` | `UTC` | IANA tz for new guilds. |
| `LOG_LEVEL` | `info` | `error` `warn` `info` `debug`. |
| `LOG_FILE` | `./data/process.log` | Process log path. |
| `ERROR_CHANNEL_ID` | empty | Channel for unhandled errors. |
| `ERROR_DM_OWNER` | `false` | DM first `OWNER_IDS` on fatal errors. |
| `HOT_RELOAD_MS` | `15000` | Re-read `.env` (not TOKEN) and refresh guild cache. `0` disables. |
| `MAX_QUEUE_PER_CHANNEL` | `20` | Drop oldest if a log channel is slow. |
| `SEND_INTERVAL_MS` | `350` | Delay between sends per flush tick (rate-limit friendly). |
| `AUDIT_MAX_AGE_MS` | `12000` | Ignore audit entries older than this when attributing an executor. |
| `WEBHOOK_NAME` | `LogYazicam` | Webhook username if the guild set webhook id/token. |
| `WEBHOOK_AVATAR_URL` | empty | Webhook avatar. |
| `EMBED_SHOW_IDS` | `true` | Include snowflakes in embeds. |
| `EMBED_SHOW_JUMP` | `true` | Include jump URLs. |
| `EMBED_COMPACT` | `false` | Inline fields. |
| `EMBED_FOOTER` | `LogYazicam` | Footer prefix; credit is always appended. |
| `IGNORE_BOTS` | `true` | Skip events whose actor is a bot. |
| `IGNORE_WEBHOOKS` | `true` | Skip webhook messages. |
| `IGNORE_SELF` | `true` | Skip the bot’s own user id (stops log loops). |
| `STORE_HISTORY` | `true` | Write a short JSON row per event. |
| `HISTORY_LIMIT` | `200` | Cap per guild (oldest trimmed). |

Booleans accept `1/0`, `true/false`, `yes/no`, `on/off`.

## Slash command `/log`

Requires **Manage Guild** or an `OWNER_IDS` user. Guild only. Replies are ephemeral.

| Path | Effect |
| --- | --- |
| `/log channel set` | Default destination for events without an override. |
| `/log channel clear` | Remove default. Events with no override stay silent. |
| `/log event on key:messageDelete channel:#msg-log` | Enable one event. `channel` optional. Autocomplete lists keys. |
| `/log event off key:messageDelete` | Disable one event. |
| `/log group on name:voice channel:#voice-log` | Enable every key in that group. |
| `/log group off name:presence` | Disable the group. |
| `/log ignore add kind:user id:123` | Ignore that snowflake (`user` `channel` `role` `category`). |
| `/log ignore remove` / `/log ignore list` | Remove / list. |
| `/log locale code:tr` | Embed + command language. |
| `/log timezone tz:Europe/Istanbul` | IANA timezone (validated). |
| `/log filter name:ignore_bots value:False` | Per-guild boolean. |
| `/log webhook id: token:` | Send via webhook instead of `channel.send`. `clear:True` unsets. |
| `/log footer text:Mod team` | Footer prefix. Credit still appended. |
| `/log status` | Locale, tz, default channel, enabled count, queue size, last send error. |
| `/log test` | Send `event.test` embed now. |
| `/log history limit:50` | Attachment of recent stored rows. |
| `/log reload` | Re-read this guild from SQLite (also happens on the hot-reload timer). |
| `/log events` | Dump every group and key. |

## Per-guild SQLite

File: `DATABASE_PATH`. WAL + foreign keys.

- `guilds` — locale, timezone, default channel, webhook, embed flags, footer, history cap, extra JSON.
- `event_routes` — `(guild_id, event_key) → enabled, channel_id`.
- `ignores` — `(guild_id, kind, target_id)`.
- `history` — capped JSON summaries for `/log history`.

`extra_json` is a bag for future flags without a migration. `/log filter` writes known boolean columns.

Column names in SQL are English snake_case, same as slash `filter` names.

## Hot reload

Every `HOT_RELOAD_MS` (default 15s):

1. Parse `.env` again.
2. Rebuild `processCfg` **keeping the original TOKEN**.
3. Refresh every cached guild from SQLite.

So you can flip `IGNORE_BOTS` or `SEND_INTERVAL_MS` in `.env` and wait one tick. You can `/log event on` and the next delete is logged. You cannot change the Discord token without restarting the process.

## Routing, webhooks, queues

For each event:

1. Guild config from memory (SQLite-backed).
2. If the event is off → drop.
3. Channel = route override || guild default.
4. Filters: self, bots, webhooks, ignore list (user / channel / parent category / role).
5. Optional history row.
6. Push onto a per-channel queue (`MAX_QUEUE_PER_CHANNEL`).
7. A timer (`SEND_INTERVAL_MS`) sends one item: webhook if configured, else `channel.send`. Mentions are disabled except the optional delete ping role.

If the webhook fails, it falls back to the channel and logs a warning. It does not crash.

## Ignores and filters

| Filter | Default | |
| --- | --- | --- |
| `ignore_self` | on | The bot’s own id. |
| `ignore_bots` | on | `user.bot`. |
| `ignore_webhooks` | on | Message has `webhookId`. |
| ignore list | empty | Explicit snowflakes. |

A message delete in an ignored category (parent id) is dropped even if the child channel is not listed.

## Audit log

When Discord does not put the moderator on the gateway payload (kick vs leave, ban, some channel updates), LogYazicam calls `guild.fetchAuditLogs` and accepts an entry only if:

- action type matches,
- target id matches when present,
- entry is newer than `AUDIT_MAX_AGE_MS`.

If the bot lacks **View Audit Log**, executor fields are omitted. The event still logs.

`guildAuditLogEntryCreate` is also a first-class event (noisy). Pins/unpins are derived from it as `messagePin` / `messageUnpin`.

## History export

If `store_history` is on, each accepted event appends `{ eventKey, channelId, at, summary }`. `/log history` returns a text attachment. This is **not** a legal archive of message content. Deleted bodies live in the Discord embed at send time, not in this table (to keep the DB small and reduce secret retention). Set `store_history` false if you do not want even summaries on disk.

## Errors

- Every event handler is wrapped. A throw in `messageDelete` cannot kill the process.
- `unhandledRejection` / `uncaughtException` go to the logger, optional `ERROR_CHANNEL_ID`, optional owner DM.
- Slash failures reply with `Error: …` ephemeral and stay alive.
- Logger never throws (file append is try/catch).
- Login failure exits `1` (no token, invalid token). That is the only intentional process death besides missing `TOKEN` at boot.

## Locales

| Code | Pack |
| --- | --- |
| `en` | Default. Complete catalog. |
| `tr` `de` `fr` `es` | Commands + common event titles; missing keys fall back to English. |

Add a key to `src/locales/en.js` first, then override in the other files. Field names in slash options stay English everywhere (`key`, `channel`, `kind`).

## Intents and partials

Intents in `src/index.js` match the table above. Partials: Message, Channel, Reaction, User, GuildMember, ThreadMember, GuildScheduledEvent — so deletes of uncached messages still attempt a fetch.

If Presence is off in the portal, `presenceUpdate` simply never fires; enabling the event in SQLite does nothing until the intent is on.

## Project layout

```
LogYazicam/
  src/index.js           Client, hot reload, error plumbing
  src/catalog.js         Event keys + groups (source of truth)
  src/config.js          Env + merge guild row
  src/db.js              SQLite
  src/dispatcher.js      Queue + webhook/channel send
  src/events.js          client.on(...) for every catalog key
  src/format.js          Message/member/ban/voice formatters
  src/commands.js        /log slash builder + execute
  src/deploy-commands.js
  src/locales/           en tr de fr es
  src/logger.js
  src/util.js            embeds, audit helper, ignore
  tests/
  .env.example
  LICENSE                KYAL-1.0
```

To add an event: append to `EVENTS` in `catalog.js`, add `event.<key>` to `locales/en.js`, bind in `events.js`. `/log events` and autocomplete pick it up automatically.

## Tests

```bash
npm test
```

No Discord token. Covers catalog uniqueness, locale fallback, env parsing, voiceKind mapping, SQLite routes/ignores/history cap.

CI: GitHub Actions, Node 22, `npm ci` && `npm test`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Slash missing | `npm run deploy`, `CLIENT_ID`, invite with `applications.commands`. |
| Deletes have empty content | Bot must see the message first (Message Content + the channel). |
| No executor on bans | View Audit Log permission; `AUDIT_MAX_AGE_MS`. |
| Log loop | `ignore_self` on; do not log the log channel’s own webhook with webhooks allowed. |
| `presenceUpdate` silent | Portal Presence intent + `/log event on key:presenceUpdate`. |
| `better-sqlite3` build fail | Node 20/22 LTS, build tools (`build-essential` / VS Build Tools). |
| Commands in the wrong language | `/log locale` is per guild; `DEFAULT_LOCALE` is only the fallback for new rows. |
| Config “not applying” | Wait `HOT_RELOAD_MS` or `/log reload`. TOKEN still needs restart. |

## License — KYAL-1.0

Free to use, copy, modify, and ship. **You must keep the credit.**

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

See [LICENSE](./LICENSE). Public bots that embed this code must show that credit in their documentation and should leave the embed footer credit intact.

<p align="center"><sub>Built by <a href="https://github.com/KodYazicam">KodYazicam</a></sub></p>
