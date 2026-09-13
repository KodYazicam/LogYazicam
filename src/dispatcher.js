const { WebhookClient } = require("discord.js");
const { ignored } = require("./util");

function createDispatcher({ client, db, processCfg, log, cache }) {
  const queues = new Map();

  function guildCfg(guildId) {
    return cache.get(guildId);
  }

  function refreshGuild(guildId) {
    db.ensureGuild(guildId);
    const row = db.getGuild.get(guildId);
    const routes = db.listRoutes.all(guildId);
    const ignores = db.listIgnores.all(guildId);
    const extra = db.extraOf(row);
    const { mergeGuild } = require("./config");
    const cfg = mergeGuild(processCfg, row, routes, ignores, extra);
    cache.set(guildId, cfg);
    return cfg;
  }

  function routeFor(cfg, eventKey, fallbackChannel) {
    const route = cfg.events[eventKey];
    if (!route?.on) return null;
    return route.channelId || cfg.defaultChannel || fallbackChannel || null;
  }

  async function enqueue(guild, eventKey, payload) {
    try {
      if (!guild) return;
      const cfg = guildCfg(guild.id) || refreshGuild(guild.id);
      const channelId = routeFor(cfg, eventKey);
      if (!channelId) return;
      if (cfg.ignoreSelf && payload.userId && payload.userId === client.user.id) return;
      if (cfg.ignoreBots && payload.bot) return;
      if (cfg.ignoreWebhooks && payload.webhook) return;
      if (ignored(cfg, payload.ignore || {})) return;

      const embeds = payload.embeds || [];
      const files = payload.files || [];
      const content = payload.content || (cfg.mentionOnDelete && eventKey === "messageDelete" && cfg.mentionRole
        ? `<@&${cfg.mentionRole}>`
        : null);

      if (cfg.storeHistory) {
        db.pushHistory(guild.id, eventKey, {
          eventKey,
          channelId,
          at: Date.now(),
          summary: payload.summary || eventKey,
        }, cfg.historyLimit);
      }

      const key = `${guild.id}:${channelId}`;
      if (!queues.has(key)) queues.set(key, []);
      const q = queues.get(key);
      if (q.length >= processCfg.maxQueue) q.shift();
      q.push({ channelId, content, embeds, files, guildId: guild.id });
    } catch (error) {
      log.error("enqueue", eventKey, error);
    }
  }

  async function flushOne(item) {
    const channel = await client.channels.fetch(item.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const cfg = guildCfg(item.guildId);
    if (cfg?.webhookId && cfg?.webhookToken) {
      try {
        const hook = new WebhookClient({ id: cfg.webhookId, token: cfg.webhookToken });
        await hook.send({
          content: item.content || undefined,
          embeds: item.embeds,
          files: item.files,
          username: processCfg.webhookName,
          avatarURL: processCfg.webhookAvatarUrl || undefined,
        });
        return;
      } catch (error) {
        log.warn("webhook send failed, falling back to channel", error.message);
      }
    }
    await channel.send({
      content: item.content || undefined,
      embeds: item.embeds,
      files: item.files,
      allowedMentions: { parse: [] },
    });
  }

  setInterval(async () => {
    for (const [key, q] of queues) {
      const item = q.shift();
      if (!item) continue;
      try {
        await flushOne(item);
      } catch (error) {
        log.error("flush", key, error);
        const cfg = guildCfg(item.guildId);
        if (cfg) cfg.lastError = error.message;
      }
    }
  }, processCfg.sendIntervalMs).unref();

  return { enqueue, refreshGuild, guildCfg, routeFor, queues };
}

module.exports = { createDispatcher };
