# Roadmap

Small, shippable steps. Upvote or comment on an issue if you want something moved up.

## Now

- [x] Per-guild routing for 60 Discord gateway events
- [x] SQLite config, filters, quiet hours, and history
- [x] Five fully translated locales (`en`, `tr`, `de`, `fr`, `es`)
- [x] A one-command Docker Compose example in the README
- [x] More tests around the webhook delivery path
- [x] Redaction and voice formatter branch coverage
- [x] Config transfer replies translated in every locale pack
- [x] Config import uses true replace semantics
- [x] Webhook delivery independent of channel fetch
- [x] Optional sink failures isolated from Discord delivery
- [x] Deploy honors `.env` permission settings
- [x] WAL-consistent online SQLite backups
- [x] Logger reconfigures on hot reload
- [x] All command replies translated
- [x] Prefix integer bounds match slash options
- [x] Black embed colors preserved
- [x] Strict hex color validation
- [x] Filter command column allowlist
- [x] Bounded config attachment downloads
- [x] Logger safe value formatting
- [x] Correct, localized member-join labels
- [x] Bounded integer env parsing
- [x] Sinks mirror webhook deliveries exactly once
- [x] Staff copies bypass webhooks
- [x] Hot reload reaches dispatcher/events
- [x] Streamed config downloads are size-capped
- [x] Per-event embed color overrides
- [x] Per-event cooldown overrides
- [x] Quiet-day scheduling

## Next

- [x] Config export/import for migrating between guilds
- [x] A read-only dashboard for recent events
- [ ] More locale coverage for the operator manual

## Later

- [x] Retention policies for history
- [ ] A hosted demo server (read-only)
