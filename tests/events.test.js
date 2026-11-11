const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { AuditLogEvent } = require("discord.js");
const { bindEvents } = require("../src/events");

class FakeClient extends EventEmitter {
  constructor(guilds = []) {
    super();
    this.user = { id: "self" };
    this.guilds = { cache: new Map(guilds.map((guild) => [guild.id, guild])) };
  }
}

function guildCfg(overrides = {}) {
  return {
    id: "g1",
    locale: "en",
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
    snapshotOn: true,
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    id: "u1",
    tag: "tester#0001",
    username: "tester",
    globalName: "Tester",
    bot: false,
    avatar: "avatar-a",
    createdTimestamp: Date.UTC(2020, 0, 2, 3, 4, 5),
    displayAvatarURL: () => "https://cdn.example/avatar.png",
    ...overrides,
  };
}

function makeGuild(overrides = {}) {
  return {
    id: "g1",
    name: "Guild One",
    vanityURLCode: null,
    premiumTier: 0,
    ownerId: "owner1",
    afkChannelId: null,
    icon: "icon-a",
    members: { cache: new Map() },
    invites: { fetch: async () => new Map() },
    fetchAuditLogs: async () => ({ entries: new Map() }),
    ...overrides,
  };
}

function makeChannel(overrides = {}) {
  return {
    id: "c1",
    name: "general",
    type: 0,
    topic: "topic",
    nsfw: false,
    bitrate: null,
    userLimit: null,
    rateLimitPerUser: 0,
    parentId: null,
    guild: null,
    toString: () => "#general",
    ...overrides,
  };
}

function makeMember(overrides = {}) {
  const member = {
    id: "u1",
    user: makeUser(),
    guild: null,
    nickname: "Tester",
    roles: { cache: new Map([["r1", { id: "r1" }]]) },
    pending: false,
    premiumSince: null,
    premiumSinceTimestamp: null,
    avatar: "avatar-a",
    communicationDisabledUntil: null,
    communicationDisabledUntilTimestamp: null,
    displayAvatarURL: () => "https://cdn.example/avatar.png",
    ...overrides,
  };
  if (!member.user) member.user = makeUser({ id: member.id });
  return member;
}

function makeMessage(overrides = {}) {
  const message = {
    id: "m1",
    content: "hello",
    cleanContent: "hello",
    author: makeUser(),
    channel: makeChannel(),
    guild: null,
    attachments: { values: () => [] },
    embeds: [],
    url: "https://discord.com/channels/g1/c1/m1",
    webhookId: null,
    createdTimestamp: Date.UTC(2024, 0, 1),
    member: { roles: { cache: new Map([["r1", { id: "r1" }]]) } },
    partial: false,
    ...overrides,
  };
  if (overrides.content !== undefined && overrides.cleanContent === undefined) {
    message.cleanContent = overrides.content;
  }
  return message;
}

function makeRole(guild, overrides = {}) {
  return {
    id: "r2",
    name: "Role",
    hexColor: "#ff0000",
    hoist: false,
    mentionable: false,
    permissions: { bitfield: 0n },
    guild,
    ...overrides,
  };
}

function makeEmoji(guild, overrides = {}) {
  return {
    id: "e1",
    name: "wave",
    guild,
    toString: () => "<:wave:e1>",
    ...overrides,
  };
}

function makeSticker(guild, overrides = {}) {
  return {
    id: "s1",
    name: "sticker",
    description: "sticker description",
    guildId: guild.id,
    guild,
    ...overrides,
  };
}

function makeThread(guild, overrides = {}) {
  return {
    id: "t1",
    name: "Thread",
    guild,
    parent: makeChannel({ guild }),
    archived: false,
    locked: false,
    autoArchiveDuration: 1440,
    ...overrides,
  };
}

function makeStage(guild, overrides = {}) {
  return {
    guild,
    channel: makeChannel({ guild }),
    topic: "Stage",
    privacyLevel: 2,
    ...overrides,
  };
}

function makeScheduledEvent(guild, overrides = {}) {
  return {
    guild,
    name: "Event",
    scheduledStartAt: new Date(0),
    status: 1,
    ...overrides,
  };
}

function makeSound(guild, overrides = {}) {
  return {
    guild,
    guildId: guild.id,
    id: "sound1",
    soundId: "sound1",
    name: "Sound",
    emojiId: "e1",
    ...overrides,
  };
}

function makeEntitlement(guild, overrides = {}) {
  return {
    guildId: guild.id,
    skuId: "sku1",
    userId: "u1",
    id: "ent1",
    endsTimestamp: null,
    ...overrides,
  };
}

function makeSubscription(guild, overrides = {}) {
  return {
    guildId: guild.id,
    id: "sub1",
    status: 1,
    ...overrides,
  };
}

function makeInteraction(guild, overrides = {}) {
  return {
    guild,
    guildId: guild.id,
    commandName: "ping",
    customId: "custom",
    user: makeUser(),
    channel: makeChannel({ guild }),
    inGuild: () => true,
    isChatInputCommand: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    ...overrides,
  };
}

function makeAuditEntry(overrides = {}) {
  return {
    action: 0,
    target: { id: "u1" },
    targetId: "u1",
    executor: makeUser({ id: "mod1", tag: "mod#0001" }),
    reason: "spam",
    createdTimestamp: Date.now(),
    ...overrides,
  };
}

function setup(options = {}) {
  const calls = [];
  const snapshots = [];
  const upserts = [];
  const errors = [];
  const guild = makeGuild(options.guild);
  const cfg = guildCfg(options.cfg);
  const member = makeMember({ id: "u1", guild, user: makeUser() });
  guild.members.cache.set("u1", member);

  const db = {
    getSnap: { get: (id) => options.snapStore?.[id] || null },
    putSnapshot: (row, limit, ttl) => snapshots.push({ row, limit, ttl }),
    listInvites: { all: () => options.oldInvites || [] },
    upsertInvite: { run: (...args) => upserts.push(args) },
  };
  const dispatch = {
    guildCfg: (id) => (id === guild.id ? cfg : null),
    refreshGuild: () => cfg,
    enqueue: async (...args) => calls.push(args),
    db,
  };
  const processCfg = {
    inviteTrack: false,
    snapshotBots: true,
    snapshotLimit: 100,
    snapshotTtlMs: 1000,
    auditMaxAgeMs: 0,
    auditFetchLimit: 6,
    commandName: "log",
    ...options.processCfg,
  };
  const client = new FakeClient([guild]);
  bindEvents(client, { dispatch, processCfg, log: { error: (...args) => errors.push(args) } });
  return { client, guild, cfg, member, calls, snapshots, upserts, errors, processCfg };
}

async function fire(client, name, ...args) {
  for (const handler of client.listeners(name)) await handler(...args);
}

function keys(calls) {
  return calls.map(([, key]) => key);
}

test("bindEvents registers every gateway listener", () => {
  const { client } = setup();
  const events = [
    "messageDelete", "messageUpdate", "messageDeleteBulk",
    "messageReactionAdd", "messageReactionRemove", "messageReactionRemoveAll", "messageReactionRemoveEmoji",
    "guildMemberAdd", "guildMemberRemove", "guildMemberUpdate",
    "guildBanAdd", "guildBanRemove", "inviteCreate", "inviteDelete",
    "channelCreate", "channelDelete", "channelUpdate", "channelPinsUpdate",
    "threadCreate", "threadDelete", "threadUpdate", "threadMembersUpdate", "threadListSync",
    "roleCreate", "roleDelete", "roleUpdate",
    "emojiCreate", "emojiDelete", "emojiUpdate",
    "stickerCreate", "stickerDelete", "stickerUpdate",
    "voiceStateUpdate", "stageInstanceCreate", "stageInstanceDelete", "stageInstanceUpdate",
    "guildUpdate", "webhooksUpdate", "guildIntegrationsUpdate",
    "guildScheduledEventCreate", "guildScheduledEventDelete", "guildScheduledEventUpdate",
    "guildScheduledEventUserAdd", "guildScheduledEventUserRemove",
    "autoModerationRuleCreate", "autoModerationRuleDelete", "autoModerationRuleUpdate",
    "autoModerationActionExecution", "applicationCommandPermissionsUpdate",
    "guildAuditLogEntryCreate", "presenceUpdate", "messageCreate",
    "typingStart", "messagePollVoteAdd", "messagePollVoteRemove", "voiceChannelEffectSend",
    "threadMemberUpdate", "guildSoundboardSoundCreate", "guildSoundboardSoundDelete",
    "guildSoundboardSoundUpdate", "entitlementCreate", "entitlementUpdate", "entitlementDelete",
    "subscriptionCreate", "subscriptionUpdate", "subscriptionDelete",
    "interactionCreate", "guildAvailable", "guildUnavailable", "userUpdate",
  ];
  for (const name of events) assert.ok(client.listenerCount(name) > 0, name);
});

test("message and reaction bindings dispatch their catalog keys", async () => {
  const h = setup({ snapStore: { m1: { content: "stored body", author_tag: "stored#0001", author_id: "u9" } } });
  const { client, guild, calls, errors } = h;
  const channel = makeChannel({ guild });
  const author = makeUser();

  await fire(client, "messageDelete", makeMessage({
    id: "m1", guild, channel, author, content: "", cleanContent: "",
  }));
  await fire(client, "messageUpdate",
    makeMessage({ id: "m1", guild, channel, author, content: "before" }),
    makeMessage({ id: "m1", guild, channel, author, content: "after" }));
  await fire(client, "messageUpdate",
    makeMessage({ id: "m1", guild, channel, author, content: "same" }),
    makeMessage({ id: "m1", guild, channel, author, content: "same" }));
  await fire(client, "messageDeleteBulk",
    new Map([["m1", makeMessage({ guild, channel, author })]]), channel);

  const reaction = {
    partial: false,
    message: makeMessage({ guild, channel, author }),
    emoji: { toString: () => "👍" },
  };
  await fire(client, "messageReactionAdd", reaction, author);
  await fire(client, "messageReactionRemove", reaction, author);
  await fire(client, "messageReactionRemoveAll", makeMessage({ guild, channel, author }));
  await fire(client, "messageReactionRemoveEmoji", reaction);

  assert.deepEqual(keys(calls), [
    "messageDelete", "messageUpdate", "messageDeleteBulk",
    "messageReactionAdd", "messageReactionRemove", "messageReactionRemoveAll", "messageReactionRemoveEmoji",
  ]);
  assert.equal(errors.length, 0);
});

test("member, moderation, invite, and derived member updates dispatch", async () => {
  const h = setup({ processCfg: { inviteTrack: true }, oldInvites: [{ code: "inv1", uses: 1 }] });
  const { client, guild, calls, upserts, errors } = h;
  const channel = makeChannel({ guild });
  const user = makeUser();
  const member = makeMember({ id: user.id, user, guild });

  guild.invites.fetch = async () => new Map([["inv1", {
    code: "inv1",
    uses: 2,
    inviter: makeUser({ id: "inviter1", tag: "inviter#0001" }),
  }]]);
  guild.fetchAuditLogs = async () => ({
    entries: new Map([["e1", makeAuditEntry({ target: { id: user.id }, targetId: user.id })]]),
  });

  await fire(client, "guildMemberAdd", member);
  assert.equal(upserts[0][0], guild.id);
  assert.equal(upserts[0][1], "inv1");
  await fire(client, "guildMemberRemove", member);
  await fire(client, "guildBanAdd", { guild, user, reason: "rule" });
  await fire(client, "guildBanRemove", { guild, user, reason: null });
  await fire(client, "inviteCreate", {
    guild, code: "inv1", channel, inviter: user, maxUses: 5, expiresTimestamp: Date.now() + 1000,
  });
  await fire(client, "inviteDelete", { guild, code: "inv1", channel });

  const before = makeMember({
    id: "u1", user, guild,
    nickname: "Old",
    roles: { cache: new Map([["r1", { id: "r1" }]]) },
    pending: false,
    premiumSince: null,
    premiumSinceTimestamp: null,
    avatar: "avatar-a",
    communicationDisabledUntil: null,
    communicationDisabledUntilTimestamp: null,
  });
  const after = makeMember({
    id: "u1", user, guild,
    nickname: "New",
    roles: { cache: new Map([["r1", { id: "r1" }], ["r2", { id: "r2" }]]) },
    pending: true,
    premiumSince: new Date(123),
    premiumSinceTimestamp: 123,
    avatar: "avatar-b",
    communicationDisabledUntil: new Date(Date.now() + 1000),
    communicationDisabledUntilTimestamp: Date.now() + 1000,
  });
  await fire(client, "guildMemberUpdate", before, after);

  assert.deepEqual(keys(calls), [
    "guildMemberAdd", "guildMemberRemove", "guildBanAdd", "guildBanRemove",
    "inviteCreate", "inviteDelete",
    "guildMemberNickname", "guildMemberTimeout", "guildMemberRoles",
    "guildMemberPending", "guildMemberBoost", "guildMemberAvatar", "guildMemberUpdate",
  ]);
  assert.equal(errors.length, 0);
});

test("channel, thread, role, emoji, sticker, and stage bindings dispatch", async () => {
  const { client, guild, calls, errors } = setup();
  const channel = makeChannel({ guild });
  const changedChannel = makeChannel({ guild, name: "renamed", topic: "new topic" });
  const thread = makeThread(guild);
  const changedThread = makeThread(guild, { name: "Renamed", archived: true });
  const role = makeRole(guild);
  const changedRole = makeRole(guild, { name: "Renamed", color: 0x00ff00 });
  const emoji = makeEmoji(guild);
  const changedEmoji = makeEmoji(guild, { name: "renamed" });
  const sticker = makeSticker(guild);
  const changedSticker = makeSticker(guild, { name: "renamed", description: "new" });
  const stage = makeStage(guild);
  const changedStage = makeStage(guild, { topic: "Renamed" });

  await fire(client, "channelCreate", channel);
  await fire(client, "channelDelete", channel);
  await fire(client, "channelUpdate", channel, changedChannel);
  await fire(client, "channelPinsUpdate", channel, new Date(0));
  await fire(client, "threadCreate", thread);
  await fire(client, "threadDelete", thread);
  await fire(client, "threadUpdate", thread, changedThread);
  await fire(client, "threadMembersUpdate", new Set(["u1"]), new Set(), thread);
  await fire(client, "threadListSync", new Map([["t1", thread]]), guild);
  await fire(client, "roleCreate", role);
  await fire(client, "roleDelete", role);
  await fire(client, "roleUpdate", role, changedRole);
  await fire(client, "emojiCreate", emoji);
  await fire(client, "emojiDelete", emoji);
  await fire(client, "emojiUpdate", emoji, changedEmoji);
  await fire(client, "stickerCreate", sticker);
  await fire(client, "stickerDelete", sticker);
  await fire(client, "stickerUpdate", sticker, changedSticker);
  await fire(client, "stageInstanceCreate", stage);
  await fire(client, "stageInstanceDelete", stage);
  await fire(client, "stageInstanceUpdate", stage, changedStage);

  assert.deepEqual(keys(calls), [
    "channelCreate", "channelDelete", "channelUpdate", "channelPinsUpdate",
    "threadCreate", "threadDelete", "threadUpdate", "threadMembersUpdate", "threadListSync",
    "roleCreate", "roleDelete", "roleUpdate",
    "emojiCreate", "emojiDelete", "emojiUpdate",
    "stickerCreate", "stickerDelete", "stickerUpdate",
    "stageInstanceCreate", "stageInstanceDelete", "stageInstanceUpdate",
  ]);
  assert.equal(errors.length, 0);
});

test("voice, presence, typing, polls, effects, snapshots, and interactions dispatch", async () => {
  const h = setup();
  const { client, guild, cfg, calls, snapshots, errors } = h;
  const channel = makeChannel({ guild });
  const author = makeUser();
  const member = makeMember({ id: author.id, user: author, guild });
  const voiceBefore = { channelId: null, channel: null, member, guild };
  const voiceAfter = { channelId: "c1", channel: channel, member, guild };
  await fire(client, "voiceStateUpdate", voiceBefore, voiceAfter);
  await fire(client, "voiceChannelEffectSend", {
    guild, userId: "u1", channel, emoji: null, animationType: 1,
  });

  const thread = makeThread(guild);
  await fire(client, "threadMemberUpdate",
    { thread, id: "u1" },
    { thread, id: "u1", flags: { bitfield: 1 } });
  await fire(client, "presenceUpdate",
    { status: "offline" },
    { guild, user: author, status: "online", activities: [{ name: "Testing" }] });
  await fire(client, "typingStart", { guild, user: author, channel });

  const pollMessage = makeMessage({ guild, channel, author });
  await fire(client, "messagePollVoteAdd", { text: "A", id: "1", poll: { message: pollMessage } }, "u1");
  await fire(client, "messagePollVoteRemove", { text: "A", id: "1", poll: { message: pollMessage } }, "u1");

  await fire(client, "messageCreate", makeMessage({ guild, channel, author, content: "created" }));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].limit, 100);
  await fire(client, "messageCreate", makeMessage({
    guild, channel, author: makeUser({ id: "self" }), content: "self",
  }));
  cfg.snapshotOn = false;
  await fire(client, "messageCreate", makeMessage({ guild, channel, author, content: "no snapshot" }));
  cfg.snapshotOn = true;

  await fire(client, "interactionCreate", makeInteraction(guild));
  await fire(client, "interactionCreate", makeInteraction(guild, { commandName: "log" }));
  await fire(client, "guildAvailable", guild);
  await fire(client, "guildUnavailable", guild);
  await fire(client, "userUpdate",
    makeUser({ tag: "old#0001", username: "old", globalName: "Old" }),
    makeUser({ tag: "new#0001", username: "new", globalName: "New" }));

  assert.deepEqual(keys(calls), [
    "voiceJoin", "voiceChannelEffect", "threadMemberUpdate", "presenceUpdate",
    "typingStart", "messagePollVoteAdd", "messagePollVoteRemove",
    "messageCreate", "messageCreate",
    "commandUse", "guildAvailable", "guildUnavailable", "userUpdate",
  ]);
  assert.equal(errors.length, 0);
});

test("guild, scheduled, automod, audit, soundboard, entitlement, and subscription bindings dispatch", async () => {
  const { client, guild, calls, errors } = setup();
  const user = makeUser();
  const beforeGuild = makeGuild({ premiumTier: 0, name: "Old Guild" });
  const afterGuild = makeGuild({ premiumTier: 1, name: "New Guild" });
  await fire(client, "guildUpdate", beforeGuild, afterGuild);
  await fire(client, "guildIntegrationsUpdate", guild);
  await fire(client, "webhooksUpdate", makeChannel({ guild }));

  const scheduled = makeScheduledEvent(guild);
  const changedScheduled = makeScheduledEvent(guild, { name: "Renamed", status: 2 });
  await fire(client, "guildScheduledEventCreate", scheduled);
  await fire(client, "guildScheduledEventDelete", scheduled);
  await fire(client, "guildScheduledEventUpdate", scheduled, changedScheduled);
  await fire(client, "guildScheduledEventUserAdd", scheduled, user);
  await fire(client, "guildScheduledEventUserRemove", scheduled, user);

  const rule = { guildId: guild.id, id: "rule1", name: "Rule", enabled: true };
  const changedRule = { ...rule, name: "Renamed", enabled: false };
  await fire(client, "autoModerationRuleCreate", rule);
  await fire(client, "autoModerationRuleDelete", rule);
  await fire(client, "autoModerationRuleUpdate", rule, changedRule);
  await fire(client, "autoModerationActionExecution", {
    guild, userId: "u1", ruleId: "rule1", content: "bad", channelId: "c1",
  });
  await fire(client, "applicationCommandPermissionsUpdate", { guildId: guild.id, id: "cmd1", applicationId: "app1" });

  const pin = makeAuditEntry({ action: AuditLogEvent.MessagePin });
  const unpin = makeAuditEntry({ action: AuditLogEvent.MessageUnpin });
  const other = makeAuditEntry({ action: 12345 });
  await fire(client, "guildAuditLogEntryCreate", pin, guild);
  await fire(client, "guildAuditLogEntryCreate", unpin, guild);
  await fire(client, "guildAuditLogEntryCreate", other, guild);

  const sound = makeSound(guild);
  const changedSound = makeSound(guild, { name: "Renamed", emojiId: "e2" });
  await fire(client, "guildSoundboardSoundCreate", sound);
  await fire(client, "guildSoundboardSoundDelete", sound);
  await fire(client, "guildSoundboardSoundUpdate", sound, changedSound);

  const entitlement = makeEntitlement(guild);
  const changedEntitlement = makeEntitlement(guild, { endsTimestamp: 123 });
  await fire(client, "entitlementCreate", entitlement);
  await fire(client, "entitlementUpdate", entitlement, changedEntitlement);
  await fire(client, "entitlementDelete", entitlement);

  const subscription = makeSubscription(guild);
  const changedSubscription = makeSubscription(guild, { status: 2 });
  await fire(client, "subscriptionCreate", subscription);
  await fire(client, "subscriptionUpdate", subscription, changedSubscription);
  await fire(client, "subscriptionDelete", subscription);

  assert.deepEqual(keys(calls), [
    "guildBoostLevel", "guildUpdate", "guildIntegrationsUpdate", "webhookUpdate",
    "guildScheduledEventCreate", "guildScheduledEventDelete", "guildScheduledEventUpdate",
    "guildScheduledEventUserAdd", "guildScheduledEventUserRemove",
    "autoModerationRuleCreate", "autoModerationRuleDelete", "autoModerationRuleUpdate",
    "autoModerationActionExecution", "applicationCommandPermissionsUpdate",
    "messagePin", "guildAuditLogEntryCreate", "messageUnpin", "guildAuditLogEntryCreate",
    "guildAuditLogEntryCreate",
    "soundboardCreate", "soundboardDelete", "soundboardUpdate",
    "entitlementCreate", "entitlementUpdate", "entitlementDelete",
    "subscriptionCreate", "subscriptionUpdate", "subscriptionDelete",
  ]);
  assert.equal(errors.length, 0);
});
