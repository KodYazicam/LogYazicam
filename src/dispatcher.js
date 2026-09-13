const { WebhookClient } = require("discord.js");
const { ignored, inQuietHours, includeOk, embedToPlain } = require("./util");
const { redactEmbeds, redactText, flagsFrom } = require("./redact");

function createDispatcher({ client, db, processCfg, log, cache }) {
  const queues = new Map();
  const lastSent = new Map();
  const digestBuckets = new Map();
  const metrics = { sent: 0, dropped: 0, retries: 0 };

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
      const digestMs = cfg.digestMs || 0;
      if (digestMs > 0 && !payload.digest) {
        const dkey = `${guild.id}:${eventKey}:${channelId}`;
        const bucket = digestBuckets.get(dkey) || { count: 0, timer: null, sample: payload, guild, eventKey };
        bucket.count += 1;
        bucket.sample = payload;
        if (!bucket.timer) {
          bucket.timer = setTimeout(() => {
            digestBuckets.delete(dkey);
            const n = bucket.count;
            const min = processCfg.digestMin || 5;
            if (n >= min) {
              const { buildEmbed } = require("./util");
              const embed = buildEmbed(cfg, eventKey, [
                ["field.count", String(n)],
                ["field.channel", `<#${channelId}>`],
              ], { description: `${n}× ${eventKey}` });
              enqueue(guild, eventKey, { ...bucket.sample, embeds: [embed], digest: true, summary: `digest ${n}` });
            } else {
              enqueue(guild, eventKey, { ...bucket.sample, digest: true });
            }
          }, digestMs).unref();
        }
        digestBuckets.set(dkey, bucket);
        return;
      }
      if (!cooldownOk(cfg, guild.id, eventKey)) return;

      let embeds = payload.embeds || [];
      const files = payload.files || [];
      let content = payload.content || (cfg.mentionOnDelete && eventKey === "messageDelete" && cfg.mentionRole
        ? `<@&${cfg.mentionRole}>`
        : null);

      const flags = flagsFrom(cfg, processCfg);
      if (embeds.length) embeds = redactEmbeds(embeds, flags);
      if (content) content = redactText(content, flags);

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
        eventKey,
        summary: payload.summary,
        staff: false,
      });
      if (cfg.staffChannel && cfg.staffChannel !== channelId) {
        q.push({
          channelId: cfg.staffChannel,
          content,
          embeds: delivery === "plain" ? [] : embeds,
          files,
          guildId: guild.id,
          preferWebhook: false,
          eventKey,
          summary: payload.summary,
          staff: true,
        });
      }
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
    const sinks = String(processCfg.logSink || "discord").split(",").map((s) => s.trim());
    if (sinks.includes("file") || sinks.includes("http")) {
      const { writeFileSink, postHttpSink } = require("./sinks");
      const body = { guildId: item.guildId, eventKey: item.eventKey, summary: item.summary, at: Date.now() };
      if (sinks.includes("file")) writeFileSink(processCfg.fileSinkDir, item.guildId, item.eventKey, body);
      if (sinks.includes("http")) postHttpSink(processCfg.httpSinkUrl, body);
    }
    if (!sinks.includes("discord") && sinks.length) return;
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
        metrics.sent += 1;
      } catch (error) {
        const retryAfter = error?.retryAfter || error?.httpStatus === 429;
        if (processCfg.retry429 && retryAfter) {
          metrics.retries += 1;
          q.unshift(item);
          await new Promise((r) => setTimeout(r, Math.ceil((Number(error.retryAfter) || 1) * 1000)));
        } else {
          metrics.dropped += 1;
          log.error("flush", key, error);
          const cfg = guildCfg(item.guildId);
          if (cfg) cfg.lastError = error.message;
        }
      }
    }
  }, processCfg.sendIntervalMs).unref();

  return { enqueue, refreshGuild, guildCfg, routeFor, queues, db, metrics };
}

module.exports = { createDispatcher };
