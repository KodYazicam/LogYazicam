const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PACKS, LOCALES, t } = require("../src/locales");

const CONFIG_KEYS = [
  "cmd.config_export",
  "cmd.config_import",
  "cmd.config_import_invalid",
  "cmd.config_import_too_big",
  "cmd.config_import_file",
];

function placeholders(text) {
  return [...String(text).matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1]).sort();
}

test("every locale translates the config transfer replies", () => {
  const en = PACKS.en;
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    for (const key of CONFIG_KEYS) {
      const value = PACKS[locale][key];
      assert.equal(typeof value, "string", `${locale} ${key} is missing`);
      assert.notEqual(value, en[key], `${locale} ${key} still falls back to English`);
      assert.deepEqual(
        placeholders(value),
        placeholders(en[key]),
        `${locale} ${key} has different placeholders`,
      );
    }
  }
});

test("translated config replies interpolate their placeholders", () => {
  const output = t("ja", "cmd.config_import", {
    routes: 2,
    ignores: 1,
    settings: 3,
    skipped: 4,
  });
  assert.match(output, /2/);
  assert.match(output, /1/);
  assert.match(output, /3/);
  assert.match(output, /4/);
  assert.doesNotMatch(output, /\{[a-zA-Z]+\}/);
});
