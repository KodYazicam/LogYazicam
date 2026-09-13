const { AuditLogEvent, AttachmentBuilder } = require("discord.js");
const { buildEmbed, userTag, channelTag, truncate, diff, audit, code } = require("./util");
const { t } = require("./locales");

function messageSnapshot(message) {
  if (!message) return {};
  return {
    id: message.id,
    content: message.cleanContent || message.content || "",
    author: message.author ? userTag(message.author) : "—",
    authorId: message.author?.id,
    bot: Boolean(message.author?.bot),
    webhook: Boolean(message.webhookId),
    attachments: [...(message.attachments?.values?.() || [])].map((a) => a.url).join("\n"),
    embedCount: message.embeds?.length || 0,
    url: message.url,
  };
}

async function formatMessageDelete(oldMessage, client, cfg, processCfg) {
  const message = oldMessage.partial ? await oldMessage.fetch().catch(() => oldMessage) : oldMessage;
  const snap = messageSnapshot(message);
  const fields = [
    ["field.author", snap.author],
    ["field.channel", channelTag(message.channel)],
    ["field.content", snap.content || t(cfg.locale, "none")],
    ["field.attachments", snap.attachments],
    ["field.embeds", snap.embedCount || null],
    ["field.id", cfg.embedShowIds ? snap.id : null],
    ["field.jump", cfg.embedShowJump ? snap.url : null],
  ];
  const files = [];
  if (cfg.attachLong !== false && snap.content && snap.content.length > 1800) {
    files.push(new AttachmentBuilder(Buffer.from(snap.content, "utf8"), { name: `message-${snap.id}.txt` }));
  }
  return {
    embeds: [buildEmbed(cfg, "messageDelete", fields)],
    files,
    bot: snap.bot,
    webhook: snap.webhook,
    userId: snap.authorId,
    createdTimestamp: message.author?.createdTimestamp,
    ignore: { user: message.author, channel: message.channel, roleIds: message.member?.roles?.cache ? [...message.member.roles.cache.keys()] : [] },
    summary: `delete ${snap.id}`,
  };
}

async function formatMessageUpdate(oldMessage, newMessage, cfg) {
  const before = oldMessage.partial ? null : messageSnapshot(oldMessage);
  const afterMsg = newMessage.partial ? await newMessage.fetch().catch(() => newMessage) : newMessage;
  const after = messageSnapshot(afterMsg);
  if (before && before.content === after.content && before.attachments === after.attachments) return null;
  const fields = [
    ["field.author", after.author],
    ["field.channel", channelTag(afterMsg.channel)],
    ["field.before", before?.content || t(cfg.locale, "unknown")],
    ["field.after", after.content],
    ["field.jump", cfg.embedShowJump ? after.url : null],
  ];
  return {
    embeds: [buildEmbed(cfg, "messageUpdate", fields)],
    bot: after.bot,
    webhook: after.webhook,
    userId: after.authorId,
    ignore: { user: afterMsg.author, channel: afterMsg.channel },
    summary: `edit ${after.id}`,
  };
}

function formatBulk(messages, channel, cfg) {
  const lines = [...messages.values()].slice(0, 40).map((m) => {
    const author = m.author ? m.author.tag : "?";
    return `${author}: ${truncate(m.cleanContent || m.content || "", 80)}`;
  });
  const fields = [
    ["field.channel", channelTag(channel)],
    ["field.count", String(messages.size)],
    ["field.content", lines.join("\n") || t(cfg.locale, "none")],
  ];
  return {
    embeds: [buildEmbed(cfg, "messageDeleteBulk", fields)],
    ignore: { channel },
    summary: `bulk ${messages.size}`,
  };
}

async function formatMemberAdd(member, cfg) {
  const created = Math.floor(member.user.createdTimestamp / 1000);
  const fields = [
    ["field.user", userTag(member.user)],
    ["field.id", cfg.embedShowIds ? member.id : null],
    ["field.channel", `<t:${created}:R>`],
  ];
  return {
    embeds: [buildEmbed(cfg, "guildMemberAdd", fields, { thumbnail: member.user.displayAvatarURL({ size: 128 }) })],
    bot: member.user.bot,
    userId: member.id,
    createdTimestamp: member.user.createdTimestamp,
    ignore: { user: member.user },
    summary: `join ${member.id}`,
  };
}

async function formatMemberRemove(member, guild, cfg, processCfg) {
  const entry = await audit(guild, AuditLogEvent.MemberKick, member.id, processCfg.auditMaxAgeMs);
  const fields = [
    ["field.user", userTag(member.user || member)],
    ["field.executor", entry?.executor ? userTag(entry.executor) : null],
    ["field.reason", entry?.reason],
  ];
  return {
    embeds: [buildEmbed(cfg, "guildMemberRemove", fields)],
    bot: member.user?.bot,
    userId: member.id,
    ignore: { user: member.user },
    summary: `leave ${member.id}`,
  };
}

async function formatBanAdd(ban, cfg, processCfg) {
  const entry = await audit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id, processCfg.auditMaxAgeMs);
  const fields = [
    ["field.user", userTag(ban.user)],
    ["field.reason", ban.reason || entry?.reason],
    ["field.executor", entry?.executor ? userTag(entry.executor) : null],
  ];
  return {
    embeds: [buildEmbed(cfg, "guildBanAdd", fields)],
    userId: ban.user.id,
    ignore: { user: ban.user },
    summary: `ban ${ban.user.id}`,
  };
}

async function formatBanRemove(ban, cfg, processCfg) {
  const entry = await audit(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id, processCfg.auditMaxAgeMs);
  const fields = [
    ["field.user", userTag(ban.user)],
    ["field.executor", entry?.executor ? userTag(entry.executor) : null],
    ["field.reason", entry?.reason],
  ];
  return {
    embeds: [buildEmbed(cfg, "guildBanRemove", fields)],
    userId: ban.user.id,
    ignore: { user: ban.user },
    summary: `unban ${ban.user.id}`,
  };
}

function voiceKind(before, after) {
  if (!before.channelId && after.channelId) return "voiceJoin";
  if (before.channelId && !after.channelId) return "voiceLeave";
  if (before.channelId && after.channelId && before.channelId !== after.channelId) return "voiceMove";
  if (before.serverMute !== after.serverMute) return "voiceServerMute";
  if (before.serverDeaf !== after.serverDeaf) return "voiceServerDeafen";
  if (before.streaming !== after.streaming) return "voiceStream";
  if (before.selfVideo !== after.selfVideo) return "voiceVideo";
  return null;
}

function formatVoice(kind, before, after, cfg) {
  const member = after.member || before.member;
  const fields = [
    ["field.user", userTag(member?.user)],
    ["field.from", before.channel ? channelTag(before.channel) : t(cfg.locale, "none")],
    ["field.to", after.channel ? channelTag(after.channel) : t(cfg.locale, "none")],
  ];
  if (kind === "voiceServerMute") fields.push(["field.after", after.serverMute ? t(cfg.locale, "on") : t(cfg.locale, "off")]);
  if (kind === "voiceServerDeafen") fields.push(["field.after", after.serverDeaf ? t(cfg.locale, "on") : t(cfg.locale, "off")]);
  return {
    embeds: [buildEmbed(cfg, kind, fields)],
    bot: member?.user?.bot,
    userId: member?.id,
    ignore: { user: member?.user, channel: after.channel || before.channel },
    summary: `${kind} ${member?.id}`,
  };
}

function namedCreate(eventKey, name, extraFields, cfg, actor) {
  return {
    embeds: [buildEmbed(cfg, eventKey, [["field.name", name], ...extraFields])],
    ignore: { user: actor },
    summary: `${eventKey} ${name}`,
  };
}

function namedDelete(eventKey, name, extraFields, cfg) {
  return {
    embeds: [buildEmbed(cfg, eventKey, [["field.name", name], ...extraFields])],
    summary: `${eventKey} ${name}`,
  };
}

function namedUpdate(eventKey, name, before, after, cfg) {
  return {
    embeds: [buildEmbed(cfg, eventKey, [["field.name", name], ["field.changes", diff(before, after)]])],
    summary: `${eventKey} ${name}`,
  };
}

module.exports = {
  messageSnapshot,
  formatMessageDelete,
  formatMessageUpdate,
  formatBulk,
  formatMemberAdd,
  formatMemberRemove,
  formatBanAdd,
  formatBanRemove,
  voiceKind,
  formatVoice,
  namedCreate,
  namedDelete,
  namedUpdate,
};
