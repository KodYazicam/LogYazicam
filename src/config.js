const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { EVENTS, COLORS } = require("./catalog");
const locales = require("./locales");

const BOOL = (v, fallback) => {
  if (v == null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};
const INT = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function loadEnvFile(file = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(file)) return { ...process.env };
  const parsed = dotenv.parse(fs.readFileSync(file));
  return { ...parsed, ...process.env };
}

function processConfig(env) {
  const owners = String(env.OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const locale = locales.LOCALES.includes(env.DEFAULT_LOCALE) ? env.DEFAULT_LOCALE : "en";
  return {
    token: env.TOKEN || "",
    clientId: env.CLIENT_ID || "",
    guildId: env.GUILD_ID || "",
    owners,
    databasePath: env.DATABASE_PATH || "./data/logyazicam.sqlite",
    defaultLocale: locale,
    defaultTimezone: env.DEFAULT_TIMEZONE || "UTC",
    logLevel: env.LOG_LEVEL || "info",
    logFile: env.LOG_FILE || "./data/process.log",
    errorChannelId: env.ERROR_CHANNEL_ID || "",
    errorDmOwner: BOOL(env.ERROR_DM_OWNER, false),
    hotReloadMs: INT(env.HOT_RELOAD_MS, 15000),
    maxQueue: INT(env.MAX_QUEUE_PER_CHANNEL, 20),
    sendIntervalMs: INT(env.SEND_INTERVAL_MS, 350),
    auditMaxAgeMs: INT(env.AUDIT_MAX_AGE_MS, 12000),
    webhookName: env.WEBHOOK_NAME || "LogYazicam",
    webhookAvatarUrl: env.WEBHOOK_AVATAR_URL || "",
    embedShowIds: BOOL(env.EMBED_SHOW_IDS, true),
    embedShowJump: BOOL(env.EMBED_SHOW_JUMP, true),
    embedCompact: BOOL(env.EMBED_COMPACT, false),
    embedFooter: env.EMBED_FOOTER || "LogYazicam",
    ignoreBots: BOOL(env.IGNORE_BOTS, true),
    ignoreWebhooks: BOOL(env.IGNORE_WEBHOOKS, true),
    ignoreSelf: BOOL(env.IGNORE_SELF, true),
    storeHistory: BOOL(env.STORE_HISTORY, true),
    historyLimit: INT(env.HISTORY_LIMIT, 200),
    colors: { ...COLORS },
  };
}

function mergeGuild(processCfg, row, routes, ignores, extra) {
  const enabled = {};
  for (const event of EVENTS) {
    const route = routes.find((r) => r.event_key === event.key);
    enabled[event.key] = {
      on: route ? Boolean(route.enabled) : false,
      channelId: route?.channel_id || row.default_channel || null,
    };
  }
  const extraColors = extra?.colors || {};
  return {
    id: row.id,
    locale: locales.LOCALES.includes(row.locale) ? row.locale : processCfg.defaultLocale,
    timezone: row.timezone || processCfg.defaultTimezone,
    defaultChannel: row.default_channel,
    webhookId: row.webhook_id,
    webhookToken: row.webhook_token,
    ignoreBots: row.ignore_bots == null ? processCfg.ignoreBots : Boolean(row.ignore_bots),
    ignoreWebhooks: row.ignore_webhooks == null ? processCfg.ignoreWebhooks : Boolean(row.ignore_webhooks),
    ignoreSelf: row.ignore_self == null ? processCfg.ignoreSelf : Boolean(row.ignore_self),
    embedShowIds: row.embed_show_ids == null ? processCfg.embedShowIds : Boolean(row.embed_show_ids),
    embedShowJump: row.embed_show_jump == null ? processCfg.embedShowJump : Boolean(row.embed_show_jump),
    embedCompact: row.embed_compact == null ? processCfg.embedCompact : Boolean(row.embed_compact),
    embedFooter: row.embed_footer || processCfg.embedFooter,
    storeHistory: row.store_history == null ? processCfg.storeHistory : Boolean(row.store_history),
    historyLimit: row.history_limit || processCfg.historyLimit,
    mentionOnDelete: Boolean(row.mention_on_delete),
    mentionRole: row.mention_role,
    extra: extra || {},
    paused: Boolean(extra?.paused),
    plainText: Boolean(extra?.plainText),
    showThumbnails: extra?.showThumbnails !== false,
    quietStart: extra?.quietStart || null,
    quietEnd: extra?.quietEnd || null,
    minAccountDays: Number(extra?.minAccountDays) || 0,
    cooldownSec: Number(extra?.cooldownSec) || 0,
    actors: extra?.actors || "all",
    includeChannels: Array.isArray(extra?.includeChannels) ? extra.includeChannels : [],
    webhookName: extra?.webhookName || processCfg.webhookName,
    webhookAvatar: extra?.webhookAvatar || processCfg.webhookAvatarUrl,
    ignores: ignores || [],
    events: enabled,
    colors: {
      create: extraColors.create || row.embed_color_create || processCfg.colors.create,
      update: extraColors.update || row.embed_color_update || processCfg.colors.update,
      delete: extraColors.delete || row.embed_color_delete || processCfg.colors.delete,
      voice: extraColors.voice || processCfg.colors.voice,
      member: extraColors.member || processCfg.colors.member,
      mod: extraColors.mod || processCfg.colors.mod,
      info: extraColors.info || processCfg.colors.info,
    },
  };
}

module.exports = { loadEnvFile, processConfig, mergeGuild, BOOL, INT };
