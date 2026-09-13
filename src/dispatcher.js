const { WebhookClient } = require("discord.js");
const { ignored, inQuietHours, includeOk, embedToPlain } = require("./util");

function createDispatcher({ client, db, processCfg, log, cache }) {
  const queues = new Map();
  const lastSent = new Map();

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

  function actorOk(cfg, payload) {
    const mode = cfg.actors || "all";
    if (mode === "all") return true;
    const isBot = Boolean(payload.bot);
    if (mode === "humans" && isBot) return false;
    if (mode === "bots" && !isBot) return false;
    return true;
  }

  function accountAgeOk(cfg, payload) {
    const days = cfg.minAccountDays || 0;
    if (!days || !payload.createdTimestamp) return true;
    return Date.now() - payload.createdTimestamp >= days * 86400000;
  }

  function cooldownOk(cfg, guildId, eventKey) {
    const sec = cfg.cooldownSec || 0;
    if (!sec) return true;
    const stamp = `${guildId}:${eventKey}`;
    const last = lastSent.get(stamp) || 0;
    if (Date.now() - last < sec * 1000) return false;
    lastSent.set(stamp, Date.now());
    return true;
  }

  async function enqueue(guild, eventKey, payload) {
    try {
      if (!guild) return;
      const cfg = guildCfg(guild.id) || refreshGuild(guild.id);
      if (cfg.paused) return;
      if (inQuietHours(cfg)) return;
      const channelId = routeFor(cfg, eventKey);
      if (!channelId) return;
      if (cfg.ignoreSelf && payload.userId && payload.userId === client.user.id) return;
      if (cfg.ignoreBots && payload.bot) return;
      if (cfg.ignoreWebhooks && payload.webhook) return;
      if (!actorOk(cfg, payload)) return;
      if (!accountAgeOk(cfg, payload)) return;
      if (!includeOk(cfg, payload.ignore?.channel)) return;
      if (ignored(cfg, payload.ignore || {})) return;
      if (!cooldownOk(cfg, guild.id, eventKey)) return;

      let embeds = payload.embeds || [];
      const files = payload.files || [];
      let content = payload.content || (cfg.mentionOnDelete && eventKey === "messageDelete" && cfg.mentionRole
        ? `<@&${cfg.mentionRole}>`
        : null);

      const delivery = cfg.delivery || (cfg.plainText ? "plain" : "embed");
      if ((delivery === "plain" || cfg.plainText) && embeds.length) {
        const text = embeds.map((e) => embedToPlain(e).slice(0, processCfg.plainMax || 1900)).join("\n\n");
        content = [content, text].filter(Boolean).join("\n").slice(0, processCfg.plainMax || 1900);
        embeds = [];
      }

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
      q.push({
        channelId,
        content,
        embeds: delivery === "plain" ? [] : embeds,
        files,
        guildId: guild.id,
        preferWebhook: delivery === "webhook",
      });
    } catch (error) {
      log.error("enqueue", eventKey, error);
    }
  }

  async function flushOne(item) {
    const channel = await client.channels.fetch(item.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const cfg = guildCfg(item.guildId);
    const wantHook = item.preferWebhook || (cfg?.delivery === "webhook") || Boolean(cfg?.webhookId && cfg?.webhookToken);
    if (wantHook && cfg?.webhookId && cfg?.webhookToken) {
      try {
        const hook = new WebhookClient({ id: cfg.webhookId, token: cfg.webhookToken });
        await hook.send({
          content: item.content || undefined,
          embeds: item.embeds?.length ? item.embeds : undefined,
          files: item.files,
          username: cfg.webhookName || processCfg.webhookName,
          avatarURL: cfg.webhookAvatar || processCfg.webhookAvatarUrl || undefined,
        });
        return;
      } catch (error) {
        log.warn("webhook send failed, falling back to channel", error.message);
        if (processCfg.allowWebhookFallback === false) return;
      }
    }
    if (item.preferWebhook && (!cfg?.webhookId || !cfg?.webhookToken)) {
      log.warn("delivery=webhook but no webhook configured; using channel.send");
    }
    await channel.send({
      content: item.content || undefined,
      embeds: item.embeds?.length ? item.embeds : undefined,
      files: item.files,
      allowedMentions: { parse: [], roles: cfg?.mentionRole ? [cfg.mentionRole] : [] },
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
