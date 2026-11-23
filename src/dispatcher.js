const { randomUUID } = require("node:crypto");
const { WebhookClient, AttachmentBuilder } = require("discord.js");
const { ignored, inQuietHours, includeOk, embedToPlain } = require("./util");
const { redactEmbeds, redactText, redactFiles, flagsFrom, eventRedactFlags } = require("./redact");
const { retryDecision } = require("./retry");
const { createBoundedCache } = require("./boundedCache");

// Attachments are serialized as base64 into the pending-delivery row. Cap the
// stored copy so a large buffer cannot bloat the database during shutdown; an
// item that exceeds the cap is still persisted, just without its file.
const MAX_PENDING_FILE_BYTES = 8 * 1024 * 1024;

function encodeFiles(files) {
  return (files || []).flatMap((file) => {
    const attachment = file?.attachment;
    if (Buffer.isBuffer(attachment) && attachment.length <= MAX_PENDING_FILE_BYTES) {
      return [{ name: file.name || "attachment.bin", data: attachment.toString("base64") }];
    }
    if (typeof attachment === "string") {
      return [{ name: file.name || attachment.split(/[\\/]/).pop(), path: attachment }];
    }
    return [];
  });
}

function decodeFiles(files) {
  return (files || []).flatMap((file) => {
    if (typeof file?.data === "string") {
      return [new AttachmentBuilder(Buffer.from(file.data, "base64"), { name: file.name || "attachment.bin" })];
    }
    if (typeof file?.path === "string") return [new AttachmentBuilder(file.path, { name: file.name })];
    return [];
  });
}

function createDispatcher({ client, db, processCfg, log, cache, deps = {} }) {
  const queues = new Map();
  // Items are shifted out of their queue before the network send starts. Keep
  // them here until the attempt settles: a shutdown drain must persist them
  // like queued work, and an overflow drop must not touch a send in progress.
  const inFlight = new Set();
  const metrics = { sent: 0, dropped: 0, retries: 0 };
  const makeWebhook = deps.createWebhookClient || ((options) => new WebhookClient(options));
  const now = deps.now || Date.now;
  const newId = deps.newId || (() => randomUUID());
  const schedule = deps.setInterval || setInterval;
  const wait = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  // Cooldown/dedupe keys and pending digest buckets are the only long-lived
  // per-event state in the dispatcher. Both are capped so a long-running bot
  // has a fixed memory ceiling; old entries are evicted in insertion order.
  const dedupe = createBoundedCache({
    max: processCfg.dedupeMax ?? 10000,
    ttlMs: processCfg.dedupeTtlMs ?? 3600000,
    now,
  });
  const historyBuffer = createBoundedCache({
    max: processCfg.historyMax ?? 5000,
    ttlMs: processCfg.historyTtlMs ?? 7200000,
    now,
    onEvict: (bucket) => {
      if (bucket?.timer) clearTimeout(bucket.timer);
    },
  });

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
    const at = now();
    const last = dedupe.get(stamp, at);
    if (last != null && at - last < sec * 1000) return false;
    dedupe.set(stamp, at, at);
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
        const bucket = historyBuffer.get(dkey) || { count: 0, timer: null, sample: payload, guild, eventKey, min: digestMin, pending: [] };
        bucket.count += 1;
        bucket.sample = payload;
        // Keep the individual events only until the digest threshold is reached.
        // A burst below the minimum is not a burst: every event must be delivered
        // on its own instead of silently replacing the rest with the last sample.
        if (bucket.count < bucket.min) bucket.pending.push(payload);
        if (!bucket.timer) {
          bucket.timer = setTimeout(() => {
            historyBuffer.delete(dkey);
            const n = bucket.count;
            const min = bucket.min;
            if (n >= min) {
              const { buildEmbed } = require("./util");
              const embed = buildEmbed(cfg, eventKey, [
                ["field.count", String(n)],
                ["field.channel", `<#${channelId}>`],
              ], { description: `${n}× ${eventKey}` });
              enqueue(guild, eventKey, { ...bucket.sample, embeds: [embed], digest: true, summary: `digest ${n}` });
            } else {
              for (const event of bucket.pending) {
                enqueue(guild, eventKey, { ...event, digest: true });
              }
            }
          }, digestMs).unref();
        }
        historyBuffer.set(dkey, bucket);
        return;
      }
      if (!cooldownOk(cfg, guild.id, eventKey)) return;

      let embeds = payload.embeds || [];
      let files = payload.files || [];
      let content = payload.content || (cfg.mentionOnDelete && eventKey === "messageDelete" && cfg.mentionRole
        ? `<@&${cfg.mentionRole}>`
        : null);

      const flags = eventRedactFlags(cfg, eventKey, flagsFrom(cfg, processCfg));
      if (embeds.length) embeds = redactEmbeds(embeds, flags);
      if (content) content = redactText(content, flags);
      files = redactFiles(files, flags);

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
        metrics.dropped += 1;
        forgetPending(q.shift());
      }
      q.push({
        id: newId(),
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
        createdAt: now(),
      });
      if (cfg.staffChannel && cfg.staffChannel !== channelId) {
        q.push({
          id: newId(),
          channelId: cfg.staffChannel,
          content,
          embeds: delivery === "plain" ? [] : embeds,
          files,
          guildId: guild.id,
          preferWebhook: false,
          eventKey,
          summary: payload.summary,
          staff: true,
          createdAt: now(),
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
      const discordSink = sinks.includes("discord");
      if (sinks.includes("file") || sinks.includes("http")) {
        const { writeFileSink, postHttpSink } = require("./sinks");
        const body = { guildId: item.guildId, eventKey: item.eventKey, summary: item.summary, at: Date.now() };
        try {
          if (sinks.includes("file")) {
            if (writeFileSink(processCfg.fileSinkDir, item.guildId, item.eventKey, body)) mirrored = true;
            else log.warn("file sink failed", processCfg.fileSinkDir || "(no directory)");
          }
          if (sinks.includes("http")) {
            const url = processCfg.httpSinkUrl;
            if (!url) {
              log.warn("http sink failed", "HTTP_SINK_URL is not set");
            } else if (discordSink) {
              // A mirror must never delay Discord delivery, so its result is
              // reported asynchronously. A broken collector still gets a warning.
              postHttpSink(url, body, (error) => {
                if (error) log.warn("http sink failed", error.message);
              });
            } else {
              // The HTTP sink is the delivery path here: wait for the real status
              // before counting the event as delivered.
              const error = await new Promise((resolve) => postHttpSink(url, body, resolve));
              if (error) log.warn("http sink failed", error.message);
              else mirrored = true;
            }
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

  // Restored rows exist before the gateway login completes. Delivering then
  // would fail every channel fetch and drop the item, so the send timer waits
  // for the client to become ready.
  function clientReady() {
    return typeof client?.isReady !== "function" || client.isReady();
  }

  async function flushQueues() {
    if (flushing || !clientReady()) return;
    flushing = true;
    try {
      dedupe.prune();
      historyBuffer.prune();
      for (const [key, q] of queues) {
        const item = q[0];
        if (!item) continue;
        if (item.retryAt && item.retryAt > now()) continue;
        q.shift();
        inFlight.add(item);
        try {
          const delivered = await flushOne(item);
          if (delivered) {
            metrics.sent += 1;
            forgetPending(item);
          } else {
            metrics.dropped += 1;
            forgetPending(item);
          }
        } catch (error) {
          const at = now();
          const retry = retryDecision(error, at);
          const configured = Number(processCfg.retryMax);
          const limit = Number.isInteger(configured) && configured >= 0 ? configured : 5;
          const attempts = Number(item.retries) || 0;
          if (processCfg.retry429 && retry.retryable && attempts < limit) {
            metrics.retries += 1;
            item.retries = attempts + 1;
            item.retryAt = at + retry.delayMs;
            q.unshift(item);
          } else {
            metrics.dropped += 1;
            forgetPending(item);
            log.error("flush", key, error);
            const cfg = guildCfg(item.guildId);
            if (cfg) cfg.lastError = error.message;
          }
        } finally {
          inFlight.delete(item);
        }
      }
    } finally {
      flushing = false;
    }
  }

  function queueSize() {
    let size = inFlight.size;
    for (const q of queues.values()) size += q.length;
    return size;
  }

  // A row is removed only after the item is delivered or permanently dropped,
  // so a crash between the Discord send and this delete cannot lose the item;
  // it can only cause one duplicate delivery, which the issue accepts.
  function forgetPending(item) {
    if (!item?.id || !item.persisted || typeof db.deletePendingDelivery !== "function") return;
    try {
      db.deletePendingDelivery(item.id);
    } catch (error) {
      log.warn("pending delivery delete failed", error.message);
    }
  }

  function persistPending() {
    if (typeof db.savePendingDelivery !== "function") return 0;
    let saved = 0;
    const items = new Set(inFlight);
    for (const q of queues.values()) {
      for (const item of q) items.add(item);
    }
    for (const item of items) {
      if (!item?.id) continue;
      try {
        db.savePendingDelivery({ ...item, files: encodeFiles(item.files) });
        item.persisted = true;
        saved += 1;
      } catch (error) {
        log.error("pending delivery save failed", error.message);
      }
    }
    return saved;
  }

  function restorePending() {
    if (typeof db.listPendingDeliveries !== "function") return 0;
    let restored = 0;
    for (const row of db.listPendingDeliveries()) {
      const key = `${row.guildId}:${row.channelId}`;
      if (!queues.has(key)) queues.set(key, []);
      const q = queues.get(key);
      if (q.some((item) => item.id === row.id)) continue;
      q.push({ ...row, files: decodeFiles(row.files), restored: true, persisted: true });
      restored += 1;
    }
    return restored;
  }

  function allWaitingOnRetry() {
    // A send that is still in flight is not waiting on a retry timestamp; the
    // drain must stay inside its budget and give it a chance to settle.
    if (inFlight.size) return false;
    const at = now();
    for (const q of queues.values()) {
      for (const item of q) {
        if (!item.retryAt || item.retryAt <= at) return false;
      }
    }
    return true;
  }

  // Best-effort shutdown drain: flush while there is time left, but never
  // block shutdown forever on a future 429 retryAt or a slow network call.
  // Whatever is still queued when the budget expires is written to SQLite so
  // the next process can resume it. `timeoutMs: 0` skips the drain and only
  // persists the queue.
  async function drain({ timeoutMs = 5000, intervalMs = 25, persist = true } = {}) {
    const budget = Number(timeoutMs);
    const enabled = Number.isFinite(budget) && budget > 0;
    const deadline = now() + (enabled ? budget : 0);
    while (enabled && queueSize() > 0 && now() <= deadline) {
      // Every remaining item waits on a future retryAt, so sleeping cannot
      // deliver anything; persist it now instead of burning the budget.
      if (allWaitingOnRetry()) break;
      await flushQueues();
      if (queueSize() === 0) break;
      await wait(intervalMs);
    }
    const remaining = queueSize();
    if (persist && remaining > 0) persistPending();
    return remaining;
  }

  const timer = schedule(flushQueues, processCfg.sendIntervalMs);
  if (typeof timer?.unref === "function") timer.unref();

  return {
    enqueue,
    refreshGuild,
    guildCfg,
    routeFor,
    queues,
    db,
    metrics,
    tick: flushQueues,
    drain,
    queueSize,
    persistPending,
    restorePending,
  };
}

module.exports = { createDispatcher };
