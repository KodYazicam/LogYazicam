const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactText, flagsFrom, eventRedactFlags } = require("../src/redact");

const PROC = {
  redactUrls: false,
  redactMentions: false,
  redactEmails: false,
  redactInvites: false,
};

const TOKEN = "AbCdEf0123456789_-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijk";

const WEBHOOKS = [
  ["discord.com", `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`],
  ["discord.com v10", `https://discord.com/api/v10/webhooks/123456789012345678/${TOKEN}`],
  ["canary.discord.com", `https://canary.discord.com/api/webhooks/123456789012345678/${TOKEN}`],
  ["ptb.discord.com", `https://ptb.discord.com/api/webhooks/123456789012345678/${TOKEN}`],
  ["discordapp.com", `https://discordapp.com/api/webhooks/123456789012345678/${TOKEN}`],
];

test("default flags redact Discord webhook URLs as an always-on secret", () => {
  const flags = flagsFrom(null, PROC);
  assert.equal(flags.url, false);
  assert.equal(flags["webhook-url"], true);
  for (const [name, url] of WEBHOOKS) {
    assert.equal(redactText(`hook ${url} end`, flags), "hook [webhook-url] end", name);
  }
});

test("url:true keeps the webhook redaction", () => {
  const flags = { ...flagsFrom(null, PROC), url: true };
  assert.equal(redactText(`hook ${WEBHOOKS[0][1]}`, flags), "hook [webhook-url]");
});

test("event overrides cannot disable the always-on webhook pattern", () => {
  const base = flagsFrom(null, PROC);
  const flags = eventRedactFlags(
    { eventRedact: { messageCreate: { url: false } } },
    "messageCreate",
    base,
  );
  assert.equal(flags["webhook-url"], true);
  assert.equal(redactText(WEBHOOKS[0][1], flags), "[webhook-url]");
});

test("ordinary URLs are only redacted by the optional url flag", () => {
  const text = `docs https://example.test/guide and ${WEBHOOKS[0][1]}`;
  assert.equal(
    redactText(text, flagsFrom(null, PROC)),
    "docs https://example.test/guide and [webhook-url]",
  );
  assert.equal(
    redactText(text, { ...flagsFrom(null, PROC), url: true }),
    "docs [url] and [webhook-url]",
  );
});
