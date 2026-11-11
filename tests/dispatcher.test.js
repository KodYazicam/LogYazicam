const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
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
  const channelFetchCalls = [];
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
    channels: {
      fetch: async (id) => {
        channelFetchCalls.push(id);
        if (options.channelFetch) return options.channelFetch(id);
        return channel;
      },
    },
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
  return { dispatch, cfg, hookCalls, channelSends, channelFetchCalls, sleeps, warnings, errors };
}

async function readFileWhenReady(file) {
  let text = "";
  for (let i = 0; i < 50; i += 1) {
    if (fs.existsSync(file)) {
      text = fs.readFileSync(file, "utf8");
      if (text) return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return text;
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

test("webhook delivery succeeds without fetching the channel", async () => {
  const h = setup({
    channelFetch: async () => {
      throw new Error("Unknown Channel");
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.hookCalls.length, 1);
  assert.deepEqual(h.channelFetchCalls, []);
});

test("webhook failure with fallback enabled fetches the channel", async () => {
  const h = setup({
    processCfg: { allowWebhookFallback: true },
    send: async () => {
      throw new Error("hook down");
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.channelFetchCalls.length, 1);
  assert.equal(h.channelSends.length, 1);
});

test("file sink runs without fetching the channel when discord is not in the sinks", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sink-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const h = setup({
    cfg: { webhookId: null, webhookToken: null, delivery: "embed" },
    item: makeItem({ preferWebhook: false }),
    processCfg: { logSink: "file", fileSinkDir: dir },
  });

  await h.dispatch.tick();
  assert.deepEqual(h.channelFetchCalls, []);

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, "g1", `${day}.jsonl`);
  let text = "";
  for (let i = 0; i < 50; i += 1) {
    if (fs.existsSync(file)) {
      text = fs.readFileSync(file, "utf8");
      if (text) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(fs.existsSync(file), "file sink should create a jsonl file");
  assert.match(text, /"guildId":"g1"/);
});

test("a bad file sink does not drop Discord delivery", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sink-bad-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "not a directory");

  const h = setup({
    cfg: { webhookId: null, webhookToken: null, delivery: "embed" },
    item: makeItem({ preferWebhook: false }),
    processCfg: { logSink: "file,discord", fileSinkDir: blocker },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.metrics.dropped, 0);
  assert.equal(h.channelSends.length, 1);
  assert.ok(h.warnings.some((line) => /file sink failed/.test(line)));
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
test("file sink runs before a successful webhook delivery", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sink-webhook-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const h = setup({
    processCfg: { logSink: "file,discord", fileSinkDir: dir },
  });

  await h.dispatch.tick();
  assert.equal(h.hookCalls.length, 1);
  assert.equal(h.channelFetchCalls.length, 0);

  const day = new Date().toISOString().slice(0, 10);
  const text = await readFileWhenReady(path.join(dir, "g1", `${day}.jsonl`));
  assert.match(text, /"guildId":"g1"/);
});

test("sink output is written once across a 429 retry", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sink-retry-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let attempts = 0;
  const h = setup({
    processCfg: { logSink: "file,discord", fileSinkDir: dir },
    send: async () => {
      attempts += 1;
      if (attempts === 1) throw rateLimited();
    },
  });

  await h.dispatch.tick();
  await h.dispatch.tick();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const day = new Date().toISOString().slice(0, 10);
  const text = await readFileWhenReady(path.join(dir, "g1", `${day}.jsonl`));
  assert.equal(text.trim().split("\n").length, 1);
});
test("staff-channel copies bypass a configured webhook", async () => {
  const h = setup({
    item: makeItem({ staff: true, channelId: "staff", preferWebhook: false }),
  });

  await h.dispatch.tick();
  assert.equal(h.hookCalls.length, 0);
  assert.deepEqual(h.channelFetchCalls, ["staff"]);
  assert.equal(h.channelSends.length, 1);
  assert.equal(h.dispatch.metrics.sent, 1);
});
