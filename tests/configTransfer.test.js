const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDb } = require("../src/db");
const {
  FORMAT,
  VERSION,
  MAX_BYTES,
  exportGuild,
  importGuild,
  parseConfig,
  readAttachment,
} = require("../src/configTransfer");

function withDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-config-"));
  let db;
  try {
    db = openDb(path.join(dir, "t.sqlite"));
  } catch (error) {
    if (String(error.message).includes("Could not locate the bindings file")) {
      t.skip("better-sqlite3 native bindings are not built on this Node");
      return null;
    }
    throw error;
  }
  t.after(() => {
    db.raw.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

function snapshot(db, guildId) {
  db.ensureGuild(guildId);
  const { updated_at, ...guild } = db.getGuild.get(guildId);
  return {
    guild,
    routes: db.listRoutes.all(guildId),
    ignores: db.listIgnores.all(guildId),
  };
}

function sourcePayload() {
  return {
    format: FORMAT,
    version: VERSION,
    guildId: "100",
    guild: {
      locale: "tr",
      timezone: "Europe/Istanbul",
      default_channel: "chan-a",
      ignore_bots: 0,
      ignore_webhooks: 1,
      ignore_self: 1,
      embed_show_ids: 1,
      embed_show_jump: 0,
      embed_compact: 1,
      embed_color_create: 0x112233,
      embed_color_update: null,
      embed_color_delete: 0xff0000,
      embed_footer: "mod log",
      history_limit: 500,
      mention_role: "role-a",
    },
    routes: [
      { eventKey: "messageDelete", enabled: true, channelId: "chan-a" },
      { eventKey: "guildBanAdd", enabled: true, channelId: null },
    ],
    ignores: [
      { kind: "user", targetId: "user-a" },
      { kind: "role", targetId: "role-a" },
      { kind: "channel", targetId: "chan-a" },
    ],
    extra: {
      quietStart: "23:00",
      quietEnd: "07:00",
      includeChannels: ["chan-a", "chan-missing"],
      staffChannel: "chan-a",
      strings: { "event.messageDelete": "silindi" },
      colors: { info: 0x00ff00 },
      eventColors: { messageDelete: 0x123456 },
      eventCooldown: { messageDelete: 0, guildBanAdd: 60 },
      hiddenFields: { messageDelete: ["id", "jump"] },
      redact: { url: true },
    },
  };
}

test("export includes format, settings, routes, ignores, extra, and no webhook secrets", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("100", {
    webhook_id: "webhook-id-secret",
    webhook_token: "webhook-token-secret",
    default_channel: "chan-a",
  });
  db.setRoute("100", "messageDelete", { enabled: true, channelId: "chan-a" });
  db.addIgnore.run("100", "user", "user-a");
  db.setExtra("100", { quietStart: "23:00" });

  const out = exportGuild(db, "100", { now: 0 });
  assert.equal(out.format, FORMAT);
  assert.equal(out.version, VERSION);
  assert.equal(out.exportedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(out.guildId, "100");
  assert.equal(out.guild.default_channel, "chan-a");
  assert.equal(out.routes[0].eventKey, "messageDelete");
  assert.equal(out.ignores[0].targetId, "user-a");
  assert.deepEqual(out.extra, { quietStart: "23:00" });

  const text = JSON.stringify(out);
  assert.ok(!text.includes("webhook-id-secret"));
  assert.ok(!text.includes("webhook-token-secret"));
  assert.equal(out.guild.webhook_id, undefined);
  assert.equal(out.guild.webhook_token, undefined);
});

test("round-trips config into another guild and keeps its webhook", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("200", { webhook_id: "target-id", webhook_token: "target-token" });
  const payload = parseConfig(JSON.stringify(sourcePayload()));

  const counts = importGuild(db, "200", payload, {
    resolveChannel: (id) => ({ "chan-a": "chan-b", "role-a": "role-b" })[id] || null,
    resolveRole: (id) => ({ "role-a": "role-b" })[id] || null,
  });

  assert.equal(counts.settings, 15);
  assert.equal(counts.routes, 2);
  assert.equal(counts.ignores, 3);
  assert.equal(counts.skipped, 0);

  const row = db.getGuild.get("200");
  assert.equal(row.locale, "tr");
  assert.equal(row.timezone, "Europe/Istanbul");
  assert.equal(row.default_channel, "chan-b");
  assert.equal(row.ignore_bots, 0);
  assert.equal(row.embed_show_jump, 0);
  assert.equal(row.embed_color_create, 0x112233);
  assert.equal(row.embed_color_update, null);
  assert.equal(row.history_limit, 500);
  assert.equal(row.mention_role, "role-b");
  assert.equal(row.webhook_id, "target-id");
  assert.equal(row.webhook_token, "target-token");

  const routes = db.listRoutes.all("200");
  const del = routes.find((r) => r.event_key === "messageDelete");
  assert.equal(del.enabled, 1);
  assert.equal(del.channel_id, "chan-b");
  assert.equal(routes.find((r) => r.event_key === "guildBanAdd").channel_id, null);

  assert.deepEqual(
    db.listIgnores.all("200").map((r) => `${r.kind}:${r.target_id}`).sort(),
    ["channel:chan-b", "role:role-a", "user:user-a"],
  );

  const extra = db.extraOf(db.getGuild.get("200"));
  assert.deepEqual(extra.includeChannels, ["chan-b"]);
  assert.equal(extra.staffChannel, "chan-b");
  assert.equal(extra.quietStart, "23:00");
  assert.deepEqual(extra.strings, { "event.messageDelete": "silindi" });
  assert.deepEqual(extra.colors, { info: 0x00ff00 });
  assert.deepEqual(extra.eventColors, { messageDelete: 0x123456 });
  assert.deepEqual(extra.eventCooldown, { messageDelete: 0, guildBanAdd: 60 });
  assert.deepEqual(extra.hiddenFields, { messageDelete: ["id", "jump"] });
  assert.deepEqual(extra.redact, { url: true });
});

test("skips invalid per-event overrides", (t) => {
  const db = withDb(t);
  if (!db) return;
  const payload = sourcePayload();
  payload.extra.eventColors = {
    messageDelete: 0x000000,
    guildBanAdd: "#ff0000",
    notAnEvent: 0x123456,
    messageUpdate: 0x1000000,
  };
  payload.extra.eventCooldown = {
    messageDelete: 0,
    guildBanAdd: 3601,
    notAnEvent: 5,
    messageUpdate: 1.5,
  };

  const counts = importGuild(db, "201", payload);
  assert.equal(counts.skipped, 6);
  const extra = db.extraOf(db.getGuild.get("201"));
  assert.deepEqual(extra.eventColors, { messageDelete: 0 });
  assert.deepEqual(extra.eventCooldown, { messageDelete: 0 });
});

test("replaces omitted settings and clears missing mention roles", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("700", {
    locale: "tr",
    timezone: "Europe/Istanbul",
    default_channel: "old-chan",
    ignore_bots: 1,
    embed_show_ids: 1,
    embed_footer: "old footer",
    history_limit: 500,
    mention_role: "role-old",
    webhook_id: "keep-id",
    webhook_token: "keep-token",
  });
  db.setExtra("700", { quietStart: "23:00" });
  db.setRoute("700", "messageDelete", { enabled: true, channelId: "old-chan" });
  db.addIgnore.run("700", "user", "old-user");

  const counts = importGuild(db, "700", {
    format: FORMAT,
    version: VERSION,
    guild: { locale: "de", mention_role: "role-missing" },
    routes: [],
    ignores: [],
    extra: {},
  }, { resolveRole: () => null });

  const row = db.getGuild.get("700");
  assert.equal(counts.settings, 2);
  assert.equal(counts.skipped, 1);
  assert.equal(row.locale, "de");
  for (const key of [
    "timezone",
    "default_channel",
    "ignore_bots",
    "embed_show_ids",
    "embed_footer",
    "history_limit",
    "mention_role",
  ]) {
    assert.equal(row[key], null, key);
  }
  assert.equal(row.webhook_id, "keep-id");
  assert.equal(row.webhook_token, "keep-token");
  assert.deepEqual(db.extraOf(row), {});
  assert.equal(db.listRoutes.all("700").length, 0);
  assert.equal(db.listIgnores.all("700").length, 0);
});

test("rejects invalid payloads before writing anything", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("300", { locale: "en", default_channel: "keep-chan" });
  db.setRoute("300", "messageDelete", { enabled: true, channelId: "keep-chan" });
  db.addIgnore.run("300", "user", "keep-user");
  db.setExtra("300", { quietStart: "01:00" });
  const before = snapshot(db, "300");

  const bad = [
    null,
    [],
    {},
    { format: "other", version: VERSION },
    { format: FORMAT, version: 2 },
    { format: FORMAT, version: "1" },
    { format: FORMAT, version: VERSION, guild: [] },
    { format: FORMAT, version: VERSION, routes: {} },
    { format: FORMAT, version: VERSION, ignores: {} },
    { format: FORMAT, version: VERSION, extra: [] },
  ];
  for (const payload of bad) {
    assert.throws(() => importGuild(db, "300", payload), (error) => {
      assert.ok(error.message.length > 0);
      return true;
    }, JSON.stringify(payload));
  }
  assert.deepEqual(snapshot(db, "300"), before);
});

test("parseConfig rejects malformed JSON and oversized input", () => {
  assert.throws(() => parseConfig("{not json"), /invalid JSON/);
  assert.throws(() => parseConfig("[]"), /JSON object/);
  assert.throws(() => parseConfig("x".repeat(MAX_BYTES + 1)), /larger than/);
  assert.throws(() => parseConfig(null), /invalid JSON/);
});

test("skips unknown event keys, ignore kinds, settings, and extra keys", (t) => {
  const db = withDb(t);
  if (!db) return;
  const counts = importGuild(db, "400", {
    format: FORMAT,
    version: VERSION,
    guild: { locale: "xx", ignore_bots: "yes", history_limit: -1, unknown_column: 1 },
    routes: [
      { eventKey: "messageDelete", enabled: true, channelId: null },
      { eventKey: "notARealEvent", enabled: true, channelId: null },
      { eventKey: "messageUpdate", enabled: "yes", channelId: "c1" },
    ],
    ignores: [
      { kind: "user", targetId: "u1" },
      { kind: "guild", targetId: "g1" },
      { kind: "role", targetId: "" },
    ],
    extra: { paused: true, unknownKey: "ignored", delivery: "carrier-pigeon" },
  });

  assert.equal(counts.routes, 1);
  assert.equal(counts.ignores, 1);
  assert.equal(counts.skippedRoutes, 2);
  assert.equal(counts.skippedIgnores, 2);
  assert.equal(counts.skippedSettings, 3);
  assert.equal(counts.skippedExtra, 2);
  assert.equal(counts.skipped, 9);

  assert.equal(db.listRoutes.all("400").length, 1);
  assert.equal(db.listIgnores.all("400").length, 1);
  const row = db.getGuild.get("400");
  assert.equal(row.locale, null);
  assert.equal(row.ignore_bots, null);
  assert.equal(row.history_limit, null);
  const extra = db.extraOf(row);
  assert.deepEqual(extra, { paused: true });
});

test("missing channels fall back to the channel option or null", (t) => {
  const db = withDb(t);
  if (!db) return;
  const payload = sourcePayload();
  payload.guild.default_channel = "missing-default";
  payload.routes[0].channelId = "missing-route";
  payload.extra.includeChannels = ["missing-watch", "missing-watch"];
  payload.extra.staffChannel = "missing-staff";

  importGuild(db, "500", payload, { resolveChannel: () => "fallback" });
  assert.equal(db.getGuild.get("500").default_channel, "fallback");
  assert.equal(db.getRoute.get("500", "messageDelete").channel_id, "fallback");
  const extra = db.extraOf(db.getGuild.get("500"));
  assert.deepEqual(extra.includeChannels, ["fallback"]);
  assert.equal(extra.staffChannel, "fallback");

  importGuild(db, "501", payload, { resolveChannel: () => null });
  assert.equal(db.getGuild.get("501").default_channel, null);
  assert.equal(db.getRoute.get("501", "messageDelete").channel_id, null);
  assert.deepEqual(db.extraOf(db.getGuild.get("501")).includeChannels, []);
  assert.equal(db.extraOf(db.getGuild.get("501")).staffChannel, null);
});

test("rolls back every table when a write fails mid-import", (t) => {
  const db = withDb(t);
  if (!db) return;
  db.setGuild("600", { locale: "en", default_channel: "keep-chan" });
  db.setRoute("600", "messageDelete", { enabled: true, channelId: "keep-chan" });
  db.addIgnore.run("600", "user", "keep-user");
  db.setExtra("600", { quietStart: "01:00" });
  const before = snapshot(db, "600");

  db.raw.exec("CREATE TRIGGER fail_ignore BEFORE INSERT ON ignores BEGIN SELECT RAISE(ABORT, 'boom'); END");
  assert.throws(
    () => importGuild(db, "600", sourcePayload(), { resolveChannel: (id) => id }),
    /boom/,
  );
  assert.deepEqual(snapshot(db, "600"), before);
});

test("readAttachment checks size before and after download", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(sourcePayload())) };
  };

  await assert.rejects(
    readAttachment({ url: "https://cdn.example/x", size: MAX_BYTES + 1 }, { fetchImpl }),
    /larger than/,
  );
  assert.equal(calls, 0);

  const parsed = await readAttachment({ url: "https://cdn.example/x", size: 10 }, { fetchImpl });
  assert.equal(parsed.format, FORMAT);
  assert.equal(calls, 1);

  await assert.rejects(
    readAttachment({ url: "https://cdn.example/x" }, {
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(MAX_BYTES + 1, 32) }),
    }),
    /larger than/,
  );
  await assert.rejects(
    readAttachment({ url: "https://cdn.example/x" }, {
      fetchImpl: async () => ({ ok: false, status: 500 }),
    }),
    /download failed/,
  );
});

test("readAttachment rejects oversized content-length before reading", async () => {
  let arrayBufferCalled = false;
  let cancelled = false;
  const response = {
    ok: true,
    headers: { get: (name) => (name === "content-length" ? String(MAX_BYTES + 1) : null) },
    body: {
      cancel: async () => {
        cancelled = true;
      },
    },
    arrayBuffer: async () => {
      arrayBufferCalled = true;
      return Buffer.alloc(0);
    },
  };

  await assert.rejects(
    readAttachment({ url: "https://cdn.example/big" }, { fetchImpl: async () => response }),
    /larger than/,
  );
  assert.equal(arrayBufferCalled, false);
  assert.equal(cancelled, true);
});

test("readAttachment cancels an oversized stream at the size cap", async () => {
  let reads = 0;
  let cancelled = false;
  const body = {
    getReader() {
      return {
        read: async () => {
          reads += 1;
          if (reads === 1) return { done: false, value: Buffer.alloc(700 * 1024, 32) };
          if (reads === 2) return { done: false, value: Buffer.alloc(700 * 1024, 32) };
          return { done: true, value: undefined };
        },
        cancel: async () => {
          cancelled = true;
        },
        releaseLock() {},
      };
    },
  };

  await assert.rejects(
    readAttachment({ url: "https://cdn.example/stream" }, {
      fetchImpl: async () => ({ ok: true, body }),
    }),
    /larger than/,
  );
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test("readAttachment passes an abort signal and propagates aborts", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = options;
    return { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(sourcePayload())) };
  };

  const parsed = await readAttachment({ url: "https://cdn.example/x", size: 10 }, { fetchImpl });
  assert.equal(parsed.format, FORMAT);
  assert.ok(seen && seen.signal, "download should receive an abort signal");
  assert.equal(typeof seen.signal.addEventListener, "function");

  await assert.rejects(
    readAttachment({ url: "https://cdn.example/x", size: 10 }, {
      fetchImpl: async (url, options) => {
        assert.ok(options.signal);
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      },
    }),
    /aborted/,
  );
});

test("slash commands register export/import with a file option", () => {
  const { ApplicationCommandOptionType } = require("discord.js");
  const { data } = require("../src/commands");
  const json = data().toJSON();
  const names = json.options.map((o) => o.name);
  assert.ok(names.includes("export"));
  assert.ok(names.includes("import"));
  const imp = json.options.find((o) => o.name === "import");
  const file = imp.options.find((o) => o.name === "file");
  assert.equal(file.type, ApplicationCommandOptionType.Attachment);
  assert.equal(file.required, true);
  assert.ok(imp.options.some((o) => o.name === "channel"));
});
