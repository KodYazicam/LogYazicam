const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeFileSink } = require("../src/sinks");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sinks-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("writeFileSink returns false instead of throwing on a blocked directory", (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "not a directory");

  assert.doesNotThrow(() => {
    const ok = writeFileSink(blocker, "g1", "messageDelete", { summary: "x" });
    assert.equal(ok, false);
  });
});

test("writeFileSink returns false when no directory is configured", () => {
  assert.equal(writeFileSink("", "g1", "messageDelete", {}), false);
});
