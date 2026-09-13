const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { EVENTS } = require("./catalog");

function openDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      locale TEXT DEFAULT 'en',
      timezone TEXT DEFAULT 'UTC',
      default_channel TEXT,
      webhook_id TEXT,
      webhook_token TEXT,
      ignore_bots INTEGER DEFAULT 1,
      ignore_webhooks INTEGER DEFAULT 1,
      ignore_self INTEGER DEFAULT 1,
      embed_show_ids INTEGER DEFAULT 1,
      embed_show_jump INTEGER DEFAULT 1,
      embed_compact INTEGER DEFAULT 0,
      embed_color_create INTEGER,
      embed_color_update INTEGER,
      embed_color_delete INTEGER,
      embed_footer TEXT,
      store_history INTEGER DEFAULT 1,
      history_limit INTEGER DEFAULT 200,
      mention_on_delete INTEGER DEFAULT 0,
      mention_role TEXT,
      extra_json TEXT DEFAULT '{}',
      updated_at INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS event_routes (
      guild_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      channel_id TEXT,
      PRIMARY KEY (guild_id, event_key)
    );
    CREATE TABLE IF NOT EXISTS ignores (
      guild_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, kind, target_id)
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS history_guild_time ON history (guild_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS snapshots (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      author_id TEXT,
      author_tag TEXT,
      content TEXT,
      attachments TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS snapshots_guild ON snapshots (guild_id, created_at);
    CREATE TABLE IF NOT EXISTS invites (
      guild_id TEXT NOT NULL,
      code TEXT NOT NULL,
      uses INTEGER DEFAULT 0,
      inviter_id TEXT,
      PRIMARY KEY (guild_id, code)
    );
  `);

  const ensureGuild = db.prepare(`
    INSERT INTO guilds (id, updated_at) VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const getGuild = db.prepare("SELECT * FROM guilds WHERE id = ?");
  const listGuilds = db.prepare("SELECT id FROM guilds");
  const GUILD_COLUMNS = new Set([
    "locale", "timezone", "default_channel", "webhook_id", "webhook_token",
    "ignore_bots", "ignore_webhooks", "ignore_self", "embed_show_ids",
    "embed_show_jump", "embed_compact", "embed_color_create", "embed_color_update",
    "embed_color_delete", "embed_footer", "store_history", "history_limit",
    "mention_on_delete", "mention_role", "extra_json",
  ]);

  function setGuild(id, patch) {
    ensureGuild.run(id, Date.now());
    const keys = Object.keys(patch).filter((k) => GUILD_COLUMNS.has(k));
    if (!keys.length) return getGuild.get(id);
    const sql = `UPDATE guilds SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`;
    db.prepare(sql).run(...keys.map((k) => patch[k]), Date.now(), id);
    return getGuild.get(id);
  }

  function extraOf(row) {
    try {
      return JSON.parse(row.extra_json || "{}");
    } catch {
      return {};
    }
  }

  function setExtra(id, extra) {
    return setGuild(id, { extra_json: JSON.stringify(extra) });
  }

  const getRoute = db.prepare("SELECT * FROM event_routes WHERE guild_id = ? AND event_key = ?");
  const listRoutes = db.prepare("SELECT * FROM event_routes WHERE guild_id = ?");
  const upsertRoute = db.prepare(`
    INSERT INTO event_routes (guild_id, event_key, enabled, channel_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, event_key) DO UPDATE SET enabled = excluded.enabled, channel_id = excluded.channel_id
  `);

  function setRoute(guildId, eventKey, { enabled, channelId }) {
    const current = getRoute.get(guildId, eventKey);
    upsertRoute.run(
      guildId,
      eventKey,
      enabled == null ? (current?.enabled ?? 0) : enabled ? 1 : 0,
      channelId === undefined ? current?.channel_id ?? null : channelId,
    );
    return getRoute.get(guildId, eventKey);
  }

  function setGroup(guildId, group, { enabled, channelId }) {
    const tx = db.transaction(() => {
      for (const event of EVENTS.filter((e) => e.group === group)) {
        setRoute(guildId, event.key, { enabled, channelId });
      }
    });
    tx();
  }

  const addIgnore = db.prepare("INSERT OR IGNORE INTO ignores (guild_id, kind, target_id) VALUES (?, ?, ?)");
  const removeIgnore = db.prepare("DELETE FROM ignores WHERE guild_id = ? AND kind = ? AND target_id = ?");
  const listIgnores = db.prepare("SELECT * FROM ignores WHERE guild_id = ?");

  const insertHistory = db.prepare("INSERT INTO history (guild_id, event_key, payload, created_at) VALUES (?, ?, ?, ?)");
  const listHistory = db.prepare("SELECT * FROM history WHERE guild_id = ? ORDER BY id DESC LIMIT ?");
  const trimHistory = db.prepare(`
    DELETE FROM history WHERE guild_id = ? AND id NOT IN (
      SELECT id FROM history WHERE guild_id = ? ORDER BY id DESC LIMIT ?
    )
  `);

  function pushHistory(guildId, eventKey, payload, limit) {
    insertHistory.run(guildId, eventKey, JSON.stringify(payload), Date.now());
    const cap = Number(limit) || 200;
    trimHistory.run(guildId, guildId, cap);
  }

  const upsertSnap = db.prepare(`
    INSERT INTO snapshots (message_id, guild_id, channel_id, author_id, author_tag, content, attachments, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET content = excluded.content, attachments = excluded.attachments
  `);
  const getSnap = db.prepare("SELECT * FROM snapshots WHERE message_id = ?");
  const trimSnap = db.prepare(`
    DELETE FROM snapshots WHERE guild_id = ? AND message_id NOT IN (
      SELECT message_id FROM snapshots WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?
    )
  `);
  const expireSnap = db.prepare("DELETE FROM snapshots WHERE created_at < ?");
  function putSnapshot(row, limit, ttlMs) {
    upsertSnap.run(row.message_id, row.guild_id, row.channel_id, row.author_id, row.author_tag, row.content, row.attachments, row.created_at);
    trimSnap.run(row.guild_id, row.guild_id, limit || 2000);
    if (ttlMs > 0) expireSnap.run(Date.now() - ttlMs);
  }

  const queryHistory = db.prepare(`
    SELECT * FROM history WHERE guild_id = ?
      AND created_at >= ? AND created_at <= ?
      AND (? = '' OR event_key = ?)
    ORDER BY id DESC LIMIT ?
  `);

  const upsertInvite = db.prepare(`
    INSERT INTO invites (guild_id, code, uses, inviter_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, code) DO UPDATE SET uses = excluded.uses, inviter_id = excluded.inviter_id
  `);
  const listInvites = db.prepare("SELECT * FROM invites WHERE guild_id = ?");
  const deleteInvite = db.prepare("DELETE FROM invites WHERE guild_id = ? AND code = ?");

  return {
    raw: db,
    ensureGuild: (id) => {
      ensureGuild.run(id, Date.now());
      return getGuild.get(id);
    },
    getGuild,
    listGuilds,
    setGuild,
    extraOf,
    setExtra,
    getRoute,
    listRoutes,
    setRoute,
    setGroup,
    addIgnore,
    removeIgnore,
    listIgnores,
    pushHistory,
    listHistory,
    queryHistory,
    putSnapshot,
    getSnap,
    upsertInvite,
    listInvites,
    deleteInvite,
  };
}

module.exports = { openDb };
