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

### Fixed

- Webhook send failures now reach the retry/drop path when
  `ALLOW_WEBHOOK_FALLBACK=false` instead of being counted as sent. A 429 is
  retried; other failures increment `metrics.dropped`.
- The Docker image now creates `/app/data` with UID `10001` ownership before
  dropping privileges.

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

### Security

- Overrode `minimatch` to `^11.0.5` for the dev-only `nodemon` dependency,
  clearing the GHSA-g3hv-75wg-m249 advisory.

## [1.0.0] - 2026-09-13

### Added

- Per-guild Discord logging bot with SQLite configuration.
- 60 event keys across 20 groups.
- Filters, quiet hours, watch lists, history, webhook delivery, and prefix commands.
- Operator manuals in 19 languages.
