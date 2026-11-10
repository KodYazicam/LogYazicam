const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDispatcher } = require("../src/dispatcher");

function makeItem(overrides = {}) {
  return {
    channelId: "c1",
    content: "hello",
    embeds: [],
    files: [],
    guildId: "g1",
    preferWebhook: true,
    eventKey: "messageDelete",
    summary: "message deleted",
    staff: false,
    ...overrides,
  };
}

function setup(options = {}) {
  const hookCalls = [];
  const channelSends = [];
  const sleeps = [];
  const warnings = [];
  const errors = [];
  const cfg = {
    id: "g1",
    webhookId: "123",
    webhookToken: "secret",
    delivery: "webhook",
    mentionRole: null,
    ignores: [],
    lastError: null,
    ...(options.cfg || {}),
  };
  const channel = {
    isTextBased: () => true,
    send: async (payload) => {
      channelSends.push(payload);
      if (options.channelSend) return options.channelSend(payload);
      return payload;
    },
  };
  const client = {
    user: { id: "self" },
    channels: { fetch: async () => channel },
  };
  const processCfg = {
    sendIntervalMs: 25,
    maxQueue: 20,
    retry429: true,
    allowWebhookFallback: false,
    logSink: "discord",
    webhookName: "LogYazicam",
    ...(options.processCfg || {}),
  };
  let sendCall = 0;
  const dispatch = createDispatcher({
    client,
    db: {},
    processCfg,
    log: {
      warn: (...args) => warnings.push(args.join(" ")),
      error: (...args) => errors.push(args),
    },
    cache: new Map([["g1", cfg]]),
    deps: {
      setInterval: () => ({ unref() {} }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      createWebhookClient: () => ({
        send: async (payload) => {
          hookCalls.push(payload);
          const impl = options.send || (async () => payload);
          return impl(payload, sendCall++);
        },
      }),
    },
  });
  if (options.queued !== false) dispatch.queues.set("g1:c1", [options.item || makeItem()]);
  return { dispatch, cfg, hookCalls, channelSends, sleeps, warnings, errors };
}

const rateLimited = () =>
  Object.assign(new Error("rate limited"), { httpStatus: 429, retryAfter: 0.02 });

test("delivers a webhook message once and records metrics.sent", async () => {
  const h = setup();
  await h.dispatch.tick();

  assert.deepEqual(h.dispatch.metrics, { sent: 1, dropped: 0, retries: 0 });
  assert.equal(h.hookCalls.length, 1);
  assert.equal(h.hookCalls[0].content, "hello");
  assert.equal(h.hookCalls[0].username, "LogYazicam");
  assert.equal(h.channelSends.length, 0);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("retries a 429 once and does not duplicate the delivered message", async () => {
  let attempts = 0;
  const h = setup({
    send: async (payload) => {
      attempts += 1;
      if (attempts === 1) throw rateLimited();
      return payload;
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 0);
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.metrics.dropped, 0);
  assert.deepEqual(h.sleeps, [20]);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.metrics.dropped, 0);
  assert.equal(attempts, 2);
  assert.equal(h.hookCalls.length, 2);
  assert.equal(h.channelSends.length, 0);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("does not retry a 429 when RETRY_429 is off", async () => {
  const h = setup({
    processCfg: { retry429: false },
    send: async () => {
      throw rateLimited();
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 0);
  assert.equal(h.dispatch.metrics.retries, 0);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.deepEqual(h.sleeps, []);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("drops a 500 without retrying and records the guild error", async () => {
  const h = setup({
    send: async () => {
      throw Object.assign(new Error("server error"), { httpStatus: 500 });
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 0);
  assert.equal(h.dispatch.metrics.retries, 0);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.equal(h.cfg.lastError, "server error");
  assert.equal(h.errors.length, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("drops a timed-out webhook send without calling the channel when fallback is off", async () => {
  const h = setup({
    send: async () => {
      throw new Error("request timed out");
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 0);
  assert.equal(h.dispatch.metrics.retries, 0);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.match(h.warnings[0], /request timed out/);
  assert.equal(h.channelSends.length, 0);
  assert.equal(h.cfg.lastError, "request timed out");
});

test("falls back to channel.send when webhook delivery fails and fallback is enabled", async () => {
  const h = setup({
    processCfg: { allowWebhookFallback: true },
    send: async () => {
      throw Object.assign(new Error("server error"), { httpStatus: 500 });
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.metrics.retries, 0);
  assert.equal(h.dispatch.metrics.dropped, 0);
  assert.equal(h.channelSends.length, 1);
  assert.equal(h.channelSends[0].content, "hello");
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("enqueue routes an event into the queue and tick delivers it", async () => {
  const h = setup({
    queued: false,
    cfg: {
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "deleted" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.hookCalls.length, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});
