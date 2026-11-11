const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { openDb } = require("../src/db");

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-backup-"));
  let db;
  try {
    db = openDb(path.join(dir, "live.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      fs.rmSync(dir, { recursive: true, force: true });
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
    throw error;
  }
  t.after(() => {
    try {
      db.raw.close();
    } catch {
      // already closed by a test
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, db };
}

test("backupTo writes a readable snapshot that includes WAL rows", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const { dir, db } = setupResult;

  db.ensureGuild("g1");
  db.setGuild("g1", { locale: "tr", embed_footer: "snapshot footer" });
  db.pushHistory("g1", "messageDelete", { summary: "one" }, 10);
  db.pushHistory("g1", "messageUpdate", { summary: "two" }, 10);

  const destination = path.join(dir, "nested", "backups", "snap.sqlite");
  const returned = await db.backupTo(destination);

  assert.equal(returned, destination);
  assert.ok(fs.existsSync(destination));

  const copy = new Database(destination, { readonly: true });
  try {
    assert.equal(copy.prepare("SELECT locale FROM guilds WHERE id = ?").get("g1").locale, "tr");
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM history").get().n, 2);
  } finally {
    copy.close();
  }
});

test("backupTo rejects a missing destination", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  await assert.rejects(() => setupResult.db.backupTo(""), /destination is required/);
});
