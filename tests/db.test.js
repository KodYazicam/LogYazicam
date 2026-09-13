const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const { mergeGuild, processConfig } = require("../src/config");

test("guild routes persist without process restart", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return;
    }
    throw error;
  }
  db.ensureGuild("g1");
  db.setRoute("g1", "messageDelete", { enabled: true, channelId: "c1" });
  const row = db.getRoute.get("g1", "messageDelete");
  assert.equal(row.enabled, 1);
  assert.equal(row.channel_id, "c1");
  db.setGroup("g1", "voice", { enabled: true, channelId: "c2" });
  const routes = db.listRoutes.all("g1");
  assert.ok(routes.some((r) => r.event_key === "voiceJoin" && r.enabled === 1));
  db.addIgnore.run("g1", "user", "u1");
  assert.equal(db.listIgnores.all("g1").length, 1);
  db.pushHistory("g1", "messageDelete", { ok: true }, 2);
  db.pushHistory("g1", "messageDelete", { ok: 2 }, 2);
  db.pushHistory("g1", "messageDelete", { ok: 3 }, 2);
  assert.equal(db.listHistory.all("g1", 10).length, 2);
  const processCfg = processConfig({});
  const cfg = mergeGuild(processCfg, db.getGuild.get("g1"), db.listRoutes.all("g1"), db.listIgnores.all("g1"), {});
  assert.equal(cfg.events.messageDelete.on, true);
  assert.equal(cfg.events.messageDelete.channelId, "c1");
  db.raw.close();
});
