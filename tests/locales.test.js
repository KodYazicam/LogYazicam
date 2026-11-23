const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PACKS, LOCALES, t } = require("../src/locales");
const { buildEmbed } = require("../src/util");

const MEMBER_KEYS = ["field.created", "invite.vanity"];

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

test("every locale translates the member-join labels", () => {
  const en = PACKS.en;
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    for (const key of MEMBER_KEYS) {
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

test("empty UI overrides fall back to the locale pack", () => {
  const strings = { "event.messageDelete": "", "field.author": "" };
  assert.equal(t("en", "event.messageDelete", {}, strings), PACKS.en["event.messageDelete"]);
  assert.equal(t("en", "field.author", {}, strings), PACKS.en["field.author"]);
  assert.equal(t("de", "event.messageDelete", {}, strings), PACKS.de["event.messageDelete"]);
});

test("empty event and field overrides do not make buildEmbed throw", () => {
  const cfg = {
    locale: "en",
    colors: { create: 0, update: 0, delete: 0xed4245, voice: 0, member: 0, mod: 0, info: 0 },
    eventColors: {},
    extra: { strings: { "event.messageDelete": "", "field.author": "" } },
    showTimestamp: false,
    showCredit: false,
    embedFooter: "",
    embedCompact: false,
    fieldMax: 1024,
    descMax: 4000,
    footerMax: 2048,
    hiddenFields: {},
  };
  const embed = buildEmbed(cfg, "messageDelete", [["field.author", "a"]]);
  assert.equal(embed.data.title, PACKS.en["event.messageDelete"]);
  assert.equal(embed.data.fields[0].name, PACKS.en["field.author"]);
});

test("an empty credit override still hides the footer credit", () => {
  assert.equal(t("en", "bot.credit", {}, { "bot.credit": "" }), "");
  assert.equal(t("en", "bot.credit", {}, {}), PACKS.en["bot.credit"]);
});
