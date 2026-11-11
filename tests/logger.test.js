const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLogger } = require("../src/logger");

function capture(fn) {
  const out = [];
  const err = [];
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.stdout.write = (chunk) => {
    out.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    err.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
  return { out: out.join(""), err: err.join("") };
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-logger-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("camelCase logLevel and logFile control level and file output", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "app.log");
  const log = createLogger({ logLevel: "error", logFile: file });

  const captured = capture(() => {
    log.info("hidden info");
    log.warn("hidden warn");
    log.debug("hidden debug");
    log.error("boom", new Error("bad"));
  });

  const text = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(text, /hidden/);
  assert.match(text, /ERROR boom/);
  assert.match(text, /Error: bad/);
  assert.equal(captured.out, "");
  assert.match(captured.err, /ERROR boom/);
});

test("uppercase LOG_LEVEL and LOG_FILE still work for raw env callers", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "upper.log");
  const log = createLogger({ LOG_LEVEL: "debug", LOG_FILE: file });

  capture(() => log.debug("upper debug"));

  assert.match(fs.readFileSync(file, "utf8"), /DEBUG upper debug/);
});

test("unknown levels fall back to info", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "fallback.log");
  const log = createLogger({ logLevel: "verbose", logFile: file });

  const captured = capture(() => {
    log.info("fallback info");
    log.debug("hidden debug");
  });

  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /INFO fallback info/);
  assert.doesNotMatch(text, /hidden debug/);
  assert.match(captured.out, /INFO fallback info/);
});

test("empty logFile keeps stdout/stderr only", () => {
  const log = createLogger({ logLevel: "info", logFile: "" });
  const captured = capture(() => log.info("no file"));
  assert.match(captured.out, /INFO no file/);
});

test("an unusable log path does not throw or block stdout", (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "not a directory");
  const log = createLogger({ logLevel: "info", logFile: path.join(blocker, "app.log") });

  const captured = capture(() => log.info("still logs"));
  assert.match(captured.out, /INFO still logs/);
});
