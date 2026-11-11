const { WebhookClient } = require("discord.js");
const { ignored, inQuietHours, includeOk, embedToPlain } = require("./util");
const { redactEmbeds, redactText, flagsFrom, eventRedactFlags } = require("./redact");

function createDispatcher({ client, db, processCfg, log, cache, deps = {} }) {
  const queues = new Map();
  const lastSent = new Map();
  const digestBuckets = new Map();
  const metrics = { sent: 0, dropped: 0, retries: 0 };
  const makeWebhook = deps.createWebhookClient || ((options) => new WebhookClient(options));
  const now = deps.now || Date.now;
  const schedule = deps.setInterval || setInterval;

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

  function actorOk(cfg, payload, eventKey) {
    const override = cfg.eventActors?.[eventKey];
    const mode = ["all", "humans", "bots"].includes(override) ? override : (cfg.actors || "all");
    if (mode === "all") return true;
    // Some events have no actor (channel/role/server changes). Do not treat an
    // unknown actor as human; just leave those events unaffected.
    if (typeof payload.bot !== "boolean") return true;
    const isBot = payload.bot;
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
    const raw = cfg.eventCooldown?.[eventKey];
    const override = Number(raw);
    const sec = Number.isInteger(override) && override >= 0 && override <= 3600
      ? override
      : (cfg.cooldownSec || 0);
    if (!sec) return true;
    const stamp = `${guildId}:${eventKey}`;
    const last = lastSent.get(stamp) || 0;
    if (Date.now() - last < sec * 1000) return false;
    lastSent.set(stamp, Date.now());
    return true;
  }

  function digestFor(cfg, eventKey) {
    const raw = cfg.eventDigest?.[eventKey];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const ms = Number(raw.ms);
    if (!Number.isInteger(ms) || ms < 0 || ms > 3600000) return null;
    const min = Number(raw.min);
    return {
      ms,
      min: Number.isInteger(min) && min > 0 && min <= 1000 ? min : null,
    };
  }

  async function enqueue(guild, eventKey, payload) {
    try {
      if (!guild) return;
      const cfg = guildCfg(guild.id) || refreshGuild(guild.id);
      if (cfg.paused) return;
      if (inQuietHours(cfg) && !cfg.quietBypass?.[eventKey]) return;
      const channelId = routeFor(cfg, eventKey);
      if (!channelId) return;
      if (cfg.ignoreSelf && payload.userId && payload.userId === client.user.id) return;
      if (cfg.ignoreBots && payload.bot) return;
      if (cfg.ignoreWebhooks && payload.webhook) return;
      if (!actorOk(cfg, payload, eventKey)) return;
      if (!accountAgeOk(cfg, payload)) return;
      if (!includeOk(cfg, payload.ignore?.channel, eventKey)) return;
      const ignore = { ...(payload.ignore || {}) };
      if (!Array.isArray(ignore.roleIds) || !ignore.roleIds.length) {
        const memberId = ignore.user?.id || payload.userId;
        const member = memberId ? guild.members?.cache?.get(memberId) : null;
        if (member?.roles?.cache) ignore.roleIds = [...member.roles.cache.keys()];
      }
      if (ignored(cfg, ignore)) return;
      const eventDigest = digestFor(cfg, eventKey);
      const digestMs = eventDigest ? eventDigest.ms : (cfg.digestMs || 0);
      const digestMin = eventDigest?.min || processCfg.digestMin || 5;
      if (digestMs > 0 && !payload.digest) {
        const dkey = `${guild.id}:${eventKey}:${channelId}`;
        const bucket = digestBuckets.get(dkey) || { count: 0, timer: null, sample: payload, guild, eventKey };
        bucket.count += 1;
        bucket.sample = payload;
        if (!bucket.timer) {
          bucket.timer = setTimeout(() => {
            digestBuckets.delete(dkey);
            const n = bucket.count;
            const min = digestMin;
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

      const flags = eventRedactFlags(cfg, eventKey, flagsFrom(cfg, processCfg));
      if (embeds.length) embeds = redactEmbeds(embeds, flags);
      if (content) content = redactText(content, flags);

      const eventMode = cfg.eventDelivery?.[eventKey];
      const eventDelivery = ["embed", "plain", "webhook"].includes(eventMode) ? eventMode : null;
      const delivery = eventDelivery || cfg.delivery || (cfg.plainText ? "plain" : "embed");
      const flatten = delivery === "plain" || (!eventDelivery && cfg.plainText);
      if (flatten && embeds.length) {
        const text = embeds.map((e) => embedToPlain(e).slice(0, processCfg.plainMax || 1900)).join("\n\n");
        content = [content, text].filter(Boolean).join("\n").slice(0, processCfg.plainMax || 1900);
        embeds = [];
      }

      const historyMode = cfg.eventHistory?.[eventKey];
      if (historyMode === true || (historyMode !== false && cfg.storeHistory)) {
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
      if (q.length >= processCfg.maxQueue) {
        q.shift();
        metrics.dropped += 1;
      }
      q.push({
        channelId,
        content,
        embeds: delivery === "plain" ? [] : embeds,
        files,
        guildId: guild.id,
        delivery,
        eventDelivery,
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
    const cfg = guildCfg(item.guildId);
    const sinks = String(processCfg.logSink || "discord").split(",").map((s) => s.trim());
    // Mirror each event once, before any delivery path. The marker keeps a 429
    // retry from writing the same sink row twice.
    let mirrored = false;
    if (!item.staff && !item.sinksDone) {
      item.sinksDone = true;
      if (sinks.includes("file") || sinks.includes("http")) {
        const { writeFileSink, postHttpSink } = require("./sinks");
        const body = { guildId: item.guildId, eventKey: item.eventKey, summary: item.summary, at: Date.now() };
        try {
          if (sinks.includes("file") && writeFileSink(processCfg.fileSinkDir, item.guildId, item.eventKey, body)) {
            mirrored = true;
          } else if (sinks.includes("file")) {
            log.warn("file sink failed", processCfg.fileSinkDir || "(no directory)");
          }
          if (sinks.includes("http")) {
            postHttpSink(processCfg.httpSinkUrl, body);
            if (processCfg.httpSinkUrl) mirrored = true;
          }
        } catch (error) {
          log.warn("sink failed", error.message);
        }
      }
    }
    const wantHook = !item.staff && (
      item.preferWebhook ||
      (!item.eventDelivery && ((cfg?.delivery === "webhook") || Boolean(cfg?.webhookId && cfg?.webhookToken)))
    );
    if (wantHook && cfg?.webhookId && cfg?.webhookToken) {
      try {
        const hook = makeWebhook({ id: cfg.webhookId, token: cfg.webhookToken });
        await hook.send({
          content: item.content || undefined,
          embeds: item.embeds?.length ? item.embeds : undefined,
          files: item.files,
          username: cfg.webhookName || processCfg.webhookName,
          avatarURL: cfg.webhookAvatar || processCfg.webhookAvatarUrl || undefined,
        });
        return true;
      } catch (error) {
        log.warn("webhook send failed, falling back to channel", error.message);
        if (processCfg.allowWebhookFallback === false) throw error;
      }
    }
    if (item.preferWebhook && (!cfg?.webhookId || !cfg?.webhookToken)) {
      log.warn("delivery=webhook but no webhook configured; using channel.send");
    }
    if (!sinks.includes("discord") && sinks.length) return mirrored;
    const channel = await client.channels.fetch(item.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;
    await channel.send({
      content: item.content || undefined,
      embeds: item.embeds?.length ? item.embeds : undefined,
      files: item.files,
      allowedMentions: { parse: [], roles: cfg?.mentionRole ? [cfg.mentionRole] : [] },
    });
    return true;
  }

  let flushing = false;

  async function flushQueues() {
    if (flushing) return;
    flushing = true;
    try {
      for (const [key, q] of queues) {
        const item = q[0];
        if (!item) continue;
        if (item.retryAt && item.retryAt > now()) continue;
        q.shift();
        try {
          const delivered = await flushOne(item);
          if (delivered) metrics.sent += 1;
          else metrics.dropped += 1;
        } catch (error) {
          const retryAfter = error?.retryAfter || error?.httpStatus === 429;
          const configured = Number(processCfg.retryMax);
          const limit = Number.isInteger(configured) && configured >= 0 ? configured : 5;
          const attempts = Number(item.retries) || 0;
          if (processCfg.retry429 && retryAfter && attempts < limit) {
            const delay = Math.max(0, Math.ceil((Number(error.retryAfter) || 1) * 1000));
            metrics.retries += 1;
            item.retries = attempts + 1;
            item.retryAt = now() + delay;
            q.unshift(item);
          } else {
            metrics.dropped += 1;
            log.error("flush", key, error);
            const cfg = guildCfg(item.guildId);
            if (cfg) cfg.lastError = error.message;
          }
        }
      }
    } finally {
      flushing = false;
    }
  }

  const timer = schedule(flushQueues, processCfg.sendIntervalMs);
  if (typeof timer?.unref === "function") timer.unref();

  return { enqueue, refreshGuild, guildCfg, routeFor, queues, db, metrics, tick: flushQueues };
}

module.exports = { createDispatcher };
