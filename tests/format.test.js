const { test } = require("node:test");
const assert = require("node:assert/strict");
const { formatMemberAdd } = require("../src/format");

function guildCfg(locale = "en") {
  return {
    id: "g1",
    locale,
    timezone: "UTC",
    colors: {
      create: 0x00ff00,
      update: 0xffcc00,
      delete: 0xff0000,
      voice: 0x5865f2,
      member: 0xff69b4,
      mod: 0xff8800,
      info: 0x5865f2,
    },
    embedShowIds: true,
    embedShowJump: true,
    embedCompact: false,
    embedFooter: "LogYazicam",
    showTimestamp: false,
    showThumbnails: true,
    showCredit: false,
    extra: {},
    hiddenFields: {},
  };
}

function member() {
  return {
    id: "u1",
    user: {
      id: "u1",
      tag: "tester#0001",
      username: "tester",
      bot: false,
      createdTimestamp: Date.UTC(2020, 0, 2, 3, 4, 5),
      displayAvatarURL: () => "https://cdn.example/avatar.png",
    },
  };
}

test("guildMemberAdd labels account age as created, not channel", async () => {
  const result = await formatMemberAdd(member(), guildCfg("en"), "tester (invite)");
  const fields = result.embeds[0].data.fields;
  assert.deepEqual(fields.map((field) => field.name), ["User", "ID", "Account created", "Invited by"]);
  assert.match(fields[2].value, /^<t:\d+:R>$/);
  assert.equal(result.createdTimestamp, Date.UTC(2020, 0, 2, 3, 4, 5));
});

test("guildMemberAdd uses the guild locale for account age", async () => {
  const result = await formatMemberAdd(member(), guildCfg("tr"), "tester (invite)");
  const fields = result.embeds[0].data.fields;
  assert.equal(fields[2].name, "Hesap oluşturulma");
  assert.ok(!fields.some((field) => field.name === "Kanal"));
});
