const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactText, flagsFrom } = require("../src/redact");

test("always strips token-like strings when flags include discord-token", () => {
  const flags = { "discord-token": true, url: true, mention: true };
  const out = redactText("see https://evil.test and <@123>", flags);
  assert.match(out, /\[url\]/);
  assert.match(out, /\[mention\]/);
});

test("always strips anthropic, aws, stripe, and slack token shapes", () => {
  const flags = flagsFrom(null, { redactUrls: false, redactMentions: false });
  const out = redactText(
    "keys: sk-ant-abcdefghijklmnopqrst and AKIA1234567890ABCDEF " +
      "and sk_live_abcdefghijklmnopqrst and xoxb-1234567890abcdefgh",
    flags,
  );
  assert.doesNotMatch(out, /sk-ant-/);
  assert.doesNotMatch(out, /AKIA/);
  assert.doesNotMatch(out, /sk_live_/);
  assert.doesNotMatch(out, /xoxb-/);
  assert.match(out, /\[anthropic\]/);
  assert.match(out, /\[aws-key\]/);
  assert.match(out, /\[stripe\]/);
  assert.match(out, /\[slack-token\]/);
});
