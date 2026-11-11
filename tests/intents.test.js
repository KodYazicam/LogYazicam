const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GatewayIntentBits } = require("discord.js");
const { BASE_INTENTS, buildIntents } = require("../src/intents");

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
