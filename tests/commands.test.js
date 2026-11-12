const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { data, execute, autocomplete, clampHistoryLimit, MAX_HISTORY_LIMIT, FILTER_NAMES, SETTING_NAMES, SETTING_ALIASES } = require("../src/commands");
const { EVENTS } = require("../src/catalog");
const { exportGuild, FORMAT, VERSION, MAX_BYTES } = require("../src/configTransfer");

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

test("prefix-only setting aliases map to the canonical names", () => {
  assert.equal(SETTING_ALIASES.quiet_days, "quietDays");
  assert.equal(SETTING_ALIASES.plain, "plainText");
  assert.equal(SETTING_ALIASES.staff_channel, "staffChannel");
  assert.equal(SETTING_NAMES.has(SETTING_ALIASES.quiet_days), true);
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
  const history = event.options.find((sub) => sub.name === "history");
  assert.ok(history);
  assert.deepEqual(
    history.options.map((option) => option.name).sort(),
    ["key", "mode"],
  );
  const historyMode = history.options.find((option) => option.name === "mode");
  assert.deepEqual(
    historyMode.choices.map((choice) => choice.value),
    ["default", "on", "off"],
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

test("event history command stores, disables, and restores a per-event mode", async () => {
  let extra = { eventHistory: { guildBanAdd: true } };
  let writes = 0;
  const db = {
    ensureGuild: () => ({ id: "g1" }),
    extraOf: () => extra,
    setExtra: (id, next) => {
      writes += 1;
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
      getSubcommand: () => "history",
      getString: (name) => (name === "key" ? "messageDelete" : mode),
    },
    reply: async (payload) => {
      response = payload;
      return payload;
    },
  });

  await execute(makeInteraction("on"), { db, dispatch, processCfg });
  assert.equal(writes, 1);
  assert.deepEqual(extra.eventHistory, { guildBanAdd: true, messageDelete: true });
  assert.match(response.content, /event\.messageDelete\.history/);

  await execute(makeInteraction("off"), { db, dispatch, processCfg });
  assert.equal(writes, 2);
  assert.deepEqual(extra.eventHistory, { guildBanAdd: true, messageDelete: false });

  await execute(makeInteraction("default"), { db, dispatch, processCfg });
  assert.equal(writes, 3);
  assert.deepEqual(extra.eventHistory, { guildBanAdd: true });
  assert.match(response.content, /none|—/i);

  await execute(makeInteraction("aliens"), { db, dispatch, processCfg });
  assert.equal(writes, 3);
  assert.deepEqual(extra.eventHistory, { guildBanAdd: true });
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
    eventHistory: { messageDelete: true, messageUpdate: false },
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
  assert.deepEqual(extra.eventHistory, { messageUpdate: false });
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

function commandCfg(overrides = {}) {
  const events = {};
  for (const event of EVENTS) events[event.key] = { on: false, channelId: null };
  return {
    id: "g1",
    locale: "en",
    timezone: "UTC",
    defaultChannel: null,
    lastError: null,
    colors: {
      create: 0x00ff00,
      update: 0xffcc00,
      delete: 0xff0000,
      voice: 0x5865f2,
      member: 0xff69b4,
      mod: 0xff8800,
      info: 0x5865f2,
    },
    eventColors: {},
    extra: {},
    hiddenFields: {},
    embedShowIds: true,
    embedShowJump: true,
    embedCompact: false,
    embedFooter: "LogYazicam",
    showTimestamp: false,
    showThumbnails: true,
    showCredit: false,
    events,
    ...overrides,
  };
}

function commandChannel(id = "c1", label = `#${id}`) {
  return { id, toString: () => label };
}

function commandGuild(channels = [], roles = []) {
  return {
    id: "g1",
    channels: { cache: new Map(channels.map((channel) => [channel.id, channel])) },
    roles: { cache: new Map(roles.map((role) => [role.id, role])) },
  };
}

function commandHarness(t, options = {}) {
  const calls = {
    setGuild: [],
    setExtra: [],
    setRoute: [],
    setGroup: [],
    addIgnore: [],
    removeIgnore: [],
    replaceConfig: [],
    defer: [],
    refresh: 0,
  };
  let response;
  let extra = options.extra || {};
  const row = options.row || { id: "g1" };
  const cfg = commandCfg(options.cfg);
  const db = {
    ensureGuild: () => row,
    extraOf: () => extra,
    setExtra: (id, next) => {
      calls.setExtra.push([id, next]);
      extra = next;
    },
    setGuild: (id, patch) => {
      calls.setGuild.push([id, patch]);
      Object.assign(row, patch);
    },
    setRoute: (id, key, patch) => {
      calls.setRoute.push([id, key, patch]);
      cfg.events[key] = {
        on: Boolean(patch.enabled),
        channelId: patch.channelId ?? cfg.events[key]?.channelId ?? null,
      };
    },
    setGroup: (id, name, patch) => {
      calls.setGroup.push([id, name, patch]);
      for (const event of EVENTS) {
        if (event.group === name) {
          cfg.events[event.key] = {
            on: Boolean(patch.enabled),
            channelId: patch.channelId ?? null,
          };
        }
      }
    },
    addIgnore: { run: (...args) => calls.addIgnore.push(args) },
    removeIgnore: { run: (...args) => calls.removeIgnore.push(args) },
    listIgnores: { all: () => options.ignores || [] },
    listRoutes: { all: () => options.routes || [] },
    queryHistory: { all: () => options.history || [] },
    replaceConfig: (id, payload) => calls.replaceConfig.push([id, payload]),
    ...options.db,
  };
  const dispatch = {
    guildCfg: () => cfg,
    refreshGuild: () => {
      calls.refresh += 1;
      return cfg;
    },
    queues: options.queues || new Map(),
    metrics: options.metrics || { sent: 0, dropped: 0 },
    ...options.dispatch,
  };
  const processCfg = {
    owners: options.owners || [],
    defaultLocale: "en",
    slashEphemeral: true,
    ...options.processCfg,
  };

  const interaction = (overrides = {}) => {
    const strings = overrides.strings || {};
    const booleans = overrides.booleans || {};
    const integers = overrides.integers || {};
    const channels = overrides.channels || {};
    const roles = overrides.roles || {};
    return {
      guildId: "g1",
      guild: overrides.guild || commandGuild(),
      user: overrides.user || { id: "u1", tag: "tester#0001" },
      memberPermissions: overrides.memberPermissions || { has: () => true },
      channel: overrides.channel || commandChannel("c1", "#general"),
      options: {
        getSubcommandGroup: () => overrides.group ?? null,
        getSubcommand: () => overrides.sub ?? "status",
        getString: (name) => (Object.hasOwn(strings, name) ? strings[name] : null),
        getBoolean: (name) => (Object.hasOwn(booleans, name) ? booleans[name] : null),
        getInteger: (name) => (Object.hasOwn(integers, name) ? integers[name] : null),
        getChannel: (name) => channels[name] ?? null,
        getRole: (name) => roles[name] ?? null,
        getAttachment: () => overrides.attachment ?? null,
        getFocused: () => overrides.focused ?? null,
      },
      deferReply: async (payload) => {
        calls.defer.push(payload);
      },
      editReply: async (payload) => {
        response = payload;
        return payload;
      },
      reply: async (payload) => {
        response = payload;
        return payload;
      },
    };
  };

  return {
    calls,
    cfg,
    db,
    dispatch,
    processCfg,
    interaction,
    row,
    get response() {
      return response;
    },
    get extra() {
      return extra;
    },
  };
}

async function runCommand(h, overrides) {
  await execute(h.interaction(overrides), {
    db: h.db,
    dispatch: h.dispatch,
    processCfg: h.processCfg,
  });
  return h.response;
}

test("core commands deny unauthorized users and allow owners", async (t) => {
  const denied = commandHarness(t);
  const deniedResponse = await runCommand(denied, {
    sub: "status",
    memberPermissions: { has: () => false },
  });
  assert.match(deniedResponse.content, /cannot use/i);
  assert.equal(deniedResponse.ephemeral, true);

  const owner = commandHarness(t, { owners: ["u1"] });
  const ownerResponse = await runCommand(owner, {
    sub: "status",
    memberPermissions: { has: () => false },
  });
  assert.match(ownerResponse.content, /LogYazicam/);
  assert.doesNotMatch(ownerResponse.content, /cannot use/i);
});

test("status reports enabled routes, queue depth, metrics, and last error", async (t) => {
  const h = commandHarness(t, {
    queues: new Map([["g1", [1, 2, 3]]]),
    metrics: { sent: 7, dropped: 2 },
  });
  h.cfg.defaultChannel = "c9";
  h.cfg.lastError = "boom";
  h.cfg.events.messageDelete.on = true;
  h.cfg.events.guildBanAdd.on = true;

  const response = await runCommand(h, { sub: "status" });
  assert.match(response.content, /locale `en`/);
  assert.match(response.content, /tz `UTC`/);
  assert.match(response.content, /<#c9>/);
  assert.match(response.content, new RegExp(`Enabled events: 2/${EVENTS.length}`));
  assert.match(response.content, /Queue: 3/);
  assert.match(response.content, /sent 7/);
  assert.match(response.content, /dropped 2/);
  assert.match(response.content, /boom/);
});

test("channel, group, and event on/off commands write routes", async (t) => {
  const h = commandHarness(t);
  const channel = commandChannel("c9", "#logs");

  const setChannel = await runCommand(h, {
    group: "channel",
    sub: "set",
    channels: { channel },
  });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { default_channel: "c9" }]);
  assert.match(setChannel.content, /#logs/);

  const clearChannel = await runCommand(h, { group: "channel", sub: "clear" });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { default_channel: null }]);
  assert.match(clearChannel.content, /cleared/i);

  const groupOn = await runCommand(h, {
    group: "group",
    sub: "on",
    strings: { name: "message" },
    channels: { channel: commandChannel("c5", "#c5") },
  });
  assert.deepEqual(h.calls.setGroup.at(-1), ["g1", "message", { enabled: true, channelId: "c5" }]);
  assert.match(groupOn.content, /Group `message`/);

  const groupOff = await runCommand(h, {
    group: "group",
    sub: "off",
    strings: { name: "message" },
  });
  assert.deepEqual(h.calls.setGroup.at(-1), ["g1", "message", { enabled: false }]);
  assert.match(groupOff.content, /off/i);

  const eventOn = await runCommand(h, {
    group: "event",
    sub: "on",
    strings: { key: "messageDelete" },
    channels: { channel: commandChannel("c1") },
  });
  assert.deepEqual(h.calls.setRoute.at(-1), ["g1", "messageDelete", { enabled: true, channelId: "c1" }]);
  assert.match(eventOn.content, /\*\*on\*\*/);
  assert.match(eventOn.content, /<#c1>/);

  const eventOff = await runCommand(h, {
    group: "event",
    sub: "off",
    strings: { key: "messageDelete" },
  });
  assert.deepEqual(h.calls.setRoute.at(-1), ["g1", "messageDelete", { enabled: false }]);
  assert.match(eventOff.content, /\*\*off\*\*/);
});

test("ignore commands add, remove, list, and report an empty list", async (t) => {
  const h = commandHarness(t, {
    ignores: [{ kind: "user", target_id: "u9" }],
  });

  const added = await runCommand(h, {
    group: "ignore",
    sub: "add",
    strings: { kind: "user", id: "u9" },
  });
  assert.deepEqual(h.calls.addIgnore.at(-1), ["g1", "user", "u9"]);
  assert.match(added.content, /Added ignore/);

  const removed = await runCommand(h, {
    group: "ignore",
    sub: "remove",
    strings: { kind: "role", id: "r1" },
  });
  assert.deepEqual(h.calls.removeIgnore.at(-1), ["g1", "role", "r1"]);
  assert.match(removed.content, /Removed ignore/);

  const listed = await runCommand(h, { group: "ignore", sub: "list" });
  assert.match(listed.content, /Ignore list \(1\)/);
  assert.match(listed.content, /user/);
  assert.match(listed.content, /u9/);

  const empty = commandHarness(t, { ignores: [] });
  const emptyResponse = await runCommand(empty, { group: "ignore", sub: "list" });
  assert.match(emptyResponse.content, /empty/i);
});

test("locale and timezone commands validate before writing", async (t) => {
  const h = commandHarness(t);

  const badLocale = await runCommand(h, { sub: "locale", strings: { code: "zz" } });
  assert.match(badLocale.content, /Invalid option `locale`/);
  assert.equal(h.calls.setGuild.length, 0);

  const goodLocale = await runCommand(h, { sub: "locale", strings: { code: "tr" } });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { locale: "tr" }]);
  assert.match(goodLocale.content, /tr/);

  const badTz = await runCommand(h, { sub: "timezone", strings: { tz: "Not/AZone" } });
  assert.match(badTz.content, /Invalid IANA timezone/);
  assert.equal(h.calls.setGuild.length, 1);

  const goodTz = await runCommand(h, { sub: "timezone", strings: { tz: "Europe/Istanbul" } });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { timezone: "Europe/Istanbul" }]);
  assert.match(goodTz.content, /Europe\/Istanbul/);
});

test("filter, footer, webhook, and reload commands write settings", async (t) => {
  const h = commandHarness(t);

  const filter = await runCommand(h, {
    sub: "filter",
    strings: { name: "ignore_bots" },
    booleans: { value: true },
  });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { ignore_bots: 1 }]);
  assert.match(filter.content, /ignore_bots/);
  assert.match(filter.content, /true/);

  const beforeInvalid = h.calls.setGuild.length;
  const invalid = await runCommand(h, {
    sub: "filter",
    strings: { name: "webhook_token" },
    booleans: { value: true },
  });
  assert.match(invalid.content, /Invalid option/);
  assert.equal(h.calls.setGuild.length, beforeInvalid);

  const footer = await runCommand(h, { sub: "footer", strings: { text: "Hello" } });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { embed_footer: "Hello" }]);
  assert.match(footer.content, /reloaded/i);

  await runCommand(h, { sub: "webhook", booleans: { clear: true } });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { webhook_id: null, webhook_token: null }]);

  await runCommand(h, {
    sub: "webhook",
    strings: { id: "wid", token: "wtoken" },
    booleans: { clear: false },
  });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { webhook_id: "wid", webhook_token: "wtoken" }]);

  const reload = await runCommand(h, { sub: "reload" });
  assert.match(reload.content, /reloaded/i);
  assert.ok(h.calls.refresh > 0);
});

test("test, pack, and setup commands send and apply route packs", async (t) => {
  const sent = [];
  const channel = {
    ...commandChannel("c1", "#logs"),
    send: async (payload) => sent.push(payload),
  };
  const h = commandHarness(t);

  const testResponse = await runCommand(h, {
    sub: "test",
    channel,
    channels: { channel },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds.length, 1);
  assert.match(testResponse.content, /Test embed sent/);

  const pack = await runCommand(h, {
    sub: "pack",
    strings: { name: "quiet" },
    channels: { channel: commandChannel("c2") },
  });
  assert.ok(h.calls.setRoute.length > 0);
  assert.match(pack.content, /Group `quiet`/);

  const beforeUnknown = h.calls.setRoute.length;
  const unknownPack = await runCommand(h, {
    sub: "pack",
    strings: { name: "not-a-pack" },
  });
  assert.match(unknownPack.content, /Invalid option `pack`/);
  assert.equal(h.calls.setRoute.length, beforeUnknown);

  const setup = await runCommand(h, {
    sub: "setup",
    channels: { channel: commandChannel("c7", "#setup") },
  });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { default_channel: "c7" }]);
  assert.match(setup.content, /#setup/);
});

test("fields, string, color, mention, languages, watch, and events commands work", async (t) => {
  const h = commandHarness(t);

  await runCommand(h, {
    sub: "fields",
    strings: { key: "messageDelete", hide: "author, channel" },
  });
  assert.deepEqual(h.extra.hiddenFields.messageDelete, ["author", "channel"]);

  await runCommand(h, { sub: "string", strings: { key: "welcome", value: "Hello" } });
  assert.equal(h.extra.strings.welcome, "Hello");

  await runCommand(h, { sub: "color", strings: { slot: "delete", hex: "#00ff00" } });
  assert.equal(h.extra.colors.delete, 0x00ff00);

  await runCommand(h, { sub: "mention", booleans: { clear: true } });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { mention_role: null, mention_on_delete: 0 }]);

  await runCommand(h, {
    sub: "mention",
    booleans: { clear: false },
    roles: { role: { id: "r1" } },
  });
  assert.deepEqual(h.calls.setGuild.at(-1), ["g1", { mention_role: "r1", mention_on_delete: 1 }]);

  const languages = await runCommand(h, { sub: "languages" });
  assert.match(languages.content, /Installed locales/);

  await runCommand(h, {
    group: "watch",
    sub: "add",
    channels: { channel: commandChannel("c1") },
  });
  assert.deepEqual(h.extra.includeChannels, ["c1"]);

  await runCommand(h, { group: "watch", sub: "clear" });
  assert.deepEqual(h.extra.includeChannels, []);

  const watchList = await runCommand(h, { group: "watch", sub: "list" });
  assert.match(watchList.content, /none|—/i);

  const events = await runCommand(h, { sub: "events" });
  assert.match(events.content, /message/);
  assert.match(events.content, /messageDelete/);
});

test("history export handles empty, JSONL, and CSV output", async (t) => {
  const empty = commandHarness(t);
  const emptyResponse = await runCommand(empty, { sub: "history" });
  assert.match(emptyResponse.content, /No stored history/);

  const rows = [{
    created_at: 123,
    event_key: "messageDelete",
    payload: "{\"summary\":\"x\"}",
  }];
  const jsonl = commandHarness(t, { history: rows });
  const jsonlResponse = await runCommand(jsonl, {
    sub: "history",
    strings: { key: "messageDelete" },
    integers: { limit: 10 },
  });
  assert.match(jsonlResponse.content, /Exported `1` history rows/);
  assert.equal(jsonlResponse.files[0].name, "logyazicam-g1.jsonl.txt");

  const csv = commandHarness(t, { history: rows });
  const csvResponse = await runCommand(csv, {
    sub: "history",
    strings: { format: "csv" },
    integers: { limit: 10 },
  });
  assert.equal(csvResponse.files[0].name, "logyazicam-g1.csv");
});

test("config export and import validate files and replace config", async (t) => {
  const source = commandHarness(t, {
    row: { id: "g1", locale: "en", timezone: "UTC", default_channel: "c1" },
    routes: [{ event_key: "messageDelete", enabled: 1, channel_id: "c1" }],
    ignores: [{ kind: "user", target_id: "u9" }],
    extra: { strings: { welcome: "Hi" } },
  });
  const exported = await runCommand(source, { sub: "export" });
  assert.match(exported.content, /Exported config: 1 routes, 1 ignores/);
  assert.equal(exported.files[0].name, "logyazicam-config-g1.json");

  const invalidExt = await runCommand(source, {
    sub: "import",
    attachment: { name: "config.txt", size: 10 },
  });
  assert.match(invalidExt.content, /\.json/);
  assert.equal(source.calls.replaceConfig.length, 0);

  const tooBig = await runCommand(source, {
    sub: "import",
    attachment: { name: "config.json", size: MAX_BYTES + 1 },
  });
  assert.match(tooBig.content, /larger than/);
  assert.equal(source.calls.replaceConfig.length, 0);

  const payload = {
    format: FORMAT,
    version: VERSION,
    guild: { locale: "en", timezone: "UTC", default_channel: "c1" },
    routes: [],
    ignores: [],
    extra: {},
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const destination = commandHarness(t);
  const imported = await runCommand(destination, {
    sub: "import",
    guild: commandGuild([commandChannel("c1")], [{ id: "r1" }]),
    attachment: {
      name: "config.json",
      size: JSON.stringify(payload).length,
      url: "https://example.invalid/config.json",
    },
  });
  assert.match(imported.content, /Imported config/);
  assert.equal(destination.calls.defer.length, 1);
  assert.equal(destination.calls.defer[0].ephemeral, true);
  assert.equal(destination.calls.replaceConfig.length, 1);
  assert.equal(destination.calls.replaceConfig[0][0], "g1");
});

test("autocomplete responds with locales, groups, events, and an empty list", async () => {
  let responded;
  const respond = (items) => {
    responded = items;
  };
  const interaction = (focused, group = null) => ({
    options: {
      getFocused: () => focused,
      getSubcommandGroup: () => group,
    },
    respond,
  });

  await autocomplete(interaction({ name: "code", value: "e" }));
  assert.ok(responded.some((item) => item.value === "en"));

  await autocomplete(interaction({ name: "name", value: "ev" }, "group"));
  assert.ok(responded.some((item) => item.value === "event"));

  await autocomplete(interaction({ name: "key", value: "ban" }));
  assert.ok(responded.some((item) => item.value === "guildBanAdd"));
  assert.ok(responded.every((item) => item.name.includes("(")));

  await autocomplete(interaction({ name: "other", value: "x" }));
  assert.deepEqual(responded, []);
});

test("event validation rejects bad cooldown, digest, actors, and watch values", async (t) => {
  const h = commandHarness(t);

  const badCooldown = await runCommand(h, {
    group: "event",
    sub: "cooldown",
    strings: { key: "messageDelete" },
    integers: { seconds: 3601 },
    booleans: { clear: false },
  });
  assert.match(badCooldown.content, /Invalid option `seconds`/);

  const badDigest = await runCommand(h, {
    group: "event",
    sub: "digest",
    strings: { key: "messageDelete" },
    integers: { ms: 3600001 },
    booleans: { clear: false },
  });
  assert.match(badDigest.content, /Invalid option `ms\/min`/);

  const badMin = await runCommand(h, {
    group: "event",
    sub: "digest",
    strings: { key: "messageDelete" },
    integers: { ms: 1000, min: 0 },
    booleans: { clear: false },
  });
  assert.match(badMin.content, /Invalid option `ms\/min`/);

  const badActors = await runCommand(h, {
    group: "event",
    sub: "actors",
    strings: { key: "messageDelete", mode: "everyone" },
    booleans: { clear: false },
  });
  assert.match(badActors.content, /Invalid option `mode`/);

  const badAction = await runCommand(h, {
    group: "event",
    sub: "watch",
    strings: { key: "messageDelete", action: "bogus" },
  });
  assert.match(badAction.content, /Invalid option `action`/);

  const missingChannel = await runCommand(h, {
    group: "event",
    sub: "watch",
    strings: { key: "messageDelete", action: "add" },
  });
  assert.match(missingChannel.content, /Invalid option `channel`/);

  const badHex = await runCommand(h, {
    sub: "color",
    strings: { slot: "delete", hex: "#zzzzzz" },
  });
  assert.match(badHex.content, /#rrggbb/);
  assert.equal(h.calls.setExtra.length, 0);
});

test("removing the last per-event override clears its extra container", async (t) => {
  const h = commandHarness(t, {
    extra: {
      eventCooldown: { messageDelete: 5 },
      eventDigest: { messageDelete: { ms: 1000 } },
      eventActors: { messageDelete: "humans" },
      eventDelivery: { messageDelete: "plain" },
      eventHistory: { messageDelete: true },
      eventRedact: { messageDelete: { url: true } },
      eventIncludeChannels: { messageDelete: ["c1"] },
    },
  });

  await runCommand(h, {
    group: "event",
    sub: "cooldown",
    strings: { key: "messageDelete" },
    booleans: { clear: true },
  });
  assert.equal("eventCooldown" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "digest",
    strings: { key: "messageDelete" },
    booleans: { clear: true },
  });
  assert.equal("eventDigest" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "actors",
    strings: { key: "messageDelete" },
    booleans: { clear: true },
  });
  assert.equal("eventActors" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "delivery",
    strings: { key: "messageDelete", mode: "default" },
  });
  assert.equal("eventDelivery" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "history",
    strings: { key: "messageDelete", mode: "default" },
  });
  assert.equal("eventHistory" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "redact",
    strings: { key: "messageDelete", flag: "url" },
    booleans: { clear: true },
  });
  assert.equal("eventRedact" in h.extra, false);

  await runCommand(h, {
    group: "event",
    sub: "watch",
    strings: { key: "messageDelete", action: "clear" },
  });
  assert.equal("eventIncludeChannels" in h.extra, false);
});

test("set aliases validate actors, delivery, staff channel, redaction, and webhook fields", async (t) => {
  const h = commandHarness(t);

  let response = await runCommand(h, {
    sub: "set",
    strings: { name: "actors", value: "bots" },
  });
  assert.equal(h.extra.actors, "bots");
  assert.match(response.content, /actors/);

  response = await runCommand(h, {
    sub: "set",
    strings: { name: "actors", value: "everyone" },
  });
  assert.match(response.content, /Invalid option/);
  assert.equal(h.extra.actors, "bots");

  await runCommand(h, {
    sub: "set",
    strings: { name: "delivery", value: "plain" },
  });
  assert.equal(h.extra.delivery, "plain");
  assert.equal(h.extra.plainText, true);

  response = await runCommand(h, {
    sub: "set",
    strings: { name: "delivery", value: "email" },
  });
  assert.match(response.content, /Invalid option/);

  await runCommand(h, {
    sub: "set",
    strings: { name: "staff_ch", value: "clear" },
  });
  assert.equal(h.extra.staffChannel, null);
  await runCommand(h, {
    sub: "set",
    strings: { name: "staff_ch", value: "<#123>" },
  });
  assert.equal(h.extra.staffChannel, "123");

  await runCommand(h, {
    sub: "set",
    strings: { name: "redact_url", value: "yes" },
  });
  assert.equal(h.extra.redact.url, true);
  response = await runCommand(h, {
    sub: "set",
    strings: { name: "redact_url", value: "maybe" },
  });
  assert.match(response.content, /Invalid option/);

  await runCommand(h, {
    sub: "set",
    strings: { name: "hook_name", value: "clear" },
  });
  assert.equal(h.extra.webhookName, null);
  await runCommand(h, {
    sub: "set",
    strings: { name: "hook_name", value: "Logger" },
  });
  assert.equal(h.extra.webhookName, "Logger");
  await runCommand(h, {
    sub: "set",
    strings: { name: "hook_av", value: "https://example.test/avatar.png" },
  });
  assert.equal(h.extra.webhookAvatar, "https://example.test/avatar.png");
  await runCommand(h, {
    sub: "set",
    strings: { name: "prefix", value: "!" },
  });
  assert.equal(h.extra.prefix, "!");

  response = await runCommand(h, {
    sub: "set",
    strings: { name: "not_a_setting", value: "x" },
  });
  assert.match(response.content, /Invalid option/);
});

test("watch remove, group defaults, and unknown subcommands fall through correctly", async (t) => {
  const h = commandHarness(t, { extra: { includeChannels: ["c1", "c2"] } });

  await runCommand(h, {
    group: "watch",
    sub: "remove",
    channels: { channel: commandChannel("c1") },
  });
  assert.deepEqual(h.extra.includeChannels, ["c2"]);

  await runCommand(h, {
    group: "watch",
    sub: "remove",
    channels: { channel: commandChannel("c2") },
  });
  assert.deepEqual(h.extra.includeChannels, []);

  h.cfg.defaultChannel = "c9";
  const groupOn = await runCommand(h, {
    group: "group",
    sub: "on",
    strings: { name: "message" },
  });
  assert.match(groupOn.content, /<#c9>/);

  const eventOn = await runCommand(h, {
    group: "event",
    sub: "on",
    strings: { key: "messageDelete" },
  });
  assert.match(eventOn.content, /logging is \*\*on\*\*/);

  const unknown = await runCommand(h, { sub: "not-a-subcommand" });
  assert.match(unknown.content, /cannot use/i);
});

test("import reports a missing attachment after deferring", async (t) => {
  const h = commandHarness(t);
  const response = await runCommand(h, { sub: "import", attachment: null });

  assert.match(response.content, /\.json|file/i);
  assert.equal(h.calls.defer.length, 1);
  assert.equal(h.calls.replaceConfig.length, 0);

  const wrongType = await runCommand(h, {
    sub: "import",
    attachment: { name: "config.txt", size: 10 },
  });
  assert.match(wrongType.content, /\.json|file/i);
  assert.equal(h.calls.defer.length, 2);
  assert.equal(h.calls.replaceConfig.length, 0);
});

test("import failures report invalid config without writing", async (t) => {
  const h = commandHarness(t);
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  let response = await runCommand(h, {
    sub: "import",
    attachment: {
      name: "config.json",
      size: 20,
      url: "https://example.invalid/config.json",
    },
  });
  assert.match(response.content, /invalid|network down/i);
  assert.equal(h.calls.replaceConfig.length, 0);

  globalThis.fetch = async () => new Response(JSON.stringify({
    format: FORMAT,
    version: VERSION,
    guild: {},
    routes: "not-an-array",
    ignores: [],
    extra: {},
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  response = await runCommand(h, {
    sub: "import",
    attachment: {
      name: "config.json",
      size: 20,
      url: "https://example.invalid/config.json",
    },
  });
  assert.match(response.content, /Import failed|invalid/i);
  assert.equal(h.calls.replaceConfig.length, 0);

  globalThis.fetch = async () => new Response(JSON.stringify({
    format: FORMAT,
    version: VERSION,
    guild: {},
    routes: [],
    ignores: [],
    extra: {},
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const failing = commandHarness(t, {
    db: {
      replaceConfig: () => {
        throw new Error("db down");
      },
    },
  });
  response = await runCommand(failing, {
    sub: "import",
    attachment: {
      name: "config.json",
      size: 20,
      url: "https://example.invalid/config.json",
    },
  });
  assert.match(response.content, /Import failed|db down/i);
});
