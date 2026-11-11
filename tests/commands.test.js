const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { data } = require("../src/commands");

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
