const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const { createDashboard } = require("../src/dashboard");

function setup(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-dashboard-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      fs.rmSync(dir, { recursive: true, force: true });
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
    throw error;
  }
  db.ensureGuild("111");
  db.ensureGuild("222");
  db.pushHistory("111", "messageDelete", { channelId: "c1", summary: "one", secret: "do-not-leak" }, 10);
  db.pushHistory("111", "messageUpdate", { channelId: "c2", summary: "two" }, 10);
  db.pushHistory("222", "messageDelete", { channelId: "c3", summary: "three" }, 10);

  const processCfg = {
    dashboardHost: "127.0.0.1",
    dashboardPort: 0,
    dashboardToken: "",
    dashboardLimit: 50,
    ...overrides,
  };
  const dashboard = createDashboard({ db, processCfg, log: { error() {} } });
  t.after(async () => {
    await dashboard.close();
    db.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { db, dashboard, processCfg };
}

async function listen(dashboard, host = "127.0.0.1") {
  const address = await dashboard.start(0, host);
  return `http://${host}:${address.port}`;
}

test("events endpoint returns newest first with reduced fields", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const response = await fetch(`${base}/api/events?limit=2`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const data = await response.json();
  assert.equal(data.count, 2);
  assert.equal(data.limit, 2);
  assert.deepEqual(data.events.map((event) => event.summary), ["three", "two"]);
  assert.deepEqual(Object.keys(data.events[0]).sort(), ["at", "channelId", "eventKey", "guildId", "summary"]);
  assert.doesNotMatch(JSON.stringify(data), /do-not-leak/);
});

test("events endpoint filters by guild and validates the id", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const filtered = await (await fetch(`${base}/api/events?guildId=111`)).json();
  assert.equal(filtered.count, 2);
  assert.ok(filtered.events.every((event) => event.guildId === "111"));

  assert.equal((await fetch(`${base}/api/events?guildId=not-a-snowflake`)).status, 400);
});

test("events endpoint filters by event key and time", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  setupResult.db.raw.prepare("UPDATE history SET created_at = 1 WHERE id = 1").run();
  const base = await listen(setupResult.dashboard);

  const byEvent = await (await fetch(`${base}/api/events?event=messageDelete`)).json();
  assert.equal(byEvent.count, 2);
  assert.deepEqual(byEvent.events.map((event) => event.summary), ["three", "one"]);
  assert.deepEqual(byEvent.filters, { guildId: null, event: "messageDelete", since: 0 });

  const recent = await (await fetch(`${base}/api/events?since=1000`)).json();
  assert.equal(recent.count, 2);
  assert.deepEqual(recent.events.map((event) => event.summary), ["three", "two"]);

  const combined = await (await fetch(`${base}/api/events?guildId=111&event=messageUpdate`)).json();
  assert.equal(combined.count, 1);
  assert.equal(combined.events[0].summary, "two");
});

test("events endpoint rejects unknown events and invalid time filters", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  assert.equal((await fetch(`${base}/api/events?event=notAnEvent`)).status, 400);
  assert.equal((await fetch(`${base}/api/events?since=nope`)).status, 400);
  assert.equal((await fetch(`${base}/api/events?since=-1`)).status, 400);
  assert.equal((await fetch(`${base}/api/events?since=1.5`)).status, 400);
});

test("limit is capped and invalid values fall back to the configured default", async (t) => {
  const setupResult = setup(t, { dashboardLimit: 1 });
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const capped = await (await fetch(`${base}/api/events?limit=9999`)).json();
  assert.equal(capped.limit, 500);
  assert.equal(capped.count, 3);

  const fallback = await (await fetch(`${base}/api/events?limit=nope`)).json();
  assert.equal(fallback.limit, 1);
  assert.equal(fallback.count, 1);
});

test("non-positive configured limit falls back to 50 instead of SQLite's unlimited -1", async (t) => {
  const setupResult = setup(t, { dashboardLimit: -5 });
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const data = await (await fetch(`${base}/api/events?limit=nope`)).json();
  assert.equal(data.limit, 50);
  assert.equal(data.count, 3);
});

test("serves the read-only page without external assets", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const response = await fetch(`${base}/`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /<table>/);
  assert.match(body, /\/api\/events/);
  assert.match(body, /id="event"/);
  assert.match(body, /id="since"/);
  assert.doesNotMatch(body, /<script[^>]+src=/i);
  assert.doesNotMatch(body, /<link[^>]+href=/i);
  assert.doesNotMatch(body, /https?:\/\//i);
});

test("health reports guild and history counts", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  const data = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(data, { ok: true, guilds: 2, events: 3 });
});

test("bearer token is required for API routes when configured", async (t) => {
  const setupResult = setup(t, { dashboardToken: "s3cret" });
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  assert.equal((await fetch(`${base}/api/events`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/events`, { headers: { authorization: "Bearer wrong" } })).status,
    401,
  );
  assert.equal(
    (await fetch(`${base}/api/health`, { headers: { authorization: "Bearer wrong" } })).status,
    401,
  );
  const ok = await fetch(`${base}/api/events`, { headers: { authorization: "Bearer s3cret" } });
  assert.equal(ok.status, 200);
  assert.equal((await fetch(`${base}/`)).status, 200);
});

test("non-loopback bind is refused without a token", async (t) => {
  const setupResult = setup(t, { dashboardHost: "0.0.0.0" });
  if (!setupResult) return;
  await assert.rejects(
    () => setupResult.dashboard.start(0, "0.0.0.0"),
    /DASHBOARD_TOKEN is required/,
  );
});

test("malformed history payloads fall back to the event key", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  setupResult.db.raw
    .prepare("INSERT INTO history (guild_id, event_key, payload, created_at) VALUES (?, ?, ?, ?)")
    .run("111", "channelCreate", "{not-json", Date.now());
  const base = await listen(setupResult.dashboard);

  const data = await (await fetch(`${base}/api/events`)).json();
  const malformed = data.events.find((event) => event.eventKey === "channelCreate");
  assert.ok(malformed);
  assert.equal(malformed.summary, "channelCreate");
  assert.equal(malformed.channelId, null);
});

test("invalid dashboard ports reject before listening", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;

  await assert.rejects(
    () => setupResult.dashboard.start(-1, "127.0.0.1"),
    /invalid DASHBOARD_PORT/,
  );
  await assert.rejects(
    () => setupResult.dashboard.start(70000, "127.0.0.1"),
    /invalid DASHBOARD_PORT/,
  );
});

test("unknown routes return 404 and non-GET returns 405", async (t) => {
  const setupResult = setup(t);
  if (!setupResult) return;
  const base = await listen(setupResult.dashboard);

  assert.equal((await fetch(`${base}/nope`)).status, 404);
  const post = await fetch(`${base}/api/events`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
});

test("API failures return a 500 and log the request error", async (t) => {
  const errors = [];
  const db = {
    listGuilds: { all: () => [] },
    historyCount: () => 0,
    recentHistory() {
      throw new Error("history down");
    },
  };
  const dashboard = createDashboard({
    db,
    processCfg: {
      dashboardHost: "127.0.0.1",
      dashboardPort: 0,
      dashboardToken: "",
      dashboardLimit: 50,
    },
    log: { error: (...args) => errors.push(args) },
  });
  t.after(() => dashboard.close());
  const address = await dashboard.start(0, "127.0.0.1");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/events`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error" });
  assert.ok(errors.some((args) => args[0] === "dashboard request" && args[1].message === "history down"));
});
