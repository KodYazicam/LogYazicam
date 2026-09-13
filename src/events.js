const { AuditLogEvent } = require("discord.js");
const {
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
} = require("./format");
const { userTag, channelTag, buildEmbed, audit, diff } = require("./util");
const { t } = require("./locales");

function bindEvents(client, { dispatch, processCfg, log }) {
  const safe = (name, fn) => (...args) => {
    Promise.resolve(fn(...args)).catch((error) => log.error(name, error));
  };

  const run = async (guild, key, payload) => {
    if (!payload) return;
    await dispatch.enqueue(guild, key, payload);
  };

  client.on("messageDelete", safe("messageDelete", async (message) => {
    if (!message.guild) return;
    const cfg = dispatch.guildCfg(message.guild.id);
    if (!cfg) return;
    await run(message.guild, "messageDelete", await formatMessageDelete(message, client, cfg, processCfg));
  }));

  client.on("messageUpdate", safe("messageUpdate", async (before, after) => {
    if (!after.guild) return;
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "messageUpdate", await formatMessageUpdate(before, after, cfg));
  }));

  client.on("messageDeleteBulk", safe("messageDeleteBulk", async (messages, channel) => {
    const guild = channel.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "messageDeleteBulk", formatBulk(messages, channel, cfg));
  }));

  const reaction = (key) => async (reaction, user) => {
    if (reaction.partial) reaction = await reaction.fetch().catch(() => reaction);
    const message = reaction.message;
    if (message.partial) await message.fetch().catch(() => {});
    const guild = message.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, key, {
      embeds: [buildEmbed(cfg, key, [
        ["field.user", userTag(user)],
        ["field.emoji", reaction.emoji?.toString?.() || String(reaction.emoji)],
        ["field.channel", channelTag(message.channel)],
        ["field.jump", cfg.embedShowJump ? message.url : null],
      ])],
      bot: user.bot,
      userId: user.id,
      ignore: { user, channel: message.channel },
      summary: `${key} ${user.id}`,
    });
  };

  client.on("messageReactionAdd", safe("messageReactionAdd", reaction("messageReactionAdd")));
  client.on("messageReactionRemove", safe("messageReactionRemove", reaction("messageReactionRemove")));
  client.on("messageReactionRemoveAll", safe("messageReactionRemoveAll", async (message) => {
    if (!message.guild) return;
    const cfg = dispatch.guildCfg(message.guild.id);
    if (!cfg) return;
    await run(message.guild, "messageReactionRemoveAll", {
      embeds: [buildEmbed(cfg, "messageReactionRemoveAll", [
        ["field.channel", channelTag(message.channel)],
        ["field.jump", message.url],
      ])],
      ignore: { channel: message.channel },
    });
  }));
  client.on("messageReactionRemoveEmoji", safe("messageReactionRemoveEmoji", async (reaction) => {
    const message = reaction.message;
    if (!message.guild) return;
    const cfg = dispatch.guildCfg(message.guild.id);
    if (!cfg) return;
    await run(message.guild, "messageReactionRemoveEmoji", {
      embeds: [buildEmbed(cfg, "messageReactionRemoveEmoji", [
        ["field.emoji", String(reaction.emoji)],
        ["field.channel", channelTag(message.channel)],
      ])],
      ignore: { channel: message.channel },
    });
  }));

  client.on("guildMemberAdd", safe("guildMemberAdd", async (member) => {
    const cfg = dispatch.guildCfg(member.guild.id);
    if (!cfg) return;
    await run(member.guild, "guildMemberAdd", await formatMemberAdd(member, cfg));
  }));

  client.on("guildMemberRemove", safe("guildMemberRemove", async (member) => {
    const cfg = dispatch.guildCfg(member.guild.id);
    if (!cfg) return;
    await run(member.guild, "guildMemberRemove", await formatMemberRemove(member, member.guild, cfg, processCfg));
  }));

  client.on("guildMemberUpdate", safe("guildMemberUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    const guild = after.guild;
    if (before.nickname !== after.nickname) {
      await run(guild, "guildMemberNickname", {
        embeds: [buildEmbed(cfg, "guildMemberNickname", [
          ["field.user", userTag(after.user)],
          ["field.before", before.nickname || after.user.username],
          ["field.after", after.nickname || after.user.username],
        ])],
        bot: after.user.bot,
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    if (before.communicationDisabledUntilTimestamp !== after.communicationDisabledUntilTimestamp) {
      await run(guild, "guildMemberTimeout", {
        embeds: [buildEmbed(cfg, "guildMemberTimeout", [
          ["field.user", userTag(after.user)],
          ["field.timeout", after.communicationDisabledUntil
            ? `<t:${Math.floor(after.communicationDisabledUntilTimestamp / 1000)}:R>`
            : t(cfg.locale, "off")],
        ])],
        bot: after.user.bot,
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    const beforeRoles = new Set(before.roles.cache.keys());
    const afterRoles = new Set(after.roles.cache.keys());
    const added = [...afterRoles].filter((id) => !beforeRoles.has(id));
    const removed = [...beforeRoles].filter((id) => !afterRoles.has(id));
    if (added.length || removed.length) {
      await run(guild, "guildMemberRoles", {
        embeds: [buildEmbed(cfg, "guildMemberRoles", [
          ["field.user", userTag(after.user)],
          ["field.after", added.map((id) => `<@&${id}>`).join(" ") || t(cfg.locale, "none")],
          ["field.before", removed.map((id) => `<@&${id}>`).join(" ") || t(cfg.locale, "none")],
        ])],
        bot: after.user.bot,
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    if (Boolean(before.pending) !== Boolean(after.pending)) {
      await run(guild, "guildMemberPending", {
        embeds: [buildEmbed(cfg, "guildMemberPending", [
          ["field.user", userTag(after.user)],
          ["field.before", String(Boolean(before.pending))],
          ["field.after", String(Boolean(after.pending))],
        ])],
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    if (before.premiumSinceTimestamp !== after.premiumSinceTimestamp) {
      await run(guild, "guildMemberBoost", {
        embeds: [buildEmbed(cfg, "guildMemberBoost", [
          ["field.user", userTag(after.user)],
          ["field.boost", after.premiumSince ? t(cfg.locale, "on") : t(cfg.locale, "off")],
        ])],
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    if (before.avatar !== after.avatar) {
      await run(guild, "guildMemberAvatar", {
        embeds: [buildEmbed(cfg, "guildMemberAvatar", [
          ["field.user", userTag(after.user)],
        ], { thumbnail: after.displayAvatarURL({ size: 128 }) })],
        userId: after.id,
        ignore: { user: after.user },
      });
    }
    await run(guild, "guildMemberUpdate", {
      embeds: [buildEmbed(cfg, "guildMemberUpdate", [
        ["field.user", userTag(after.user)],
        ["field.changes", diff(
          { nick: before.nickname, timeout: before.communicationDisabledUntilTimestamp, boost: before.premiumSinceTimestamp },
          { nick: after.nickname, timeout: after.communicationDisabledUntilTimestamp, boost: after.premiumSinceTimestamp },
        )],
      ])],
      bot: after.user.bot,
      userId: after.id,
      ignore: { user: after.user },
    });
  }));

  client.on("guildBanAdd", safe("guildBanAdd", async (ban) => {
    const cfg = dispatch.guildCfg(ban.guild.id);
    if (!cfg) return;
    await run(ban.guild, "guildBanAdd", await formatBanAdd(ban, cfg, processCfg));
  }));
  client.on("guildBanRemove", safe("guildBanRemove", async (ban) => {
    const cfg = dispatch.guildCfg(ban.guild.id);
    if (!cfg) return;
    await run(ban.guild, "guildBanRemove", await formatBanRemove(ban, cfg, processCfg));
  }));

  client.on("inviteCreate", safe("inviteCreate", async (invite) => {
    if (!invite.guild) return;
    const cfg = dispatch.guildCfg(invite.guild.id);
    if (!cfg) return;
    await run(invite.guild, "inviteCreate", namedCreate("inviteCreate", invite.code, [
      ["field.channel", channelTag(invite.channel)],
      ["field.user", invite.inviter ? userTag(invite.inviter) : null],
      ["field.max_uses", invite.maxUses || "∞"],
      ["field.expires", invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : t(cfg.locale, "none")],
    ], cfg, invite.inviter));
  }));
  client.on("inviteDelete", safe("inviteDelete", async (invite) => {
    if (!invite.guild) return;
    const cfg = dispatch.guildCfg(invite.guild.id);
    if (!cfg) return;
    await run(invite.guild, "inviteDelete", namedDelete("inviteDelete", invite.code, [["field.channel", channelTag(invite.channel)]], cfg));
  }));

  const channelShape = (c) => ({
    name: c.name,
    type: c.type,
    topic: c.topic,
    nsfw: c.nsfw,
    bitrate: c.bitrate,
    userLimit: c.userLimit,
    rateLimitPerUser: c.rateLimitPerUser,
    parent: c.parentId,
  });

  client.on("channelCreate", safe("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const cfg = dispatch.guildCfg(channel.guild.id);
    if (!cfg) return;
    await run(channel.guild, "channelCreate", namedCreate("channelCreate", channel.name, [["field.channel", channelTag(channel)]], cfg));
  }));
  client.on("channelDelete", safe("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const cfg = dispatch.guildCfg(channel.guild.id);
    if (!cfg) return;
    await run(channel.guild, "channelDelete", namedDelete("channelDelete", channel.name, [["field.id", channel.id]], cfg));
  }));
  client.on("channelUpdate", safe("channelUpdate", async (before, after) => {
    if (!after.guild) return;
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "channelUpdate", namedUpdate("channelUpdate", after.name, channelShape(before), channelShape(after), cfg));
  }));
  client.on("channelPinsUpdate", safe("channelPinsUpdate", async (channel, date) => {
    if (!channel.guild) return;
    const cfg = dispatch.guildCfg(channel.guild.id);
    if (!cfg) return;
    await run(channel.guild, "channelPinsUpdate", {
      embeds: [buildEmbed(cfg, "channelPinsUpdate", [
        ["field.channel", channelTag(channel)],
        ["field.after", date ? date.toISOString() : t(cfg.locale, "none")],
      ])],
      ignore: { channel },
    });
  }));

  client.on("threadCreate", safe("threadCreate", async (thread) => {
    const cfg = dispatch.guildCfg(thread.guild.id);
    if (!cfg) return;
    await run(thread.guild, "threadCreate", namedCreate("threadCreate", thread.name, [["field.parent", channelTag(thread.parent)]], cfg));
  }));
  client.on("threadDelete", safe("threadDelete", async (thread) => {
    const cfg = dispatch.guildCfg(thread.guild.id);
    if (!cfg) return;
    await run(thread.guild, "threadDelete", namedDelete("threadDelete", thread.name, [["field.id", thread.id]], cfg));
  }));
  client.on("threadUpdate", safe("threadUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "threadUpdate", namedUpdate("threadUpdate", after.name, {
      archived: before.archived, locked: before.locked, name: before.name, autoArchive: before.autoArchiveDuration,
    }, {
      archived: after.archived, locked: after.locked, name: after.name, autoArchive: after.autoArchiveDuration,
    }, cfg));
  }));
  client.on("threadMembersUpdate", safe("threadMembersUpdate", async (added, removed, thread) => {
    const cfg = dispatch.guildCfg(thread.guild.id);
    if (!cfg) return;
    await run(thread.guild, "threadMembersUpdate", {
      embeds: [buildEmbed(cfg, "threadMembersUpdate", [
        ["field.thread", channelTag(thread)],
        ["field.after", `${added.size} added / ${removed.size} removed`],
      ])],
    });
  }));
  client.on("threadListSync", safe("threadListSync", async (threads, guild) => {
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "threadListSync", {
      embeds: [buildEmbed(cfg, "threadListSync", [["field.count", String(threads.size)]])],
    });
  }));

  const roleShape = (r) => ({
    name: r.name, color: r.hexColor, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(),
  });
  client.on("roleCreate", safe("roleCreate", async (role) => {
    const cfg = dispatch.guildCfg(role.guild.id);
    if (!cfg) return;
    await run(role.guild, "roleCreate", namedCreate("roleCreate", role.name, [["field.color", role.hexColor]], cfg));
  }));
  client.on("roleDelete", safe("roleDelete", async (role) => {
    const cfg = dispatch.guildCfg(role.guild.id);
    if (!cfg) return;
    await run(role.guild, "roleDelete", namedDelete("roleDelete", role.name, [["field.id", role.id]], cfg));
  }));
  client.on("roleUpdate", safe("roleUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "roleUpdate", namedUpdate("roleUpdate", after.name, roleShape(before), roleShape(after), cfg));
  }));

  client.on("emojiCreate", safe("emojiCreate", async (emoji) => {
    const cfg = dispatch.guildCfg(emoji.guild.id);
    if (!cfg) return;
    await run(emoji.guild, "emojiCreate", namedCreate("emojiCreate", emoji.name, [["field.emoji", emoji.toString()]], cfg));
  }));
  client.on("emojiDelete", safe("emojiDelete", async (emoji) => {
    const cfg = dispatch.guildCfg(emoji.guild.id);
    if (!cfg) return;
    await run(emoji.guild, "emojiDelete", namedDelete("emojiDelete", emoji.name, [], cfg));
  }));
  client.on("emojiUpdate", safe("emojiUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "emojiUpdate", namedUpdate("emojiUpdate", after.name, { name: before.name }, { name: after.name }, cfg));
  }));

  client.on("stickerCreate", safe("stickerCreate", async (sticker) => {
    const cfg = dispatch.guildCfg(sticker.guildId);
    if (!cfg) return;
    const guild = sticker.guild || client.guilds.cache.get(sticker.guildId);
    if (!guild) return;
    await run(guild, "stickerCreate", namedCreate("stickerCreate", sticker.name, [["field.id", sticker.id]], cfg));
  }));
  client.on("stickerDelete", safe("stickerDelete", async (sticker) => {
    const guild = sticker.guild || client.guilds.cache.get(sticker.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "stickerDelete", namedDelete("stickerDelete", sticker.name, [], cfg));
  }));
  client.on("stickerUpdate", safe("stickerUpdate", async (before, after) => {
    const guild = after.guild || client.guilds.cache.get(after.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "stickerUpdate", namedUpdate("stickerUpdate", after.name, { name: before.name, desc: before.description }, { name: after.name, desc: after.description }, cfg));
  }));

  client.on("voiceStateUpdate", safe("voiceStateUpdate", async (before, after) => {
    const guild = after.guild || before.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    const kind = voiceKind(before, after);
    if (!kind) return;
    await run(guild, kind, formatVoice(kind, before, after, cfg));
  }));

  client.on("stageInstanceCreate", safe("stageInstanceCreate", async (stage) => {
    const cfg = dispatch.guildCfg(stage.guild.id);
    if (!cfg) return;
    await run(stage.guild, "stageInstanceCreate", namedCreate("stageInstanceCreate", stage.topic, [["field.channel", channelTag(stage.channel)]], cfg));
  }));
  client.on("stageInstanceDelete", safe("stageInstanceDelete", async (stage) => {
    const cfg = dispatch.guildCfg(stage.guild.id);
    if (!cfg) return;
    await run(stage.guild, "stageInstanceDelete", namedDelete("stageInstanceDelete", stage.topic, [], cfg));
  }));
  client.on("stageInstanceUpdate", safe("stageInstanceUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "stageInstanceUpdate", namedUpdate("stageInstanceUpdate", after.topic, { topic: before.topic, privacy: before.privacyLevel }, { topic: after.topic, privacy: after.privacyLevel }, cfg));
  }));

  client.on("guildUpdate", safe("guildUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.id);
    if (!cfg) return;
    if (before.premiumTier !== after.premiumTier) {
      await run(after, "guildBoostLevel", {
        embeds: [buildEmbed(cfg, "guildBoostLevel", [
          ["field.before", String(before.premiumTier)],
          ["field.after", String(after.premiumTier)],
        ])],
      });
    }
    await run(after, "guildUpdate", namedUpdate("guildUpdate", after.name, {
      name: before.name, icon: before.icon, owner: before.ownerId, vanity: before.vanityURLCode, afk: before.afkChannelId,
    }, {
      name: after.name, icon: after.icon, owner: after.ownerId, vanity: after.vanityURLCode, afk: after.afkChannelId,
    }, cfg));
  }));

  client.on("webhooksUpdate", safe("webhooksUpdate", async (channel) => {
    if (!channel.guild) return;
    const cfg = dispatch.guildCfg(channel.guild.id);
    if (!cfg) return;
    await run(channel.guild, "webhookUpdate", {
      embeds: [buildEmbed(cfg, "webhookUpdate", [["field.channel", channelTag(channel)]])],
      ignore: { channel },
    });
  }));

  client.on("guildIntegrationsUpdate", safe("guildIntegrationsUpdate", async (guild) => {
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "guildIntegrationsUpdate", {
      embeds: [buildEmbed(cfg, "guildIntegrationsUpdate", [["field.name", guild.name]])],
    });
  }));

  client.on("guildScheduledEventCreate", safe("guildScheduledEventCreate", async (event) => {
    const cfg = dispatch.guildCfg(event.guild.id);
    if (!cfg) return;
    await run(event.guild, "guildScheduledEventCreate", namedCreate("guildScheduledEventCreate", event.name, [
      ["field.scheduled", event.scheduledStartAt ? event.scheduledStartAt.toISOString() : null],
    ], cfg));
  }));
  client.on("guildScheduledEventDelete", safe("guildScheduledEventDelete", async (event) => {
    const cfg = dispatch.guildCfg(event.guild.id);
    if (!cfg) return;
    await run(event.guild, "guildScheduledEventDelete", namedDelete("guildScheduledEventDelete", event.name, [], cfg));
  }));
  client.on("guildScheduledEventUpdate", safe("guildScheduledEventUpdate", async (before, after) => {
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "guildScheduledEventUpdate", namedUpdate("guildScheduledEventUpdate", after.name, {
      name: before.name, status: before.status,
    }, { name: after.name, status: after.status }, cfg));
  }));
  client.on("guildScheduledEventUserAdd", safe("guildScheduledEventUserAdd", async (event, user) => {
    const cfg = dispatch.guildCfg(event.guild.id);
    if (!cfg) return;
    await run(event.guild, "guildScheduledEventUserAdd", {
      embeds: [buildEmbed(cfg, "guildScheduledEventUserAdd", [["field.user", userTag(user)], ["field.name", event.name]])],
      userId: user.id,
      ignore: { user },
    });
  }));
  client.on("guildScheduledEventUserRemove", safe("guildScheduledEventUserRemove", async (event, user) => {
    const cfg = dispatch.guildCfg(event.guild.id);
    if (!cfg) return;
    await run(event.guild, "guildScheduledEventUserRemove", {
      embeds: [buildEmbed(cfg, "guildScheduledEventUserRemove", [["field.user", userTag(user)], ["field.name", event.name]])],
      userId: user.id,
      ignore: { user },
    });
  }));

  client.on("autoModerationRuleCreate", safe("autoModerationRuleCreate", async (rule) => {
    const guild = client.guilds.cache.get(rule.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "autoModerationRuleCreate", namedCreate("autoModerationRuleCreate", rule.name, [["field.id", rule.id]], cfg));
  }));
  client.on("autoModerationRuleDelete", safe("autoModerationRuleDelete", async (rule) => {
    const guild = client.guilds.cache.get(rule.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "autoModerationRuleDelete", namedDelete("autoModerationRuleDelete", rule.name, [], cfg));
  }));
  client.on("autoModerationRuleUpdate", safe("autoModerationRuleUpdate", async (before, after) => {
    const guild = client.guilds.cache.get(after.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "autoModerationRuleUpdate", namedUpdate("autoModerationRuleUpdate", after.name, { name: before.name, enabled: before.enabled }, { name: after.name, enabled: after.enabled }, cfg));
  }));
  client.on("autoModerationActionExecution", safe("autoModerationActionExecution", async (exec) => {
    const guild = exec.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "autoModerationActionExecution", {
      embeds: [buildEmbed(cfg, "autoModerationActionExecution", [
        ["field.user", exec.userId],
        ["field.rule", exec.ruleId],
        ["field.content", exec.content || exec.matchedContent],
        ["field.channel", exec.channelId ? `<#${exec.channelId}>` : null],
      ])],
      userId: exec.userId,
    });
  }));

  client.on("applicationCommandPermissionsUpdate", safe("applicationCommandPermissionsUpdate", async (data) => {
    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "applicationCommandPermissionsUpdate", {
      embeds: [buildEmbed(cfg, "applicationCommandPermissionsUpdate", [
        ["field.id", data.id],
        ["field.command", data.applicationId],
      ])],
    });
  }));

  client.on("guildAuditLogEntryCreate", safe("guildAuditLogEntryCreate", async (entry, guild) => {
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    if (entry.action === AuditLogEvent.MessagePin) {
      await run(guild, "messagePin", {
        embeds: [buildEmbed(cfg, "messagePin", [
          ["field.executor", entry.executor ? userTag(entry.executor) : null],
          ["field.target", entry.targetId],
        ])],
      });
    }
    if (entry.action === AuditLogEvent.MessageUnpin) {
      await run(guild, "messageUnpin", {
        embeds: [buildEmbed(cfg, "messageUnpin", [
          ["field.executor", entry.executor ? userTag(entry.executor) : null],
          ["field.target", entry.targetId],
        ])],
      });
    }
    await run(guild, "guildAuditLogEntryCreate", {
      embeds: [buildEmbed(cfg, "guildAuditLogEntryCreate", [
        ["field.audit", String(entry.action)],
        ["field.executor", entry.executor ? userTag(entry.executor) : null],
        ["field.target", entry.targetId],
        ["field.reason", entry.reason],
      ])],
    });
  }));

  client.on("presenceUpdate", safe("presenceUpdate", async (before, after) => {
    if (!after?.guild) return;
    const cfg = dispatch.guildCfg(after.guild.id);
    if (!cfg) return;
    await run(after.guild, "presenceUpdate", {
      embeds: [buildEmbed(cfg, "presenceUpdate", [
        ["field.user", userTag(after.user)],
        ["field.status", `${before?.status || "?"} → ${after.status}`],
        ["field.activity", after.activities?.[0]?.name],
      ])],
      bot: after.user?.bot,
      userId: after.user?.id,
      ignore: { user: after.user },
    });
  }));

  client.on("messageCreate", safe("messageCreate", async (message) => {
    if (!message.guild || message.author?.id === client.user.id) return;
    const cfg = dispatch.guildCfg(message.guild.id);
    if (!cfg) return;
    await run(message.guild, "messageCreate", {
      embeds: [buildEmbed(cfg, "messageCreate", [
        ["field.author", userTag(message.author)],
        ["field.channel", channelTag(message.channel)],
        ["field.content", message.cleanContent || message.content],
        ["field.jump", cfg.embedShowJump ? message.url : null],
      ])],
      bot: message.author?.bot,
      webhook: Boolean(message.webhookId),
      userId: message.author?.id,
      ignore: { user: message.author, channel: message.channel },
      summary: `create ${message.id}`,
    });
  }));

  client.on("typingStart", safe("typingStart", async (typing) => {
    const guild = typing.guild || typing.channel?.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "typingStart", {
      embeds: [buildEmbed(cfg, "typingStart", [
        ["field.user", userTag(typing.user)],
        ["field.channel", channelTag(typing.channel)],
      ])],
      bot: typing.user?.bot,
      userId: typing.user?.id,
      ignore: { user: typing.user, channel: typing.channel },
    });
  }));

  client.on("messagePollVoteAdd", safe("messagePollVoteAdd", async (answer, userId) => {
    const message = answer.poll?.message;
    const guild = message?.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "messagePollVoteAdd", {
      embeds: [buildEmbed(cfg, "messagePollVoteAdd", [
        ["field.user", userId],
        ["field.after", String(answer.text || answer.id)],
        ["field.jump", message.url],
      ])],
      userId,
      ignore: { channel: message.channel },
    });
  }));

  client.on("messagePollVoteRemove", safe("messagePollVoteRemove", async (answer, userId) => {
    const message = answer.poll?.message;
    const guild = message?.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "messagePollVoteRemove", {
      embeds: [buildEmbed(cfg, "messagePollVoteRemove", [
        ["field.user", userId],
        ["field.after", String(answer.text || answer.id)],
        ["field.jump", message.url],
      ])],
      userId,
      ignore: { channel: message.channel },
    });
  }));

  client.on("voiceChannelEffectSend", safe("voiceChannelEffectSend", async (effect) => {
    const guild = effect.guild || effect.channel?.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "voiceChannelEffect", {
      embeds: [buildEmbed(cfg, "voiceChannelEffect", [
        ["field.user", effect.userId],
        ["field.channel", channelTag(effect.channel)],
        ["field.emoji", effect.emoji ? String(effect.emoji) : String(effect.animationType ?? "effect")],
      ])],
      userId: effect.userId,
      ignore: { channel: effect.channel },
    });
  }));

  client.on("threadMemberUpdate", safe("threadMemberUpdate", async (before, after) => {
    const thread = after.thread || before.thread;
    const guild = thread?.guild;
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "threadMemberUpdate", {
      embeds: [buildEmbed(cfg, "threadMemberUpdate", [
        ["field.user", after.id],
        ["field.thread", channelTag(thread)],
        ["field.action", String(after.flags?.bitfield ?? after.flags ?? "")],
      ])],
      userId: after.id,
    });
  }));

  const soundGuild = (sound) => sound.guild || client.guilds.cache.get(sound.guildId);
  client.on("guildSoundboardSoundCreate", safe("soundboardCreate", async (sound) => {
    const guild = soundGuild(sound);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "soundboardCreate", namedCreate("soundboardCreate", sound.name, [["field.id", sound.soundId || sound.id]], cfg));
  }));
  client.on("guildSoundboardSoundDelete", safe("soundboardDelete", async (sound) => {
    const guild = soundGuild(sound);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "soundboardDelete", namedDelete("soundboardDelete", sound.name, [["field.id", sound.soundId || sound.id]], cfg));
  }));
  client.on("guildSoundboardSoundUpdate", safe("soundboardUpdate", async (before, after) => {
    const guild = soundGuild(after);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "soundboardUpdate", namedUpdate("soundboardUpdate", after.name, { name: before.name, emoji: before.emojiId }, { name: after.name, emoji: after.emojiId }, cfg));
  }));

  const entitlementGuild = (ent) => client.guilds.cache.get(ent.guildId);
  client.on("entitlementCreate", safe("entitlementCreate", async (ent) => {
    const guild = entitlementGuild(ent);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "entitlementCreate", namedCreate("entitlementCreate", String(ent.skuId), [["field.user", ent.userId], ["field.id", ent.id]], cfg));
  }));
  client.on("entitlementUpdate", safe("entitlementUpdate", async (before, after) => {
    const guild = entitlementGuild(after);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "entitlementUpdate", namedUpdate("entitlementUpdate", String(after.skuId), { ends: before?.endsTimestamp }, { ends: after.endsTimestamp }, cfg));
  }));
  client.on("entitlementDelete", safe("entitlementDelete", async (ent) => {
    const guild = entitlementGuild(ent);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "entitlementDelete", namedDelete("entitlementDelete", String(ent.skuId), [["field.user", ent.userId]], cfg));
  }));

  client.on("subscriptionCreate", safe("subscriptionCreate", async (sub) => {
    const guild = client.guilds.cache.get(sub.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "subscriptionCreate", namedCreate("subscriptionCreate", sub.id, [["field.status", String(sub.status)]], cfg));
  }));
  client.on("subscriptionUpdate", safe("subscriptionUpdate", async (before, after) => {
    const guild = client.guilds.cache.get(after.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "subscriptionUpdate", namedUpdate("subscriptionUpdate", after.id, { status: before?.status }, { status: after.status }, cfg));
  }));
  client.on("subscriptionDelete", safe("subscriptionDelete", async (sub) => {
    const guild = client.guilds.cache.get(sub.guildId);
    if (!guild) return;
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "subscriptionDelete", namedDelete("subscriptionDelete", sub.id, [], cfg));
  }));

  client.on("interactionCreate", safe("commandUse", async (interaction) => {
    if (!interaction.inGuild()) return;
    if (interaction.commandName && interaction.commandName === (processCfg.commandName || "log")) return;
    const cfg = dispatch.guildCfg(interaction.guildId);
    if (!cfg) return;
    const kind = interaction.isChatInputCommand?.() ? "slash"
      : interaction.isButton?.() ? "button"
      : interaction.isStringSelectMenu?.() ? "select"
      : interaction.isModalSubmit?.() ? "modal"
      : interaction.isContextMenuCommand?.() ? "context"
      : interaction.isAutocomplete?.() ? "autocomplete"
      : "interaction";
    await run(interaction.guild, "commandUse", {
      embeds: [buildEmbed(cfg, "commandUse", [
        ["field.user", userTag(interaction.user)],
        ["field.command", interaction.commandName || interaction.customId || kind],
        ["field.channel", channelTag(interaction.channel)],
        ["field.action", kind],
      ])],
      bot: interaction.user.bot,
      userId: interaction.user.id,
      ignore: { user: interaction.user, channel: interaction.channel },
    });
  }));

  client.on("guildAvailable", safe("guildAvailable", async (guild) => {
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "guildAvailable", { embeds: [buildEmbed(cfg, "guildAvailable", [["field.name", guild.name]])] });
  }));
  client.on("guildUnavailable", safe("guildUnavailable", async (guild) => {
    const cfg = dispatch.guildCfg(guild.id);
    if (!cfg) return;
    await run(guild, "guildUnavailable", { embeds: [buildEmbed(cfg, "guildUnavailable", [["field.name", guild.name], ["field.id", guild.id]])] });
  }));

  client.on("userUpdate", safe("userUpdate", async (before, after) => {
    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(after.id)) continue;
      const cfg = dispatch.guildCfg(guild.id);
      if (!cfg) continue;
      await run(guild, "userUpdate", namedUpdate("userUpdate", after.tag, {
        username: before.username, avatar: before.avatar, global: before.globalName,
      }, {
        username: after.username, avatar: after.avatar, global: after.globalName,
      }, cfg));
    }
  }));
}

module.exports = { bindEvents };
