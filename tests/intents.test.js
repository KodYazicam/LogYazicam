const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GatewayIntentBits } = require("discord.js");
const { BASE_INTENTS, buildIntents } = require("../src/intents");
const { byKey } = require("../src/catalog");

test("presence intent is opt-in", () => {
  assert.equal(BASE_INTENTS.includes(GatewayIntentBits.GuildPresences), false);
  assert.equal(buildIntents().includes(GatewayIntentBits.GuildPresences), false);
  assert.equal(buildIntents({ presenceIntent: false }).includes(GatewayIntentBits.GuildPresences), false);
});

test("enabling presence adds GuildPresences exactly once", () => {
  const intents = buildIntents({ presenceIntent: true });
  assert.equal(intents.includes(GatewayIntentBits.GuildPresences), true);
  assert.equal(intents.filter((intent) => intent === GatewayIntentBits.GuildPresences).length, 1);
});

test("catalog events gated by a non-privileged intent have that intent", () => {
  const required = {
    guildIntegrationsUpdate: GatewayIntentBits.GuildIntegrations,
    messagePollVoteAdd: GatewayIntentBits.GuildMessagePolls,
    messagePollVoteRemove: GatewayIntentBits.GuildMessagePolls,
  };
  for (const [key, bit] of Object.entries(required)) {
    assert.ok(byKey[key], `${key} must stay a documented catalog event`);
    assert.equal(buildIntents().includes(bit), true, `${key} needs its gateway intent or it never fires`);
    assert.equal(buildIntents({ presenceIntent: true }).includes(bit), true, `${key} must survive PRESENCE_INTENT`);
  }
  const intents = buildIntents({ presenceIntent: true });
  assert.equal(new Set(intents).size, intents.length, "no duplicate intents");
});
