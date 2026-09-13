<p align="center">
  <strong>LogYazicam</strong><br/>
  A Discord logging bot with one job: take every guild event Discord actually emits, format it, and send it where you configured it to go.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="discord.js">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/license-KYAL--1.0-7C3AED?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/author-KodYazicam-0D0D0D?style=flat-square" alt="Author">
</p>

<p align="center">
  <strong>Read this README in your language</strong><br/>
  <a href="./README.md">English</a> ·
  <a href="./docs/README.tr.md">Türkçe</a> ·
  <a href="./docs/README.de.md">Deutsch</a> ·
  <a href="./docs/README.fr.md">Français</a> ·
  <a href="./docs/README.es.md">Español</a> ·
  <a href="./docs/README.pt.md">Português</a> ·
  <a href="./docs/README.it.md">Italiano</a> ·
  <a href="./docs/README.nl.md">Nederlands</a> ·
  <a href="./docs/README.pl.md">Polski</a> ·
  <a href="./docs/README.ru.md">Русский</a> ·
  <a href="./docs/README.uk.md">Українська</a> ·
  <a href="./docs/README.ar.md">العربية</a> ·
  <a href="./docs/README.ja.md">日本語</a> ·
  <a href="./docs/README.ko.md">한국어</a> ·
  <a href="./docs/README.zh.md">简体中文</a> ·
  <a href="./docs/README.sv.md">Svenska</a> ·
  <a href="./docs/README.hi.md">हिन्दी</a> ·
  <a href="./docs/README.id.md">Bahasa Indonesia</a>
</p>

The bot UI (`/log locale`) uses the same language codes. Slash **option names** stay English (`key`, `channel`, `kind`). Event keys stay English (`messageDelete`). Only embed titles and command replies are translated.

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — free to use and modify. Attribution is **mandatory** in LICENSE, this README, and any public bot that ships this code. Embed footers always append `Powered by LogYazicam — KodYazicam`. You may add your own footer prefix; you may not strip the credit.

---

## Table of contents

1. [What this is (and is not)](#what-this-is-and-is-not)
2. [Mental model](#mental-model)
3. [Feature surface](#feature-surface)
4. [Full event catalog](#full-event-catalog)
5. [Discord Developer Portal](#discord-developer-portal)
6. [Invite permissions (not Administrator)](#invite-permissions-not-administrator)
7. [Install and first boot](#install-and-first-boot)
8. [Environment reference](#environment-reference)
9. [Slash command `/log` (complete)](#slash-command-log-complete)
10. [Recipes](#recipes)
11. [SQLite schema](#sqlite-schema)
12. [Hot reload](#hot-reload)
13. [Dispatch pipeline](#dispatch-pipeline)
14. [Ignores, filters, and loops](#ignores-filters-and-loops)
15. [Audit log attribution](#audit-log-attribution)
16. [Embeds](#embeds)
17. [Webhooks vs channel.send](#webhooks-vs-channelsend)
18. [History](#history)
19. [Locales](#locales)
20. [Intents and partials](#intents-and-partials)
21. [Error handling](#error-handling)
22. [Limits Discord imposes](#limits-discord-imposes)
23. [Project layout](#project-layout) — also [`src/README.md`](src/README.md)
24. [Adding an event](#adding-an-event)
25. [Tests and CI](#tests-and-ci)
26. [Troubleshooting](#troubleshooting)
27. [FAQ](#faq)
28. [License](#license--kyal-10)

---

## What this is (and is not)

LogYazicam is a **logging bot**. It does not warn, kick, ban, mute, play music, sell coins, or open tickets. Those are other products ([Stribog-Bot](https://github.com/KodYazicam/Stribog-Bot), [discord-music-panel](https://github.com/KodYazicam/discord-music-panel)).

It:

- Listens to Discord.js v14 **guild** gateway events that exist in the API.
- Splits noisy Discord events into **English keys** you can enable one by one (`voiceJoin` vs `voiceVideo`).
- Formats an embed (titles/fields translated; option names stay English).
- Sends it to a per-event channel, or a guild default, optionally via webhook.
- Stores config in SQLite so `/log` changes apply on the **next event** without restarting the Node process.

It does **not**:

- Invent events Discord does not emit.
- Recover deleted message content Discord no longer has (cache / partial fetch only).
- Replace Discord’s own Audit Log UI.
- Publish to npm. Clone this repo.

Identifiers in env, SQLite, slash options, and `src/catalog.js` are **English**: `messageDelete`, `ignore_bots`, `DEFAULT_LOCALE`. User-visible strings are **en** (default), **tr**, **de**, **fr**, **es**.

---

## Mental model

```
Discord gateway
    → src/events.js          (one real listener per Discord event)
        → format payload     (src/format.js + inline builders)
            → dispatcher     (filters, queue, history)
                → webhook or channel.send
```

Config layers (later wins for guild fields):

1. Hardcoded defaults in `src/config.js` / `src/catalog.js`
2. Process `.env` (`IGNORE_BOTS`, `DEFAULT_LOCALE`, queue timings, …)
3. SQLite `guilds` row (locale, default channel, embed flags, webhook, …)
4. SQLite `event_routes` (this event on/off, optional channel override)
5. SQLite `ignores` (drop this user/channel/role/category)

`TOKEN` is the exception: Discord.js is already logged in. Changing the token requires `npm start` again. Everything else is hot: `/log …` writes SQLite immediately; `.env` is re-read every `HOT_RELOAD_MS` (default 15s) except the live token.

Nothing is logged until you **turn an event or group on**. A fresh guild is silent on purpose.

---

## Feature surface

| Area | What you can do |
| --- | --- |
| Events | 60 English keys in 20 groups — all have a real `client.on` (or a split of `voiceStateUpdate` / `guildMemberUpdate` / `guildAuditLogEntryCreate`) |
| Routing | Default channel + per-event override + per-group enable |
| Locale | `en` `tr` `de` `fr` `es` per guild |
| Timezone | Any IANA id (`Europe/Istanbul`), validated |
| Filters | ignore bots / webhooks / self; ignore list by snowflake |
| Embed | show ids, jump URLs, compact inline fields, footer prefix, color per create/update/delete |
| Delivery | `channel.send` or guild webhook (username/avatar from env) |
| Rate | Per-channel queue, interval between sends |
| History | Capped JSON summaries, `/log history` export |
| Errors | Process log file, optional error channel, optional owner DM, no crash on handler throw |
| Reload | `/log reload` + timer; TOKEN still needs restart |

---

## Full event catalog

Use these **exact keys** with `/log event on key:…` (autocomplete). Groups are `/log group on name:…`.

Color in the embed comes from the catalog (`create` green, `update` yellow, `delete` red, `voice` blurple, `member` pink, `mod` orange, `info` blurple). Override create/update/delete integers on the guild row (`embed_color_*`).

### Group `message`

| Key | Discord source | Embed contains | Notes |
| --- | --- | --- | --- |
| `messageDelete` | `messageDelete` | author, channel, content, attachments, embed count, id, jump | Partial messages are fetched. Long bodies (>1800) attach a `.txt`. Empty content = bot never cached the message. |
| `messageUpdate` | `messageUpdate` | author, channel, before, after, jump | Skipped if content and attachments did not change (embed-only noise). |
| `messageDeleteBulk` | `messageDeleteBulk` | channel, count, up to 40 cached lines | Discord does not send a full archive. |
| `messageReactionAdd` | `messageReactionAdd` | user, emoji, channel, jump | Partial reactions fetched. |
| `messageReactionRemove` | `messageReactionRemove` | same | |
| `messageReactionRemoveAll` | `messageReactionRemoveAll` | channel, jump | |
| `messageReactionRemoveEmoji` | `messageReactionRemoveEmoji` | emoji, channel | |
| `messagePin` | `guildAuditLogEntryCreate` + `MessagePin` | executor, target | Needs View Audit Log. |
| `messageUnpin` | `guildAuditLogEntryCreate` + `MessageUnpin` | executor, target | Same. |
| `messageCreate` | `messageCreate` | author, channel, content, jump | **Default off.** Logs every message the bot can see. `ignore_self` still drops LogYazicam. Use `/log watch` + a dedicated `#chat-mirror` or you will flood the log channel. Customize title with `/log string key:event.messageCreate`. |

### Group `member`

| Key | Source | Embed |
| --- | --- | --- |
| `guildMemberAdd` | `guildMemberAdd` | user, id, account age (`<t:…:R>`), avatar |
| `guildMemberRemove` | `guildMemberRemove` | user; executor/reason if a **kick** audit entry is fresh |
| `guildMemberUpdate` | `guildMemberUpdate` | summary diff (nick/timeout/boost) — also fires alongside the split keys below |
| `guildMemberNickname` | same | before/after nick |
| `guildMemberTimeout` | same | timeout timestamp or off |
| `guildMemberRoles` | same | added roles / removed roles |
| `guildMemberBoost` | same | boost on/off (`premiumSince`) |
| `guildMemberAvatar` | same | server avatar thumbnail |
| `guildMemberPending` | `guildMemberUpdate` when `pending` flips | user, before/after | Membership screening / rules gate. Fires when Discord marks the member as having passed (or failed) the gate. |

`guildMemberTimeout` is also listed under `moderation` in the catalog (same key, one handler). Enabling the `moderation` group turns it on; enabling `member` also turns it on. `/log group on name:member` enables **all** member keys including `guildMemberPending` and `guildMemberUpdate` (the summary event). Turn individual keys off afterward if that is too noisy: `/log event off key:guildMemberUpdate`.

### Group `moderation`

| Key | Source | Embed |
| --- | --- | --- |
| `guildBanAdd` | `guildBanAdd` | user, reason, executor (audit) |
| `guildBanRemove` | `guildBanRemove` | user, executor, reason |
| `guildMemberTimeout` | `guildMemberUpdate` | see above |

### Group `invite`

| Key | Source | Embed |
| --- | --- | --- |
| `inviteCreate` | `inviteCreate` | code, channel, inviter, max uses, expiry |
| `inviteDelete` | `inviteDelete` | code, channel |

Requires `GuildInvites` intent (already requested).

### Group `channel`

| Key | Source | Embed |
| --- | --- | --- |
| `channelCreate` | `channelCreate` | name, mention |
| `channelDelete` | `channelDelete` | name, id |
| `channelUpdate` | `channelUpdate` | name + diff: type, topic, nsfw, bitrate, userLimit, slowmode, parent |
| `channelPinsUpdate` | `channelPinsUpdate` | channel, timestamp |

### Group `thread`

| Key | Source | Embed |
| --- | --- | --- |
| `threadCreate` | `threadCreate` | name, parent |
| `threadDelete` | `threadDelete` | name, id |
| `threadUpdate` | `threadUpdate` | name, archived/locked/autoArchive diff |
| `threadMembersUpdate` | `threadMembersUpdate` | added/removed counts |
| `threadListSync` | `threadListSync` | thread count |
| `threadMemberUpdate` | `threadMemberUpdate` | user id, thread, flags | A single member’s thread metadata changed (notifications, joined flags), not the add/remove burst (`threadMembersUpdate`). |

### Group `role` / `emoji` / `sticker`

Create / delete / update for each. Role update diffs name, color, hoist, mentionable, permission bitfield. Emoji/sticker update diffs names (sticker also description).

### Group `voice` (split from `voiceStateUpdate`)

| Key | When |
| --- | --- |
| `voiceJoin` | `before.channelId` empty, `after.channelId` set |
| `voiceLeave` | opposite |
| `voiceMove` | both set, different |
| `voiceServerMute` | `serverMute` flipped |
| `voiceServerDeafen` | `serverDeaf` flipped |
| `voiceStream` | Go Live / `streaming` flipped |
| `voiceVideo` | camera / `selfVideo` flipped |
| `voiceChannelEffect` | `voiceChannelEffectSend` | user, channel, emoji / animation | Soundboard-style effects sent in a voice channel (hearts, etc.). Separate from `soundboard*` (server sound library). |
| `voiceSelfMute` | `selfMute` flipped | user, from/to, on/off | **Default off.** Client mute is noisy. Enable if you need AFK / “who muted themselves” traces. |
| `voiceSelfDeaf` | `selfDeaf` flipped | same | **Default off.** |
| `voiceSuppress` | `suppress` flipped | user, on/off | Stage channel speaker suppressed / unsuppressed by a moderator. |

`/log group on name:voice` turns **every** voice key on, including self mute/deaf. Prefer `/log event on key:voiceJoin` plus `voiceLeave` / `voiceMove` / `voiceServerMute` if you only want staff-relevant voice.

### Group `stage`

`stageInstanceCreate` / `Delete` / `Update` — topic, channel, privacy on update.

### Group `server`

| Key | Source | Embed |
| --- | --- | --- |
| `guildUpdate` | `guildUpdate` | name, icon, owner, vanity, AFK channel diff |
| `guildBoostLevel` | same, when `premiumTier` changes | old/new tier |
| `guildAvailable` | `guildAvailable` | name | **Default off.** Discord marked the guild as available again after an outage. |
| `guildUnavailable` | `guildUnavailable` | name, id | Outage / bot lost the guild. Worth leaving **on** in a `#ops` channel. |

### Group `webhook` / `integration`

`webhooksUpdate` → `webhookUpdate` (channel). `guildIntegrationsUpdate` → server name only (Discord does not send the integration body on this event).

### Group `event` (scheduled events)

Create / delete / update (name, status). User add/remove (subscriber).

### Group `automod`

Rule create/delete/update. `autoModerationActionExecution` — user, rule id, matched content, channel. Needs AutoMod intents (already in `src/index.js`) and AutoMod enabled in the server.

### Group `command`

| Key | Source | Embed | Notes |
| --- | --- | --- | --- |
| `applicationCommandPermissionsUpdate` | same Discord event | command id, application id | Permission overwrite on a slash command. |
| `commandUse` | `interactionCreate` | user, command/customId, channel, kind (`slash` `button` `select` `modal` `context` `autocomplete`) | **Default off.** Logs **other** apps’ interactions in this guild. Never logs LogYazicam’s own `COMMAND_NAME` (`/log`). Buttons use `customId`. Enable per-channel with `/log event on key:commandUse channel:#mod-commands`. |

### Group `audit`

`guildAuditLogEntryCreate` — **every** audit entry (action, executor, target, reason). This is noisy. Use it as a raw feed or keep it off and rely on the specific events above.

### Group `presence` / `user` (default **off**)

| Key | Why off | Needs |
| --- | --- | --- |
| `presenceUpdate` | Fires constantly | Privileged **Presence** intent in the portal + this key on |
| `userUpdate` | Username/avatar is global; the bot fans out to every shared guild | Member cache |

### Group `poll`

| Key | Source | Embed | Notes |
| --- | --- | --- | --- |
| `messagePollVoteAdd` | `messagePollVoteAdd` | user id, answer text, jump | Someone voted on a native Discord poll. Answer text is whatever Discord still has on the poll object. |
| `messagePollVoteRemove` | `messagePollVoteRemove` | same | Vote retracted. |

`/log group on name:poll` enables both. Needs the bot to see the poll message (same channel access as message logs).

### Group `typing` (default **off**)

| Key | Source | Embed | Notes |
| --- | --- | --- | --- |
| `typingStart` | `typingStart` | user, channel | Fires on every typing indicator. **Do not** point this at the same channel as `messageCreate`. Requires `GuildMessageTyping` (already in `src/index.js`). Customize: `/log event on key:typingStart channel:#typing-debug` and `/log ignore` for bots. |

### Group `soundboard`

| Key | Source | Embed | Notes |
| --- | --- | --- | --- |
| `soundboardCreate` | `guildSoundboardSoundCreate` | name, sound id | A sound was added to the **server** soundboard (not a one-off voice effect). |
| `soundboardDelete` | `guildSoundboardSoundDelete` | name, id | |
| `soundboardUpdate` | `guildSoundboardSoundUpdate` | name + diff (name, emoji) | |

Voice-channel “send effect” is `voiceChannelEffect`, not this group.

### Group `monetization`

Only useful if this **application** has SKUs, entitlements, or server subscriptions. Empty for a normal logging bot — keys still exist so you can turn them on later without a code change.

| Key | Source | Embed |
| --- | --- | --- |
| `entitlementCreate` | `entitlementCreate` | SKU id, user id, entitlement id |
| `entitlementUpdate` | `entitlementUpdate` | SKU + ends timestamp diff |
| `entitlementDelete` | `entitlementDelete` | SKU, user |
| `subscriptionCreate` | `subscriptionCreate` | id, status |
| `subscriptionUpdate` | `subscriptionUpdate` | id, status diff |
| `subscriptionDelete` | `subscriptionDelete` | id |

Guild is resolved from `guildId` on the payload. If Discord omits it, the event is dropped (nothing to route).

### Defaults (on vs off)

**Off until you enable the key or its group:** everything, as before.

**Off even if you enable the parent group’s “noisy extras” by accident** — these catalog rows have `defaultOff: true`. They still turn **on** when you `/log group on` that group (group on = all keys in the group). The `defaultOff` flag is documentation + a reminder in `/log events`; it does **not** keep them off after a group enable. If you run `/log group on name:voice`, also `/log event off key:voiceSelfMute` and `voiceSelfDeaf` unless you want those.

Noisy keys to leave off in production: `messageCreate`, `typingStart`, `presenceUpdate`, `userUpdate`, `commandUse`, `guildAuditLogEntryCreate`, `voiceSelfMute`, `voiceSelfDeaf`, `guildAvailable`.

`/log group` names use **autocomplete** (24 groups). Example split:

```
/log event on key:messageCreate channel:#chat-mirror
/log event on key:commandUse channel:#mod-commands
/log group on name:poll channel:#mod-log
/log event on key:guildUnavailable channel:#ops
```

---

## Discord Developer Portal

1. [Applications](https://discord.com/developers/applications) → New Application → name it (e.g. LogYazicam).
2. **Bot** → Add Bot → Reset Token → paste into `.env` as `TOKEN=`.
3. **Bot → Privileged Gateway Intents**
   - **SERVER MEMBERS INTENT** — on (joins, roles, nicknames).
   - **MESSAGE CONTENT INTENT** — on (deleted/edited bodies).
   - **PRESENCE INTENT** — only if you will enable `presenceUpdate`.
4. **OAuth2 → General** → copy **Application ID** → `CLIENT_ID=`.
5. **OAuth2 → URL Generator** — see next section.
6. Optional: Bot → Public Bot off if this is a private logger.

---

## Invite permissions (not Administrator)

Scopes:

- `bot`
- `applications.commands`

Permissions to tick (names as in the portal):

| Permission | Why |
| --- | --- |
| View Channels | See the guild |
| Send Messages | Log channel |
| Embed Links | Embeds |
| Attach Files | Long delete dumps, `/log history` |
| Read Message History | Partials / jump context |
| View Audit Log | Executor on kick/ban/pin |
| Read Message Content | Already an intent; still need channel access |
| Mention Everyone | **off** unless you use `mention_on_delete` with a role and want that ping to work (the send path still uses `allowedMentions: { parse: [] }` except that optional role) |

Do **not** tick Administrator. Kick/Ban/Manage Roles are **not** required — this bot does not moderate.

Invite URL (replace `CLIENT_ID`). Bitfield `117888` =

`VIEW_CHANNEL` (1024) + `SEND_MESSAGES` (2048) + `EMBED_LINKS` (16384) + `ATTACH_FILES` (32768) + `READ_MESSAGE_HISTORY` (65536) + `VIEW_AUDIT_LOG` (128).

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

The bot’s **role** must be able to see `#mod-log`. If the log channel is private, add the bot role to the overwrite.

---

## Install and first boot

Not on npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam
cp .env.example .env
```

Edit `.env`:

```env
TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_dev_server_id
OWNER_IDS=your_user_id
DEFAULT_LOCALE=en
```

```bash
npm install
npm test
npm run deploy
npm start
```

`npm run deploy` with `GUILD_ID` registers `/log` on that guild in seconds. Without `GUILD_ID` it registers **global** commands (can take up to an hour). Re-run deploy after pulling command changes.

In Discord:

```
/log channel set channel:#mod-log
/log group on name:message
/log group on name:member
/log group on name:moderation
/log test
```

Then delete a message the bot can see. You should get `messageDelete` in `#mod-log` with the KYAL footer.

`better-sqlite3` is a native addon. Use Node **20 or 22 LTS**. Node 24 may fail to find bindings until a prebuild exists (`npm install` without `--ignore-scripts` on a machine with `build-essential`).

---

## Environment reference

All names English. Booleans: `1` `0` `true` `false` `yes` `no` `on` `off`. Guild `/log` overrides the embed/filter defaults per server. Process-level timings (`SEND_INTERVAL_MS`, `HOT_RELOAD_MS`, `MAX_QUEUE_PER_CHANNEL`) stay global until hot-reload re-reads `.env`.

| Variable | Default | Restart? | Meaning |
| --- | --- | --- | --- |
| `TOKEN` | — | **yes** | Bot token. Missing → process exits 1. |
| `CLIENT_ID` | — | deploy only | Application id for slash deploy. |
| `GUILD_ID` | empty | deploy only | Dev guild for instant command register. |
| `OWNER_IDS` | empty | hot | Comma-separated snowflakes that can `/log` without Manage Guild. |
| `DATABASE_PATH` | `./data/logyazicam.sqlite` | process* | SQLite path. *Changing the path after boot needs restart (the file is already open). |
| `DEFAULT_LOCALE` | `en` | hot | Fallback for new guild rows. Invalid values become `en`. |
| `DEFAULT_TIMEZONE` | `UTC` | hot | Fallback IANA tz. |
| `LOG_LEVEL` | `info` | hot | `error` `warn` `info` `debug`. |
| `LOG_FILE` | `./data/process.log` | process* | Append-only process log. |
| `ERROR_CHANNEL_ID` | empty | hot | Text channel for unhandled errors. |
| `ERROR_DM_OWNER` | `false` | hot | DM `OWNER_IDS[0]` on fatal errors. |
| `HOT_RELOAD_MS` | `15000` | process* | `0` disables the timer. Changing the interval needs restart; contents of `.env` do not. |
| `MAX_QUEUE_PER_CHANNEL` | `20` | hot | Oldest dropped if a log channel is slow. |
| `SEND_INTERVAL_MS` | `350` | process* | Flush timer period (set at boot). |
| `AUDIT_MAX_AGE_MS` | `12000` | hot | Ignore older audit entries when attributing executor. |
| `WEBHOOK_NAME` | `LogYazicam` | hot | Webhook username. |
| `WEBHOOK_AVATAR_URL` | empty | hot | Webhook avatar URL. |
| `EMBED_SHOW_IDS` | `true` | hot / guild override | Snowflakes on embeds. |
| `EMBED_SHOW_JUMP` | `true` | hot / guild | Jump URLs. |
| `EMBED_COMPACT` | `false` | hot / guild | Inline fields. |
| `EMBED_FOOTER` | `LogYazicam` | hot / guild | Footer **prefix**; credit always appended. |
| `IGNORE_BOTS` | `true` | hot / guild | Drop `user.bot`. |
| `IGNORE_WEBHOOKS` | `true` | hot / guild | Drop messages with `webhookId`. |
| `IGNORE_SELF` | `true` | hot / guild | Drop the bot’s own id (stops log loops). |
| `STORE_HISTORY` | `true` | hot / guild | Write summary rows. |
| `HISTORY_LIMIT` | `200` | hot / guild | Per-guild cap; oldest trimmed. |
| `DEFAULT_PAUSED` | `false` | hot | New guilds start paused until `/log set`. |
| `DEFAULT_PLAIN_TEXT` | `false` | hot | Flatten embeds by default. |
| `DEFAULT_SHOW_THUMBNAILS` | `true` | hot | Avatars on embeds. |
| `DEFAULT_SHOW_TIMESTAMP` | `true` | hot | Embed timestamp. |
| `DEFAULT_ATTACH_LONG` | `true` | hot | Attach `.txt` when deleted content > 1800 chars. |
| `DEFAULT_QUIET_START` / `DEFAULT_QUIET_END` | empty | hot | Default quiet window `HH:MM`. |
| `DEFAULT_MIN_ACCOUNT_DAYS` | `0` | hot | Skip young accounts. |
| `DEFAULT_COOLDOWN_SEC` | `0` | hot | Per-event-key cooldown. |
| `DEFAULT_ACTORS` | `all` | hot | `all` `humans` `bots`. |
| `WEBHOOK_USERNAME` | `LogYazicam` | hot | Alias of webhook display name. |
| `ACTIVITY_TYPE` | `Watching` | hot | `Playing` `Watching` `Listening` `Competing` `Custom`. |
| `ACTIVITY_TEXT` | `guild logs · /log` | hot | Presence name (128 chars). |
| `ACTIVITY_STATUS` | `online` | hot | `online` `idle` `dnd` `invisible`. |
| `PREFIX_ENABLED` | `true` | hot | Process default; guild `/log set name:prefix_on`. |
| `PREFIX` | `!` | hot | `!log status` — guild can override with `name:prefix`. |
| `SLASH_ENABLED` | `true` | hot | `false` ignores `/log` (prefix still works if on). |
| `DEFAULT_DELIVERY` | `embed` | hot | `embed` (bot message + embed), `plain` (bot message, no embed), `webhook` (requires webhook id/token). |
| `ALLOW_WEBHOOK_FALLBACK` | `true` | hot | If webhook send fails, fall back to `channel.send`. `false` drops the item. |
| `COMMAND_NAME` | `log` | deploy | Slash + prefix verb (`!log` / `/log`). Redeploy after change. |
| `CONFIG_PERMISSION` | `ManageGuild` | hot | Discord permission name; `OWNER_IDS` always bypass. |
| `SLASH_EPHEMERAL` | `true` | hot | Slash replies hidden. Guild: `/log set name:ephemeral`. |
| `SHOW_CREDIT` | `true` | hot | Embed footer credit. Guild: `name:credit`. LICENSE still requires attribution in docs. |
| `EMBED_FIELD_MAX` | `1024` | hot | Field value cap (Discord max 1024). |
| `EMBED_DESC_MAX` | `4000` | hot | Description cap. |
| `EMBED_FOOTER_MAX` | `2048` | hot | Footer cap. |
| `PLAIN_MAX` | `1900` | hot | Plain-text delivery cap. |
| `ERROR_MESSAGE_MAX` | `1900` | hot | Error channel / owner DM cap. |
| `ATTACH_MIN_CHARS` | `1800` | hot | Deleted-content length before `.txt` attach. Guild: not in slash set (env / extra `attachMin`). |
| `AUDIT_FETCH_LIMIT` | `6` | hot | Audit entries fetched when attributing executor. |
| `BULK_LINE_LIMIT` | `40` | hot | Lines in bulk-delete embed. |
| `HISTORY_EXPORT_DEFAULT` | `50` | hot | `/log history` default rows. |
| `COLOR_CREATE` … `COLOR_INFO` | decimal | hot | Default embed colors; `/log color` still overrides per guild. |

\* “process” = the Node timer or file handle was created at boot. Pull a new binary / restart to change those. Guild-level `/log filter` still applies immediately.

---

## Slash command `/log` (complete)

**Permission:** `Manage Guild` **or** user id in `OWNER_IDS`.  
**Context:** guild only.  
**Replies:** ephemeral.  
**Option names:** English everywhere.

### `/log channel`

| Sub | Options | Effect |
| --- | --- | --- |
| `set` | `channel` (text or announcement, required) | Writes `guilds.default_channel`. Events without an override go here. |
| `clear` | — | Nulls default. Events with no override stay silent. |

### `/log event`

| Sub | Options | Effect |
| --- | --- | --- |
| `on` | `key` (required, autocomplete), `channel` (optional) | `event_routes.enabled=1`. Optional `channel_id` override. |
| `off` | `key` | `enabled=0`. |

Autocomplete matches substring of the English key (`del` → `messageDelete`, …), max 25 choices (Discord limit). `/log events` lists all keys if you cannot find one.

Unknown key → `cmd.unknown_event`.

### `/log group`

| Sub | Options | Effect |
| --- | --- | --- |
| `on` | `name` (choice of 20 groups), `channel` optional | Every catalog key in that group enabled; optional shared override channel. |
| `off` | `name` | All keys in the group disabled. |

Groups: `message` `member` `moderation` `invite` `channel` `thread` `role` `emoji` `sticker` `voice` `stage` `server` `webhook` `integration` `event` `automod` `command` `audit` `presence` `user`.

### `/log ignore`

| Sub | Options | Effect |
| --- | --- | --- |
| `add` | `kind`: `user` `channel` `role` `category`, `id`: snowflake | Insert ignore row. |
| `remove` | same | Delete row. |
| `list` | — | Print kind + id. |

`category` matches `channel.parentId`. A ignored role matches if the member’s role cache contains that id (message/member events that pass `roleIds`).

### `/log locale`

`code`: `en` `tr` `de` `fr` `es`. Writes `guilds.locale`. Next embed and the next command reply use that pack (missing keys fall back to English).

### `/log timezone`

`tz`: IANA name (`UTC`, `Europe/Istanbul`, `America/New_York`). Invalid → error, no write. Used by `when()` for human timestamps in embeds that call it.

### `/log filter`

`name` + `value` (boolean). Maps 1:1 to SQLite integers:

| `name` | Column |
| --- | --- |
| `ignore_bots` | `ignore_bots` |
| `ignore_webhooks` | `ignore_webhooks` |
| `ignore_self` | `ignore_self` |
| `embed_show_ids` | `embed_show_ids` |
| `embed_show_jump` | `embed_show_jump` |
| `embed_compact` | `embed_compact` |
| `store_history` | `store_history` |
| `mention_on_delete` | `mention_on_delete` |

### `/log webhook`

`id` + `token` to set `webhook_id` / `webhook_token`. `clear:True` nulls both. Next flush uses `WebhookClient` with `WEBHOOK_NAME` / `WEBHOOK_AVATAR_URL`. Failure → warn + `channel.send` fallback.

### `/log footer`

`text` → `embed_footer`. Displayed as `{footer} · {credit}`. Credit string is `t(locale, "bot.credit")` (`Powered by LogYazicam — KodYazicam` in English).

### `/log status`

Locale, timezone, default channel, `enabled/total` event counts, current queue length, last send error.

### `/log test`

Optional `channel` (else current). Sends `event.test` embed immediately (does not go through event routes). Use this to verify permissions and footer credit.

### `/log history`

`limit` 1–200 (default 50). Attachment `logyazicam-{guildId}.jsonl.txt`. Empty → `cmd.history_empty`.

### `/log reload`

`dispatch.refreshGuild` — re-read SQLite into memory now (does not re-parse `.env`; the timer does that).

### `/log events`

Ephemeral dump of every group and its keys (truncated to 3900 characters if needed).

### `/log languages`

Reloads `src/locales/*.js` from disk and lists codes. Adding `sv.js` does not need a bot restart if `HOT_RELOAD_MS` is on; this command forces a reload now.

### `/log string`

`key` (e.g. `event.messageDelete`) + `value` → `guilds.extra_json.strings`. Per-guild UI override. Placeholders like `{channel}` still work. Does not change English keys in slash options.

### `/log color`

`slot` (`create` `update` `delete` `voice` `member` `mod` `info`) + `hex` `#rrggbb` → `extra_json.colors`. Applies on the next embed.

### `/log mention`

`role:@Staff` sets `mention_role` and `mention_on_delete`. `clear:True` unsets both.

### `/log set`

One command for the remaining guild knobs (`extra_json`). `name` + `value`:

| `name` | `value` | Effect |
| --- | --- | --- |
| `paused` | `true` / `false` | Drop **all** events until resumed |
| `plain_text` | `true` / `false` | Flatten embeds to markdown text |
| `thumbnails` | `true` / `false` | Avatar on embeds |
| `actors` | `all` `humans` `bots` | Who is logged |
| `cooldown_sec` | `0`–`3600` | Min seconds between two logs of the **same event key** |
| `min_account_days` | `0`–`3650` | Skip members whose account is younger |
| `quiet_start` / `quiet_end` | `HH:MM` in guild timezone | Drop events in that window (wraps midnight). `value:clear` unsets |
| `webhook_name` / `webhook_avatar` | string / URL | Per-guild webhook identity |
| `show_timestamp` | `true` / `false` | Embed timestamp |
| `attach_long` | `true` / `false` | `.txt` dump for long deleted messages |
| `delivery` | `embed` `plain` `webhook` | How logs are posted |
| `prefix` | e.g. `!` | Guild prefix for `!log …` |
| `prefix_on` / `slash_on` | `true` / `false` | Enable prefix and/or slash |

Prefix uses the **same** execute path as slash. Examples (prefix `!`):

```
!log status
!log event on key:messageDelete channel:#logs
!log group on name:voice
!log set name:delivery value:plain
!log set name:delivery value:webhook
!log webhook id:123 token:abc
```

Named `key:value` tokens work in any order after the subcommand. Webhook delivery still needs `/log webhook` (or `!log webhook`) credentials; otherwise the bot logs a warning and uses `channel.send` unless `ALLOW_WEBHOOK_FALLBACK=false`.

### `/log watch`

Allow-list. Empty = every channel. `add` / `remove` / `clear` / `list` a text channel or **category**. If a category is listed, its children match.

Quiet hours, pause, allow-list, cooldown, and account age all run **before** the send queue. They apply without restart.

Developer maps: [`src/README.md`](src/README.md) · [`src/locales/README.md`](src/locales/README.md) · [`docs/README.md`](docs/README.md).

---

## Recipes

**One channel for everything**

```
/log channel set channel:#logs
/log group on name:message
/log group on name:member
/log group on name:moderation
/log group on name:channel
/log group on name:role
/log group on name:voice
```

**Split channels**

```
/log channel set channel:#logs-misc
/log group on name:message channel:#logs-messages
/log group on name:voice channel:#logs-voice
/log event on key:guildBanAdd channel:#logs-mod
```

**Ignore a ticket category and a noisy bot**

```
/log ignore add kind:category id:123456789012345678
/log ignore add kind:user id:987654321098765432
```

**Turkish staff, Istanbul time**

```
/log locale code:tr
/log timezone tz:Europe/Istanbul
```

**Webhook (hides the bot as the message author)**

Create a webhook in `#logs` → copy id and token:

```
/log webhook id:123 token:abc
```

**Quiet presence** — leave `presence` and `user` groups off.

**Raw audit feed**

```
/log event on key:guildAuditLogEntryCreate channel:#audit-raw
```

Expect volume.

---

## SQLite schema

File: `DATABASE_PATH` (default `./data/logyazicam.sqlite`). `journal_mode=WAL`, `foreign_keys=ON`. Created on first start.

### `guilds`

| Column | Type | Default | Set by |
| --- | --- | --- | --- |
| `id` | TEXT PK | — | auto on first `/log` or `guildCreate` |
| `locale` | TEXT | `en` | `/log locale` |
| `timezone` | TEXT | `UTC` | `/log timezone` |
| `default_channel` | TEXT | null | `/log channel` |
| `webhook_id` / `webhook_token` | TEXT | null | `/log webhook` |
| `ignore_bots` `ignore_webhooks` `ignore_self` | INTEGER | 1 | `/log filter` / env fallback |
| `embed_show_ids` `embed_show_jump` | INTEGER | 1 | `/log filter` |
| `embed_compact` | INTEGER | 0 | `/log filter` |
| `embed_color_create` `embed_color_update` `embed_color_delete` | INTEGER | null | SQL / `extra` (no slash yet — use a SQLite editor or future `/log` if you add it) |
| `embed_footer` | TEXT | null | `/log footer` |
| `store_history` | INTEGER | 1 | `/log filter` |
| `history_limit` | INTEGER | 200 | env / column |
| `mention_on_delete` | INTEGER | 0 | `/log filter` |
| `mention_role` | TEXT | null | SQL (role snowflake for delete pings) |
| `extra_json` | TEXT | `{}` | bag for forward-compatible flags |
| `updated_at` | INTEGER | 0 | auto |

Unknown keys in `setGuild` are ignored (whitelist in `src/db.js`). That is intentional so a typo cannot become SQL injection.

### `event_routes`

`(guild_id, event_key)` → `enabled` (0/1), `channel_id` (nullable override).

### `ignores`

`(guild_id, kind, target_id)` with `kind` in `user|channel|role|category`.

### `history`

`id`, `guild_id`, `event_key`, `payload` (JSON text: `{ eventKey, channelId, at, summary }`), `created_at`. Index `(guild_id, created_at DESC)`. Trimmed to `history_limit`.

---

## Hot reload

Timer: `setInterval(..., HOT_RELOAD_MS).unref()`.

Each tick:

1. `loadEnvFile()` — disk `.env` then existing `process.env` (already-exported vars still win, same as dotenv).
2. `processConfig` rebuilt; **`TOKEN` copied from the previous object** so a stray `.env` edit cannot swap the logged-in session mid-flight.
3. Every cached guild id is `refreshGuild`’d from SQLite.

`/log` writes SQLite and calls `refreshGuild` immediately — you do not wait for the timer.

`HOT_RELOAD_MS=0` disables the timer. `/log` still hot-applies.

---

## Dispatch pipeline

`dispatcher.enqueue(guild, eventKey, payload)`:

1. Load guild cfg (cache, else SQLite).
2. If `events[eventKey].on` is false → return.
3. Channel = route.channelId || default_channel.
4. Drop if `ignoreSelf` and `payload.userId === client.user.id`.
5. Drop if `ignoreBots` and `payload.bot`.
6. Drop if `ignoreWebhooks` and `payload.webhook`.
7. Drop if `ignored()` matches user / channel / parent category / roles.
8. If `storeHistory`, insert summary (not full message body).
9. Push `{ content, embeds, files, channelId }` onto `queues.get(guildId:channelId)`. If length ≥ `MAX_QUEUE_PER_CHANNEL`, **shift** (drop oldest).

Flush timer (`SEND_INTERVAL_MS`): one item per queue per tick. Webhook first if tokens exist; on throw, log warn and `channel.send`. `allowedMentions: { parse: [] }` unless `mention_on_delete` set content to a role mention for `messageDelete`.

Handler throws never reach `client.login` — `bindEvents` wraps every listener.

---

## Ignores, filters, and loops

Typical loop: log channel is also a place people talk, `messageDelete` is on, bot deletes its own embed → another log. **`ignore_self` default on** stops that. If you use a webhook, also keep `ignore_webhooks` on or ignore the webhook’s channel.

Staff bots: `/log ignore add kind:user id:<botUserId>` or `ignore_bots` true (default).

Private tickets: ignore the ticket **category** id so every child channel is skipped.

---

## Audit log attribution

Used when the gateway payload has no moderator:

- `guildMemberRemove` → `MemberKick` (leave vs kick)
- `guildBanAdd` / `guildBanRemove`
- Pins via `guildAuditLogEntryCreate`

`util.audit(guild, type, targetId, maxAge)`: fetch 6 entries, first match with target id (if any) and `now - created < AUDIT_MAX_AGE_MS`. Missing permission → `null` → embed still posts without executor.

---

## Embeds

`util.buildEmbed(cfg, eventKey, fields, { description, thumbnail, url })`:

- Color from `cfg.colors[catalog.color]`
- Title: `t(locale, "event." + eventKey)`
- Fields: `t(locale, fieldKey)` as name; empty values skipped
- Footer: `{embedFooter} · {bot.credit}` truncated to 2048
- Timestamp: now

Field keys are English in code (`field.author`) and translated for display.

---

## Webhooks vs channel.send

Webhook: looks like a custom app, can use a different avatar, still needs the bot to manage the webhook token (stored in SQLite — treat the DB as secret).

Channel send: uses the bot user. Simpler. Rate limits are per-channel; the queue exists so a burst of deletes does not 429 the process.

---

## History

Not a compliance archive. Rows are `{ eventKey, channelId, at, summary }` e.g. `delete 123456`. Message **bodies are not stored** in SQLite (they were already posted in the embed). Turn `store_history` off if even summaries are too much.

---

## Locales

| Code | File | Coverage |
| --- | --- | --- |
| Code | README | Bot UI pack |
| --- | --- | --- |
| `en` | [README.md](./README.md) | Complete (`src/locales/en.js`) |
| `tr` | [docs/README.tr.md](./docs/README.tr.md) | `src/locales/tr.js` |
| `de` | [docs/README.de.md](./docs/README.de.md) | `src/locales/de.js` |
| `fr` | [docs/README.fr.md](./docs/README.fr.md) | `src/locales/fr.js` |
| `es` | [docs/README.es.md](./docs/README.es.md) | `src/locales/es.js` |
| `pt` | [docs/README.pt.md](./docs/README.pt.md) | `src/locales/pt.js` |
| `it` | [docs/README.it.md](./docs/README.it.md) | `src/locales/it.js` |
| `nl` | [docs/README.nl.md](./docs/README.nl.md) | `src/locales/nl.js` |
| `pl` | [docs/README.pl.md](./docs/README.pl.md) | `src/locales/pl.js` |
| `ru` | [docs/README.ru.md](./docs/README.ru.md) | `src/locales/ru.js` |
| `uk` | [docs/README.uk.md](./docs/README.uk.md) | `src/locales/uk.js` |
| `ar` | [docs/README.ar.md](./docs/README.ar.md) | `src/locales/ar.js` |
| `ja` | [docs/README.ja.md](./docs/README.ja.md) | `src/locales/ja.js` |
| `ko` | [docs/README.ko.md](./docs/README.ko.md) | `src/locales/ko.js` |
| `zh` | [docs/README.zh.md](./docs/README.zh.md) | `src/locales/zh.js` |
| `sv` | [docs/README.sv.md](./docs/README.sv.md) | `src/locales/sv.js` |
| `hi` | [docs/README.hi.md](./docs/README.hi.md) | `src/locales/hi.js` |
| `id` | [docs/README.id.md](./docs/README.id.md) | `src/locales/id.js` |

Missing UI strings fall back to English. `/log locale code:ja` does not require a process restart.

Slash **option names** stay English (`key`, `channel`, `kind`) so `/log` is scriptable across languages.

Add a string: put it in `en.js` first, then override.

---

## Intents and partials

From `src/index.js`:

**Intents:** Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, GuildVoiceStates, GuildInvites, GuildModeration, GuildEmojisAndStickers, GuildWebhooks, GuildScheduledEvents, GuildPresences, AutoModerationConfiguration, AutoModerationExecution.

**Partials:** Message, Channel, Reaction, User, GuildMember, ThreadMember, GuildScheduledEvent.

If the portal has Presence off, `presenceUpdate` never fires regardless of SQLite.

---

## Error handling

| Layer | Behavior |
| --- | --- |
| Event handler | `safe()` → `log.error`, process lives |
| Slash | reply/followUp `Error: {message}`, process lives |
| Webhook send | warn, fallback to channel |
| Logger file | try/catch, never throws |
| `unhandledRejection` / `uncaughtException` | log + optional `ERROR_CHANNEL_ID` + optional owner DM |
| Missing `TOKEN` / failed `login` | exit 1 |

---

## Limits Discord imposes

- Autocomplete max 25 choices — that is why `key` is free text + autocomplete, not a 60-choice list.
- Slash command JSON ~6kB here (under 8kB Discord cap).
- Message content after delete only if cached or partial fetch works.
- Bulk delete list is cache, not REST history.
- Global commands: up to 1 hour to appear.
- Privileged intents must be flipped in the portal, not only in code.

---

## Project layout

```
LogYazicam/
  src/index.js            Client, intents, hot reload, error plumbing
  src/catalog.js          Event keys + groups (source of truth)
  src/config.js           Env parse + mergeGuild
  src/db.js               SQLite
  src/dispatcher.js       Queue + webhook/channel
  src/events.js           client.on for the catalog
  src/format.js           Message/member/ban/voice formatters
  src/commands.js         /log builder + execute + autocomplete
  src/deploy-commands.js  REST put
  src/README.md           Module map (contributors)
  src/locales/            Disk-loaded packs + locales/README.md
  src/logger.js
  src/util.js             embed, audit, ignore, truncate
  tests/README.md
  docs/README.md          Language index + translated operator manuals
  .env.example
  LICENSE                 KYAL-1.0
```

---

## Adding an event

1. Append `{ key, group, color, audit }` to `EVENTS` in `src/catalog.js`.
2. Add `event.yourKey` to `src/locales/en.js` (then other locales).
3. Bind a real Discord event in `src/events.js` (or extend an existing splitter).
4. `npm test` — catalog uniqueness + locale key.
5. `npm run deploy` if you did not use autocomplete-only keys (autocomplete reads the catalog at runtime; no deploy needed for new keys).

Do not add a key without a listener. Tests do not catch missing listeners; the README catalog must match `events.js`.

---

## Tests and CI

```bash
npm test
```

- Unique English keys, every key has `event.*` in `en`
- Locale fallback
- `processConfig` env parsing
- `voiceKind` mapping
- SQLite routes / group enable / ignore / history cap (skipped if `better-sqlite3` has no native build, e.g. Node 24 without compile)

CI: GitHub Actions, Node 22, `npm ci` && `npm test`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/log` missing | Not deployed / wrong app | `CLIENT_ID`, `npm run deploy`, invite with `applications.commands` |
| `/log` in another language | Guild locale | `/log locale` |
| Empty deleted content | Never cached | Message Content intent, bot can see the channel, talk after the bot is online |
| No executor on ban/kick | No audit access or entry too old | View Audit Log; raise `AUDIT_MAX_AGE_MS` |
| Log loop | Logging the log channel | `ignore_self`, ignore that channel, or webhook + `ignore_webhooks` |
| `presenceUpdate` silent | Intent and/or event off | Portal Presence + `/log event on key:presenceUpdate` |
| `better-sqlite3` bindings | Node 24 / no compiler | Node 22, `npm install` **with** scripts |
| Config “not applying” | Looking at TOKEN or waiting on timer | `/log reload`; TOKEN needs restart |
| Slash “unknown event” | Typo | `/log events` or autocomplete |
| Webhook 401 | Rotated token | `/log webhook` again or `clear` |
| Queue drops events | Burst > `MAX_QUEUE_PER_CHANNEL` | Raise it; add a dedicated log channel |

---

## FAQ

**Can I log DMs?** No. This is a guild logger. `interaction.inGuild()` is required for `/log`.

**Can I change embed colors from Discord?** Columns exist (`embed_color_create` as integer RGB). There is no slash for them yet; set via SQLite or a small SQL snippet. `/log filter` covers the boolean embed flags.

**Does `/log group on name:member` enable timeout logs?** Yes. `guildMemberTimeout` is in both `member` and `moderation` groups in the catalog (same key).

**Why English keys?** So config, SQL, and slash options are stable across locales. Staff language is `/log locale`.

**Is it on npm?** No. Clone.

**Can I strip the footer credit?** Not under KYAL-1.0.

---

## License — KYAL-1.0

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

See [LICENSE](./LICENSE). Keep this block in forks and in any public bot documentation.

<p align="center"><sub>Built by <a href="https://github.com/KodYazicam">KodYazicam</a> · Powered by LogYazicam</sub></p>
