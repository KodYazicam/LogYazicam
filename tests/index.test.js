const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

test("entrypoint exits clearly when TOKEN is missing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-index-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const env = {
    ...process.env,
    TOKEN: "",
    SHARD_LIST: "",
    HOT_RELOAD_MS: "0",
    DATABASE_PATH: path.join(dir, "data.sqlite"),
    LOG_FILE: path.join(dir, "process.log"),
  };
  // Do not let the child process merge its partial entrypoint coverage into
  // the parent report; this test only asserts the fail-fast startup path.
  delete env.NODE_V8_COVERAGE;

  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "src", "index.js")], {
    cwd: dir,
    encoding: "utf8",
    timeout: 15000,
    env,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing TOKEN/);
  assert.match(result.stderr, /\.env\.example/);
});
