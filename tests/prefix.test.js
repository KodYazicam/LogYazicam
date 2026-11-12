const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePrefix, fakeInteraction, canPrefix } = require("../src/prefix");

test("parsePrefix requires prefix + log", () => {
  assert.equal(parsePrefix("hello", "!"), null);
  assert.deepEqual(parsePrefix("!log status", "!"), ["status"]);
  assert.deepEqual(parsePrefix("!log event on key:messageDelete", "!"), [
    "event",
    "on",
    "key:messageDelete",
  ]);
  assert.equal(parsePrefix("!help", "!"), null);
  assert.deepEqual(parsePrefix("?audit status", "?", "audit"), ["status"]);
  assert.equal(parsePrefix("!log status", "!", "audit"), null);
});

function message(overrides = {}) {
  return {
    guild: { channels: { cache: new Map() }, roles: { cache: new Map() } },
    guildId: "g1",
    channel: { id: "c1" },
    author: { id: "u1" },
    member: { permissions: { has: () => false } },
    reply: (payload) => payload,
    ...overrides,
  };
}

function fake(tokens, overrides = {}) {
  return fakeInteraction(message(overrides), tokens);
}

test("prefix integer options reject fractional, infinite, and empty values", () => {
  for (const value of ["2.5", "abc", "Infinity", ""]) {
    assert.equal(fake([`limit:${value}`]).options.getInteger("limit"), null, value);
  }
  assert.equal(fake(["limit:50"]).options.getInteger("limit"), 50);
  assert.equal(fake(["limit:-5"]).options.getInteger("limit"), -5);
});

test("prefix options work after the subcommand and keep positional tokens", () => {
  const set = fake(["set", "name:quiet_days", "value:mon,tue"]);
  assert.equal(set.options.getSubcommand(), "set");
  assert.equal(set.options.getString("name"), "quiet_days");
  assert.equal(set.options.getString("value"), "mon,tue");

  const group = fake(["group", "on", "name:voice", "channel:#123"]);
  assert.equal(group.options.getSubcommandGroup(), "group");
  assert.equal(group.options.getSubcommand(), "on");
  assert.equal(group.options.getString("name"), "voice");
  assert.equal(group.options.getChannel("channel").id, "123");

  const event = fake(["event", "on", "key:messageDelete", "channel:#456"]);
  assert.equal(event.options.getSubcommandGroup(), "event");
  assert.equal(event.options.getSubcommand(), "on");
  assert.equal(event.options.getString("key"), "messageDelete");
  assert.equal(event.options.getChannel("channel").id, "456");
});

test("prefix URL values are not mistaken for new options", () => {
  const url = fake(["set", "name:webhook_avatar", "value:https://example.com/a.png"]);
  assert.equal(url.options.getString("name"), "webhook_avatar");
  assert.equal(url.options.getString("value"), "https://example.com/a.png");
});

test("prefix import resolves a pasted Discord CDN attachment URL", () => {
  const attachment = fake([
    "import",
    "file:https://cdn.discordapp.com/attachments/1/2/config.json?x=1",
  ]).options.getAttachment("file");
  assert.deepEqual(attachment, {
    url: "https://cdn.discordapp.com/attachments/1/2/config.json?x=1",
    name: "config.json",
    size: 0,
  });
  assert.equal(fake(["import"]).options.getAttachment("file"), null);
  assert.equal(
    fake(["import", "file:https://cdn.discordapp.com/attachments/1/2/a%20b.json"])
      .options.getAttachment("file").name,
    "a b.json",
  );
  assert.equal(fake(["import", "file:https://example.com/config.json"]).options.getAttachment("file"), null);
  assert.equal(fake(["import", "file:http://cdn.discordapp.com/config.json"]).options.getAttachment("file"), null);
});

test("canPrefix allows owners and configured permissions but denies others", () => {
  assert.equal(canPrefix({ author: { id: "owner1" } }, { owners: ["owner1"] }), true);
  assert.equal(
    canPrefix(
      { author: { id: "u1" }, member: { permissions: { has: (name) => name === "ManageGuild" } } },
      { owners: [], configPermission: "ManageGuild" },
    ),
    true,
  );
  assert.equal(
    canPrefix(
      { author: { id: "u1" }, member: { permissions: { has: (name) => name === "Administrator" } } },
      { owners: [], configPermission: "Administrator" },
    ),
    true,
  );
  assert.equal(
    canPrefix(
      { author: { id: "u1" }, member: { permissions: { has: () => false } } },
      { owners: [] },
    ),
    false,
  );
  assert.equal(canPrefix({ author: { id: "u1" } }, { owners: [] }), false);
});

test("fakeInteraction defaults to status and exposes message context", () => {
  const source = message({
    member: { permissions: { has: () => true } },
  });
  const interaction = fakeInteraction(source, []);

  assert.equal(interaction.options.getSubcommand(), "status");
  assert.equal(interaction.options.getSubcommandGroup(), null);
  assert.equal(interaction.guild, source.guild);
  assert.equal(interaction.guildId, "g1");
  assert.equal(interaction.channel, source.channel);
  assert.equal(interaction.user, source.author);
  assert.equal(interaction.member, source.member);
  assert.equal(interaction.memberPermissions, source.member.permissions);
  assert.equal(interaction.inGuild(), true);
  assert.equal(interaction.isChatInputCommand(), true);
  assert.equal(interaction.commandName, "log");
  assert.equal(fake(["event"]).options.getSubcommand(), "event");
  assert.equal(fake(["event"]).options.getSubcommandGroup(), null);
});

test("prefix required options consume positional tokens and reject flags", () => {
  const positional = fake(["set", "quiet_days", "mon,tue"]);
  assert.equal(positional.options.getSubcommand(), "set");
  assert.equal(positional.options.getString("name", true), "quiet_days");
  assert.equal(positional.options.getString("value", true), "mon,tue");

  const flagged = fake(["set", "-x"]);
  assert.equal(flagged.options.getString("name", true), null);
  assert.equal(flagged.options.getString("value"), null);
});

test("prefix booleans, channels, and roles resolve from options or caches", () => {
  const enabled = fake(["set", "enabled:YES", "disabled:off"]);
  assert.equal(enabled.options.getBoolean("enabled"), true);
  assert.equal(enabled.options.getBoolean("disabled"), false);
  assert.equal(enabled.options.getBoolean("missing"), null);

  const channel = { id: "c9", toString: () => "<#c9>" };
  const role = { id: "r9", name: "Role" };
  const source = message({
    guild: {
      channels: { cache: new Map([["c9", channel]]) },
      roles: { cache: new Map([["r9", role]]) },
    },
  });
  const cached = fakeInteraction(source, ["set", "channel:<#c9>", "role:<@&r9>"]);
  assert.equal(cached.options.getChannel("channel"), channel);
  assert.equal(cached.options.getRole("role"), role);
  const fallbackChannel = fake(["set", "channel:#123"]).options.getChannel("channel");
  assert.equal(fallbackChannel.id, "123");
  assert.equal(fallbackChannel.toString(), "<#123>");
  assert.equal(fake(["set", "role:r9"]).options.getRole("role").id, "r9");
  assert.equal(fake(["set", "channel:"]).options.getChannel("channel"), null);
  assert.equal(fake(["set"]).options.getRole("role"), null);
});

test("prefix reply passes content, files, and no replied-user mention", () => {
  const replies = [];
  const source = message({
    reply: (payload) => {
      replies.push(payload);
      return "sent";
    },
  });
  const interaction = fakeInteraction(source, [], "audit");

  assert.equal(interaction.commandName, "audit");
  assert.equal(interaction.reply("plain"), "sent");
  interaction.reply({ content: "embed", files: [{ name: "f.txt" }] });

  assert.deepEqual(replies[0], {
    content: "plain",
    files: undefined,
    allowedMentions: { repliedUser: false },
  });
  assert.deepEqual(replies[1], {
    content: "embed",
    files: [{ name: "f.txt" }],
    allowedMentions: { repliedUser: false },
  });
});
