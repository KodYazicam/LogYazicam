const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { data, execute, clampHistoryLimit, MAX_HISTORY_LIMIT, FILTER_NAMES, SETTING_NAMES } = require("../src/commands");

function permission(json) {
  return json.default_member_permissions;
}

test("data uses the supplied config permission", () => {
  assert.equal(
    permission(data({ configPermission: "Administrator" }).toJSON()),
    String(PermissionFlagsBits.Administrator),
  );
  assert.equal(
    permission(data({ configPermission: "KickMembers" }).toJSON()),
    String(PermissionFlagsBits.KickMembers),
  );
});

test("invalid permission names fall back to ManageGuild", () => {
  assert.equal(
    permission(data({ configPermission: "NotARealPermission" }).toJSON()),
    String(PermissionFlagsBits.ManageGuild),
  );
});

test("process.env remains a fallback when no config is supplied", (t) => {
  const previous = process.env.CONFIG_PERMISSION;
  t.after(() => {
    if (previous === undefined) delete process.env.CONFIG_PERMISSION;
    else process.env.CONFIG_PERMISSION = previous;
  });
  process.env.CONFIG_PERMISSION = "BanMembers";

  assert.equal(permission(data().toJSON()), String(PermissionFlagsBits.BanMembers));
});

test("supplied config wins over process.env", (t) => {
  const previous = process.env.CONFIG_PERMISSION;
  t.after(() => {
    if (previous === undefined) delete process.env.CONFIG_PERMISSION;
    else process.env.CONFIG_PERMISSION = previous;
  });
  process.env.CONFIG_PERMISSION = "BanMembers";

  assert.equal(
    permission(data({ configPermission: "Administrator" }).toJSON()),
    String(PermissionFlagsBits.Administrator),
  );
});

test("history export limits are clamped to the slash option bounds", () => {
  assert.equal(MAX_HISTORY_LIMIT, 500);
  assert.equal(clampHistoryLimit(50), 50);
  assert.equal(clampHistoryLimit(999999), 500);
  assert.equal(clampHistoryLimit(-5, 25), 25);
  assert.equal(clampHistoryLimit(2.5, 25), 25);
  assert.equal(clampHistoryLimit(null, 25), 25);
});

test("filter allowlist rejects guild columns and unknown names", () => {
  for (const name of ["ignore_bots", "ignore_webhooks", "store_history", "mention_on_delete"]) {
    assert.equal(FILTER_NAMES.has(name), true, name);
  }
  for (const name of ["webhook_id", "webhook_token", "locale", "timezone", "default_channel", "unknown"]) {
    assert.equal(FILTER_NAMES.has(name), false, name);
  }
});

test("setting allowlist excludes internal maps and unknown names", () => {
  for (const name of ["cooldownSec", "quietDays", "fieldMax", "attachMin", "showCredit"]) {
    assert.equal(SETTING_NAMES.has(name), true, name);
  }
  for (const name of ["eventColors", "eventCooldown", "colors", "strings", "hiddenFields", "unknown"]) {
    assert.equal(SETTING_NAMES.has(name), false, name);
  }
});

test("event group exposes color overrides", () => {
  const json = data({}).toJSON();
  const event = json.options.find((group) => group.name === "event");
  const color = event.options.find((sub) => sub.name === "color");
  assert.ok(color);
  assert.deepEqual(
    color.options.map((option) => option.name).sort(),
    ["clear", "hex", "key"],
  );
  const cooldown = event.options.find((sub) => sub.name === "cooldown");
  assert.ok(cooldown);
  assert.deepEqual(
    cooldown.options.map((option) => option.name).sort(),
    ["clear", "key", "seconds"],
  );
  const reset = event.options.find((sub) => sub.name === "reset");
  assert.ok(reset);
  assert.deepEqual(reset.options.map((option) => option.name), ["key"]);
  const digest = event.options.find((sub) => sub.name === "digest");
  assert.ok(digest);
  assert.deepEqual(
    digest.options.map((option) => option.name).sort(),
    ["clear", "key", "min", "ms"],
  );
  const actors = event.options.find((sub) => sub.name === "actors");
  assert.ok(actors);
  assert.deepEqual(
    actors.options.map((option) => option.name).sort(),
    ["clear", "key", "mode"],
  );
  const bypass = event.options.find((sub) => sub.name === "bypass");
  assert.ok(bypass);
  assert.deepEqual(
    bypass.options.map((option) => option.name).sort(),
    ["enabled", "key"],
  );
  const watch = event.options.find((sub) => sub.name === "watch");
  assert.ok(watch);
  assert.deepEqual(
    watch.options.map((option) => option.name).sort(),
    ["action", "channel", "key"],
  );
  const action = watch.options.find((option) => option.name === "action");
  assert.deepEqual(
    action.choices.map((choice) => choice.value).sort(),
    ["add", "clear", "list", "remove"],
  );
  const delivery = event.options.find((sub) => sub.name === "delivery");
  assert.ok(delivery);
  assert.deepEqual(
    delivery.options.map((option) => option.name).sort(),
    ["key", "mode"],
  );
  const mode = delivery.options.find((option) => option.name === "mode");
  assert.deepEqual(
    mode.choices.map((choice) => choice.value),
    ["default", "embed", "plain", "webhook"],
  );
  const redact = event.options.find((sub) => sub.name === "redact");
  assert.ok(redact);
  assert.deepEqual(
    redact.options.map((option) => option.name).sort(),
    ["clear", "enabled", "flag", "key"],
  );
  const flag = redact.options.find((option) => option.name === "flag");
  assert.deepEqual(
    flag.choices.map((choice) => choice.value).sort(),
    ["email", "invite", "mention", "url"],
  );
});

test("set command exposes quiet-day scheduling", () => {
  const json = data({}).toJSON();
  const set = json.options.find((sub) => sub.name === "set");
  const name = set.options.find((option) => option.name === "name");
  const choice = name.choices.find((item) => item.value === "quietDays");
  assert.equal(choice.name, "quiet_days");
});

test("event color command stores and clears a black override", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (hex, clear) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "color",
      getString: (name) => (name === "key" ? "messageDelete" : hex),
      getBoolean: () => clear,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("#000000", false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventColors, { messageDelete: 0 });
  assert.match(response.content, /#000000/);

  await execute(makeInteraction(null, true), { db, dispatch, processCfg });
  assert.equal(extra.eventColors, undefined);
  assert.match(response.content, /none|—/i);
});

test("event cooldown command stores zero and clears it", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (seconds, clear) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "cooldown",
      getString: () => "messageDelete",
      getInteger: () => seconds,
      getBoolean: () => clear,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction(0, false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventCooldown, { messageDelete: 0 });
  assert.match(response.content, /0/);

  await execute(makeInteraction(null, true), { db, dispatch, processCfg });
  assert.equal(extra.eventCooldown, undefined);
  assert.match(response.content, /none|—/i);
});

test("event digest command stores a window and clears it", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (ms, min, clear) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "digest",
      getString: () => "messageDelete",
      getInteger: (name) => (name === "ms" ? ms : min),
      getBoolean: () => clear,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction(0, null, false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventDigest, { messageDelete: { ms: 0 } });
  assert.match(response.content, /0ms/);

  await execute(makeInteraction(5000, 2, false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventDigest, { messageDelete: { ms: 5000, min: 2 } });
  assert.match(response.content, /5000ms \/ 2/);

  await execute(makeInteraction(null, null, true), { db, dispatch, processCfg });
  assert.equal(extra.eventDigest, undefined);
  assert.match(response.content, /none|—/i);
});

test("event actors command stores a mode and clears it", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (mode, clear) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "actors",
      getString: (name) => (name === "key" ? "messageDelete" : mode),
      getBoolean: () => clear,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("humans", false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventActors, { messageDelete: "humans" });
  assert.match(response.content, /humans/);

  await execute(makeInteraction(null, true), { db, dispatch, processCfg });
  assert.equal(extra.eventActors, undefined);
  assert.match(response.content, /none|—/i);
});

test("event bypass command enables and disables quiet-hours bypass", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (enabled) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "bypass",
      getString: () => "guildBanAdd",
      getBoolean: () => enabled,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction(null), { db, dispatch, processCfg });
  assert.deepEqual(extra.quietBypass, { guildBanAdd: true });
  assert.match(response.content, /true/);

  await execute(makeInteraction(false), { db, dispatch, processCfg });
  assert.equal(extra.quietBypass, undefined);
  assert.match(response.content, /false/);
});

test("event watch command adds, removes, lists and clears channels", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (action, channel) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "watch",
      getString: (name) => (name === "key" ? "messageDelete" : action),
      getChannel: () => channel,
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("add", { id: "c1" }), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventIncludeChannels, { messageDelete: ["c1"] });
  assert.match(response.content, /c1/);

  await execute(makeInteraction("add", { id: "c2" }), { db, dispatch, processCfg });
  await execute(makeInteraction("add", { id: "c1" }), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventIncludeChannels, { messageDelete: ["c1", "c2"] });

  await execute(makeInteraction("list"), { db, dispatch, processCfg });
  assert.match(response.content, /c1/);
  assert.match(response.content, /c2/);

  await execute(makeInteraction("remove", { id: "c1" }), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventIncludeChannels, { messageDelete: ["c2"] });

  await execute(makeInteraction("add"), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventIncludeChannels, { messageDelete: ["c2"] });
  assert.match(response.content, /channel/i);

  await execute(makeInteraction("clear"), { db, dispatch, processCfg });
  assert.equal(extra.eventIncludeChannels, undefined);
  assert.match(response.content, /none|—/i);
});

test("event delivery command stores and restores a per-event mode", async () => {
  let extra = { eventDelivery: { guildBanAdd: "webhook" } };
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (mode) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "delivery",
      getString: (name) => (name === "key" ? "messageDelete" : mode),
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("plain"), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventDelivery, { guildBanAdd: "webhook", messageDelete: "plain" });
  assert.match(response.content, /plain/);

  await execute(makeInteraction("default"), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventDelivery, { guildBanAdd: "webhook" });
  assert.match(response.content, /none|—/i);

  await execute(makeInteraction("aliens"), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventDelivery, { guildBanAdd: "webhook" });
  assert.match(response.content, /mode/i);
});

test("event redact command stores, disables, and clears one flag", async () => {
  let extra = { eventRedact: { messageUpdate: { url: true } } };
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (flag, enabled, clear = false) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "redact",
      getString: (name) => (name === "key" ? "messageDelete" : flag),
      getBoolean: (name) => (name === "clear" ? clear : enabled),
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("email", true), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventRedact, {
    messageUpdate: { url: true },
    messageDelete: { email: true },
  });
  assert.match(response.content, /true/);

  await execute(makeInteraction("email", false), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventRedact, {
    messageUpdate: { url: true },
    messageDelete: { email: false },
  });
  assert.match(response.content, /false/);

  await execute(makeInteraction("email", true, true), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventRedact, { messageUpdate: { url: true } });
  assert.match(response.content, /none|—/i);

  await execute(makeInteraction("secrets", true), { db, dispatch, processCfg });
  assert.deepEqual(extra.eventRedact, { messageUpdate: { url: true } });
  assert.match(response.content, /flag/i);
});

test("event reset clears only that event's overrides", async () => {
  let extra = {
    eventColors: { messageDelete: 0xff0000, guildBanAdd: 0x00ff00 },
    eventCooldown: { messageDelete: 60, messageUpdate: 30 },
    eventDigest: { messageDelete: { ms: 5000 }, messageUpdate: { ms: 1000, min: 2 } },
    eventActors: { messageDelete: "humans", messageUpdate: "bots" },
    quietBypass: { messageDelete: true, messageUpdate: true },
    eventIncludeChannels: { messageDelete: ["c1"], messageUpdate: ["c2"] },
    eventDelivery: { messageDelete: "plain", messageUpdate: "webhook" },
    eventRedact: { messageDelete: { url: true }, messageUpdate: { mention: false } },
  };
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const interaction = {
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => "event",
      getSubcommand: () => "reset",
      getString: () => "messageDelete",
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  };

  await execute(interaction, { db, dispatch, processCfg });
  assert.deepEqual(extra.eventColors, { guildBanAdd: 0x00ff00 });
  assert.deepEqual(extra.eventCooldown, { messageUpdate: 30 });
  assert.deepEqual(extra.eventDigest, { messageUpdate: { ms: 1000, min: 2 } });
  assert.deepEqual(extra.eventActors, { messageUpdate: "bots" });
  assert.deepEqual(extra.quietBypass, { messageUpdate: true });
  assert.deepEqual(extra.eventIncludeChannels, { messageUpdate: ["c2"] });
  assert.deepEqual(extra.eventDelivery, { messageUpdate: "webhook" });
  assert.deepEqual(extra.eventRedact, { messageUpdate: { mention: false } });
  assert.match(response.content, /none|—/i);
});

test("quiet_days setting accepts aliases and clears with all", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const makeInteraction = (value) => ({
    guildId: "g1",
    user: { id: "u1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => "set",
      getString: (name) => (name === "name" ? "quietDays" : value),
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("Mon, Thursday"), { db, dispatch, processCfg });
  assert.deepEqual(extra.quietDays, ["mon", "thu"]);
  assert.match(response.content, /mon,thu/);

  await execute(makeInteraction("all"), { db, dispatch, processCfg });
  assert.deepEqual(extra.quietDays, []);
  assert.match(response.content, /all/);
});

test("set command rejects unknown names and out-of-range values", async () => {
  let extra = {};
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      extra = next;
    },
  };
  let response;
  const dispatch = {
    guildCfg: () => ({ locale: "en" }),
    refreshGuild: () => {},
  };
  const processCfg = { owners: [], defaultLocale: "en", slashEphemeral: true };
  const run = async (name, value) => {
    const interaction = {
      guildId: "g1",
      user: { id: "u1" },
      memberPermissions: { has: () => true },
      options: {
        getSubcommandGroup: () => null,
        getSubcommand: () => "set",
        getString: (option) => (option === "name" ? name : value),
      },
      reply: async (payload) => {
        response = payload;
        return payload;
      },
    };
    await execute(interaction, { db, dispatch, processCfg });
    return response.content;
  };

  assert.match(await run("eventColors", "{}"), /Invalid option/);
  assert.match(await run("__proto__", "{}"), /Invalid option/);
  assert.match(await run("constructor", "{}"), /Invalid option/);
  assert.deepEqual(extra, {});
  assert.match(await run("field_max", "5000"), /Invalid option/);
  assert.match(await run("plain_text", "maybe"), /Invalid option/);
  assert.match(await run("quiet_start", "25:00"), /Invalid option/);
  assert.deepEqual(extra, {});

  assert.match(await run("field_max", "512"), /field_max/);
  assert.equal(extra.fieldMax, 512);
  await run("plain_text", "false");
  assert.equal(extra.plainText, false);
  await run("cooldown_sec", "30");
  assert.equal(extra.cooldownSec, 30);
  await run("history_days", "0");
  assert.equal(extra.historyRetentionDays, 0);
});
