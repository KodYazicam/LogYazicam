# Contributing to LogYazicam

```bash
npm install
npm test
```

Read these before changing code:

- [`src/README.md`](src/README.md) — module map, event pipeline, `extra_json`
- [`src/locales/README.md`](src/locales/README.md) — how to add a language pack
- [`tests/README.md`](tests/README.md) — what CI actually runs
- [`docs/README.md`](docs/README.md) — translated operator manuals

Rules:

- Event keys are English identifiers in `src/catalog.js`. Locale strings go in `src/locales/en.js` first.
- Do not log an event Discord does not emit. No stub handlers.
- Config changes must work without a process restart (except `TOKEN`).
- Keep KYAL-1.0 attribution in LICENSE, README, and embed footers (`bot.credit`).
