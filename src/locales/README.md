# `src/locales/` — bot UI strings

User-facing **command replies and embed titles** live here.  
Human READMEs for operators live in [`docs/`](../../docs/README.md) (`docs/README.tr.md`, …). Do not mix the two.

Slash **option names** and event **keys** are always English (`key`, `channel`, `messageDelete`). Only the *values* of titles/replies are translated.

## Canonical pack

`en.js` is complete. Every `event.<catalogKey>`, `cmd.*`, and `field.*` must exist there first. Other files:

```js
const en = require("./en");
module.exports = { ...en, "cmd.denied": "…" };
```

Missing keys fall back to English inside `t()`.

## How packs load

`index.js` **reads the directory**. Any `xx.js` besides `index.js` becomes locale `xx`. You do **not** edit a hardcoded list when adding a language.

`reloadLocales()` runs on the hot-reload timer and on `/log languages`. Drop a file in, wait `HOT_RELOAD_MS` (or `/log languages`), then `/log locale code:xx` (autocomplete lists disk files). Discord’s 25-choice slash limit does not cap how many locale files you can ship — locale uses **autocomplete**, not `addChoices`.

`DEFAULT_LOCALE` in `.env` must match a filename (`tr`, `ja`, …) or it becomes `en`.

## Adding a language

1. Copy `en.js` → `xx.js`, override the strings staff will see.
2. Optional: `docs/README.xx.md` + link in the language bar of [../../README.md](../../README.md) and [../../docs/README.md](../../docs/README.md).
3. `npm test` — `LOCALES` is derived from the folder; the test asserts the known set (update the test array when you add a code).
4. No `npm run deploy` required (autocomplete is runtime).

`xx` should be a short BCP-47-ish id (`pt`, `zh`, `pt-BR` is fine as `pt-BR.js` if you want a variant).

## Guild overrides

`/log string key:event.messageDelete value:…` writes `guilds.extra_json.strings`. That wins over the pack for **that guild only**. Credit key `bot.credit` can be rephrased but KYAL still requires visible KodYazicam credit in README/LICENSE; do not use this to hide attribution in public forks’ documentation.

Placeholders: `{key}`, `{channel}`, `{locale}`, … — same names as in `en.js`.

## Placeholders used in `en.js`

| Token | Typical use |
| --- | --- |
| `{tag}` `{guilds}` | ready line |
| `{key}` `{channel}` `{group}` | command confirmations |
| `{locale}` `{tz}` | locale / timezone |
| `{kind}` `{id}` | ignores |
| `{name}` `{value}` | filters / string set |
| `{count}` `{list}` | ignore list / export |
| `{enabled}` `{total}` `{queue}` `{error}` | status |

## Do not

- Translate event **keys** in `catalog.js`.
- Put markdown docs in this folder.
- Ship a pack that omits `bot.credit` without a fallback (English still injects it if you spread `...en`).
