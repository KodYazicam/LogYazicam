const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { redactText, redactEmbeds, redactFiles, flagsFrom, eventRedactFlags } = require("../src/redact");

const BASE_FLAGS = {
  redactUrls: false,
  redactMentions: false,
  redactEmails: false,
  redactInvites: false,
};

function block(label, body) {
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

const KEYS = [
  ["RSA PRIVATE KEY", "MIIEowIBAAKCAQEA" + "A".repeat(48)],
  ["EC PRIVATE KEY", "MHcCAQEEIB" + "b".repeat(40)],
  ["OPENSSH PRIVATE KEY", "b3BlbnNzaC1rZXktdjEAAAAABG5vbmU" + "c".repeat(32)],
  ["PGP PRIVATE KEY BLOCK", "lQOYBGabcdefghijklmnop" + "d".repeat(32)],
  ["ENCRYPTED PRIVATE KEY", "MIGbMFcGCSqGSIb3DQEFDTBKMCkGCSqGSIb3" + "e".repeat(32)],
  ["PRIVATE KEY", "MC4CAQAwBQYDK2VwBCIEI" + "f".repeat(40)],
];

test("flagsFrom enables private-key with defaults and per-guild overrides", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  assert.equal(flags["private-key"], true);

  const overridden = flagsFrom(
    { extra: { redact: { url: true, mention: true, email: true, invite: true } } },
    { ...BASE_FLAGS, redactUrls: true, redactMentions: true, redactEmails: true, redactInvites: true },
  );
  assert.equal(overridden["private-key"], true);

  const perEvent = eventRedactFlags(
    { eventRedact: { messageCreate: { url: true, mention: true, email: true, invite: true } } },
    "messageCreate",
    overridden,
  );
  assert.equal(perEvent["private-key"], true);
});

test("always strips every PEM private-key flavour without leaving the body", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  for (const [label, body] of KEYS) {
    const key = block(label, body);
    const out = redactText(`before\n${key}\nafter`, flags);
    assert.equal(out, "before\n[private-key]\nafter", label);
    assert.ok(!out.includes(body), `${label} body leaked`);
    assert.ok(!out.includes("-----BEGIN"), `${label} header leaked`);
    assert.ok(!out.includes("-----END"), `${label} footer leaked`);
  }
});

test("redacts a truncated private-key paste through the end of the text", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  const truncated = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA";
  assert.equal(redactText(`key:\n${truncated}`, flags), "key:\n[private-key]");
});

test("public keys, certificates and prose stay untouched", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  const text = [
    "-----BEGIN PUBLIC KEY-----",
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE",
    "-----END PUBLIC KEY-----",
    "-----BEGIN CERTIFICATE-----",
    "MIICpDCCAYwCCQDU",
    "-----END CERTIFICATE-----",
    "We discussed BEGIN and END markers and the PRIVATE KEY wording.",
  ].join("\n");
  assert.equal(redactText(text, flags), text);
});

test("private-key stays off when the flag is not set", () => {
  const flags = { ...flagsFrom(null, BASE_FLAGS), "private-key": false };
  const key = block(KEYS[0][0], KEYS[0][1]);
  assert.equal(redactText(key, flags), key);
});

test("redactEmbeds strips a private key from title, description and fields", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  const key = block(KEYS[0][0], KEYS[0][1]);
  const source = new EmbedBuilder()
    .setTitle(`key ${key}`)
    .setDescription(`deleted message\n${key}`)
    .addFields({ name: "content", value: key });

  const [result] = redactEmbeds([source], flags);
  const json = result.toJSON();
  const serialized = JSON.stringify(json);
  assert.match(json.title, /\[private-key\]/);
  assert.equal(json.description, "deleted message\n[private-key]");
  assert.equal(json.fields[0].value, "[private-key]");
  assert.ok(!serialized.includes(KEYS[0][1]));
});

test("redactFiles strips a private key from the long-message .txt attachment", () => {
  const flags = flagsFrom(null, BASE_FLAGS);
  const key = block(KEYS[2][0], KEYS[2][1]);
  const file = new AttachmentBuilder(Buffer.from(`deleted message\n${key}`, "utf8"), {
    name: "message-m1.txt",
  });

  const [out] = redactFiles([file], flags);
  assert.notEqual(out, file);
  assert.equal(out.name, "message-m1.txt");
  assert.equal(out.attachment.toString("utf8"), "deleted message\n[private-key]");
});
