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
