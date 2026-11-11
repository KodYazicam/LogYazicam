# `tests/`

No Discord token. Runner: `node --test` (CI and `npm test`).

| File | Asserts |
| --- | --- |
| `catalog.test.js` | Unique English keys; every key has `event.*` in `en`; locale folder matches the expected set; `processConfig` env parsing; every `voiceKind` branch including move precedence |
| `db.test.js` | Routes, group enable, ignores, history cap. **Skipped** if `better-sqlite3` has no native build (e.g. Node 24 without compile) |
| `dispatcher.test.js` | Webhook success, 429 retry and no-duplicate delivery, 500 drop, timeout/network failure, channel fallback, and `sent`/`retries`/`dropped` metrics. Uses an injected sender and clock; no real webhook or network calls |
| `docker.test.js` | Compose uses the named `logyazicam-data` volume, the image owns `/app/data` before `USER 10001`, and the README quickstart keeps its start/deploy/logs/backup commands |
| `configTransfer.test.js` | Export omits webhook secrets; import replaces omitted settings, preserves webhooks, remaps channels and roles, skips unknown keys, rejects invalid or oversized payloads before writing, rolls back on a mid-import failure, and protects attachment downloads |
| `dashboard.test.js` | Events are newest-first, filtered by guild, limit-capped, and reduced to summary fields; token auth, non-loopback refusal, HTML without external assets, health, 404, and 405 |
| `retention.test.js` | Days normalization, cutoff boundaries, per-guild overrides, unknown-guild defaults, untouched routes/ignores/snapshots/invites, and config transfer round-trip |
| `redact.test.js` | Each optional flag independently, invite/url coupling, no-flag passthrough, all always-on token shapes, ordinary-text false positives, embed title/description/field redaction without mutation, and `flagsFrom` per-guild overrides |
| `locales.test.js` | Every non-English pack translates the five config-transfer replies and keeps the same placeholder set as English; interpolation drops no placeholders |

When you add a locale file, update the sorted array in `catalog.test.js`. When you add an event, `en.js` + catalog uniqueness is enough — no new test file required unless the formatter has branches (`voiceKind`).
