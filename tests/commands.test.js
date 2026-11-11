const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { data, execute, clampHistoryLimit, MAX_HISTORY_LIMIT, FILTER_NAMES } = require("../src/commands");

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

test("event group exposes color overrides", () => {
  const json = data({}).toJSON();
  const event = json.options.find((group) => group.name === "event");
  const color = event.options.find((sub) => sub.name === "color");
  assert.ok(color);
  assert.deepEqual(
    color.options.map((option) => option.name).sort(),
    ["clear", "hex", "key"],
  );
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
