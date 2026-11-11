const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  messageSnapshot,
  formatMessageDelete,
  formatMessageUpdate,
  formatBulk,
  formatMemberAdd,
  formatMemberRemove,
  formatBanAdd,
  formatBanRemove,
  formatVoice,
  namedCreate,
  namedDelete,
  namedUpdate,
} = require("../src/format");

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

function makeUser(overrides = {}) {
  return {
    id: "u1",
    tag: "tester#0001",
    username: "tester",
    bot: false,
    createdTimestamp: Date.UTC(2020, 0, 2, 3, 4, 5),
    displayAvatarURL: () => "https://cdn.example/avatar.png",
    ...overrides,
  };
}

function makeChannel(overrides = {}) {
  return {
    id: "c1",
    name: "general",
    parentId: null,
    toString: () => "#general",
    ...overrides,
  };
}

function attachments(...urls) {
  return { values: () => urls.map((url) => ({ url })) };
}

function makeMessage(overrides = {}) {
  const message = {
    id: "m1",
    content: "hello",
    cleanContent: "hello",
    author: makeUser(),
    channel: makeChannel(),
    guild: { id: "g1" },
    attachments: attachments(),
    embeds: [],
    url: "https://discord.com/channels/g1/c1/m1",
    member: { roles: { cache: new Map([["r1", { id: "r1" }], ["r2", { id: "r2" }]]) } },
    partial: false,
    ...overrides,
  };
  if (overrides.content !== undefined && overrides.cleanContent === undefined) {
    message.cleanContent = overrides.content;
  }
  return message;
}

function auditGuild(entries = []) {
  return {
    fetchAuditLogs: async () => ({
      entries: new Map(entries.map((entry, index) => [String(index), entry])),
    }),
  };
}

test("messageSnapshot normalizes message content and attachment state", () => {
  const snap = messageSnapshot(makeMessage({
    webhookId: "w1",
    embeds: [{}, {}],
    attachments: attachments("https://cdn.example/a.png", "https://cdn.example/b.png"),
  }));

  assert.deepEqual(snap, {
    id: "m1",
    content: "hello",
    author: "tester#0001 (u1)",
    authorId: "u1",
    bot: false,
    webhook: true,
    attachments: "https://cdn.example/a.png\nhttps://cdn.example/b.png",
    embedCount: 2,
    url: "https://discord.com/channels/g1/c1/m1",
  });
  assert.deepEqual(messageSnapshot(null), {});
});

test("formatMessageDelete builds fields, files, and ignore context", async () => {
  const result = await formatMessageDelete(makeMessage({
    content: "a long deleted body",
    attachments: attachments("https://cdn.example/a.png"),
    embeds: [{}],
    webhookId: "w1",
  }), {}, { ...guildCfg(), attachMin: 5 }, {});

  const data = result.embeds[0].data;
  assert.equal(data.title, "Message deleted");
  assert.deepEqual(data.fields.map((field) => field.name), [
    "Author", "Channel", "Content", "Attachments", "Embeds", "ID", "Jump",
  ]);
  assert.equal(data.fields[2].value, "a long deleted body");
  assert.equal(data.fields[3].value, "https://cdn.example/a.png");
  assert.equal(data.fields[4].value, "1");
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, "message-m1.txt");
  assert.equal(result.bot, false);
  assert.equal(result.webhook, true);
  assert.equal(result.userId, "u1");
  assert.deepEqual(result.ignore.roleIds, ["r1", "r2"]);
  assert.equal(result.summary, "delete m1");
});

test("formatMessageDelete fetches partial messages and uses stored snapshots", async () => {
  const fetched = makeMessage({ id: "m2", content: "fetched body", partial: false });
  const partial = makeMessage({
    id: "m2",
    content: "",
    partial: true,
    fetch: async () => fetched,
  });
  const fromFetch = await formatMessageDelete(partial, {}, guildCfg(), {});
  assert.equal(fromFetch.embeds[0].data.fields[2].value, "fetched body");

  const empty = makeMessage({ id: "m3", content: "", attachments: attachments() });
  const fromSnapshot = await formatMessageDelete(empty, {}, guildCfg(), {}, {
    content: "stored body",
    author_tag: "stored#0001",
    author_id: "u9",
    attachments: "stored.txt",
  });
  const fields = fromSnapshot.embeds[0].data.fields;
  assert.equal(fields[0].value, "stored#0001");
  assert.equal(fields[2].value, "stored body");
  assert.equal(fields[3].value, "stored.txt");
  assert.equal(fromSnapshot.userId, "u9");
});

test("formatMessageUpdate reports edits and skips unchanged messages", async () => {
  const changed = await formatMessageUpdate(
    makeMessage({ id: "m1", content: "before" }),
    makeMessage({ id: "m1", content: "after" }),
    guildCfg(),
  );
  assert.deepEqual(changed.embeds[0].data.fields.map((field) => field.name), [
    "Author", "Channel", "Before", "After", "Jump",
  ]);
  assert.equal(changed.embeds[0].data.fields[2].value, "before");
  assert.equal(changed.embeds[0].data.fields[3].value, "after");
  assert.equal(changed.summary, "edit m1");

  const unchanged = await formatMessageUpdate(
    makeMessage({ content: "same", attachments: attachments("https://cdn.example/a.png") }),
    makeMessage({ content: "same", attachments: attachments("https://cdn.example/a.png") }),
    guildCfg(),
  );
  assert.equal(unchanged, null);

  const partialBefore = await formatMessageUpdate(
    makeMessage({ partial: true, content: "" }),
    makeMessage({ content: "new" }),
    guildCfg(),
  );
  assert.equal(partialBefore.embeds[0].data.fields[2].value, "Unknown");

  const fetched = makeMessage({ id: "m4", content: "fetched edit", partial: false });
  const partialAfter = await formatMessageUpdate(
    makeMessage({ partial: false, content: "old" }),
    makeMessage({ id: "m4", partial: true, content: "", fetch: async () => fetched }),
    guildCfg(),
  );
  assert.equal(partialAfter.embeds[0].data.fields[3].value, "fetched edit");
});

test("formatBulk summarizes the channel and message list", () => {
  const messages = new Map([
    ["m1", makeMessage({ content: "first" })],
    ["m2", makeMessage({ content: "second" })],
  ]);
  const result = formatBulk(messages, makeChannel(), { ...guildCfg(), bulkLineLimit: 1 });

  assert.equal(result.embeds[0].data.title, "Messages bulk-deleted");
  assert.equal(result.embeds[0].data.fields[1].value, "2");
  assert.equal(result.embeds[0].data.fields[2].value, "tester#0001: first");
  assert.equal(result.ignore.channel.id, "c1");
  assert.equal(result.summary, "bulk 2");
});

test("formatMemberRemove and ban formatters use audit-log context", async () => {
  const executor = makeUser({ id: "mod1", tag: "mod#0001" });
  const entry = {
    target: { id: "u1" },
    executor,
    reason: "spam",
    createdTimestamp: Date.now(),
  };
  const processCfg = { auditMaxAgeMs: 60000, auditFetchLimit: 6 };
  const memberData = { id: "u1", user: makeUser() };
  const removed = await formatMemberRemove(memberData, auditGuild([entry]), guildCfg(), processCfg);
  assert.deepEqual(removed.embeds[0].data.fields.map((field) => field.name), [
    "User", "Executor", "Reason",
  ]);
  assert.equal(removed.embeds[0].data.fields[1].value, "mod#0001 (mod1)");
  assert.equal(removed.embeds[0].data.fields[2].value, "spam");
  assert.equal(removed.summary, "leave u1");

  const noEntry = await formatMemberRemove(memberData, auditGuild(), guildCfg(), processCfg);
  assert.deepEqual(noEntry.embeds[0].data.fields.map((field) => field.name), ["User"]);

  const ban = { guild: auditGuild([entry]), user: makeUser(), reason: "rule" };
  const banned = await formatBanAdd(ban, guildCfg(), processCfg);
  assert.deepEqual(banned.embeds[0].data.fields.map((field) => field.name), [
    "User", "Reason", "Executor",
  ]);
  assert.equal(banned.embeds[0].data.fields[1].value, "rule");
  assert.equal(banned.summary, "ban u1");

  const unbanned = await formatBanRemove({ ...ban, reason: null }, guildCfg(), processCfg);
  assert.equal(unbanned.embeds[0].data.fields[2].value, "spam");
  assert.equal(unbanned.summary, "unban u1");
});

test("formatVoice renders channel context and state labels", () => {
  const memberData = { id: "u1", user: makeUser() };
  const source = makeChannel({ id: "c1", toString: () => "#source" });
  const target = makeChannel({ id: "c2", toString: () => "#target" });
  const base = { channelId: "c1", channel: source, member: memberData };
  const joined = formatVoice("voiceJoin", { channelId: null, channel: null, member: memberData }, {
    ...base, channelId: "c2", channel: target,
  }, guildCfg());
  assert.equal(joined.embeds[0].data.fields[1].value, "—");
  assert.match(joined.embeds[0].data.fields[2].value, /#target/);

  const left = formatVoice("voiceLeave", base, { channelId: null, channel: null, member: memberData }, guildCfg());
  assert.match(left.embeds[0].data.fields[1].value, /#source/);
  assert.equal(left.embeds[0].data.fields[2].value, "—");

  for (const [kind, flag] of [
    ["voiceServerMute", "serverMute"],
    ["voiceServerDeafen", "serverDeaf"],
    ["voiceSelfMute", "selfMute"],
    ["voiceSelfDeaf", "selfDeaf"],
    ["voiceSuppress", "suppress"],
  ]) {
    const result = formatVoice(kind, { ...base, [flag]: false }, { ...base, [flag]: true }, guildCfg());
    const last = result.embeds[0].data.fields.at(-1);
    assert.deepEqual([last.name, last.value], ["After", "On"], kind);
  }
});

test("named formatters build create, delete, and update payloads", () => {
  const created = namedCreate("inviteCreate", "abc", [["field.channel", "<#c1>"]], guildCfg(), makeUser());
  assert.equal(created.embeds[0].data.title, "Invite created");
  assert.deepEqual(created.embeds[0].data.fields.map((field) => field.name), ["Name", "Channel"]);
  assert.equal(created.ignore.user.id, "u1");
  assert.equal(created.summary, "inviteCreate abc");

  const deleted = namedDelete("inviteDelete", "abc", [["field.channel", "<#c1>"]], guildCfg());
  assert.equal(deleted.embeds[0].data.title, "Invite deleted");
  assert.equal(deleted.summary, "inviteDelete abc");

  const updated = namedUpdate("channelUpdate", "general", { topic: "old" }, { topic: "new" }, guildCfg());
  assert.equal(updated.embeds[0].data.title, "Channel updated");
  assert.match(updated.embeds[0].data.fields[1].value, /topic/);
  assert.match(updated.embeds[0].data.fields[1].value, /old/);
  assert.match(updated.embeds[0].data.fields[1].value, /new/);
  assert.equal(updated.summary, "channelUpdate general");
});
