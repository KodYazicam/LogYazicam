const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inQuietHours, includeOk, embedToPlain } = require("../src/util");

test("quiet hours wrap midnight", () => {
  const cfg = { quietStart: "22:00", quietEnd: "06:00", timezone: "UTC" };
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T23:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T03:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T12:00:00Z")), false);
});

test("include list treats empty as all", () => {
  assert.equal(includeOk({ includeChannels: [] }, { id: "a" }), true);
  assert.equal(includeOk({ includeChannels: ["a"] }, { id: "b", parentId: "a" }), true);
  assert.equal(includeOk({ includeChannels: ["a"] }, { id: "b" }), false);
});

test("plain text flattening keeps title", () => {
  const text = embedToPlain({ title: "Message deleted", fields: [{ name: "Author", value: "x" }] });
  assert.match(text, /Message deleted/);
  assert.match(text, /Author/);
});
