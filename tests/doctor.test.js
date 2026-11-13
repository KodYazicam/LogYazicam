const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  checkNode,
  checkToken,
  checkIntents,
  checkDataDir,
  checkDatabase,
  checkEnvFile,
  runDoctor,
  formatResults,
  summarize,
  exitCode,
} = require("../src/doctor");

const VALID_TOKEN = "MTAwMDAwMDAwMDAwMDAwMDAw.GaBcDe.abcdefghijklmnopqrstuvwxyz12";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-doctor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeEnv(dir, contents, mode) {
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, contents);
  if (mode != null) fs.chmodSync(file, mode);
  return file;
}

function makeDatabase(file) {
  const Database = require("better-sqlite3");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec("CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY)");
  db.close();
}

test("node check requires 22 or newer", () => {
  assert.equal(checkNode("22.0.0").status, "PASS");
  assert.equal(checkNode("24.11.1").status, "PASS");
  assert.equal(checkNode("20.19.0").status, "FAIL");
  assert.match(checkNode("20.19.0").message, />= 22/);
});

test("token check validates shape without echoing the token", () => {
  assert.equal(checkToken({}).status, "FAIL");
  assert.equal(checkToken({ TOKEN: "   " }).status, "FAIL");
  assert.equal(checkToken({ TOKEN: "not-a-token" }).status, "FAIL");
  assert.equal(checkToken({ TOKEN: "aaa.bbb" }).status, "FAIL");
  assert.equal(checkToken({ TOKEN: VALID_TOKEN }).status, "PASS");

  const prefixed = checkToken({ TOKEN: `Bot ${VALID_TOKEN}` });
  assert.equal(prefixed.status, "WARN");
  for (const result of [
    checkToken({}),
    checkToken({ TOKEN: "not-a-token" }),
    checkToken({ TOKEN: VALID_TOKEN }),
    prefixed,
  ]) {
    assert.ok(!result.message.includes(VALID_TOKEN), result.message);
    assert.ok(!result.message.includes("not-a-token"), result.message);
  }
});

test("intent check reports required intents and boolean warnings", () => {
  const base = checkIntents({});
  assert.equal(base.status, "PASS");
  assert.match(base.message, /GuildMembers/);
  assert.match(base.message, /MessageContent/);

  const presence = checkIntents({ PRESENCE_INTENT: "true" });
  assert.equal(presence.status, "PASS");
  assert.match(presence.message, /Presence/);

  const bad = checkIntents({ PRESENCE_INTENT: "sometimes" });
  assert.equal(bad.status, "WARN");
  assert.match(bad.message, /PRESENCE_INTENT/);
});

test("data directory check covers missing, writable, and blocked paths", (t) => {
  const dir = tempDir(t);
  const missing = checkDataDir({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" }, platform: "linux" });
  assert.equal(missing.status, "PASS");
  assert.match(missing.message, /create/);

  fs.mkdirSync(path.join(dir, "data"), { mode: 0o755 });
  const writable = checkDataDir({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" }, platform: "linux" });
  assert.equal(writable.status, "PASS");
  assert.match(writable.message, /writable/);

  fs.chmodSync(path.join(dir, "data"), 0o777);
  const world = checkDataDir({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" }, platform: "linux" });
  assert.equal(world.status, "WARN");
  assert.match(world.message, /world-writable/);

  fs.writeFileSync(path.join(dir, "blocked"), "not a directory");
  const blocked = checkDataDir({ cwd: dir, env: { DATABASE_PATH: "./blocked/log.sqlite" }, platform: "linux" });
  assert.equal(blocked.status, "FAIL");
});

test("sqlite check warns when absent and fails on corrupt files", (t) => {
  const dir = tempDir(t);
  const dbPath = path.join(dir, "data", "log.sqlite");
  const missing = checkDatabase({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" } });
  assert.equal(missing.status, "WARN");
  assert.match(missing.message, /does not exist/);

  makeDatabase(dbPath);
  const healthy = checkDatabase({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" } });
  assert.equal(healthy.status, "PASS");
  assert.match(healthy.message, /ok/);

  fs.writeFileSync(dbPath, "this is not a sqlite database");
  const corrupt = checkDatabase({ cwd: dir, env: { DATABASE_PATH: "./data/log.sqlite" } });
  assert.equal(corrupt.status, "FAIL");
});

test("env permission check warns on missing or group-readable .env", (t) => {
  const dir = tempDir(t);
  assert.equal(checkEnvFile({ cwd: dir, platform: "linux" }).status, "WARN");

  writeEnv(dir, "TOKEN=x\n", 0o600);
  const privateEnv = checkEnvFile({ cwd: dir, platform: "linux" });
  assert.equal(privateEnv.status, "PASS");
  assert.match(privateEnv.message, /600/);

  fs.chmodSync(path.join(dir, ".env"), 0o644);
  const publicEnv = checkEnvFile({ cwd: dir, platform: "linux" });
  assert.equal(publicEnv.status, "WARN");
  assert.match(publicEnv.message, /chmod 600/);

  fs.chmodSync(path.join(dir, ".env"), 0o640);
  assert.equal(checkEnvFile({ cwd: dir, platform: "linux" }).status, "WARN");
});

test("runDoctor aggregates checks and only FAIL changes the exit code", (t) => {
  const dir = tempDir(t);
  makeDatabase(path.join(dir, "data", "log.sqlite"));
  writeEnv(dir, "TOKEN=x\n", 0o600);
  const env = { TOKEN: VALID_TOKEN, DATABASE_PATH: "./data/log.sqlite" };

  const healthy = runDoctor({ cwd: dir, env, nodeVersion: "22.11.0", platform: "linux" });
  assert.deepEqual(healthy.map((r) => r.status), ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS"]);
  assert.equal(exitCode(healthy), 0);
  assert.match(summarize(healthy), /6 passed, 0 warnings, 0 failed/);

  const broken = runDoctor({
    cwd: dir,
    env: { TOKEN: "", DATABASE_PATH: "./data/log.sqlite" },
    nodeVersion: "18.20.0",
    platform: "linux",
  });
  assert.equal(exitCode(broken), 1);
  assert.ok(broken.some((r) => r.status === "FAIL"));
  assert.match(formatResults(broken), /^FAIL node/m);
});

test("CLI prints a report and maps failures to exit code 1", (t) => {
  const dir = tempDir(t);
  makeDatabase(path.join(dir, "data", "log.sqlite"));
  writeEnv(dir, "TOKEN=x\n", 0o600);
  const cli = path.join(__dirname, "..", "src", "cli.js");
  const env = {
    ...process.env,
    TOKEN: VALID_TOKEN,
    DATABASE_PATH: "./data/log.sqlite",
    PRESENCE_INTENT: "false",
  };

  const ok = spawnSync(process.execPath, [cli, "doctor"], { cwd: dir, env, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /PASS token/);
  assert.match(ok.stdout, /PASS sqlite/);
  assert.match(ok.stdout, /6 passed/);
  assert.ok(!ok.stdout.includes(VALID_TOKEN));

  const bad = spawnSync(process.execPath, [cli, "doctor"], {
    cwd: dir,
    env: { ...env, TOKEN: "", DATABASE_PATH: "./data/log.sqlite" },
    encoding: "utf8",
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL token/);

  const unknown = spawnSync(process.execPath, [cli, "nope"], { cwd: dir, env, encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Usage: logyazicam doctor/);
});

test("package exposes the doctor script and bin entry", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.scripts.doctor, "node src/cli.js doctor");
  assert.equal(pkg.bin.logyazicam, "src/cli.js");
});
