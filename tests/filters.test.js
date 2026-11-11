const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inQuietHours, includeOk, embedToPlain, parseHexColor } = require("../src/util");

test("quiet hours wrap midnight", () => {
  const cfg = { quietStart: "22:00", quietEnd: "06:00", timezone: "UTC" };
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T23:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T03:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T12:00:00Z")), false);
});

test("quiet days limit the window to selected weekdays", () => {
  const cfg = {
    quietStart: "22:00",
    quietEnd: "06:00",
    timezone: "UTC",
    quietDays: ["thu"],
  };
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T23:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T03:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-02T23:00:00Z")), false);
  assert.equal(inQuietHours(cfg, new Date("2026-01-02T03:00:00Z")), false);
});

test("quiet days follow the guild timezone", () => {
  const cfg = {
    quietStart: "22:00",
    quietEnd: "06:00",
    timezone: "Europe/Istanbul",
    quietDays: ["thu"],
  };
  // 2026-01-01T22:30Z is Friday 01:30 in Istanbul, inside the window but not a quiet day.
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T22:30:00Z")), false);
  // 2026-01-01T20:00Z is Thursday 23:00 in Istanbul.
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T20:00:00Z")), true);
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

test("parseHexColor accepts exactly six hex digits with an optional hash", () => {
  assert.equal(parseHexColor("#000000"), 0);
  assert.equal(parseHexColor("000000"), 0);
  assert.equal(parseHexColor("#aBc123"), 0xabc123);
  assert.equal(parseHexColor("  #FFFFFF  "), 0xffffff);
});

test("parseHexColor rejects malformed values", () => {
  for (const value of ["", "123", "1234567", "ffffff00", "#12345g", "#", null, undefined]) {
    assert.equal(parseHexColor(value), null, String(value));
  }
});
