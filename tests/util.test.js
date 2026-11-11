const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  code,
  truncate,
  userTag,
  channelTag,
  diff,
  when,
  audit,
  inQuietHours,
  hasConfigPermission,
} = require("../src/util");

test("code and truncate handle null, backticks, and long values", () => {
  assert.equal(code("a`b"), "`a'b`");
  assert.equal(code(null), "`—`");
  assert.equal(truncate(null), "—");
  assert.equal(truncate("abcdef", 5), "abcd…");
  assert.equal(truncate("abcde", 5), "abcde");
});

test("userTag, channelTag, and diff normalize missing and changed values", () => {
  assert.equal(userTag(null), "—");
  assert.equal(userTag({ username: "tester", id: "u1" }), "tester (u1)");
  assert.equal(channelTag(null), "—");
  assert.equal(channelTag({ id: "c1", toString: () => "#general" }), "#general (`c1`)");
  assert.equal(diff({ a: 1 }, { a: 1 }), "—");
  assert.match(diff({ a: 1 }, { a: 2 }), /\*\*a:\*\* 1 → 2/);
});

test("when formats in the guild timezone and falls back to ISO", () => {
  assert.match(when(new Date("2026-01-01T12:00:00Z"), "Europe/Istanbul"), /2026/);
  assert.equal(when(new Date("2026-01-01T12:00:00Z"), "Not/AZone"), "2026-01-01T12:00:00.000Z");
});

test("audit returns null when the audit-log fetch fails", async () => {
  const guild = {
    fetchAuditLogs: async () => {
      throw new Error("missing permissions");
    },
  };
  assert.equal(await audit(guild, 1, "u1", 60000), null);
});

test("quiet hours use the UTC fallback for an invalid timezone", () => {
  const cfg = {
    quietStart: "22:00",
    quietEnd: "06:00",
    timezone: "Bad/Zone",
    quietDays: ["thu"],
  };
  assert.equal(inQuietHours(cfg, new Date("2026-01-01T23:00:00Z")), true);
  assert.equal(inQuietHours(cfg, new Date("2026-01-02T23:00:00Z")), false);
});

test("hasConfigPermission rejects missing and non-function permission objects", () => {
  assert.equal(hasConfigPermission(null, {}), false);
  assert.equal(hasConfigPermission({}, {}), false);
  assert.equal(
    hasConfigPermission({ has: (name) => name === "Administrator" }, { configPermission: "Administrator" }),
    true,
  );
  assert.equal(hasConfigPermission({ has: () => true }, {}), true);
});
