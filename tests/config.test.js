const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const { processConfig, applyConfig, mergeGuild } = require("../src/config");
const { COLORS } = require("../src/catalog");
const { buildEmbed } = require("../src/util");

function withDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-config-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
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

test("processConfig truncates and bounds numeric environment values", () => {
  const cfg = processConfig({
    HISTORY_LIMIT: "2.9",
    MAX_QUEUE_PER_CHANNEL: "-4",
    SEND_INTERVAL_MS: "0",
    EMBED_FIELD_MAX: "1024.8",
    EMBED_FOOTER_MAX: "-1",
    DIGEST_MS: "-5000",
    DASHBOARD_PORT: "70000",
    DASHBOARD_LIMIT: "12.7",
    COLOR_CREATE: "-1",
    COLOR_UPDATE: "16777216",
    COLOR_DELETE: "0",
    COLOR_INFO: "16777215",
  });

  assert.equal(cfg.historyLimit, 2);
  assert.equal(cfg.maxQueue, 20);
  assert.equal(cfg.sendIntervalMs, 350);
  assert.equal(cfg.fieldMax, 1024);
  assert.equal(cfg.footerMax, 2048);
  assert.equal(cfg.digestMs, 0);
  assert.equal(cfg.dashboardPort, 8787);
  assert.equal(cfg.dashboardLimit, 12);
  assert.equal(cfg.colors.create, COLORS.create);
  assert.equal(cfg.colors.update, COLORS.update);
  assert.equal(cfg.colors.delete, 0);
  assert.equal(cfg.colors.info, 0xffffff);
});

test("processConfig keeps zero for values that disable features", () => {
  const cfg = processConfig({
    HISTORY_RETENTION_DAYS: "0",
    BACKUP_MS: "0",
    SNAPSHOT_TTL_MS: "0",
    DASHBOARD_PORT: "0",
  });

  assert.equal(cfg.historyRetentionDays, 0);
  assert.equal(cfg.backupMs, 0);
  assert.equal(cfg.snapshotTtlMs, 0);
  assert.equal(cfg.dashboardPort, 0);
});

test("applyConfig updates the captured object and preserves the live token", () => {
  const current = processConfig({
    TOKEN: "live-token",
    LOG_LEVEL: "info",
    MAX_QUEUE_PER_CHANNEL: "20",
    WEBHOOK_NAME: "old-hook",
  });

  const same = applyConfig(current, {
    TOKEN: "replacement-token",
    LOG_LEVEL: "debug",
    MAX_QUEUE_PER_CHANNEL: "5",
    WEBHOOK_NAME: "new-hook",
  });

  assert.equal(same, current);
  assert.equal(current.token, "live-token");
  assert.equal(current.logLevel, "debug");
  assert.equal(current.maxQueue, 5);
  assert.equal(current.webhookName, "new-hook");
});

test("mergeGuild preserves black row and extra colors", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("g1", {
    embed_color_create: 0,
    embed_color_update: 0,
    embed_color_delete: 0,
  });
  db.setExtra("g1", {
    colors: { create: 0, voice: 0, member: 0, mod: 0, info: 0 },
  });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.equal(merged.colors.create, 0);
  assert.equal(merged.colors.update, 0);
  assert.equal(merged.colors.delete, 0);
  assert.equal(merged.colors.voice, 0);
  assert.equal(merged.colors.member, 0);
  assert.equal(merged.colors.mod, 0);
  assert.equal(merged.colors.info, 0);
});

test("non-zero extra colors still override row colors", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("g1", { embed_color_delete: 0x654321 });
  db.setExtra("g1", { colors: { delete: 0x123456 } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.equal(merged.colors.delete, 0x123456);
});

test("buildEmbed uses a black event color instead of the info fallback", () => {
  const embed = buildEmbed(
    {
      id: "g1",
      locale: "en",
      colors: { create: 0xffffff, update: 0xffffff, delete: 0, voice: 0xffffff, member: 0xffffff, mod: 0xffffff, info: 0xffffff },
      showTimestamp: false,
      showCredit: false,
      extra: {},
      embedCompact: false,
      hiddenFields: {},
    },
    "messageDelete",
    [],
  );

  assert.equal(embed.data.color, 0);
});

test("mergeGuild keeps per-event color overrides", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventColors: { messageDelete: 0x000000, guildBanAdd: 0x123456 } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventColors, { messageDelete: 0x000000, guildBanAdd: 0x123456 });
});

test("mergeGuild keeps per-event cooldown overrides", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventCooldown: { messageDelete: 0, guildBanAdd: 60 } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventCooldown, { messageDelete: 0, guildBanAdd: 60 });
});

test("mergeGuild keeps quiet-day schedules", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { quietDays: ["mon", "thu"] });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.quietDays, ["mon", "thu"]);
});

test("mergeGuild keeps per-event digest overrides", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventDigest: { messageDelete: { ms: 0 }, guildBanAdd: { ms: 5000, min: 2 } } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventDigest, {
    messageDelete: { ms: 0 },
    guildBanAdd: { ms: 5000, min: 2 },
  });
});

test("mergeGuild keeps per-event actor modes", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventActors: { messageDelete: "humans", guildBanAdd: "bots" } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventActors, { messageDelete: "humans", guildBanAdd: "bots" });
});

test("mergeGuild keeps quiet-hours bypasses", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { quietBypass: { guildBanAdd: true, channelDelete: true } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.quietBypass, { guildBanAdd: true, channelDelete: true });
});

test("mergeGuild keeps per-event channel allow-lists", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventIncludeChannels: { messageDelete: ["c1", "c2"], guildBanAdd: [] } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventIncludeChannels, { messageDelete: ["c1", "c2"], guildBanAdd: [] });
});

test("mergeGuild keeps per-event delivery modes", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventDelivery: { messageDelete: "plain", guildBanAdd: "webhook" } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventDelivery, { messageDelete: "plain", guildBanAdd: "webhook" });
});

test("mergeGuild keeps per-event redaction overrides", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setExtra("g1", { eventRedact: { messageDelete: { url: true }, guildBanAdd: { mention: false } } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.deepEqual(merged.eventRedact, {
    messageDelete: { url: true },
    guildBanAdd: { mention: false },
  });
});

test("buildEmbed prefers a per-event color over the slot color", () => {
  const cfg = {
    id: "g1",
    locale: "en",
    colors: { create: 0x111111, update: 0x111111, delete: 0xff0000, voice: 0x111111, member: 0x111111, mod: 0x111111, info: 0x111111 },
    eventColors: { messageDelete: 0x000000 },
    showTimestamp: false,
    showCredit: false,
    embedCompact: false,
    extra: {},
    hiddenFields: {},
  };

  assert.equal(buildEmbed(cfg, "messageDelete", []).data.color, 0);
  assert.equal(buildEmbed(cfg, "messageDeleteBulk", []).data.color, 0xff0000);
});
