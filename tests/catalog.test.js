const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EVENTS, GROUPS, byKey } = require("../src/catalog");
const { t, LOCALES } = require("../src/locales");
const { processConfig } = require("../src/config");
const { voiceKind } = require("../src/format");

test("every event has a unique english key and a group", () => {
  const keys = EVENTS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const event of EVENTS) {
    assert.ok(GROUPS.includes(event.group), event.key);
    assert.equal(byKey[event.key], event);
    assert.ok(t("en", `event.${event.key}`).length > 0);
  }
});

test("locales fall back to english", () => {
  assert.deepEqual(
    LOCALES.sort(),
    ["ar", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "tr", "uk", "zh"].sort(),
  );
  assert.equal(t("xx", "none"), "—");
  assert.match(t("tr", "cmd.denied"), /kullanamazsın/);
});

test("processConfig reads env with english keys", () => {
  const cfg = processConfig({
    TOKEN: "t",
    DEFAULT_LOCALE: "tr",
    IGNORE_BOTS: "false",
    SEND_INTERVAL_MS: "500",
    OWNER_IDS: "1, 2",
  });
  assert.equal(cfg.defaultLocale, "tr");
  assert.equal(cfg.ignoreBots, false);
  assert.equal(cfg.sendIntervalMs, 500);
  assert.deepEqual(cfg.owners, ["1", "2"]);
});

test("voiceKind maps discord voice states", () => {
  assert.equal(voiceKind({ channelId: null }, { channelId: "a" }), "voiceJoin");
  assert.equal(voiceKind({ channelId: "a" }, { channelId: null }), "voiceLeave");
  assert.equal(voiceKind({ channelId: "a" }, { channelId: "b" }), "voiceMove");
  assert.equal(voiceKind({ channelId: "a", serverMute: false }, { channelId: "a", serverMute: true }), "voiceServerMute");
});
