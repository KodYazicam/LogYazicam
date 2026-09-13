const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePrefix } = require("../src/prefix");

test("parsePrefix requires prefix + log", () => {
  assert.equal(parsePrefix("hello", "!"), null);
  assert.deepEqual(parsePrefix("!log status", "!"), ["status"]);
  assert.deepEqual(parsePrefix("!log event on key:messageDelete", "!"), [
    "event",
    "on",
    "key:messageDelete",
  ]);
  assert.equal(parsePrefix("!help", "!"), null);
  assert.deepEqual(parsePrefix("?audit status", "?", "audit"), ["status"]);
  assert.equal(parsePrefix("!log status", "!", "audit"), null);
});
