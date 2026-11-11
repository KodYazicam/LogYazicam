# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Relicensed from KYAL-1.0 to Apache-2.0.
- Added issue templates, pull request template, roadmap, Dependabot, and code of conduct.
- Clarified that the embed footer credit is optional.
- Docker Compose now stores data in the named `logyazicam-data` volume instead
  of a host bind mount, so a non-root container can write SQLite on a fresh
  host.
- `PRESENCE_INTENT` is now opt-in (`false` by default). Presence logging needs
  both the env flag and the privileged intent in the Developer Portal, so a
  missing portal toggle can no longer block gateway login.
- Message snapshots are now opt-in (`SNAPSHOT_ENABLED=false` by default)
  because they store message text at rest.
- Docker Compose mounts `.env` read-only and sets `ENV_FILE_WINS=true`, so
  `HOT_RELOAD_MS` sees host edits instead of the frozen `env_file` values. A
  `.dockerignore` keeps `.env`, data, and build output out of the image context.

### Fixed

- Webhook send failures now reach the retry/drop path when
  `ALLOW_WEBHOOK_FALLBACK=false` instead of being counted as sent. A 429 is
  retried; other failures increment `metrics.dropped`.
- A 429 no longer blocks the send loop while waiting: the item stores a
  `retryAt` timestamp, other channels continue, and `RETRY_MAX` (default `5`)
  bounds attempts before the item is dropped. Overlapping ticks cannot deliver
  the same item twice.
- The Docker image now creates `/app/data` with UID `10001` ownership before
  dropping privileges.
- `/log set` now uses one allowlist for slash and prefix names, rejects unknown
  keys, and validates numeric ranges instead of silently writing arbitrary
  `extra_json` values. Prefix aliases such as `plain_text` and `quiet_start`
  now reach the same settings as their slash choices.
- Prefix `key:value` options now parse before or after the subcommand, so
  `!log set name:delivery value:plain` and `!log event on key:messageDelete`
  both work.
- Role ignores now use the member cache when an event payload does not carry
  `roleIds`, covering member events without formatter-specific plumbing.
- A per-event `embed`/`plain` delivery override now forces `channel.send` even
  when the guild has webhook credentials; `webhook` still opts into the hook.
- Unknown `/log pack` names and invalid `/log locale` codes now report
  `Invalid option` instead of the misleading `Unknown event` text.
- `metrics.sent` only increments after real delivery. Missing channels and
  queue overflow increment `metrics.dropped` instead.
- Actor filters (`humans`/`bots`) no longer drop events that have no actor
  field, such as channel or role changes.
- `/log group on name:member` now also enables `guildMemberTimeout`, matching
  the README.
- `SIGTERM`/`SIGINT` now close the dashboard, gateway client, and SQLite handle
  before exit. An `uncaughtException` is reported and then exits with code 1
  instead of leaving the process in an unknown state.

### Added

- Regression tests for webhook delivery: success, 429 retry (no duplicate
  delivery), 500 and timeout drops, channel fallback, and delivery metrics.
  `createDispatcher` accepts an optional `deps` object for the webhook client,
  sleep, and interval, so tests never open a network connection.
- README quickstart for running the bot with Docker Compose, deploying slash
  commands in the container, reading logs, and backing up the data volume.
- `tests/docker.test.js` guards the named volume, `/app/data` ownership, and
  the quickstart commands without requiring a Docker daemon.
- `/log export` and `/log import` for moving guild settings, routes, ignores,
  and `extra_json` between guilds. Webhook credentials are never exported or
  overwritten, unknown keys are skipped and reported, and imports are
  validated and applied in one SQLite transaction.
- Optional read-only dashboard (`DASHBOARD_ENABLED`) for recent history rows,
  with loopback-by-default binding, bearer-token auth for non-loopback hosts,
  no external assets, and no write routes.
- History retention: global `HISTORY_RETENTION_DAYS` / `HISTORY_PRUNE_MS` and
  a per-guild `history_days` override. Only `history` rows are pruned.
- Branch coverage for redaction (all optional and always-on patterns, embed
  fields, per-guild overrides) and every `voiceKind` transition.
- Formatter and pack coverage for message delete/update/bulk, partial fetches,
  stored snapshots, moderation audit context, voice state labels, named
  create/delete/update payloads, and `applyPack`; `format.js` line coverage is
  now 100%.
- Gateway binding coverage with a fake Discord client: every listener is
  registered, all event families dispatch their catalog keys, derived member
  events are asserted individually, and snapshot/self/snapshot-off guards are
  exercised. The `safe()` wrapper now returns its handler promise so callers
  can await completion; `events.js` line coverage is 98.5%.
- Prefix adapter and sink coverage: owner/permission checks, boolean and
  positional option parsing, channel/role cache fallbacks, reply payloads,
  successful JSONL writes, and local HTTP POST headers/body; `prefix.js` and
  `sinks.js` now have 100% line coverage.
- Core command-handler coverage: denial/owner access, status metrics,
  channel/group/event routing, ignore lists, locale/timezone validation,
  filter/webhook/footer, test/pack/setup, fields/string/color/mention,
  history CSV/JSONL, config export/import validation, watch/events, and
  autocomplete; `commands.js` line coverage is now about 97%.
- Command edge coverage: invalid per-event cooldown/digest/actor/watch values,
  empty override cleanup, set aliases, watch removal/default fallthrough, and
  import read/database failures; `commands.js` line coverage is now 99.9%.
- Fallback-path coverage for utility formatting, logger append failures,
  malformed dashboard payloads, invalid dashboard ports, and HTTP sink
  connection errors; `util.js`, `logger.js`, and `sinks.js` now have 100%
  line coverage.
- Per-event embed color overrides via `/log event color`, stored in
  `extra_json.eventColors` and validated during config import. A black override
  is preserved; clearing it restores the semantic slot color.
- Per-event cooldown overrides via `/log event cooldown`, stored in
  `extra_json.eventCooldown`. `0` disables the cooldown for one event while
  other events keep the guild default.
- Per-event digest overrides via `/log event digest`, stored in
  `extra_json.eventDigest`. `ms:0` disables digesting for one event; an
  optional `min` overrides the minimum count.
- Per-event actor overrides via `/log event actors`, stored in
  `extra_json.eventActors`. One event can log only humans or only bots while
  the guild keeps its default.
- Per-event quiet-hours bypass via `/log event bypass`, stored in
  `extra_json.quietBypass`. Selected events still log during quiet hours;
  pause and the other filters still apply.
- Per-event channel allow-lists via `/log event watch`, stored in
  `extra_json.eventIncludeChannels`. One event can watch a dedicated channel or
  category while the rest of the guild keeps its normal allow-list; `clear`
  restores the guild list.
- Per-event delivery modes via `/log event delivery`, stored in
  `extra_json.eventDelivery`. One event can stay an embed while the guild uses
  plain text, flatten only that event, or prefer the webhook for it; `default`
  restores guild behavior.
- Per-event history toggles via `/log event history`, stored in
  `extra_json.eventHistory`. `on` keeps one event in history when guild
  `store_history` is off, `off` skips a noisy event while the rest keep the
  guild setting, and `default` removes the override.
- Per-event redaction overrides via `/log event redact`, stored in
  `extra_json.eventRedact`. One event can strip URLs, mentions, emails, or
  invites while the guild keeps its default, or keep a field the guild
  redacts. Always-on secret-token patterns cannot be disabled.
- Optional quiet-day scheduling via `/log set name:quiet_days value:mon,tue`.
  The existing quiet window can now apply only on selected local weekdays;
  `all` or `clear` restores every-day behavior.
- Dashboard event/time filters: `/api/events` accepts validated `event` and
  `since` parameters, and the page exposes event-key and recency controls.
- `/log event reset` clears color, cooldown, digest, actor, quiet-bypass,
  channel allow-list, delivery, history, and redaction overrides for one event
  without touching its route, channel, or guild defaults.
- All 18 locale packs now translate the `/log export` and `/log import` replies;
  a placeholder-consistency test keeps future additions honest.
- `/log import` now resets every importable setting to `null` before applying
  the file, so omitted settings fall back to env defaults instead of the target
  guild's old values. Missing `mention_role` ids are cleared and counted.
- The logger now reads `logLevel`/`logFile` from `processConfig` (while keeping
  uppercase env support), so `LOG_LEVEL` and `LOG_FILE` take effect. An
  unusable log path no longer blocks startup.
- Webhook delivery no longer fetches the route channel first, so a transient
  channel lookup failure cannot drop an event that the webhook could send.
  File/HTTP sinks also run before the Discord channel lookup.
- File/HTTP sink failures are isolated: an unwritable `FILE_SINK_DIR` no longer
  drops Discord delivery, and a failed backup path no longer throws on every
  interval.
- `npm run deploy` now applies `CONFIG_PERMISSION` from `.env` instead of the
  unset `process.env` value, so slash defaults match the configured runtime
  permission.
- SQLite backups now use better-sqlite3's online backup API, so WAL contents
  are included and a running bot produces a consistent snapshot. Overlapping
  intervals are skipped and failures are logged.
- Hot reload now reconfigures the logger, so `LOG_LEVEL` and `LOG_FILE` changes
  apply without a restart.
- Remaining hardcoded command replies (guild-only, invalid timezone, invalid hex,
  and generic errors) are translated in all 18 locale packs.
- Prefix integer options reject fractional/infinite/empty values, and history
  exports are clamped to the same 1–500 bounds as the slash command.
- Black (`0x000000`) embed colors are preserved instead of falling back to the
  default color.
- `/log color` now requires exactly six hex digits (with optional `#`) and
  rejects out-of-range or malformed values.
- `/log filter` now enforces the boolean-filter allowlist, so a prefix call
  cannot overwrite webhook credentials or other guild columns.
- `/log import` attachment downloads now have a 10-second abort timeout instead
  of hanging until the interaction expires.
- The logger safely formats circular, BigInt, and throwing values instead of
  letting a formatting error escape the log call.
- Member-join embeds now label account age as **Account created** instead of
  reusing the channel field, and the vanity/unknown invite fallbacks are
  translated in every locale pack.
- Numeric environment settings are now parsed as bounded integers, so
  fractional or negative limits cannot reach SQLite `LIMIT` clauses, queue
  checks, or embed colors.
- File/HTTP sinks now run before webhook delivery and only once per event, so a
  configured webhook no longer disables sink mirroring and a 429 retry no
  longer writes duplicate sink rows.
- Staff-channel copies now always use `channel.send`, even when the guild has a
  webhook configured, matching the documented staff-channel behavior.
- Hot reload now updates the shared process-config object in place, so the
  dispatcher and event handlers see changed queue, webhook, audit, and default
  settings instead of keeping the startup snapshot.
- `/log import` now rejects oversized `content-length` responses and stops
  streamed bodies at the 1 MiB cap instead of buffering the whole download.

### Security

- Overrode `minimatch` to `^11.0.5` for the dev-only `nodemon` dependency,
  clearing the GHSA-g3hv-75wg-m249 advisory.

## [1.0.0] - 2026-09-13

### Added

- Per-guild Discord logging bot with SQLite configuration.
- 60 event keys across 20 groups.
- Filters, quiet hours, watch lists, history, webhook delivery, and prefix commands.
- Operator manuals in 19 languages.
