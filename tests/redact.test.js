const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EmbedBuilder } = require("discord.js");
const { redactText, redactEmbeds, flagsFrom, eventRedactFlags } = require("../src/redact");

const BASE_FLAGS = {
  redactUrls: false,
  redactMentions: false,
  redactEmails: false,
  redactInvites: false,
};

const off = {
  url: false,
  mention: false,
  email: false,
  invite: false,
  "discord-token": false,
  "github-token": false,
  openai: false,
  anthropic: false,
  "aws-key": false,
  stripe: false,
  "slack-token": false,
};

const alwaysOn = {
  ...off,
  "discord-token": true,
  "github-token": true,
  openai: true,
  anthropic: true,
  "aws-key": true,
  stripe: true,
  "slack-token": true,
};

test("flagsFrom uses globals and per-guild overrides, including explicit false", () => {
  const defaults = flagsFrom(null, { ...BASE_FLAGS, redactUrls: true, redactEmails: true });
  assert.equal(defaults.url, true);
  assert.equal(defaults.email, true);
  assert.equal(defaults.mention, false);
  assert.equal(defaults.invite, false);
  for (const kind of ["discord-token", "github-token", "openai", "anthropic", "aws-key", "stripe", "slack-token"]) {
    assert.equal(defaults[kind], true, kind);
  }

  const overridden = flagsFrom(
    { extra: { redact: { url: false, mention: true, email: false, invite: true } } },
    { ...BASE_FLAGS, redactUrls: true, redactMentions: false, redactEmails: true },
  );
  assert.equal(overridden.url, false);
  assert.equal(overridden.mention, true);
  assert.equal(overridden.email, false);
  assert.equal(overridden.invite, true);
});

test("each optional redaction flag works independently", () => {
  const text = "see https://example.test/x, mail a.b+c@example.co.uk, invite discord.gg/abc, ping <@123>";

  const url = redactText(text, { ...off, url: true });
  assert.match(url, /\[url\]/);
  assert.doesNotMatch(url, /https:\/\/example\.test/);
  assert.match(url, /a\.b\+c@example\.co\.uk/);
  // Invite links follow url as well as invite.
  assert.match(url, /\[invite\]/);
  assert.match(url, /<@123>/);

  const email = redactText(text, { ...off, email: true });
  assert.match(email, /\[email\]/);
  assert.doesNotMatch(email, /a\.b\+c@example\.co\.uk/);
  assert.match(email, /https:\/\/example\.test\/x/);

  const mention = redactText(text, { ...off, mention: true });
  assert.match(mention, /\[mention\]/);
  assert.doesNotMatch(mention, /<@123>/);

  const invite = redactText(text, { ...off, invite: true });
  assert.match(invite, /\[invite\]/);
  assert.doesNotMatch(invite, /discord\.gg\/abc/);
});

test("invite is redacted when either url or invite is enabled", () => {
  assert.equal(redactText("discord.gg/abc", { ...off, invite: true }), "[invite]");
  assert.equal(redactText("discord.gg/abc", { ...off, url: true }), "[invite]");
  assert.equal(redactText("discord.gg/abc", off), "discord.gg/abc");
});

test("no flags or empty input passes through unchanged", () => {
  const text = "https://example.test a@b.co discord.gg/x <@1>";
  assert.equal(redactText(text, off), text);
  assert.equal(redactText(null, off), null);
  assert.equal(redactText("", off), "");
  assert.equal(redactText("text", null), "text");
});

test("always strips token-like strings regardless of optional flags", () => {
  const discord = `${"a".repeat(24)}.${"b".repeat(6)}.${"c".repeat(27)}`;
  const github = `ghp_${"A".repeat(20)}`;
  const openaiProject = `sk-proj-${"a".repeat(20)}`;
  const openaiLegacy = `sk-${"B".repeat(32)}`;
  const anthropic = `sk-ant-${"c".repeat(20)}`;
  const aws = "AKIA1234567890ABCDEF";
  const stripe = `sk_live_${"d".repeat(20)}`;
  const slack = "xoxb-1234567890abcdefgh";
  const out = redactText(
    `d ${discord} g ${github} o1 ${openaiProject} o2 ${openaiLegacy} a ${anthropic} w ${aws} s ${stripe} k ${slack}`,
    alwaysOn,
  );

  assert.doesNotMatch(out, /[a-c]{20,}/);
  assert.doesNotMatch(out, /ghp_/);
  assert.doesNotMatch(out, /sk-proj-/);
  assert.doesNotMatch(out, /sk-B{32}/);
  assert.doesNotMatch(out, /sk-ant-/);
  assert.doesNotMatch(out, /AKIA/);
  assert.doesNotMatch(out, /sk_live_/);
  assert.doesNotMatch(out, /xoxb-/);
  assert.match(out, /\[discord-token\]/);
  assert.match(out, /\[github-token\]/);
  assert.match(out, /\[openai\]/);
  assert.match(out, /\[anthropic\]/);
  assert.match(out, /\[aws-key\]/);
  assert.match(out, /\[stripe\]/);
  assert.match(out, /\[slack-token\]/);
});

test("ordinary text is not changed by always-on token patterns", () => {
  const text = "Deploy at 10:30; ask @ops about sk-learn and AKIA is not a key here.";
  assert.equal(redactText(text, alwaysOn), text);
});

test("redactEmbeds redacts title, description, and fields without mutating the source", () => {
  const source = new EmbedBuilder()
    .setTitle(`token ghp_${"A".repeat(20)}`)
    .setDescription("mail a@b.co and see https://example.test/x")
    .addFields({ name: "ping", value: "<@123>" });
  const before = source.toJSON();

  const flags = { ...alwaysOn, url: true, email: true, mention: true };
  const result = redactEmbeds([source], flags);

  assert.equal(result.length, 1);
  assert.ok(result[0] instanceof EmbedBuilder);
  const json = result[0].toJSON();
  assert.match(json.title, /\[github-token\]/);
  assert.match(json.description, /\[email\]/);
  assert.match(json.description, /\[url\]/);
  assert.match(json.fields[0].value, /\[mention\]/);
  assert.deepEqual(source.toJSON(), before);
});

test("redactEmbeds passes through empty lists and missing flags", () => {
  const embeds = [new EmbedBuilder().setDescription("a@b.co")];
  const empty = [];
  assert.equal(redactEmbeds(empty, alwaysOn), empty);
  assert.equal(redactEmbeds(embeds, null), embeds);
  assert.notEqual(redactEmbeds(embeds, alwaysOn), embeds);
});

test("eventRedactFlags overrides only optional per-event flags", () => {
  const base = { ...alwaysOn, url: true, email: false };
  const cfg = {
    eventRedact: {
      messageDelete: {
        url: false,
        email: true,
        invite: "true",
        "discord-token": false,
        unknown: true,
      },
    },
  };

  const flags = eventRedactFlags(cfg, "messageDelete", base);
  assert.equal(flags.url, false);
  assert.equal(flags.email, true);
  assert.equal(flags.invite, false);
  assert.equal(flags["discord-token"], true);
  assert.equal(flags.unknown, undefined);
  assert.equal(base.url, true);
  assert.deepEqual(eventRedactFlags({}, "messageDelete", base), base);
});
