# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Relicensed from KYAL-1.0 to Apache-2.0.
- Added issue templates, pull request template, roadmap, Dependabot, and code of conduct.
- Clarified that the embed footer credit is optional.

### Security

- Overrode `minimatch` to `^11.0.5` for the dev-only `nodemon` dependency,
  clearing the GHSA-g3hv-75wg-m249 advisory.

## [1.0.0] - 2026-09-13

### Added

- Per-guild Discord logging bot with SQLite configuration.
- 60 event keys across 20 groups.
- Filters, quiet hours, watch lists, history, webhook delivery, and prefix commands.
- Operator manuals in 19 languages.
