const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const { processConfig, mergeGuild } = require("../src/config");
const { buildEmbed } = require("../src/util");

function withDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-config-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
    throw error;
  }
  t.after(() => {
    db.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

test("mergeGuild preserves black row and extra colors", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("g1", {
    embed_color_create: 0,
    embed_color_update: 0,
    embed_color_delete: 0,
  });
  db.setExtra("g1", {
    colors: { create: 0, voice: 0, member: 0, mod: 0, info: 0 },
  });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.equal(merged.colors.create, 0);
  assert.equal(merged.colors.update, 0);
  assert.equal(merged.colors.delete, 0);
  assert.equal(merged.colors.voice, 0);
  assert.equal(merged.colors.member, 0);
  assert.equal(merged.colors.mod, 0);
  assert.equal(merged.colors.info, 0);
});

test("non-zero extra colors still override row colors", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("g1", { embed_color_delete: 0x654321 });
  db.setExtra("g1", { colors: { delete: 0x123456 } });

  const row = db.getGuild.get("g1");
  const merged = mergeGuild(processConfig({}), row, [], [], db.extraOf(row));

  assert.equal(merged.colors.delete, 0x123456);
});

test("buildEmbed uses a black event color instead of the info fallback", () => {
  const embed = buildEmbed(
    {
      id: "g1",
      locale: "en",
      colors: { create: 0xffffff, update: 0xffffff, delete: 0, voice: 0xffffff, member: 0xffffff, mod: 0xffffff, info: 0xffffff },
      showTimestamp: false,
      showCredit: false,
      extra: {},
      embedCompact: false,
      hiddenFields: {},
    },
    "messageDelete",
    [],
  );

  assert.equal(embed.data.color, 0);
});
