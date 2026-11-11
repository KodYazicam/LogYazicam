const DAY_MS = 86400000;
const MAX_DAYS = 3650;

function normalizeDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(Math.floor(days), MAX_DAYS);
}

function cutoffFor(days, now = Date.now()) {
  const normalized = normalizeDays(days);
  return normalized > 0 ? now - normalized * DAY_MS : null;
}

function guildDays(db, guildId, processCfg) {
  const row = db.getGuild.get(guildId);
  const extra = row ? db.extraOf(row) : {};
  if (extra.historyRetentionDays != null && extra.historyRetentionDays !== "") {
    return normalizeDays(extra.historyRetentionDays);
  }
  return normalizeDays(processCfg.historyRetentionDays);
}

function pruneGuild(db, guildId, processCfg, now = Date.now()) {
  const cutoff = cutoffFor(guildDays(db, guildId, processCfg), now);
  if (cutoff == null) return 0;
  return db.pruneHistory(cutoff, guildId);
}

function pruneAll(db, processCfg, now = Date.now()) {
  let deleted = 0;
  for (const row of db.listHistoryGuilds.all()) {
    deleted += pruneGuild(db, row.guild_id, processCfg, now);
  }
  return deleted;
}

module.exports = { DAY_MS, MAX_DAYS, normalizeDays, cutoffFor, guildDays, pruneGuild, pruneAll };
