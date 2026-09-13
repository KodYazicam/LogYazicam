const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PACKS } = require("../src/packs");
const { byKey } = require("../src/catalog");

test("every pack key exists in the catalog", () => {
  for (const [name, keys] of Object.entries(PACKS)) {
    assert.ok(keys.length > 0, name);
    for (const key of keys) assert.ok(byKey[key], `${name}:${key}`);
  }
});
