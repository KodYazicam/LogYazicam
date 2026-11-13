const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MAX_RETRY_DELAY_MS, parseRetryAfter, retryDecision } = require("../src/retry");

const NOW = Date.parse("2026-11-13T18:00:00.000Z");

test("parseRetryAfter reads delta seconds and caps the delay", () => {
  assert.equal(parseRetryAfter("0", NOW), 0);
  assert.equal(parseRetryAfter("2", NOW), 2000);
  assert.equal(parseRetryAfter("0.25", NOW), 250);
  assert.equal(parseRetryAfter(3, NOW), 3000);
  assert.equal(parseRetryAfter("9999", NOW), MAX_RETRY_DELAY_MS);
});

test("parseRetryAfter reads HTTP-date values", () => {
  assert.equal(parseRetryAfter(new Date(NOW + 30000).toUTCString(), NOW), 30000);
  assert.equal(parseRetryAfter(new Date(NOW - 30000).toUTCString(), NOW), 0);
  assert.equal(
    parseRetryAfter(new Date(NOW + 60 * 60 * 1000).toUTCString(), NOW),
    MAX_RETRY_DELAY_MS,
  );
});

test("parseRetryAfter rejects invalid and negative values", () => {
  for (const value of [undefined, null, "", "   ", "soon", "-1", "-0.5", {}, []]) {
    assert.equal(parseRetryAfter(value, NOW), null, JSON.stringify(value));
  }
});

test("retryDecision reads Retry-After from common error carriers", () => {
  const carriers = [
    { headers: { "Retry-After": "2" } },
    { headers: new Headers({ "retry-after": "2" }) },
    { headers: new Map([["retry-after", "2"]]) },
    { response: { headers: { "retry-after": "2" } } },
    { rawError: { headers: { "retry-after": "2" } } },
    { cause: { headers: { "retry-after": "2" } } },
  ];
  for (const carrier of carriers) {
    const decision = retryDecision(Object.assign(new Error("unavailable"), carrier), NOW);
    assert.deepEqual(decision, { retryable: true, delayMs: 2000, status: 0 });
  }
});

test("retryDecision prefers Retry-After and falls back for invalid headers", () => {
  const withHeader = Object.assign(new Error("limited"), {
    httpStatus: 429,
    retryAfter: 0.02,
    headers: { "retry-after": "7" },
  });
  assert.deepEqual(retryDecision(withHeader, NOW), { retryable: true, delayMs: 7000, status: 429 });

  const invalidHeader = Object.assign(new Error("limited"), {
    httpStatus: 429,
    retryAfter: 0.02,
    headers: { "retry-after": "not-a-date" },
  });
  assert.deepEqual(retryDecision(invalidHeader, NOW), { retryable: true, delayMs: 20, status: 429 });

  const noDelay = Object.assign(new Error("limited"), { httpStatus: 429 });
  assert.deepEqual(retryDecision(noDelay, NOW), { retryable: true, delayMs: 1000, status: 429 });
});

test("retryDecision treats 503 as retryable and keeps 500 as a drop", () => {
  const unavailable = Object.assign(new Error("unavailable"), { status: 503 });
  assert.deepEqual(retryDecision(unavailable, NOW), { retryable: true, delayMs: 1000, status: 503 });

  const serverError = Object.assign(new Error("server error"), { httpStatus: 500 });
  assert.deepEqual(retryDecision(serverError, NOW), { retryable: false, delayMs: 1000, status: 500 });
});

test("retryDecision understands Discord.js millisecond retryAfter values", () => {
  const rateLimit = Object.assign(new Error("rate limited"), {
    name: "RateLimitError[/webhooks]",
    httpStatus: 429,
    retryAfter: 1500,
    timeToReset: 1500,
  });
  assert.deepEqual(retryDecision(rateLimit, NOW), { retryable: true, delayMs: 1500, status: 429 });
});

test("retryDecision caps huge embedded retryAfter values", () => {
  const error = Object.assign(new Error("limited"), { httpStatus: 429, retryAfter: 99999 });
  assert.equal(retryDecision(error, NOW).delayMs, MAX_RETRY_DELAY_MS);
});
