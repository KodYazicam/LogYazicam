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
    ["ar", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt", "ru", "sv", "tr", "uk", "zh"].sort(),
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

test("voiceKind maps every discord voice transition", () => {
  const base = {
    channelId: "a",
    serverMute: false,
    serverDeaf: false,
    streaming: false,
    selfVideo: false,
    selfMute: false,
    selfDeaf: false,
    suppress: false,
  };

  assert.equal(voiceKind({ ...base, channelId: null }, base), "voiceJoin");
  assert.equal(voiceKind(base, { ...base, channelId: null }), "voiceLeave");
  assert.equal(voiceKind(base, { ...base, channelId: "b" }), "voiceMove");

  const transitions = [
    ["serverMute", "voiceServerMute"],
    ["serverDeaf", "voiceServerDeafen"],
    ["streaming", "voiceStream"],
    ["selfVideo", "voiceVideo"],
    ["selfMute", "voiceSelfMute"],
    ["selfDeaf", "voiceSelfDeaf"],
    ["suppress", "voiceSuppress"],
  ];
  for (const [key, kind] of transitions) {
    assert.equal(voiceKind(base, { ...base, [key]: true }), kind, key);
  }

  assert.equal(voiceKind(base, { ...base }), null);

  // A channel change wins over simultaneous mute state changes.
  assert.equal(
    voiceKind(base, { ...base, channelId: "b", serverMute: true, selfMute: true }),
    "voiceMove",
  );
});
