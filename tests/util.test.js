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
  buildEmbed,
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

function embedCfg(hiddenFields = {}) {
  return {
    locale: "en",
    colors: { create: 0xffffff, update: 0xffffff, delete: 0xffffff, voice: 0xffffff, member: 0xffffff, mod: 0xffffff, info: 0xffffff },
    showTimestamp: false,
    showCredit: false,
    embedCompact: false,
    descMax: 4000,
    fieldMax: 1024,
    footerMax: 2048,
    extra: {},
    hiddenFields,
  };
}

function embeddedFieldNames(hiddenFields) {
  return buildEmbed(embedCfg(hiddenFields), "messageDelete", [
    ["field.id", "123"],
    ["field.jump", "https://discord.com/channels/1/2/3"],
    ["field.author", "tester"],
  ]).data.fields.map((field) => field.name);
}

test("hiddenFields wildcard and event list are combined", () => {
  assert.deepEqual(
    embeddedFieldNames({ "*": ["id"], messageDelete: ["jump"] }),
    ["Author"],
  );
});

test("an empty event-specific hiddenFields list does not disable the wildcard", () => {
  assert.deepEqual(
    embeddedFieldNames({ "*": ["id"], messageDelete: [] }),
    ["Jump", "Author"],
  );
});

test("malformed hiddenFields entries are ignored instead of dropping the embed", () => {
  assert.deepEqual(
    embeddedFieldNames({ "*": "id", messageDelete: null }),
    ["ID", "Jump", "Author"],
  );
});
