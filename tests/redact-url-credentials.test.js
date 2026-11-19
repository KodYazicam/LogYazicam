const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactText, flagsFrom } = require("../src/redact");

const defaults = {
  redactUrls: false,
  redactMentions: false,
  redactEmails: false,
  redactInvites: false,
};

// Production flags with every optional pattern off. The userinfo pass must
// still run because the credential is a secret, not an optional link.
const flags = flagsFrom({ extra: {} }, defaults);

test("connection-string credentials are stripped with every optional flag off", () => {
  assert.equal(flags.url, false);
  assert.equal(flags.email, false);

  const cases = [
    ["http://user:pass@example.test/path", "http://[credentials]@example.test/path"],
    ["https://user:pass@example.test/path", "https://[credentials]@example.test/path"],
    ["postgres://app:s3cr3t@db.internal:5432/prod", "postgres://[credentials]@db.internal:5432/prod"],
    ["postgresql://app:s3cr3t@db.internal/prod", "postgresql://[credentials]@db.internal/prod"],
    ["redis://:hunter2@cache:6379/0", "redis://[credentials]@cache:6379/0"],
    ["rediss://app:s3cr3t@cache:6380/0", "rediss://[credentials]@cache:6380/0"],
    ["mongodb+srv://user:pass@cluster.example/db", "mongodb+srv://[credentials]@cluster.example/db"],
    ["POSTGRES://app:s3cr3t@db.internal/prod", "POSTGRES://[credentials]@db.internal/prod"],
    ["https://user:p%40ss@example.test/path", "https://[credentials]@example.test/path"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(redactText(input, flags), expected, input);
  }
});

test("every credential URL in a message is stripped", () => {
  const text =
    "primary postgres://app:one@db.internal/prod and cache redis://:two@cache:6379/0, mirror https://ops:three@example.test/x";
  const out = redactText(text, flags);

  assert.equal(
    out,
    "primary postgres://[credentials]@db.internal/prod and cache redis://[credentials]@cache:6379/0, mirror https://[credentials]@example.test/x",
  );
  assert.doesNotMatch(out, /one|two|three/);
});

test("userinfo credentials are stripped even when url redaction is enabled", () => {
  const out = redactText("postgres://app:s3cr3t@db.internal/prod", { ...flags, url: true });
  assert.equal(out, "postgres://[credentials]@db.internal/prod");
  assert.doesNotMatch(out, /s3cr3t/);
});

test("the credential pass is not limited to defaults passed through flagsFrom", () => {
  const allOff = {
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

  assert.equal(
    redactText("redis://:hunter2@cache:6379/0", allOff),
    "redis://[credentials]@cache:6379/0",
  );
});

test("URLs without a credential pair are left alone", () => {
  const cases = [
    "https://example.test/path?q=1",
    "postgres://db.internal:5432/prod",
    "mailto:ops@example.test",
    "ops@example.test",
    "git+ssh://git@github.com/KodYazicam/LogYazicam",
    "notes:item@2 is prose, not a URL",
  ];

  for (const input of cases) {
    assert.equal(redactText(input, flags), input, input);
  }
});
