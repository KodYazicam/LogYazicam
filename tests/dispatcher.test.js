const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
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
  let clock = Number.isFinite(options.now) ? options.now : 0;
  const dispatch = createDispatcher({
    client,
    db: options.db || {},
    processCfg,
    log: {
      warn: (...args) => warnings.push(args.join(" ")),
      error: (...args) => errors.push(args),
    },
    cache: new Map([["g1", cfg]]),
    deps: {
      setInterval: () => ({ unref() {} }),
      now: () => clock,
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
  return { dispatch, cfg, hookCalls, channelSends, channelFetchCalls, sleeps, warnings, errors, advance: (ms) => { clock += ms; } };
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
  assert.deepEqual(h.sleeps, []);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(attempts, 1);

  h.advance(20);
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

test("drops an item after RETRY_MAX retries", async () => {
  let attempts = 0;
  const h = setup({
    processCfg: { retryMax: 2 },
    send: async () => {
      attempts += 1;
      throw rateLimited();
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  h.advance(20);
  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 2);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  h.advance(20);
  await h.dispatch.tick();
  assert.equal(attempts, 3);
  assert.equal(h.dispatch.metrics.retries, 2);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
  assert.equal(h.cfg.lastError, "rate limited");
});

test("RETRY_MAX=0 drops a 429 without retrying", async () => {
  const h = setup({
    processCfg: { retryMax: 0 },
    send: async () => {
      throw rateLimited();
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 0);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("uses Retry-After seconds on a 429", async () => {
  let attempts = 0;
  const h = setup({
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("rate limited"), {
          httpStatus: 429,
          retryAfter: 0.02,
          headers: { "retry-after": "2" },
        });
      }
      return { ok: true };
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  h.advance(1999);
  await h.dispatch.tick();
  assert.equal(attempts, 1);

  h.advance(1);
  await h.dispatch.tick();
  assert.equal(attempts, 2);
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("uses Retry-After HTTP-date on a 503", async () => {
  const start = Date.parse("2026-11-13T18:00:00.000Z");
  let attempts = 0;
  const h = setup({
    now: start,
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("service unavailable"), {
          httpStatus: 503,
          headers: { "retry-after": new Date(start + 5000).toUTCString() },
        });
      }
      return { ok: true };
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  h.advance(4999);
  await h.dispatch.tick();
  assert.equal(attempts, 1);

  h.advance(1);
  await h.dispatch.tick();
  assert.equal(attempts, 2);
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("invalid Retry-After on a 503 falls back to the existing backoff", async () => {
  let attempts = 0;
  const h = setup({
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("service unavailable"), {
          httpStatus: 503,
          headers: { "retry-after": "not-a-date" },
        });
      }
      return { ok: true };
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);

  h.advance(999);
  await h.dispatch.tick();
  assert.equal(attempts, 1);

  h.advance(1);
  await h.dispatch.tick();
  assert.equal(attempts, 2);
  assert.equal(h.dispatch.metrics.sent, 1);
});

test("caps Retry-After at five minutes", async () => {
  let attempts = 0;
  const h = setup({
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("rate limited"), {
          httpStatus: 429,
          headers: { "retry-after": "99999" },
        });
      }
      return { ok: true };
    },
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.retries, 1);

  h.advance(299999);
  await h.dispatch.tick();
  assert.equal(attempts, 1);

  h.advance(1);
  await h.dispatch.tick();
  assert.equal(attempts, 2);
  assert.equal(h.dispatch.metrics.sent, 1);
});

test("503 honors RETRY_MAX and drops after exhaustion", async () => {
  let attempts = 0;
  const h = setup({
    processCfg: { retryMax: 2 },
    send: async () => {
      attempts += 1;
      throw Object.assign(new Error("service unavailable"), {
        httpStatus: 503,
        headers: { "retry-after": "0" },
      });
    },
  });

  await h.dispatch.tick();
  assert.equal(attempts, 1);
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  await h.dispatch.tick();
  assert.equal(attempts, 2);
  assert.equal(h.dispatch.metrics.retries, 2);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  await h.dispatch.tick();
  assert.equal(attempts, 3);
  assert.equal(h.dispatch.metrics.retries, 2);
  assert.equal(h.dispatch.metrics.dropped, 1);
  assert.equal(h.dispatch.queues.get("g1:c1").length, 0);
});

test("a rate-limited channel does not block other queues", async () => {
  const h = setup({
    queued: false,
    send: async (payload) => {
      if (payload.content === "slow") throw rateLimited();
      return payload;
    },
  });
  h.dispatch.queues.set("g1:c1", [makeItem({ content: "slow" })]);
  h.dispatch.queues.set("g1:c2", [makeItem({ content: "fast", channelId: "c2" })]);

  await h.dispatch.tick();
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
  assert.equal(h.dispatch.queues.get("g1:c2").length, 0);
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.dispatch.metrics.retries, 1);
  assert.deepEqual(h.sleeps, []);
});

test("a second tick does not deliver an in-flight item twice", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const h = setup({
    send: async (payload) => {
      await gate;
      return payload;
    },
  });

  const first = h.dispatch.tick();
  const second = h.dispatch.tick();
  release();
  await Promise.all([first, second]);

  assert.equal(h.hookCalls.length, 1);
  assert.equal(h.dispatch.metrics.sent, 1);
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
test("drain flushes queued items and reports an empty queue", async () => {
  const h = setup({
    queued: false,
    cfg: {
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "drain me" });
  assert.equal(h.dispatch.queueSize(), 1);
  assert.equal(await h.dispatch.drain({ timeoutMs: 1000, intervalMs: 1 }), 0);
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.hookCalls.length, 1);
});

test("per-event cooldown zero disables the guild cooldown", async () => {
  const h = setup({
    queued: false,
    cfg: {
      cooldownSec: 60,
      eventCooldown: { messageDelete: 0 },
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "two" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
});

test("a per-event digest zero disables digesting for that event only", async () => {
  const h = setup({
    queued: false,
    cfg: {
      digestMs: 10000,
      eventDigest: { messageDelete: { ms: 0 } },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "two" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
});

test("a per-event actor mode filters only that event", async () => {
  const h = setup({
    queued: false,
    cfg: {
      actors: "all",
      eventActors: { messageDelete: "humans" },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "bot edit", bot: true });
  assert.equal(h.dispatch.queues.get("g1:c1"), undefined);
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "human edit", bot: false });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "bot update", bot: true });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
});

test("a quiet-hours bypass applies only to the selected event and not pause", async () => {
  const events = {
    messageDelete: { on: true, channelId: "c1" },
    guildBanAdd: { on: true, channelId: "c1" },
  };
  const h = setup({
    queued: false,
    cfg: {
      quietStart: "00:00",
      quietEnd: "00:00",
      timezone: "UTC",
      quietBypass: { guildBanAdd: true },
      events,
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "quiet drop" });
  assert.equal(h.dispatch.queues.get("g1:c1"), undefined);
  await h.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "critical" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  const paused = setup({
    queued: false,
    cfg: {
      paused: true,
      quietStart: "00:00",
      quietEnd: "00:00",
      timezone: "UTC",
      quietBypass: { guildBanAdd: true },
      events,
    },
  });
  await paused.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "paused" });
  assert.equal(paused.dispatch.queues.get("g1:c1"), undefined);
});

test("a per-event include list restricts only that event", async () => {
  const h = setup({
    queued: false,
    cfg: {
      includeChannels: ["c1"],
      eventIncludeChannels: { messageDelete: ["c2"] },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", {
    summary: "wrong channel",
    ignore: { channel: { id: "c1" } },
  });
  assert.equal(h.dispatch.queues.get("g1:c1"), undefined);
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", {
    summary: "event channel",
    ignore: { channel: { id: "c2" } },
  });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", {
    summary: "guild channel",
    ignore: { channel: { id: "c1" } },
  });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", {
    summary: "outside guild list",
    ignore: { channel: { id: "c2" } },
  });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
});

test("a per-event redaction override applies only to that event", async () => {
  const h = setup({
    queued: false,
    cfg: {
      delivery: "embed",
      extra: { redact: { url: true } },
      eventRedact: {
        messageDelete: { url: false },
        guildBanAdd: { url: true },
      },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        guildBanAdd: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", {
    summary: "delete",
    content: "see https://example.com/delete",
  });
  const kept = h.dispatch.queues.get("g1:c1").at(-1);
  assert.match(kept.content, /https:\/\/example\.com\/delete/);

  await h.dispatch.enqueue({ id: "g1" }, "guildBanAdd", {
    summary: "ban",
    content: "see https://example.com/ban",
  });
  const redacted = h.dispatch.queues.get("g1:c1").at(-1);
  assert.match(redacted.content, /\[url\]/);
  assert.doesNotMatch(redacted.content, /https:\/\/example\.com\/ban/);
});

test("a per-event delivery mode overrides the guild mode", async () => {
  const events = {
    messageDelete: { on: true, channelId: "c1" },
    guildBanAdd: { on: true, channelId: "c1" },
    channelDelete: { on: true, channelId: "c1" },
  };
  const embed = { title: "Deleted", fields: [{ name: "channel", value: "#logs" }] };
  const h = setup({
    queued: false,
    cfg: {
      delivery: "embed",
      plainText: true,
      eventDelivery: {
        messageDelete: "plain",
        guildBanAdd: "embed",
        channelDelete: "webhook",
      },
      events,
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "plain", embeds: [embed] });
  const plain = h.dispatch.queues.get("g1:c1").at(-1);
  assert.deepEqual(plain.embeds, []);
  assert.match(plain.content, /Deleted/);
  assert.equal(plain.preferWebhook, false);

  await h.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "embed", embeds: [embed] });
  const keep = h.dispatch.queues.get("g1:c1").at(-1);
  assert.equal(keep.embeds.length, 1);
  assert.equal(keep.embeds[0].data.title, "Deleted");
  assert.equal(keep.preferWebhook, false);

  await h.dispatch.enqueue({ id: "g1" }, "channelDelete", { summary: "hook", embeds: [embed] });
  const hook = h.dispatch.queues.get("g1:c1").at(-1);
  assert.equal(hook.preferWebhook, true);
  assert.equal(hook.embeds[0].data.title, "Deleted");
});

test("per-event history overrides the guild storeHistory setting", async () => {
  const pushes = [];
  const db = { pushHistory: (...args) => pushes.push(args) };
  const events = {
    messageDelete: { on: true, channelId: "c1" },
    guildBanAdd: { on: true, channelId: "c1" },
    messageUpdate: { on: true, channelId: "c1" },
  };

  const off = setup({
    queued: false,
    db,
    cfg: {
      storeHistory: false,
      eventHistory: { messageDelete: true, guildBanAdd: false },
      events,
    },
  });
  await off.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "force on" });
  await off.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "force off" });
  await off.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "guild off" });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][1], "messageDelete");

  pushes.length = 0;
  const on = setup({
    queued: false,
    db,
    cfg: {
      storeHistory: true,
      eventHistory: { guildBanAdd: false },
      events,
    },
  });
  await on.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "guild on" });
  await on.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "force off" });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][1], "messageDelete");
});

test("a per-event cooldown applies only to that event key", async () => {
  const h = setup({
    queued: false,
    cfg: {
      cooldownSec: 0,
      eventCooldown: { messageDelete: 60 },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "two" });
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "three" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
});

test("dedupe cache evicts the oldest key at DEDUPE_MAX", async () => {
  const h = setup({
    queued: false,
    processCfg: { dedupeMax: 2 },
    cfg: {
      cooldownSec: 60,
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
        guildBanAdd: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "two" });
  await h.dispatch.enqueue({ id: "g1" }, "guildBanAdd", { summary: "three" });
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "four" });

  assert.equal(h.dispatch.queues.get("g1:c1").length, 4);
});

test("dedupe entries expire after DEDUPE_TTL_MS", async () => {
  const h = setup({
    queued: false,
    processCfg: { dedupeTtlMs: 1000 },
    cfg: {
      cooldownSec: 600,
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "two" });
  h.advance(999);
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "three" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);

  h.advance(1);
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "four" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
});

test("history buffer evicts the oldest pending digest bucket", async () => {
  const h = setup({
    queued: false,
    processCfg: { historyMax: 1 },
    cfg: {
      digestMs: 20,
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "two" });
  await new Promise((resolve) => setTimeout(resolve, 60));

  const queue = h.dispatch.queues.get("g1:c1");
  assert.equal(queue?.length ?? 0, 1);
  assert.equal(queue[0].eventKey, "messageUpdate");
});

test("history buffer expires stale pending digest buckets", async () => {
  const h = setup({
    queued: false,
    processCfg: { historyTtlMs: 10 },
    cfg: {
      digestMs: 1000,
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  h.advance(50);
  await h.dispatch.tick();

  assert.equal(h.dispatch.queues.get("g1:c1")?.length ?? 0, 0);
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

test("enqueue applies role ignores from the member cache", async () => {
  const guild = {
    id: "g1",
    members: {
      cache: new Map([
        ["u1", { roles: { cache: new Map([["r1", { id: "r1" }]]) } }],
        ["u2", { roles: { cache: new Map([["r2", { id: "r2" }]]) } }],
      ]),
    },
  };
  const h = setup({
    queued: false,
    cfg: {
      ignores: [{ kind: "role", target_id: "r1" }],
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue(guild, "messageDelete", { summary: "ignored", userId: "u1" });
  assert.equal(h.dispatch.queues.get("g1:c1"), undefined);
  await h.dispatch.enqueue(guild, "messageDelete", { summary: "kept", userId: "u2" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
});

test("a per-event embed/plain mode forces channel delivery when the guild uses a webhook", async () => {
  const h = setup({
    queued: false,
    cfg: {
      delivery: "webhook",
      eventDelivery: { messageDelete: "embed" },
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", {
    summary: "embed override",
    embeds: [{ title: "Deleted" }],
  });
  const item = h.dispatch.queues.get("g1:c1").at(-1);
  assert.equal(item.eventDelivery, "embed");
  await h.dispatch.tick();
  assert.equal(h.hookCalls.length, 0);
  assert.equal(h.channelSends.length, 1);
  assert.equal(h.dispatch.metrics.sent, 1);
});

test("a missing channel is counted as dropped, not sent", async () => {
  const h = setup({
    cfg: { webhookId: null, webhookToken: null, delivery: "embed" },
    item: makeItem({ preferWebhook: false }),
    channelFetch: async () => null,
  });

  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 0);
  assert.equal(h.dispatch.metrics.dropped, 1);
});

test("queue overflow drops the oldest item and records it", async () => {
  const h = setup({
    queued: false,
    processCfg: { maxQueue: 1 },
    cfg: { events: { messageDelete: { on: true, channelId: "c1" } } },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "two" });
  const q = h.dispatch.queues.get("g1:c1");
  assert.equal(q.length, 1);
  assert.equal(q[0].summary, "two");
  assert.equal(h.dispatch.metrics.dropped, 1);
});

test("actor filters leave events without a known actor unaffected", async () => {
  const h = setup({
    queued: false,
    cfg: {
      actors: "humans",
      events: { channelDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "channelDelete", { summary: "no actor" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
  await h.dispatch.enqueue({ id: "g1" }, "channelDelete", { summary: "bot", bot: true });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
});

test("refreshGuild rebuilds and caches the merged guild config", () => {
  const h = setup({
    queued: false,
    processCfg: {
      colors: {
        create: 0x00ff00,
        update: 0xffcc00,
        delete: 0xff0000,
        voice: 0x5865f2,
        member: 0xff69b4,
        mod: 0xff8800,
        info: 0x5865f2,
      },
    },
    db: {
      ensureGuild: () => ({}),
      getGuild: {
        get: () => ({
          id: "g1",
          locale: "tr",
          timezone: "UTC",
          default_channel: "c1",
          extra_json: "{}",
        }),
      },
      listRoutes: {
        all: () => [{ event_key: "messageDelete", enabled: 1, channel_id: "c1" }],
      },
      listIgnores: { all: () => [] },
      extraOf: () => ({}),
    },
  });

  const cfg = h.dispatch.refreshGuild("g1");
  assert.equal(cfg.locale, "tr");
  assert.equal(cfg.events.messageDelete.on, true);
  assert.equal(cfg.events.messageDelete.channelId, "c1");
  assert.equal(h.dispatch.guildCfg("g1"), cfg);
});

test("an old enough account passes the minimum account age filter", async () => {
  const h = setup({
    queued: false,
    cfg: {
      minAccountDays: 30,
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", {
    summary: "old account",
    createdTimestamp: Date.now() - 31 * 86400000,
  });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 1);
});

test("digest buckets flush after the window with and without enough events", async () => {
  const h = setup({
    queued: false,
    cfg: {
      locale: "en",
      digestMs: 20,
      colors: { info: 0x5865f2, delete: 0xff0000 },
      showTimestamp: false,
      showCredit: false,
      hiddenFields: {},
      eventDigest: { messageUpdate: { ms: 20, min: 2 } },
      events: {
        messageDelete: { on: true, channelId: "c1" },
        messageUpdate: { on: true, channelId: "c1" },
      },
    },
    processCfg: { digestMin: 1 },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "one" });
  await h.dispatch.enqueue({ id: "g1" }, "messageUpdate", { summary: "two" });
  assert.equal(h.dispatch.queues.get("g1:c1")?.length ?? 0, 0);

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);

  await h.dispatch.tick();
  await h.dispatch.tick();
  assert.equal(h.hookCalls.length, 2);
  const digest = h.hookCalls.find((payload) => payload.embeds?.length);
  assert.ok(digest);
  assert.match(digest.embeds[0].data.description, /messageDelete/);
});

test("enqueue copies to the staff channel and logs route failures", async () => {
  const h = setup({
    queued: false,
    cfg: {
      staffChannel: "staff",
      events: { messageDelete: { on: true, channelId: "c1" } },
    },
  });

  await h.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "copy" });
  assert.equal(h.dispatch.queues.get("g1:c1").length, 2);
  assert.equal(h.dispatch.queues.get("g1:c1")[1].staff, true);
  assert.equal(h.dispatch.queues.get("g1:c1")[1].channelId, "staff");

  const failing = setup({
    queued: false,
    cfg: {
      events: new Proxy({}, {
        get() {
          throw new Error("route failure");
        },
      }),
    },
  });
  await failing.dispatch.enqueue({ id: "g1" }, "messageDelete", { summary: "boom" });
  assert.equal(failing.errors.length, 1);
  assert.match(failing.errors[0].join(" "), /route failure/);
});

test("preferWebhook without credentials warns and falls back to channel", async () => {
  const h = setup({
    item: makeItem({ preferWebhook: true }),
    cfg: { webhookId: null, webhookToken: null, delivery: "channel" },
  });

  await h.dispatch.tick();
  assert.equal(h.hookCalls.length, 0);
  assert.deepEqual(h.channelFetchCalls, ["c1"]);
  assert.equal(h.channelSends.length, 1);
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.ok(h.warnings.some((warning) => warning.includes("no webhook configured")));
});

test("HTTP sinks mirror events and sink exceptions do not drop delivery", async (t) => {
  const received = [];
  let resolveReceived;
  const sinkReceived = new Promise((resolve) => {
    resolveReceived = resolve;
  });
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(204);
      res.end();
      resolveReceived();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const { port } = server.address();

  const h = setup({
    item: makeItem({ summary: "http sink" }),
    processCfg: {
      logSink: "http",
      httpSinkUrl: `http://127.0.0.1:${port}/sink`,
    },
  });
  await h.dispatch.tick();
  assert.equal(h.dispatch.metrics.sent, 1);
  assert.equal(h.hookCalls.length, 1);
  await sinkReceived;
  assert.equal(received.length, 1);
  assert.equal(received[0].summary, "http sink");

  const sinksPath = require.resolve("../src/sinks");
  const sinks = require(sinksPath);
  const original = sinks.postHttpSink;
  sinks.postHttpSink = () => {
    throw new Error("sink exploded");
  };
  try {
    const failing = setup({
      item: makeItem({ summary: "sink failure" }),
      processCfg: {
        logSink: "http",
        httpSinkUrl: "http://127.0.0.1:9/sink",
      },
    });
    await failing.dispatch.tick();
    assert.equal(failing.dispatch.metrics.sent, 1);
    assert.ok(failing.warnings.some((warning) => warning.includes("sink exploded")));
  } finally {
    sinks.postHttpSink = original;
  }
});
