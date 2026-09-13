# Contributing to LogYazicam

```bash
npm install
npm test
```

- Event keys are English identifiers in `src/catalog.js`. Add locale strings in `src/locales/en.js` first.
- Do not log an event Discord does not emit. No stub handlers.
- Config changes must work without a process restart (except `TOKEN`).
- Keep KYAL-1.0 attribution in LICENSE, README, and embed footers.
