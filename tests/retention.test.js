const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const { processConfig, mergeGuild } = require("../src/config");
const { importGuild, FORMAT, VERSION } = require("../src/configTransfer");
const {
  DAY_MS,
  MAX_DAYS,
  normalizeDays,
  cutoffFor,
  guildDays,
  pruneGuild,
  pruneAll,
} = require("../src/retention");

function tempDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-retention-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      fs.rmSync(dir, { recursive: true, force: true });
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
    throw error;
  }
  t.after(() => {
    db.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

function insertHistory(db, guildId, at, eventKey = "messageDelete") {
  db.raw
    .prepare("INSERT INTO history (guild_id, event_key, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(guildId, eventKey, JSON.stringify({ summary: eventKey }), at);
}

function rows(db) {
  return db.raw
    .prepare("SELECT guild_id, created_at FROM history ORDER BY guild_id, created_at")
    .all();
}

test("normalizes invalid and oversized retention values", () => {
  assert.equal(normalizeDays(0), 0);
  assert.equal(normalizeDays(-5), 0);
  assert.equal(normalizeDays("nope"), 0);
  assert.equal(normalizeDays(1.9), 1);
  assert.equal(normalizeDays(MAX_DAYS + 100), MAX_DAYS);
  assert.equal(cutoffFor(0, 1000), null);
  assert.equal(cutoffFor(1, 10 * DAY_MS), 9 * DAY_MS);
});

test("prunes only rows older than the cutoff, with per-guild overrides", (t) => {
  const db = tempDb(t);
  if (!db) return;
  const now = 100 * DAY_MS;

  for (const id of ["A", "B", "C"]) db.ensureGuild(id);
  db.setExtra("A", {});
  db.setExtra("B", { historyRetentionDays: 0 });
  db.setExtra("C", { historyRetentionDays: 7 });

  insertHistory(db, "A", now - 31 * DAY_MS);
  insertHistory(db, "A", now - 30 * DAY_MS);
  insertHistory(db, "B", now - 100 * DAY_MS);
  insertHistory(db, "C", now - 8 * DAY_MS);
  insertHistory(db, "C", now - 6 * DAY_MS);
  insertHistory(db, "C", now - 7 * DAY_MS);

  db.putSnapshot({
    message_id: "m1",
    guild_id: "A",
    channel_id: "c1",
    author_id: "u1",
    author_tag: "u#1",
    content: "keep",
    attachments: "[]",
    created_at: now - 100 * DAY_MS,
  }, 10, 0);
  db.upsertInvite.run("A", "code", 1, "u1");
  db.setRoute("A", "messageDelete", { enabled: true, channelId: "c1" });
  db.addIgnore.run("A", "user", "u1");

  const deleted = pruneAll(db, { historyRetentionDays: 30 }, now);
  assert.equal(deleted, 2);

  const left = rows(db);
  assert.deepEqual(
    left.map((row) => `${row.guild_id}:${Math.round((now - row.created_at) / DAY_MS)}`),
    ["A:30", "B:100", "C:7", "C:6"],
  );

  assert.equal(db.getSnap.get("m1").content, "keep");
  assert.equal(db.listInvites.all("A").length, 1);
  assert.equal(db.listRoutes.all("A").length, 1);
  assert.equal(db.listIgnores.all("A").length, 1);
});

test("per-guild days win, and history for unknown guild rows still uses the global default", (t) => {
  const db = tempDb(t);
  if (!db) return;
  const now = 50 * DAY_MS;
  db.ensureGuild("known");
  db.setExtra("known", { historyRetentionDays: 3 });

  insertHistory(db, "known", now - 4 * DAY_MS);
  insertHistory(db, "known", now - 2 * DAY_MS);
  insertHistory(db, "history-only", now - 40 * DAY_MS);
  insertHistory(db, "history-only", now - 1 * DAY_MS);

  assert.equal(guildDays(db, "known", { historyRetentionDays: 90 }), 3);
  assert.equal(guildDays(db, "history-only", { historyRetentionDays: 90 }), 90);

  const deleted = pruneAll(db, { historyRetentionDays: 10 }, now);
  assert.equal(deleted, 2);

  assert.deepEqual(
    rows(db).map((row) => `${row.guild_id}:${Math.round((now - row.created_at) / DAY_MS)}`),
    ["history-only:1", "known:2"],
  );
});

test("pruneGuild returns zero when the guild keeps history forever", (t) => {
  const db = tempDb(t);
  if (!db) return;
  db.ensureGuild("forever");
  db.setExtra("forever", { historyRetentionDays: 0 });
  insertHistory(db, "forever", 0);

  assert.equal(pruneGuild(db, "forever", { historyRetentionDays: 1 }, 10 * DAY_MS), 0);
  assert.equal(db.historyCount(), 1);
});

test("config parsing and export/import preserve historyRetentionDays", (t) => {
  const cfg = processConfig({ HISTORY_RETENTION_DAYS: "30", HISTORY_PRUNE_MS: "0" });
  assert.equal(cfg.historyRetentionDays, 30);
  assert.equal(cfg.historyPruneMs, 0);

  const db = tempDb(t);
  if (!db) return;
  importGuild(db, "D", {
    format: FORMAT,
    version: VERSION,
    guild: {},
    routes: [],
    ignores: [],
    extra: { historyRetentionDays: 14 },
  });

  const row = db.getGuild.get("D");
  assert.equal(db.extraOf(row).historyRetentionDays, 14);
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));
  assert.equal(merged.historyRetentionDays, 14);
});
