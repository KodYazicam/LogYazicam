const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PACKS, applyPack } = require("../src/packs");
const { byKey } = require("../src/catalog");

test("every pack key exists in the catalog", () => {
  for (const [name, keys] of Object.entries(PACKS)) {
    assert.ok(keys.length > 0, name);
    for (const key of keys) assert.ok(byKey[key], `${name}:${key}`);
  }
});

test("applyPack enables each route and rejects unknown packs", () => {
  const calls = [];
  const db = {
    setRoute: (...args) => calls.push(args),
  };

  const keys = applyPack(db, "g1", "moderation", "c1");
  assert.deepEqual(keys, PACKS.moderation);
  assert.equal(calls.length, keys.length);
  assert.deepEqual(calls[0], ["g1", "guildBanAdd", { enabled: true, channelId: "c1" }]);

  assert.equal(applyPack(db, "g1", "missing"), null);
  assert.equal(calls.length, keys.length);
});
