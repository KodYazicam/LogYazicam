const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactText } = require("../src/redact");

test("always strips token-like strings when flags include discord-token", () => {
  const flags = { "discord-token": true, url: true, mention: true };
  const out = redactText("see https://evil.test and <@123>", flags);
  assert.match(out, /\[url\]/);
  assert.match(out, /\[mention\]/);
});
