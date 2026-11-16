const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AttachmentBuilder } = require("discord.js");
const { createDispatcher } = require("../src/dispatcher");
const { openDb } = require("../src/db");
const { processConfig } = require("../src/config");

function harness(t, options = {}) {
  let db = options.db;
  if (!db) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-pending-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    try {
      db = openDb(path.join(dir, "t.sqlite"));
    } catch (error) {
      if (!String(error.message).includes("Could not locate the bindings file")) throw error;
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
  }
  const sent = [];
  const sleeps = [];
  let clock = options.now || 0;
  let ready = options.ready !== false;
  const channel = {
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      if (options.channelSend) return options.channelSend(payload);
      return payload;
    },
  };
  const dispatch = createDispatcher({
    client: { user: { id: "self" }, channels: { fetch: async () => channel }, isReady: () => ready },
    db,
    processCfg: {
      sendIntervalMs: 10000, maxQueue: 20, retry429: true, retryMax: 5,
      allowWebhookFallback: false, logSink: "discord",
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    cache: new Map([["g1", { id: "g1", webhookId: null, delivery: "embed", mentionRole: null }]]),
    deps: {
      setInterval: () => ({ unref() {} }),
      now: () => clock,
      sleep: async (ms) => { sleeps.push(ms); },
    },
  });
  return {
    db, dispatch, sent, sleeps,
    setReady: (value) => { ready = value; },
  };
}

function item(overrides = {}) {
  return {
    id: "p1", channelId: "c1", content: "hello", embeds: [], files: [],
    guildId: "g1", preferWebhook: false, eventKey: "messageDelete", staff: false,
    ...overrides,
  };
}

test("persists, restores, and removes a delivery exactly once", async (t) => {
  const first = harness(t);
  if (!first) return;
  const file = new AttachmentBuilder(Buffer.from("snapshot body"), { name: "message-1.txt" });
  first.dispatch.queues.set("g1:c1", [item({ retryAt: 60000, files: [file] })]);

  assert.equal(await first.dispatch.drain({ timeoutMs: 0 }), 1);
  await first.dispatch.drain({ timeoutMs: 0 });
  assert.equal(first.db.pendingDeliveryCount(), 1, "draining twice must not duplicate the row");
  const [row] = first.db.listPendingDeliveries();
  assert.equal(row.retryAt, 60000);
  assert.equal(row.files[0].name, "message-1.txt");

  const second = harness(t, { db: first.db, now: 70000 });
  assert.equal(second.dispatch.restorePending(), 1);
  assert.equal(second.dispatch.restorePending(), 0, "restoring twice must not duplicate the item");
  await second.dispatch.tick();
  assert.equal(second.sent.length, 1);
  assert.equal(second.sent[0].files[0].attachment.toString("utf8"), "snapshot body");
  assert.equal(first.db.pendingDeliveryCount(), 0, "delivery removes the row");
  await second.dispatch.tick();
  assert.equal(second.sent.length, 1);
});

test("an empty queue exits without a database write", async (t) => {
  const h = harness(t);
  if (!h) return;
  let writes = 0;
  const save = h.db.savePendingDelivery.bind(h.db);
  h.db.savePendingDelivery = (row) => { writes += 1; return save(row); };
  assert.equal(await h.dispatch.drain({ timeoutMs: 5000 }), 0);
  assert.equal(writes, 0);
});

test("drain persists immediately when every item waits on a future retryAt", async (t) => {
  const h = harness(t);
  if (!h) return;
  h.dispatch.queues.set("g1:c1", [item({ retryAt: 5000 })]);
  assert.equal(await h.dispatch.drain({ timeoutMs: 5000 }), 1);
  assert.deepEqual(h.sleeps, [], "must not sleep through the shutdown budget");
  assert.equal(h.db.pendingDeliveryCount(), 1);
});

test("restored items wait for the client instead of being dropped", async (t) => {
  const first = harness(t);
  if (!first) return;
  first.dispatch.queues.set("g1:c1", [item()]);
  await first.dispatch.drain({ timeoutMs: 0 });

  const second = harness(t, { db: first.db, ready: false });
  assert.equal(second.dispatch.restorePending(), 1);
  await second.dispatch.tick();
  assert.equal(second.sent.length, 0);
  assert.equal(first.db.pendingDeliveryCount(), 1);

  second.setReady(true);
  await second.dispatch.tick();
  assert.equal(second.sent.length, 1);
  assert.equal(first.db.pendingDeliveryCount(), 0);
});

test("a permanently dropped restored item removes its row", async (t) => {
  const first = harness(t);
  if (!first) return;
  first.dispatch.queues.set("g1:c1", [item()]);
  await first.dispatch.drain({ timeoutMs: 0 });

  const second = harness(t, {
    db: first.db,
    channelSend: async () => { throw Object.assign(new Error("bad request"), { httpStatus: 400 }); },
  });
  assert.equal(second.dispatch.restorePending(), 1);
  await second.dispatch.tick();
  assert.equal(second.sent.length, 1);
  assert.equal(first.db.pendingDeliveryCount(), 0);
});

test("SHUTDOWN_FLUSH_MS defaults to 5000 and accepts 0", () => {
  assert.equal(processConfig({}).shutdownFlushMs, 5000);
  assert.equal(processConfig({ SHUTDOWN_FLUSH_MS: "1200" }).shutdownFlushMs, 1200);
  assert.equal(processConfig({ SHUTDOWN_FLUSH_MS: "0" }).shutdownFlushMs, 0);
});
