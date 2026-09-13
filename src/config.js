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
    defaultPaused: BOOL(env.DEFAULT_PAUSED, false),
    defaultPlainText: BOOL(env.DEFAULT_PLAIN_TEXT, false),
    defaultShowThumbnails: BOOL(env.DEFAULT_SHOW_THUMBNAILS, true),
    defaultShowTimestamp: BOOL(env.DEFAULT_SHOW_TIMESTAMP, true),
    defaultAttachLong: BOOL(env.DEFAULT_ATTACH_LONG, true),
    defaultQuietStart: env.DEFAULT_QUIET_START || "",
    defaultQuietEnd: env.DEFAULT_QUIET_END || "",
    defaultMinAccountDays: INT(env.DEFAULT_MIN_ACCOUNT_DAYS, 0),
    defaultCooldownSec: INT(env.DEFAULT_COOLDOWN_SEC, 0),
    defaultActors: env.DEFAULT_ACTORS || "all",
    defaultWebhookUsername: env.WEBHOOK_USERNAME || env.WEBHOOK_NAME || "LogYazicam",
    activityType: env.ACTIVITY_TYPE || "Watching",
    activityText: env.ACTIVITY_TEXT || "guild logs · /log",
    activityStatus: env.ACTIVITY_STATUS || "online",
    shardList: env.SHARD_LIST || "",
    prefixEnabled: BOOL(env.PREFIX_ENABLED, true),
    prefix: env.PREFIX || "!",
    slashEnabled: BOOL(env.SLASH_ENABLED, true),
    defaultDelivery: env.DEFAULT_DELIVERY || "embed",
    allowWebhookFallback: BOOL(env.ALLOW_WEBHOOK_FALLBACK, true),
    mentionUsers: BOOL(env.MENTION_USERS, false),
    commandName: (env.COMMAND_NAME || "log").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "log",
    configPermission: env.CONFIG_PERMISSION || "ManageGuild",
    slashEphemeral: BOOL(env.SLASH_EPHEMERAL, true),
    showCredit: BOOL(env.SHOW_CREDIT, true),
    fieldMax: INT(env.EMBED_FIELD_MAX, 1024),
    descMax: INT(env.EMBED_DESC_MAX, 4000),
    footerMax: INT(env.EMBED_FOOTER_MAX, 2048),
    plainMax: INT(env.PLAIN_MAX, 1900),
    errorMax: INT(env.ERROR_MESSAGE_MAX, 1900),
    attachMin: INT(env.ATTACH_MIN_CHARS, 1800),
    auditFetchLimit: INT(env.AUDIT_FETCH_LIMIT, 6),
    bulkLineLimit: INT(env.BULK_LINE_LIMIT, 40),
    historyExportDefault: INT(env.HISTORY_EXPORT_DEFAULT, 50),
    snapshotEnabled: BOOL(env.SNAPSHOT_ENABLED, true),
    snapshotLimit: INT(env.SNAPSHOT_LIMIT, 2000),
    digestMs: INT(env.DIGEST_MS, 0),
    digestMin: INT(env.DIGEST_MIN, 5),
    logSink: env.LOG_SINK || "discord",
    fileSinkDir: env.FILE_SINK_DIR || "./data/logs",
    httpSinkUrl: env.HTTP_SINK_URL || "",
    backupDir: env.BACKUP_DIR || "",
    backupMs: INT(env.BACKUP_MS, 0),
    inviteTrack: BOOL(env.INVITE_TRACK, true),
    snapshotTtlMs: INT(env.SNAPSHOT_TTL_MS, 0),
    snapshotBots: BOOL(env.SNAPSHOT_BOTS, false),
    redactUrls: BOOL(env.REDACT_URLS, false),
    redactMentions: BOOL(env.REDACT_MENTIONS, false),
    redactEmails: BOOL(env.REDACT_EMAILS, false),
    redactInvites: BOOL(env.REDACT_INVITES, false),
    retry429: BOOL(env.RETRY_429, true),
    colors: {
      create: INT(env.COLOR_CREATE, COLORS.create),
      update: INT(env.COLOR_UPDATE, COLORS.update),
      delete: INT(env.COLOR_DELETE, COLORS.delete),
      voice: INT(env.COLOR_VOICE, COLORS.voice),
      member: INT(env.COLOR_MEMBER, COLORS.member),
      mod: INT(env.COLOR_MOD, COLORS.mod),
      info: INT(env.COLOR_INFO, COLORS.info),
    },
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
    paused: extra?.paused != null ? Boolean(extra.paused) : processCfg.defaultPaused,
    plainText: extra?.plainText != null ? Boolean(extra.plainText) : processCfg.defaultPlainText,
    showThumbnails: extra?.showThumbnails != null ? Boolean(extra.showThumbnails) : processCfg.defaultShowThumbnails,
    showTimestamp: extra?.showTimestamp != null ? Boolean(extra.showTimestamp) : processCfg.defaultShowTimestamp,
    attachLong: extra?.attachLong != null ? Boolean(extra.attachLong) : processCfg.defaultAttachLong,
    quietStart: extra?.quietStart || processCfg.defaultQuietStart || null,
    quietEnd: extra?.quietEnd || processCfg.defaultQuietEnd || null,
    minAccountDays: extra?.minAccountDays != null ? Number(extra.minAccountDays) : processCfg.defaultMinAccountDays,
    cooldownSec: extra?.cooldownSec != null ? Number(extra.cooldownSec) : processCfg.defaultCooldownSec,
    actors: extra?.actors || processCfg.defaultActors,
    includeChannels: Array.isArray(extra?.includeChannels) ? extra.includeChannels : [],
    webhookName: extra?.webhookName || processCfg.defaultWebhookUsername || processCfg.webhookName,
    webhookAvatar: extra?.webhookAvatar || processCfg.webhookAvatarUrl,
    delivery: extra?.delivery || processCfg.defaultDelivery,
    prefix: extra?.prefix || processCfg.prefix,
    prefixOn: extra?.prefixOn != null ? Boolean(extra.prefixOn) : processCfg.prefixEnabled,
    slashOn: extra?.slashOn != null ? Boolean(extra.slashOn) : processCfg.slashEnabled,
    ephemeral: extra?.ephemeral != null ? Boolean(extra.ephemeral) : processCfg.slashEphemeral,
    showCredit: extra?.showCredit != null ? Boolean(extra.showCredit) : processCfg.showCredit,
    fieldMax: extra?.fieldMax != null ? Number(extra.fieldMax) : processCfg.fieldMax,
    attachMin: extra?.attachMin != null ? Number(extra.attachMin) : processCfg.attachMin,
    hiddenFields: extra?.hiddenFields || {},
    digestMs: extra?.digestMs != null ? Number(extra.digestMs) : processCfg.digestMs,
    snapshotOn: extra?.snapshotOn != null ? Boolean(extra.snapshotOn) : processCfg.snapshotEnabled,
    staffChannel: extra?.staffChannel || null,
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
