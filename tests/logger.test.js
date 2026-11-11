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

test("configure applies a new level and file at runtime", (t) => {
  const dir = tempDir(t);
  const first = path.join(dir, "first.log");
  const second = path.join(dir, "second.log");
  const log = createLogger({ logLevel: "info", logFile: first });

  capture(() => {
    log.info("before only");
    log.debug("hidden before");
  });
  log.configure({ logLevel: "debug", logFile: second });
  capture(() => log.debug("visible after"));

  assert.match(fs.readFileSync(first, "utf8"), /INFO before only/);
  assert.doesNotMatch(fs.readFileSync(first, "utf8"), /visible after/);
  assert.match(fs.readFileSync(second, "utf8"), /DEBUG visible after/);
});

test("configure falls back for invalid levels and blocked paths", (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "not a directory");
  const log = createLogger({ logLevel: "error", logFile: path.join(dir, "ok.log") });

  log.configure({ logLevel: "verbose", logFile: path.join(blocker, "app.log") });
  const captured = capture(() => {
    log.info("info lives");
    log.debug("hidden debug");
  });

  assert.match(captured.out, /INFO info lives/);
  assert.doesNotMatch(captured.out, /hidden debug/);
});

test("logger safely handles circular, BigInt, and throwing values", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "safe.log");
  const log = createLogger({ logLevel: "info", logFile: file });
  const circular = {};
  circular.self = circular;
  const bad = {
    toJSON() {
      throw new Error("no json");
    },
    toString() {
      throw new Error("no string");
    },
  };

  capture(() => {
    assert.doesNotThrow(() => log.info("values", circular, 1n, bad));
  });

  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /INFO values/);
  assert.match(text, /1/);
  assert.match(text, /\[unloggable\]/);
});
