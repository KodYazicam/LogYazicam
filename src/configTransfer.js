const { byKey, COLORS } = require("./catalog");
const { LOCALES } = require("./locales");

const FORMAT = "logyazicam-config";
const VERSION = 1;
const MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

const BOOLEAN_SETTINGS = new Set([
  "ignore_bots",
  "ignore_webhooks",
  "ignore_self",
  "embed_show_ids",
  "embed_show_jump",
  "embed_compact",
  "store_history",
  "mention_on_delete",
]);
const COLOR_SETTINGS = new Set(["embed_color_create", "embed_color_update", "embed_color_delete"]);
const SETTINGS = [
  "locale",
  "timezone",
  "default_channel",
  ...BOOLEAN_SETTINGS,
  ...COLOR_SETTINGS,
  "embed_footer",
  "history_limit",
  "mention_role",
];

const IGNORE_KINDS = new Set(["user", "channel", "role", "category"]);
const COLOR_SLOTS = new Set(Object.keys(COLORS));
const QUIET_DAYS = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

const EXTRA_BOOLEANS = new Set([
  "paused",
  "plainText",
  "showThumbnails",
  "showTimestamp",
  "attachLong",
  "prefixOn",
  "slashOn",
  "ephemeral",
  "showCredit",
  "snapshotOn",
]);
const EXTRA_NUMBERS = {
  minAccountDays: [0, 3650],
  cooldownSec: [0, 3600],
  fieldMax: [1, 1024],
  attachMin: [0, 100000],
  digestMs: [0, 3600000],
  historyRetentionDays: [0, 3650],
};
const EXTRA_STRINGS = {
  webhookName: 80,
  webhookAvatar: 512,
  prefix: 16,
};
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toBoolean(value) {
  if (value === true || value === 1 || value === "true" || value === "1") return 1;
  if (value === false || value === 0 || value === "false" || value === "0") return 0;
  return null;
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validString(value, max) {
  return typeof value === "string" && value.length <= max;
}

function exportGuild(db, guildId, { now = Date.now() } = {}) {
  const row = db.ensureGuild(guildId);
  const guild = {};
  for (const key of SETTINGS) guild[key] = row[key] ?? null;
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date(now).toISOString(),
    guildId,
    guild,
    routes: db.listRoutes.all(guildId).map((route) => ({
      eventKey: route.event_key,
      enabled: Boolean(route.enabled),
      channelId: route.channel_id || null,
    })),
    ignores: db.listIgnores.all(guildId).map((ignore) => ({
      kind: ignore.kind,
      targetId: ignore.target_id,
    })),
    extra: db.extraOf(row),
  };
}

function validateConfig(data) {
  if (!isPlainObject(data)) throw new Error("config must be a JSON object");
  if (data.format !== FORMAT) throw new Error("unsupported config format");
  if (data.version !== VERSION) throw new Error(`unsupported config version: ${data.version}`);
  if (data.guild != null && !isPlainObject(data.guild)) throw new Error("guild must be an object");
  if (data.routes != null && !Array.isArray(data.routes)) throw new Error("routes must be an array");
  if (data.ignores != null && !Array.isArray(data.ignores)) throw new Error("ignores must be an array");
  if (data.extra != null && !isPlainObject(data.extra)) throw new Error("extra must be an object");
  return data;
}

function parseConfig(input) {
  const text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input ?? "");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_BYTES) throw new Error(`config is larger than ${MAX_BYTES / 1024} KB`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("invalid JSON");
  }
  return validateConfig(data);
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Best effort: the caller is already rejecting the download.
  }
}

async function readBoundedBody(response) {
  const body = response.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancellation errors; the size limit is the real error.
          }
          throw new Error(`config is larger than ${MAX_BYTES / 1024} KB`);
        }
        chunks.push(chunk);
      }
    } finally {
      try {
        reader.releaseLock?.();
      } catch {
        // Releasing a cancelled reader is best effort.
      }
    }
    return Buffer.concat(chunks, total);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error(`config is larger than ${MAX_BYTES / 1024} KB`);
  return buffer;
}

async function readAttachment(attachment, {
  fetchImpl = globalThis.fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  if (!attachment || typeof attachment.url !== "string") throw new Error("missing file attachment");
  const declared = Number(attachment.size);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error(`config is larger than ${MAX_BYTES / 1024} KB`);
  }
  if (typeof fetchImpl !== "function") throw new Error("attachment download is unavailable");
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  const response = await fetchImpl(attachment.url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`attachment download failed: ${response.status}`);
  const rawLength = response.headers?.get?.("content-length");
  const contentLength = rawLength == null || rawLength === "" ? NaN : Number(rawLength);
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    await cancelBody(response);
    throw new Error(`config is larger than ${MAX_BYTES / 1024} KB`);
  }
  return parseConfig(await readBoundedBody(response));
}

function resolveId(value, resolveChannel) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  if (!id || id.length > 64) return null;
  const resolved = resolveChannel(id);
  return resolved == null || resolved === "" ? null : String(resolved);
}

function cleanSettings(guild, resolveChannel, resolveRole) {
  const patch = {};
  let skipped = 0;
  if (!isPlainObject(guild)) return { patch, skipped };
  for (const key of SETTINGS) {
    if (!has(guild, key)) continue;
    const raw = guild[key];
    if (key === "locale") {
      if (LOCALES.includes(raw)) patch.locale = raw;
      else skipped += 1;
    } else if (key === "timezone") {
      if (raw == null || validTimezone(raw)) patch.timezone = raw;
      else skipped += 1;
    } else if (key === "default_channel") {
      if (raw == null) patch.default_channel = null;
      else if (typeof raw === "string" || typeof raw === "number") {
        patch.default_channel = resolveId(raw, resolveChannel);
      } else skipped += 1;
    } else if (BOOLEAN_SETTINGS.has(key)) {
      const value = toBoolean(raw);
      if (value == null) skipped += 1;
      else patch[key] = value;
    } else if (COLOR_SETTINGS.has(key)) {
      if (raw == null) patch[key] = null;
      else {
        const value = Number(raw);
        if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) patch[key] = value;
        else skipped += 1;
      }
    } else if (key === "history_limit") {
      if (raw == null) patch.history_limit = null;
      else {
        const value = Number(raw);
        if (Number.isInteger(value) && value >= 1 && value <= 10000) patch.history_limit = value;
        else skipped += 1;
      }
    } else if (key === "embed_footer") {
      if (raw == null || validString(raw, 2048)) patch.embed_footer = raw;
      else skipped += 1;
    } else if (key === "mention_role") {
      if (raw == null) {
        patch.mention_role = null;
      } else if (typeof raw === "string" || typeof raw === "number") {
        const resolved = resolveId(raw, resolveRole);
        if (resolved) patch.mention_role = resolved;
        else {
          patch.mention_role = null;
          skipped += 1;
        }
      } else skipped += 1;
    }
  }
  return { patch, skipped };
}

function cleanRoutes(routes, resolveChannel) {
  const seen = new Map();
  let skipped = 0;
  for (const route of Array.isArray(routes) ? routes : []) {
    if (!isPlainObject(route) || typeof route.eventKey !== "string" || !byKey[route.eventKey]) {
      skipped += 1;
      continue;
    }
    const enabled = route.enabled == null ? null : toBoolean(route.enabled);
    if (enabled == null && route.enabled != null) {
      skipped += 1;
      continue;
    }
    seen.set(route.eventKey, {
      eventKey: route.eventKey,
      enabled: Boolean(enabled),
      channelId: resolveId(route.channelId, resolveChannel),
    });
  }
  return { routes: [...seen.values()], skipped };
}

function cleanIgnores(ignores, resolveChannel) {
  const seen = new Map();
  let skipped = 0;
  for (const row of Array.isArray(ignores) ? ignores : []) {
    if (!isPlainObject(row) || !IGNORE_KINDS.has(row.kind)) {
      skipped += 1;
      continue;
    }
    if (typeof row.targetId !== "string" && typeof row.targetId !== "number") {
      skipped += 1;
      continue;
    }
    let targetId = String(row.targetId).trim();
    if (!targetId || targetId.length > 64) {
      skipped += 1;
      continue;
    }
    if (row.kind === "channel" || row.kind === "category") {
      targetId = resolveId(targetId, resolveChannel);
      if (!targetId) {
        skipped += 1;
        continue;
      }
    }
    seen.set(`${row.kind}:${targetId}`, { kind: row.kind, targetId });
  }
  return { ignores: [...seen.values()], skipped };
}

function cleanHiddenFields(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  let fields = 0;
  for (const [key, names] of Object.entries(value)) {
    if (key !== "*" && !byKey[key]) {
      skipped += 1;
      continue;
    }
    if (!Array.isArray(names)) {
      skipped += 1;
      continue;
    }
    out[key] = names
      .filter((name) => typeof name === "string" && name.length > 0 && name.length <= 64)
      .slice(0, 50);
    fields += 1;
    if (fields >= 100) break;
  }
  return { value: out, skipped };
}

function cleanStringMap(value, { maxKey = 128, maxValue = 2000, maxEntries = 500 } = {}) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  let entries = 0;
  for (const [key, text] of Object.entries(value)) {
    if (typeof key !== "string" || key.length > maxKey || !validString(text, maxValue)) {
      skipped += 1;
      continue;
    }
    out[key] = text;
    entries += 1;
    if (entries >= maxEntries) break;
  }
  return { value: out, skipped };
}

function cleanColorMap(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [slot, raw] of Object.entries(value)) {
    if (!COLOR_SLOTS.has(slot)) {
      skipped += 1;
      continue;
    }
    const color = Number(raw);
    if (Number.isInteger(color) && color >= 0 && color <= 0xffffff) out[slot] = color;
    else skipped += 1;
  }
  return { value: out, skipped };
}

function cleanEventColors(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    const color = Number(raw);
    if (!byKey[key] || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
      skipped += 1;
      continue;
    }
    out[key] = color;
  }
  return { value: out, skipped };
}

function cleanEventCooldown(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    const seconds = Number(raw);
    if (!byKey[key] || !Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      skipped += 1;
      continue;
    }
    out[key] = seconds;
  }
  return { value: out, skipped };
}

function cleanEventDigest(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!byKey[key] || !isPlainObject(raw)) {
      skipped += 1;
      continue;
    }
    const ms = Number(raw.ms);
    const hasMin = raw.min != null;
    const min = Number(raw.min);
    if (
      !Number.isInteger(ms) || ms < 0 || ms > 3600000
      || (hasMin && (!Number.isInteger(min) || min < 1 || min > 1000))
    ) {
      skipped += 1;
      continue;
    }
    out[key] = hasMin ? { ms, min } : { ms };
  }
  return { value: out, skipped };
}

function cleanEventActors(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!byKey[key] || !["all", "humans", "bots"].includes(raw)) {
      skipped += 1;
      continue;
    }
    out[key] = raw;
  }
  return { value: out, skipped };
}

function cleanQuietBypass(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!byKey[key] || raw !== true) {
      skipped += 1;
      continue;
    }
    out[key] = true;
  }
  return { value: out, skipped };
}

function cleanQuietDays(value) {
  if (!Array.isArray(value)) return { value: undefined, skipped: 1 };
  const out = [];
  let skipped = 0;
  for (const raw of value) {
    const day = String(raw).toLowerCase();
    if (!QUIET_DAYS.has(day)) {
      skipped += 1;
      continue;
    }
    out.push(day);
  }
  return { value: [...new Set(out)], skipped };
}

function cleanRedact(value) {
  if (!isPlainObject(value)) return { value: undefined, skipped: 1 };
  const out = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!["url", "mention", "email", "invite"].includes(key)) {
      skipped += 1;
      continue;
    }
    const flag = toBoolean(raw);
    if (flag == null) skipped += 1;
    else out[key] = Boolean(flag);
  }
  return { value: out, skipped };
}

function cleanExtra(extra, resolveChannel) {
  if (!isPlainObject(extra)) return { extra: {}, skipped: 0 };
  const out = {};
  let skipped = 0;

  for (const [key, raw] of Object.entries(extra)) {
    if (EXTRA_BOOLEANS.has(key)) {
      const flag = toBoolean(raw);
      if (flag == null) skipped += 1;
      else out[key] = Boolean(flag);
      continue;
    }
    if (has(EXTRA_NUMBERS, key)) {
      const [min, max] = EXTRA_NUMBERS[key];
      const value = Number(raw);
      if (Number.isInteger(value) && value >= min && value <= max) out[key] = value;
      else skipped += 1;
      continue;
    }
    if (has(EXTRA_STRINGS, key)) {
      if (raw == null || validString(raw, EXTRA_STRINGS[key])) out[key] = raw ?? null;
      else skipped += 1;
      continue;
    }
    if (key === "quietStart" || key === "quietEnd") {
      if (raw == null || raw === "" || (typeof raw === "string" && TIME_PATTERN.test(raw))) out[key] = raw || null;
      else skipped += 1;
      continue;
    }
    if (key === "quietDays") {
      const cleaned = cleanQuietDays(raw);
      if (cleaned.value) out.quietDays = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "delivery") {
      if (["embed", "plain", "webhook"].includes(raw)) out.delivery = raw;
      else skipped += 1;
      continue;
    }
    if (key === "actors") {
      if (["all", "humans", "bots"].includes(raw)) out.actors = raw;
      else skipped += 1;
      continue;
    }
    if (key === "staffChannel") {
      out.staffChannel = resolveId(raw, resolveChannel);
      continue;
    }
    if (key === "includeChannels") {
      if (!Array.isArray(raw)) {
        skipped += 1;
        continue;
      }
      const ids = raw
        .map((id) => resolveId(id, resolveChannel))
        .filter(Boolean);
      out.includeChannels = [...new Set(ids)];
      continue;
    }
    if (key === "hiddenFields") {
      const cleaned = cleanHiddenFields(raw);
      if (cleaned.value) out.hiddenFields = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "strings") {
      const cleaned = cleanStringMap(raw);
      if (cleaned.value) out.strings = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "colors") {
      const cleaned = cleanColorMap(raw);
      if (cleaned.value) out.colors = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "eventColors") {
      const cleaned = cleanEventColors(raw);
      if (cleaned.value) out.eventColors = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "eventCooldown") {
      const cleaned = cleanEventCooldown(raw);
      if (cleaned.value) out.eventCooldown = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "eventDigest") {
      const cleaned = cleanEventDigest(raw);
      if (cleaned.value) out.eventDigest = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "eventActors") {
      const cleaned = cleanEventActors(raw);
      if (cleaned.value) out.eventActors = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "quietBypass") {
      const cleaned = cleanQuietBypass(raw);
      if (cleaned.value) out.quietBypass = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    if (key === "redact") {
      const cleaned = cleanRedact(raw);
      if (cleaned.value) out.redact = cleaned.value;
      skipped += cleaned.skipped;
      continue;
    }
    skipped += 1;
  }

  return { extra: out, skipped };
}

function importGuild(db, guildId, data, {
  resolveChannel = (id) => id,
  resolveRole = (id) => id,
} = {}) {
  validateConfig(data);
  const settings = cleanSettings(data.guild, resolveChannel, resolveRole);
  const routes = cleanRoutes(data.routes, resolveChannel);
  const ignores = cleanIgnores(data.ignores, resolveChannel);
  const extra = cleanExtra(data.extra, resolveChannel);

  // Replace semantics: omitted settings fall back to env/defaults instead of
  // inheriting whatever the target guild had before the import.
  const patch = Object.fromEntries(SETTINGS.map((key) => [key, null]));
  Object.assign(patch, settings.patch);

  db.replaceConfig(guildId, {
    patch,
    routes: routes.routes,
    ignores: ignores.ignores,
    extra: extra.extra,
  });

  const counts = {
    settings: Object.keys(settings.patch).length,
    routes: routes.routes.length,
    ignores: ignores.ignores.length,
    skippedSettings: settings.skipped,
    skippedRoutes: routes.skipped,
    skippedIgnores: ignores.skipped,
    skippedExtra: extra.skipped,
  };
  counts.skipped =
    counts.skippedSettings + counts.skippedRoutes + counts.skippedIgnores + counts.skippedExtra;
  return counts;
}

module.exports = {
  FORMAT,
  VERSION,
  MAX_BYTES,
  exportGuild,
  importGuild,
  validateConfig,
  parseConfig,
  readAttachment,
};
