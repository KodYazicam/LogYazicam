const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PACKS, LOCALES, t } = require("../src/locales");

const TRANSLATED_KEYS = [
  "cmd.config_export",
  "cmd.config_import",
  "cmd.config_import_invalid",
  "cmd.config_import_too_big",
  "cmd.config_import_file",
  "cmd.guild_only",
  "cmd.invalid_timezone",
  "cmd.invalid_hex",
  "cmd.error",
  "cmd.invalid_option",
];

function placeholders(text) {
  return [...String(text).matchAll(/\{([a-zA-Z]+)\}/g)].map((match) => match[1]).sort();
}

test("every locale translates command replies", () => {
  const en = PACKS.en;
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    for (const key of TRANSLATED_KEYS) {
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

test("translated validation replies interpolate their placeholders", () => {
  assert.match(t("tr", "cmd.invalid_timezone", { tz: "Mars/Olympus" }), /Mars\/Olympus/);
  assert.match(t("de", "cmd.error", { error: "boom" }), /boom/);
});
