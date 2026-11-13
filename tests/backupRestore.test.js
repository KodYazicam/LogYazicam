const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Database = require("better-sqlite3");
const { openDb } = require("../src/db");
const { backupDatabase, restoreDatabase } = require("../src/backupRestore");

const SECRET = "super-secret-token-value-that-must-not-leak";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-backup-restore-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function dbAvailable() {
  try {
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
}

function skipWithoutBindings(t) {
  if (dbAvailable()) return false;
  t.skip("better-sqlite3 native bindings are not built on this Node");
  return true;
}

function seedDb(file, { locale, summary }) {
  const db = openDb(file);
  try {
    db.ensureGuild("g1");
    db.setGuild("g1", { locale });
    db.pushHistory("g1", "messageDelete", { summary }, 100);
  } finally {
    db.raw.close();
  }
}

function readMarker(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const guild = db.prepare("SELECT locale FROM guilds WHERE id = ?").get("g1");
    const history = db
      .prepare("SELECT payload FROM history WHERE guild_id = ? ORDER BY id DESC LIMIT 1")
      .get("g1");
    return {
      locale: guild && guild.locale,
      summary: history ? JSON.parse(history.payload).summary : null,
    };
  } finally {
    db.close();
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function corruptLastPage(file) {
  const buffer = fs.readFileSync(file);
  const pageSize = buffer.readUInt16BE(16) === 1 ? 65536 : buffer.readUInt16BE(16);
  buffer.fill(0, buffer.length - pageSize);
  fs.writeFileSync(file, buffer);
}

function files(dir) {
  return fs.readdirSync(dir).sort();
}

function cliEnv() {
  return {
    ...process.env,
    TOKEN: SECRET,
    DATABASE_PATH: "./data/live.sqlite",
  };
}

test("backupDatabase writes a WAL-consistent snapshot to the default path", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  seedDb(dbPath, { locale: "tr", summary: "before" });

  const now = Date.parse("2026-11-13T18:20:00.000Z");
  const result = await backupDatabase({
    cwd: dir,
    env: { DATABASE_PATH: "./data/live.sqlite" },
    now,
  });

  assert.equal(result.source, dbPath);
  assert.equal(
    result.destination,
    path.join(dir, "data", "logyazicam-backup-20261113-182000Z.sqlite"),
  );
  assert.equal(readMarker(result.destination).summary, "before");
});

test("backup → mutate → restore round-trip restores the snapshot and backs up the old DB", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  seedDb(dbPath, { locale: "tr", summary: "before" });

  const backup = await backupDatabase({
    cwd: dir,
    env: { DATABASE_PATH: "./data/live.sqlite" },
    out: "backups/snapshot.sqlite",
    now: Date.parse("2026-11-13T18:20:00.000Z"),
  });
  assert.ok(fs.existsSync(backup.destination));

  seedDb(dbPath, { locale: "en", summary: "after" });
  assert.deepEqual(readMarker(dbPath), { locale: "en", summary: "after" });

  const restored = await restoreDatabase({
    cwd: dir,
    env: { DATABASE_PATH: "./data/live.sqlite" },
    file: "backups/snapshot.sqlite",
    force: true,
    now: Date.parse("2026-11-13T18:21:00.000Z"),
  });

  assert.equal(restored.target, dbPath);
  assert.ok(restored.autoBackup.endsWith(".bak-20261113-182100Z"));
  assert.ok(fs.existsSync(restored.autoBackup));
  assert.deepEqual(readMarker(dbPath), { locale: "tr", summary: "before" });
  assert.deepEqual(readMarker(restored.autoBackup), { locale: "en", summary: "after" });
  assert.ok(!files(path.join(dir, "data")).some((name) => name.endsWith(".tmp")));
});

test("restore refuses an existing database without --force", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  const source = path.join(dir, "restore-source.sqlite");
  seedDb(dbPath, { locale: "en", summary: "live" });
  seedDb(source, { locale: "tr", summary: "snapshot" });

  await assert.rejects(
    restoreDatabase({
      cwd: dir,
      env: { DATABASE_PATH: "./data/live.sqlite" },
      file: "restore-source.sqlite",
    }),
    /--force/,
  );

  assert.deepEqual(readMarker(dbPath), { locale: "en", summary: "live" });
  assert.ok(!files(path.join(dir, "data")).some((name) => name.includes(".bak-")));
});

test("restore --force replaces the database and keeps a timestamped copy", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  const source = path.join(dir, "restore-source.sqlite");
  seedDb(dbPath, { locale: "en", summary: "live" });
  seedDb(source, { locale: "tr", summary: "snapshot" });

  const result = await restoreDatabase({
    cwd: dir,
    env: { DATABASE_PATH: "./data/live.sqlite" },
    file: "restore-source.sqlite",
    force: true,
    now: Date.parse("2026-11-13T18:22:00.000Z"),
  });

  assert.equal(result.autoBackup, `${dbPath}.bak-20261113-182200Z`);
  assert.deepEqual(readMarker(dbPath), { locale: "tr", summary: "snapshot" });
  assert.deepEqual(readMarker(result.autoBackup), { locale: "en", summary: "live" });
});

test("restore rejects a non-SQLite file before writing anything", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  const corrupt = path.join(dir, "corrupt.sqlite");
  seedDb(dbPath, { locale: "en", summary: "live" });
  fs.writeFileSync(corrupt, "this is not a sqlite database");

  const beforeHash = sha256(dbPath);
  const beforeFiles = files(path.join(dir, "data"));

  await assert.rejects(
    restoreDatabase({
      cwd: dir,
      env: { DATABASE_PATH: "./data/live.sqlite" },
      file: "corrupt.sqlite",
      force: true,
    }),
    /not a database|integrity|malformed/i,
  );

  assert.equal(sha256(dbPath), beforeHash);
  assert.deepEqual(files(path.join(dir, "data")), beforeFiles);
  assert.deepEqual(readMarker(dbPath), { locale: "en", summary: "live" });
});

test("restore rejects a file that fails PRAGMA integrity_check before writing anything", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  const corrupt = path.join(dir, "structurally-corrupt.sqlite");
  seedDb(dbPath, { locale: "en", summary: "live" });
  seedDb(corrupt, { locale: "tr", summary: "broken" });
  corruptLastPage(corrupt);

  const beforeHash = sha256(dbPath);
  const beforeFiles = files(path.join(dir, "data"));

  await assert.rejects(
    restoreDatabase({
      cwd: dir,
      env: { DATABASE_PATH: "./data/live.sqlite" },
      file: "structurally-corrupt.sqlite",
      force: true,
    }),
    /integrity_check failed|malformed/i,
  );

  assert.equal(sha256(dbPath), beforeHash);
  assert.deepEqual(files(path.join(dir, "data")), beforeFiles);
  assert.ok(!files(path.join(dir, "data")).some((name) => name.endsWith(".tmp")));
});

test("restore creates a missing database without taking an auto-backup", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const source = path.join(dir, "restore-source.sqlite");
  const target = path.join(dir, "fresh", "data", "live.sqlite");
  seedDb(source, { locale: "tr", summary: "snapshot" });

  const result = await restoreDatabase({
    cwd: dir,
    env: { DATABASE_PATH: "./fresh/data/live.sqlite" },
    file: "restore-source.sqlite",
  });

  assert.equal(result.target, target);
  assert.equal(result.autoBackup, null);
  assert.ok(fs.existsSync(target));
  assert.deepEqual(readMarker(target), { locale: "tr", summary: "snapshot" });
});

test("backup and restore refuse the live database path", async (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  seedDb(dbPath, { locale: "en", summary: "live" });

  await assert.rejects(
    backupDatabase({
      cwd: dir,
      env: { DATABASE_PATH: "./data/live.sqlite" },
      out: "data/live.sqlite",
    }),
    /differ from the live database/,
  );

  await assert.rejects(
    restoreDatabase({
      cwd: dir,
      env: { DATABASE_PATH: "./data/live.sqlite" },
      file: "data/live.sqlite",
      force: true,
    }),
    /differ from the live database/,
  );
});

test("CLI backup/restore maps success, failure, and usage to exit codes without leaking secrets", (t) => {
  if (skipWithoutBindings(t)) return;
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "live.sqlite");
  const cli = path.join(__dirname, "..", "src", "cli.js");
  const env = cliEnv();
  seedDb(dbPath, { locale: "tr", summary: "before" });

  const backup = spawnSync(process.execPath, [cli, "backup", "--out", "backups/cli.sqlite"], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(backup.status, 0, backup.stderr);
  assert.match(backup.stdout, /Backup written:/);
  assert.ok(fs.existsSync(path.join(dir, "backups", "cli.sqlite")));
  assert.ok(!backup.stdout.includes(SECRET));
  assert.ok(!backup.stderr.includes(SECRET));

  seedDb(dbPath, { locale: "en", summary: "after" });
  const noForce = spawnSync(process.execPath, [cli, "restore", "backups/cli.sqlite"], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(noForce.status, 1);
  assert.match(noForce.stderr, /--force/);
  assert.deepEqual(readMarker(dbPath), { locale: "en", summary: "after" });
  assert.ok(!noForce.stdout.includes(SECRET));
  assert.ok(!noForce.stderr.includes(SECRET));

  const force = spawnSync(
    process.execPath,
    [cli, "restore", "backups/cli.sqlite", "--force"],
    { cwd: dir, env, encoding: "utf8" },
  );
  assert.equal(force.status, 0, force.stderr);
  assert.match(force.stdout, /Restored:/);
  assert.match(force.stdout, /Previous database backed up:/);
  assert.deepEqual(readMarker(dbPath), { locale: "tr", summary: "before" });
  assert.ok(!force.stdout.includes(SECRET));
  assert.ok(!force.stderr.includes(SECRET));

  const missingFile = spawnSync(process.execPath, [cli, "restore"], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(missingFile.status, 2);
  assert.match(missingFile.stderr, /Usage: logyazicam restore/);

  const badFlag = spawnSync(process.execPath, [cli, "backup", "--nope"], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(badFlag.status, 2);
  assert.match(badFlag.stderr, /Usage: logyazicam backup/);
});
