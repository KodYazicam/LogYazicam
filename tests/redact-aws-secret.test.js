const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redactText, flagsFrom } = require("../src/redact");

const PROCESS_DEFAULTS = {
  redactUrls: false,
  redactMentions: false,
  redactEmails: false,
  redactInvites: false,
};

const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const SESSION_TOKEN =
  "IQoJb3JpZ2luX2VjEJr//////////wEaCXVzLWVhc3QtMSJHMEUCIQD" + "A".repeat(160);

function defaults() {
  return flagsFrom(null, PROCESS_DEFAULTS);
}

test("redacts an aws_secret_access_key assignment with the default flags", () => {
  const out = redactText(`aws_secret_access_key=${SECRET}`, defaults());
  assert.equal(out, "[aws-secret]");
  assert.doesNotMatch(out, /wJalrXUtnFEMI/);
});

test("redacts quoted, YAML, and JSON forms of the secret access key", () => {
  const cases = [
    `AWS_SECRET_ACCESS_KEY="${SECRET}"`,
    `aws_secret_access_key: ${SECRET}`,
    `PROD_AWS_SECRET_ACCESS_KEY=${SECRET}`,
    `{"SecretAccessKey":"${SECRET}"}`,
    `{"secretAccessKey":"${SECRET}"}`,
    `https://example.test/hook?aws_secret_access_key=${SECRET}&next=1`,
  ];
  for (const input of cases) {
    const out = redactText(input, defaults());
    assert.match(out, /\[aws-secret\]/, input);
    assert.doesNotMatch(out, /wJalrXUtnFEMI/, input);
  }
});

test("redacts aws_session_token / SessionToken values", () => {
  const cases = [
    `aws_session_token=${SESSION_TOKEN}`,
    `{"SessionToken":"${SESSION_TOKEN}"}`,
  ];
  for (const input of cases) {
    const out = redactText(input, defaults());
    assert.match(out, /\[aws-secret\]/, input);
    assert.doesNotMatch(out, /IQoJb3JpZ2luX2VjEJr/, input);
    assert.doesNotMatch(out, /A{100}/, input);
  }
});

test("the AWS secret rule is always on even when every optional flag is false", () => {
  const flags = {
    ...defaults(),
    url: false,
    mention: false,
    email: false,
    invite: false,
  };
  const out = redactText(`aws_secret_access_key=${SECRET}`, flags);
  assert.equal(out, "[aws-secret]");
  assert.doesNotMatch(out, /wJalrXUtnFEMI/);
});

test("does not redact contextless or short values", () => {
  const contextless = `hash=${"A".repeat(40)}`;
  assert.equal(redactText(contextless, defaults()), contextless);

  const shortValue = "secret_access_key: abc";
  assert.equal(redactText(shortValue, defaults()), shortValue);

  const prose = "the secret_access_key: documentation explains rotation";
  assert.equal(redactText(prose, defaults()), prose);
});

test("AWS access key IDs (AKIA and ASIA) keep their existing label", () => {
  const out = redactText(
    "id=ASIAIOSFODNN7EXAMPLE legacy=AKIAIOSFODNN7EXAMPLE",
    defaults()
  );
  assert.equal(out, "id=[aws-key] legacy=[aws-key]");
});
