# `tests/`

No Discord token. Runner: `node --test` (CI and `npm test`).

| File | Asserts |
| --- | --- |
| `catalog.test.js` | Unique English keys; every key has `event.*` in `en`; locale folder matches the expected set; `processConfig` env parsing; `voiceKind` mapping |
| `db.test.js` | Routes, group enable, ignores, history cap. **Skipped** if `better-sqlite3` has no native build (e.g. Node 24 without compile) |

When you add a locale file, update the sorted array in `catalog.test.js`. When you add an event, `en.js` + catalog uniqueness is enough — no new test file required unless the formatter has branches (`voiceKind`).
