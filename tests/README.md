# `tests/`

No Discord token. Runner: `node --test` (CI and `npm test`).

| File | Asserts |
| --- | --- |
| `catalog.test.js` | Unique English keys; every key has `event.*` in `en`; locale folder matches the expected set; `processConfig` env parsing; every `voiceKind` branch including move precedence |
| `db.test.js` | Routes, group enable, ignores, history cap. **Skipped** if `better-sqlite3` has no native build (e.g. Node 24 without compile) |
| `dispatcher.test.js` | Webhook success without a channel fetch, 429 retry and no-duplicate delivery, 500 drop, timeout/network failure, channel fallback, sink mirroring before webhook success, one sink row per retried item, staff-copy webhook bypass, file sink ordering/isolation, and `sent`/`retries`/`dropped` metrics. Uses an injected sender and clock; no real webhook or network calls |
| `docker.test.js` | Compose uses the named `logyazicam-data` volume, the image owns `/app/data` before `USER 10001`, and the README quickstart keeps its start/deploy/logs/backup commands |
| `configTransfer.test.js` | Export omits webhook secrets; import replaces omitted settings, preserves webhooks, remaps channels and roles, skips unknown keys, rejects invalid or oversized payloads before writing, rolls back on a mid-import failure, validates per-event colors, and bounds attachment downloads with an abort signal, content-length precheck, and streamed size cap |
| `dashboard.test.js` | Events are newest-first, filtered by guild, limit-capped, and reduced to summary fields; token auth, non-loopback refusal, HTML without external assets, health, 404, and 405 |
| `retention.test.js` | Days normalization, cutoff boundaries, per-guild overrides, unknown-guild defaults, untouched routes/ignores/snapshots/invites, and config transfer round-trip |
| `redact.test.js` | Each optional flag independently, invite/url coupling, no-flag passthrough, all always-on token shapes, ordinary-text false positives, embed title/description/field redaction without mutation, and `flagsFrom` per-guild overrides |
| `locales.test.js` | Every non-English pack translates config-transfer, validation, and member-join labels, keeps the same placeholder sets as English, and interpolates values |
| `format.test.js` | Member-join embeds label account age separately from channel, and the new labels follow the guild locale |
| `logger.test.js` | `logLevel`/`logFile` and uppercase env keys, hot reconfiguration, level filtering, file output, unknown-level fallback, no-file mode, unusable paths, and circular/BigInt/throwing values |
| `sinks.test.js` | `writeFileSink` returns `false` for blocked/missing destinations instead of throwing |
| `backup.test.js` | `backupTo` creates nested directories and a readable snapshot that includes rows still in WAL; missing destinations reject |
| `config.test.js` | Numeric env normalization (fractions, negatives, colors, ports), in-place hot config updates preserve the live token, guild color merging preserves `0`/black, extra colors win over row colors, per-event colors win over slot colors, and `buildEmbed` uses a black event color |
| `commands.test.js` | Slash default permission uses the supplied `processConfig`, falls back to `ManageGuild` for invalid names, keeps the `process.env` fallback, clamps history limits, enforces the filter allowlist, and stores/clears per-event colors |

When you add a locale file, update the sorted array in `catalog.test.js`. When you add an event, `en.js` + catalog uniqueness is enough — no new test file required unless the formatter has branches (`voiceKind`).
