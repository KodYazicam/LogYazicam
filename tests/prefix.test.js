const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePrefix, fakeInteraction } = require("../src/prefix");

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

function fake(tokens) {
  return fakeInteraction(
    {
      guild: { channels: { cache: new Map() }, roles: { cache: new Map() } },
      channel: {},
      author: {},
      member: {},
    },
    tokens,
  );
}

test("prefix integer options reject fractional, infinite, and empty values", () => {
  for (const value of ["2.5", "abc", "Infinity", ""]) {
    assert.equal(fake([`limit:${value}`]).options.getInteger("limit"), null, value);
  }
  assert.equal(fake(["limit:50"]).options.getInteger("limit"), 50);
  assert.equal(fake(["limit:-5"]).options.getInteger("limit"), -5);
});
