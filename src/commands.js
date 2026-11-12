const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");
const { EVENTS, GROUPS, byKey } = require("./catalog");
const { LOCALES, t } = require("./locales");
const { buildEmbed, parseHexColor } = require("./util");
const { EVENT_FLAGS } = require("./redact");

const MAX_HISTORY_LIMIT = 500;
const QUIET_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const QUIET_DAY_ALIASES = {
  sunday: "sun",
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
};
const FILTER_NAMES = new Set([
  "ignore_bots",
  "ignore_webhooks",
  "ignore_self",
  "embed_show_ids",
  "embed_show_jump",
  "embed_compact",
  "store_history",
  "mention_on_delete",
]);

function clampHistoryLimit(value, fallback = 50) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, MAX_HISTORY_LIMIT) : fallback;
}

function parseQuietDays(raw) {
  const tokens = String(raw || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (!tokens.length || tokens.some((token) => ["all", "clear", "*", "everyday"].includes(token))) return [];
  const out = [];
  for (const token of tokens) {
    const day = QUIET_DAY_ALIASES[token] || token;
    if (!QUIET_DAYS.includes(day)) return null;
    out.push(day);
  }
  return [...new Set(out)];
}

const SETTING_ALIASES = {
  paused: "paused",
  plain: "plainText",
  plain_text: "plainText",
  thumbs: "showThumbnails",
  thumbnails: "showThumbnails",
  actors: "actors",
  cooldown: "cooldownSec",
  cooldown_sec: "cooldownSec",
  acct_days: "minAccountDays",
  min_account_days: "minAccountDays",
  quiet_in: "quietStart",
  quiet_start: "quietStart",
  quiet_out: "quietEnd",
  quiet_end: "quietEnd",
  quiet_days: "quietDays",
  hook_name: "webhookName",
  webhook_name: "webhookName",
  hook_av: "webhookAvatar",
  webhook_avatar: "webhookAvatar",
  timestamp: "showTimestamp",
  show_timestamp: "showTimestamp",
  attach: "attachLong",
  attach_long: "attachLong",
  delivery: "delivery",
  prefix: "prefix",
  prefix_on: "prefixOn",
  slash_on: "slashOn",
  ephemeral: "ephemeral",
  credit: "showCredit",
  show_credit: "showCredit",
  digest_ms: "digestMs",
  history_days: "historyRetentionDays",
  history_retention_days: "historyRetentionDays",
  snapshot: "snapshotOn",
  snapshot_on: "snapshotOn",
  staff_ch: "staffChannel",
  staff_channel: "staffChannel",
  redact_url: "redactUrl",
  field_max: "fieldMax",
  attach_min: "attachMin",
};
const SETTING_NAMES = new Set(Object.values(SETTING_ALIASES));
const BOOL_SETTINGS = new Set([
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
const NUMBER_SETTINGS = {
  cooldownSec: [0, 3600],
  minAccountDays: [0, 3650],
  digestMs: [0, 3600000],
  historyRetentionDays: [0, 3650],
  fieldMax: [1, 1024],
  attachMin: [0, 100000],
};
const TIME_SETTINGS = new Set(["quietStart", "quietEnd"]);
const TIME_VALUE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseBoolSetting(raw) {
  const value = String(raw || "").toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return null;
}

function data(config = {}) {
  const permissionName = config.configPermission || process.env.CONFIG_PERMISSION || "ManageGuild";
  const permission = PermissionFlagsBits[permissionName] || PermissionFlagsBits.ManageGuild;
  const cmd = new SlashCommandBuilder()
    .setName("log")
    .setDescription("Configure logging")
    .setDefaultMemberPermissions(permission)
    .addSubcommandGroup((g) =>
      g
        .setName("event")
        .setDescription("One event")
        .addSubcommand((s) =>
          s
            .setName("on")
            .setDescription("Enable")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Override channel")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("off")
            .setDescription("Turn an event off")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("color")
            .setDescription("Override one event's embed color")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) => o.setName("hex").setDescription("#rrggbb"))
            .addBooleanOption((o) => o.setName("clear").setDescription("Restore the slot color")),
        )
        .addSubcommand((s) =>
          s
            .setName("cooldown")
            .setDescription("Override one event's send cooldown")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addIntegerOption((o) =>
              o.setName("seconds").setDescription("0-3600; 0 disables").setMinValue(0).setMaxValue(3600),
            )
            .addBooleanOption((o) => o.setName("clear").setDescription("Use the guild cooldown")),
        )
        .addSubcommand((s) =>
          s
            .setName("digest")
            .setDescription("Override one event's digest window")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addIntegerOption((o) =>
              o.setName("ms").setDescription("0-3600000; 0 disables").setMinValue(0).setMaxValue(3600000),
            )
            .addIntegerOption((o) =>
              o.setName("min").setDescription("Minimum events to summarize (1-1000)").setMinValue(1).setMaxValue(1000),
            )
            .addBooleanOption((o) => o.setName("clear").setDescription("Use the guild digest")),
        )
        .addSubcommand((s) =>
          s
            .setName("actors")
            .setDescription("Override actor filtering for one event")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("mode")
                .setDescription("Who to log")
                .addChoices(
                  { name: "all", value: "all" },
                  { name: "humans", value: "humans" },
                  { name: "bots", value: "bots" },
                ),
            )
            .addBooleanOption((o) => o.setName("clear").setDescription("Use the guild actor setting")),
        )
        .addSubcommand((s) =>
          s
            .setName("bypass")
            .setDescription("Let one event bypass quiet hours")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addBooleanOption((o) => o.setName("enabled").setDescription("Default true")),
        )
        .addSubcommand((s) =>
          s
            .setName("watch")
            .setDescription("Channel allow-list for one event")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("action")
                .setDescription("Change the list")
                .setRequired(true)
                .addChoices(
                  { name: "add", value: "add" },
                  { name: "remove", value: "remove" },
                  { name: "clear", value: "clear" },
                  { name: "list", value: "list" },
                ),
            )
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel or category")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("delivery")
            .setDescription("Delivery mode for one event")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("mode")
                .setDescription("Embed, plain text, webhook, or guild default")
                .setRequired(true)
                .addChoices(
                  { name: "default", value: "default" },
                  { name: "embed", value: "embed" },
                  { name: "plain", value: "plain" },
                  { name: "webhook", value: "webhook" },
                ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("history")
            .setDescription("History storage for one event")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("mode")
                .setDescription("Store, skip, or use the guild setting")
                .setRequired(true)
                .addChoices(
                  { name: "default", value: "default" },
                  { name: "on", value: "on" },
                  { name: "off", value: "off" },
                ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("redact")
            .setDescription("Redaction flags for one event")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("flag")
                .setDescription("Optional redaction flag")
                .setRequired(true)
                .addChoices(
                  { name: "url", value: "url" },
                  { name: "mention", value: "mention" },
                  { name: "email", value: "email" },
                  { name: "invite", value: "invite" },
                ),
            )
            .addBooleanOption((o) => o.setName("enabled").setDescription("Default true"))
            .addBooleanOption((o) => o.setName("clear").setDescription("Remove the event override")),
        )
        .addSubcommand((s) =>
          s
            .setName("reset")
            .setDescription("Clear all per-event overrides")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("group")
        .setDescription("Event group")
        .addSubcommand((s) =>
          s
            .setName("on")
            .setDescription("Enable group")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Group name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Override channel")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("off")
            .setDescription("Disable group")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Group name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("channel")
        .setDescription("Default log channel")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Set default channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Text channel")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) => s.setName("clear").setDescription("Clear default")),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("ignore")
        .setDescription("Ignores")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Add an ignore")
            .addStringOption((o) =>
              o
                .setName("kind")
                .setDescription("user | channel | role | category")
                .setRequired(true)
                .addChoices(
                  { name: "user", value: "user" },
                  { name: "channel", value: "channel" },
                  { name: "role", value: "role" },
                  { name: "category", value: "category" },
                ),
            )
            .addStringOption((o) => o.setName("id").setDescription("Snowflake").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove an ignore")
            .addStringOption((o) =>
              o
                .setName("kind")
                .setDescription("Kind")
                .setRequired(true)
                .addChoices(
                  { name: "user", value: "user" },
                  { name: "channel", value: "channel" },
                  { name: "role", value: "role" },
                  { name: "category", value: "category" },
                ),
            )
            .addStringOption((o) => o.setName("id").setDescription("Snowflake").setRequired(true)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("List ignores")),
    )
    .addSubcommand((s) =>
      s
        .setName("locale")
        .setDescription("Language")
        .addStringOption((o) =>
          o
            .setName("code")
            .setDescription("Locale code")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("timezone")
        .setDescription("Timezone")
        .addStringOption((o) => o.setName("tz").setDescription("e.g. Europe/Istanbul").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("filter")
        .setDescription("Boolean filter")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Filter")
            .setRequired(true)
            .addChoices(
              { name: "ignore_bots", value: "ignore_bots" },
              { name: "ignore_webhooks", value: "ignore_webhooks" },
              { name: "ignore_self", value: "ignore_self" },
              { name: "embed_show_ids", value: "embed_show_ids" },
              { name: "embed_show_jump", value: "embed_show_jump" },
              { name: "embed_compact", value: "embed_compact" },
              { name: "store_history", value: "store_history" },
              { name: "mention_on_delete", value: "mention_on_delete" },
            ),
        )
        .addBooleanOption((o) => o.setName("value").setDescription("On / off").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("webhook")
        .setDescription("Webhook credentials")
        .addStringOption((o) => o.setName("id").setDescription("Webhook id"))
        .addStringOption((o) => o.setName("token").setDescription("Webhook token"))
        .addBooleanOption((o) => o.setName("clear").setDescription("Clear webhook")),
    )
    .addSubcommand((s) =>
      s
        .setName("footer")
        .setDescription("Footer prefix (credit stays)")
        .addStringOption((o) => o.setName("text").setDescription("Footer text").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("status").setDescription("Status"))
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription("Test post")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("history")
        .setDescription("Export history")
           .addIntegerOption((o) => o.setName("limit").setDescription("Rows").setMinValue(1).setMaxValue(500))
        .addStringOption((o) => o.setName("key").setDescription("Event key").setAutocomplete(true))
        .addStringOption((o) => o.setName("format").setDescription("jsonl or csv")),
    )
    .addSubcommand((s) => s.setName("export").setDescription("Export guild config as JSON"))
    .addSubcommand((s) =>
      s
        .setName("import")
        .setDescription("Import guild config from JSON")
        .addAttachmentOption((o) =>
          o.setName("file").setDescription("Config JSON from /log export").setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Fallback channel for ids missing in this guild")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) => s.setName("reload").setDescription("Reload guild cache"))
    .addSubcommand((s) => s.setName("events").setDescription("List event keys"))
    .addSubcommand((s) =>
      s
        .setName("pack")
        .setDescription("Enable a preset set of events")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("moderation voice message server quiet")
            .setRequired(true)
            .addChoices(
              { name: "moderation", value: "moderation" },
              { name: "voice", value: "voice" },
              { name: "message", value: "message" },
              { name: "server", value: "server" },
              { name: "quiet", value: "quiet" },
            ),
        )
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Set default channel and apply the quiet pack")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Log channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("fields")
        .setDescription("Hide embed fields for one event")
        .addStringOption((o) => o.setName("key").setDescription("Event key").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("hide").setDescription("Comma field names, e.g. jump,id")),
    )
    .addSubcommand((s) =>
      s
        .setName("string")
        .setDescription("Override one UI string")
        .addStringOption((o) => o.setName("key").setDescription("e.g. event.messageDelete").setRequired(true))
        .addStringOption((o) => o.setName("value").setDescription("Replacement text ({vars} ok)").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("color")
        .setDescription("Embed color override")
        .addStringOption((o) =>
          o
            .setName("slot")
            .setDescription("color slot")
            .setRequired(true)
            .addChoices(
              { name: "create", value: "create" },
              { name: "update", value: "update" },
              { name: "delete", value: "delete" },
              { name: "voice", value: "voice" },
              { name: "member", value: "member" },
              { name: "mod", value: "mod" },
              { name: "info", value: "info" },
            ),
        )
        .addStringOption((o) => o.setName("hex").setDescription("#rrggbb").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("mention")
        .setDescription("Ping role on messageDelete")
        .addRoleOption((o) => o.setName("role").setDescription("Role"))
        .addBooleanOption((o) => o.setName("clear").setDescription("Clear mention role")),
    )
    .addSubcommand((s) => s.setName("languages").setDescription("List locales"))
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Guild knobs")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Setting")
            .setRequired(true)
            .addChoices(
              { name: "paused", value: "paused" },
              { name: "plain", value: "plainText" },
              { name: "thumbs", value: "showThumbnails" },
              { name: "actors", value: "actors" },
              { name: "cooldown", value: "cooldownSec" },
              { name: "acct_days", value: "minAccountDays" },
              { name: "quiet_in", value: "quietStart" },
              { name: "quiet_out", value: "quietEnd" },
              { name: "quiet_days", value: "quietDays" },
              { name: "hook_name", value: "webhookName" },
              { name: "hook_av", value: "webhookAvatar" },
              { name: "timestamp", value: "showTimestamp" },
              { name: "attach", value: "attachLong" },
              { name: "delivery", value: "delivery" },
              { name: "prefix", value: "prefix" },
              { name: "prefix_on", value: "prefixOn" },
              { name: "slash_on", value: "slashOn" },
              { name: "ephemeral", value: "ephemeral" },
              { name: "credit", value: "showCredit" },
              { name: "digest_ms", value: "digestMs" },
              { name: "history_days", value: "historyRetentionDays" },
              { name: "snapshot", value: "snapshotOn" },
              { name: "staff_ch", value: "staffChannel" },
              { name: "redact_url", value: "redactUrl" },
            ),
        )
        .addStringOption((o) =>
          o.setName("value").setDescription("value").setRequired(true),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("watch")
        .setDescription("Channel allow-list")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Allow channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Target")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Unwatch")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Target")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory),
            ),
        )
        .addSubcommand((s) => s.setName("clear").setDescription("Clear allow-list"))
        .addSubcommand((s) => s.setName("list").setDescription("List allow-list")),
    );
  return cmd;
}

function canRun(interaction, processCfg) {
  if (processCfg.owners.includes(interaction.user.id)) return true;
  const { hasConfigPermission } = require("./util");
  return hasConfigPermission(interaction.memberPermissions, processCfg);
}

function eph(cfg, processCfg) {
  if (cfg && cfg.ephemeral != null) return Boolean(cfg.ephemeral);
  return processCfg.slashEphemeral !== false;
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const q = String(focused.value || "").toLowerCase();
  if (focused.name === "code") {
    const { LOCALES } = require("./locales");
    const picks = LOCALES.filter((c) => c.includes(q)).slice(0, 25);
    return interaction.respond(picks.map((c) => ({ name: c, value: c })));
  }
  if (focused.name === "name" && interaction.options.getSubcommandGroup(false) === "group") {
    const picks = GROUPS.filter((g) => g.includes(q)).slice(0, 25);
    return interaction.respond(picks.map((g) => ({ name: g, value: g })));
  }
  if (focused.name !== "key") return interaction.respond([]);
  const picks = EVENTS.filter((e) => e.key.toLowerCase().includes(q)).slice(0, 25);
  return interaction.respond(picks.map((e) => ({ name: `${e.key} (${e.group})`, value: e.key })));
}

async function execute(interaction, { db, dispatch, processCfg }) {
  const locale = dispatch.guildCfg(interaction.guildId)?.locale || processCfg.defaultLocale;
  const cfg0 = dispatch.guildCfg(interaction.guildId);
  const hidden = eph(cfg0, processCfg);
  if (!canRun(interaction, processCfg)) {
    return interaction.reply({ content: t(locale, "cmd.denied"), ephemeral: hidden });
  }
  dispatch.refreshGuild(interaction.guildId);
  const origReply = interaction.reply.bind(interaction);
  interaction.reply = (payload) => {
    if (typeof payload === "string") return origReply({ content: payload, ephemeral: hidden });
    return origReply({ ...payload, ephemeral: payload.ephemeral ?? hidden });
  };
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === "event") {
    const key = interaction.options.getString("key", true);
    if (!byKey[key]) return interaction.reply({ content: t(locale, "cmd.unknown_event", { key }), ephemeral: true });
    if (sub === "reset") {
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      let changed = false;
      for (const mapKey of ["eventColors", "eventCooldown", "eventDigest", "eventActors", "quietBypass", "eventIncludeChannels", "eventDelivery", "eventHistory", "eventRedact"]) {
        if (!extra[mapKey] || typeof extra[mapKey] !== "object" || Array.isArray(extra[mapKey])) continue;
        if (Object.prototype.hasOwnProperty.call(extra[mapKey], key)) changed = true;
        delete extra[mapKey][key];
        if (!Object.keys(extra[mapKey]).length) delete extra[mapKey];
      }
      if (changed) {
        db.setExtra(interaction.guildId, extra);
        dispatch.refreshGuild(interaction.guildId);
      }
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}`, value: t(locale, "none") }),
        ephemeral: true,
      });
    }
    if (sub === "color") {
      const hex = interaction.options.getString("hex");
      const clear = interaction.options.getBoolean("clear");
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventColors = extra.eventColors && typeof extra.eventColors === "object" && !Array.isArray(extra.eventColors)
        ? { ...extra.eventColors }
        : {};
      let value;
      if (clear) {
        delete eventColors[key];
        value = t(locale, "none");
      } else {
        const color = parseHexColor(hex);
        if (color == null) return interaction.reply({ content: t(locale, "cmd.invalid_hex"), ephemeral: true });
        eventColors[key] = color;
        value = `#${color.toString(16).padStart(6, "0")}`;
      }
      if (Object.keys(eventColors).length) extra.eventColors = eventColors;
      else delete extra.eventColors;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.color`, value }),
        ephemeral: true,
      });
    }
    if (sub === "cooldown") {
      const seconds = interaction.options.getInteger("seconds");
      const clear = interaction.options.getBoolean("clear");
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventCooldown = extra.eventCooldown && typeof extra.eventCooldown === "object" && !Array.isArray(extra.eventCooldown)
        ? { ...extra.eventCooldown }
        : {};
      let value;
      if (clear) {
        delete eventCooldown[key];
        value = t(locale, "none");
      } else {
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
          return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "seconds" }), ephemeral: true });
        }
        eventCooldown[key] = seconds;
        value = String(seconds);
      }
      if (Object.keys(eventCooldown).length) extra.eventCooldown = eventCooldown;
      else delete extra.eventCooldown;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.cooldown`, value }),
        ephemeral: true,
      });
    }
    if (sub === "digest") {
      const ms = interaction.options.getInteger("ms");
      const min = interaction.options.getInteger("min");
      const clear = interaction.options.getBoolean("clear");
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventDigest = extra.eventDigest && typeof extra.eventDigest === "object" && !Array.isArray(extra.eventDigest)
        ? { ...extra.eventDigest }
        : {};
      let value;
      if (clear) {
        delete eventDigest[key];
        value = t(locale, "none");
      } else {
        if (!Number.isInteger(ms) || ms < 0 || ms > 3600000 || (min != null && (!Number.isInteger(min) || min < 1 || min > 1000))) {
          return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "ms/min" }), ephemeral: true });
        }
        eventDigest[key] = min == null ? { ms } : { ms, min };
        value = min == null ? `${ms}ms` : `${ms}ms / ${min}`;
      }
      if (Object.keys(eventDigest).length) extra.eventDigest = eventDigest;
      else delete extra.eventDigest;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.digest`, value }),
        ephemeral: true,
      });
    }
    if (sub === "actors") {
      const mode = interaction.options.getString("mode");
      const clear = interaction.options.getBoolean("clear");
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventActors = extra.eventActors && typeof extra.eventActors === "object" && !Array.isArray(extra.eventActors)
        ? { ...extra.eventActors }
        : {};
      let value;
      if (clear) {
        delete eventActors[key];
        value = t(locale, "none");
      } else {
        if (!["all", "humans", "bots"].includes(mode)) {
          return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "mode" }), ephemeral: true });
        }
        eventActors[key] = mode;
        value = mode;
      }
      if (Object.keys(eventActors).length) extra.eventActors = eventActors;
      else delete extra.eventActors;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.actors`, value }),
        ephemeral: true,
      });
    }
    if (sub === "bypass") {
      const enabledOption = interaction.options.getBoolean("enabled");
      const enabled = enabledOption == null ? true : enabledOption;
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const quietBypass = extra.quietBypass && typeof extra.quietBypass === "object" && !Array.isArray(extra.quietBypass)
        ? { ...extra.quietBypass }
        : {};
      if (enabled) quietBypass[key] = true;
      else delete quietBypass[key];
      if (Object.keys(quietBypass).length) extra.quietBypass = quietBypass;
      else delete extra.quietBypass;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.quietBypass`, value: String(enabled) }),
        ephemeral: true,
      });
    }
    if (sub === "watch") {
      const action = interaction.options.getString("action", true);
      const channel = interaction.options.getChannel("channel");
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventIncludeChannels = extra.eventIncludeChannels && typeof extra.eventIncludeChannels === "object" && !Array.isArray(extra.eventIncludeChannels)
        ? { ...extra.eventIncludeChannels }
        : {};
      if (!["add", "remove", "clear", "list"].includes(action)) {
        return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "action" }), ephemeral: true });
      }
      let ids = Array.isArray(eventIncludeChannels[key]) ? [...eventIncludeChannels[key]] : [];
      if (action === "list") {
        return interaction.reply({
          content: t(locale, "cmd.filter_set", {
            name: `event.${key}.watch`,
            value: ids.map((id) => `<#${id}>`).join(" ") || t(locale, "none"),
          }),
          ephemeral: true,
        });
      }
      if (action === "clear") {
        ids = [];
      } else {
        if (!channel) {
          return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "channel" }), ephemeral: true });
        }
        if (action === "add") ids = [...new Set([...ids, channel.id])];
        else ids = ids.filter((id) => id !== channel.id);
      }
      if (ids.length) eventIncludeChannels[key] = ids;
      else delete eventIncludeChannels[key];
      if (Object.keys(eventIncludeChannels).length) extra.eventIncludeChannels = eventIncludeChannels;
      else delete extra.eventIncludeChannels;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", {
          name: `event.${key}.watch`,
          value: ids.map((id) => `<#${id}>`).join(" ") || t(locale, "none"),
        }),
        ephemeral: true,
      });
    }
    if (sub === "delivery") {
      const mode = interaction.options.getString("mode", true);
      if (!["default", "embed", "plain", "webhook"].includes(mode)) {
        return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "mode" }), ephemeral: true });
      }
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventDelivery = extra.eventDelivery && typeof extra.eventDelivery === "object" && !Array.isArray(extra.eventDelivery)
        ? { ...extra.eventDelivery }
        : {};
      if (mode === "default") delete eventDelivery[key];
      else eventDelivery[key] = mode;
      if (Object.keys(eventDelivery).length) extra.eventDelivery = eventDelivery;
      else delete extra.eventDelivery;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", {
          name: `event.${key}.delivery`,
          value: mode === "default" ? t(locale, "none") : mode,
        }),
        ephemeral: true,
      });
    }
    if (sub === "history") {
      const mode = interaction.options.getString("mode", true);
      if (!["default", "on", "off"].includes(mode)) {
        return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "mode" }), ephemeral: true });
      }
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventHistory = extra.eventHistory && typeof extra.eventHistory === "object" && !Array.isArray(extra.eventHistory)
        ? { ...extra.eventHistory }
        : {};
      if (mode === "default") delete eventHistory[key];
      else eventHistory[key] = mode === "on";
      if (Object.keys(eventHistory).length) extra.eventHistory = eventHistory;
      else delete extra.eventHistory;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", {
          name: `event.${key}.history`,
          value: mode === "default" ? t(locale, "none") : mode,
        }),
        ephemeral: true,
      });
    }
    if (sub === "redact") {
      const flag = interaction.options.getString("flag", true);
      const enabledOption = interaction.options.getBoolean("enabled");
      const clear = interaction.options.getBoolean("clear");
      if (!EVENT_FLAGS.includes(flag)) {
        return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "flag" }), ephemeral: true });
      }
      const row = db.ensureGuild(interaction.guildId);
      const extra = db.extraOf(row);
      const eventRedact = extra.eventRedact && typeof extra.eventRedact === "object" && !Array.isArray(extra.eventRedact)
        ? { ...extra.eventRedact }
        : {};
      const perEvent = eventRedact[key] && typeof eventRedact[key] === "object" && !Array.isArray(eventRedact[key])
        ? { ...eventRedact[key] }
        : {};
      let value;
      if (clear) {
        delete perEvent[flag];
        value = t(locale, "none");
      } else {
        const enabled = enabledOption == null ? true : enabledOption;
        perEvent[flag] = enabled;
        value = String(enabled);
      }
      if (Object.keys(perEvent).length) eventRedact[key] = perEvent;
      else delete eventRedact[key];
      if (Object.keys(eventRedact).length) extra.eventRedact = eventRedact;
      else delete extra.eventRedact;
      db.setExtra(interaction.guildId, extra);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({
        content: t(locale, "cmd.filter_set", { name: `event.${key}.redact.${flag}`, value }),
        ephemeral: true,
      });
    }
    if (sub === "on") {
      const channel = interaction.options.getChannel("channel");
      db.setRoute(interaction.guildId, key, { enabled: true, channelId: channel?.id });
      dispatch.refreshGuild(interaction.guildId);
      const cfg = dispatch.guildCfg(interaction.guildId);
      const dest = cfg.events[key].channelId;
      return interaction.reply({
        content: t(locale, "cmd.enabled", { key, channel: dest ? `<#${dest}>` : t(locale, "none") }),
        ephemeral: true,
      });
    }
    db.setRoute(interaction.guildId, key, { enabled: false });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.disabled", { key }), ephemeral: true });
  }

  if (group === "group") {
    const name = interaction.options.getString("name", true);
    if (sub === "on") {
      const channel = interaction.options.getChannel("channel");
      db.setGroup(interaction.guildId, name, { enabled: true, channelId: channel?.id });
      dispatch.refreshGuild(interaction.guildId);
      const dest = channel ? `${channel}` : dispatch.guildCfg(interaction.guildId).defaultChannel
        ? `<#${dispatch.guildCfg(interaction.guildId).defaultChannel}>`
        : t(locale, "none");
      return interaction.reply({ content: t(locale, "cmd.group_on", { group: name, channel: dest }), ephemeral: true });
    }
    db.setGroup(interaction.guildId, name, { enabled: false });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.group_off", { group: name }), ephemeral: true });
  }

  if (group === "channel") {
    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      db.setGuild(interaction.guildId, { default_channel: channel.id });
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({ content: t(locale, "cmd.channel_set", { channel: `${channel}` }), ephemeral: true });
    }
    db.setGuild(interaction.guildId, { default_channel: null });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.channel_clear"), ephemeral: true });
  }

  if (group === "ignore") {
    if (sub === "add") {
      const kind = interaction.options.getString("kind", true);
      const id = interaction.options.getString("id", true);
      db.addIgnore.run(interaction.guildId, kind, id);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({ content: t(locale, "cmd.ignore_add", { kind, id }), ephemeral: true });
    }
    if (sub === "remove") {
      const kind = interaction.options.getString("kind", true);
      const id = interaction.options.getString("id", true);
      db.removeIgnore.run(interaction.guildId, kind, id);
      dispatch.refreshGuild(interaction.guildId);
      return interaction.reply({ content: t(locale, "cmd.ignore_remove", { kind, id }), ephemeral: true });
    }
    const rows = db.listIgnores.all(interaction.guildId);
    if (!rows.length) return interaction.reply({ content: t(locale, "cmd.ignore_empty"), ephemeral: true });
    const list = rows.map((r) => `\`${r.kind}\` ${r.target_id}`).join("\n");
    return interaction.reply({
      content: t(locale, "cmd.ignore_list", { count: rows.length, list }),
      ephemeral: true,
    });
  }

  if (sub === "locale") {
    const { LOCALES } = require("./locales");
    const code = interaction.options.getString("code", true);
    if (!LOCALES.includes(code)) {
      return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "locale" }), ephemeral: true });
    }
    db.setGuild(interaction.guildId, { locale: code });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(code, "cmd.locale_set", { locale: code }), ephemeral: true });
  }

  if (sub === "timezone") {
    const tz = interaction.options.getString("tz", true);
    try {
      Intl.DateTimeFormat("en", { timeZone: tz }).format(new Date());
    } catch {
      return interaction.reply({ content: t(locale, "cmd.invalid_timezone", { tz }), ephemeral: true });
    }
    db.setGuild(interaction.guildId, { timezone: tz });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.tz_set", { tz }), ephemeral: true });
  }

  if (sub === "filter") {
    const name = interaction.options.getString("name", true);
    const value = interaction.options.getBoolean("value", true);
    if (!FILTER_NAMES.has(name)) {
      return interaction.reply({ content: t(locale, "cmd.invalid_option", { name }), ephemeral: true });
    }
    db.setGuild(interaction.guildId, { [name]: value ? 1 : 0 });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({
      content: t(locale, "cmd.filter_set", { name, value: value ? "true" : "false" }),
      ephemeral: true,
    });
  }

  if (sub === "webhook") {
    if (interaction.options.getBoolean("clear")) {
      db.setGuild(interaction.guildId, { webhook_id: null, webhook_token: null });
    } else {
      const id = interaction.options.getString("id");
      const token = interaction.options.getString("token");
      if (id && token) db.setGuild(interaction.guildId, { webhook_id: id, webhook_token: token });
    }
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.reload"), ephemeral: true });
  }

  if (sub === "footer") {
    db.setGuild(interaction.guildId, { embed_footer: interaction.options.getString("text", true) });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.reload"), ephemeral: true });
  }

  if (sub === "status") {
    const cfg = dispatch.guildCfg(interaction.guildId);
    const enabled = EVENTS.filter((e) => cfg.events[e.key].on).length;
    return interaction.reply({
      content: t(cfg.locale, "cmd.status", {
        locale: cfg.locale,
        tz: cfg.timezone,
        channel: cfg.defaultChannel ? `<#${cfg.defaultChannel}>` : t(cfg.locale, "none"),
        enabled,
        total: EVENTS.length,
        queue: [...dispatch.queues.values()].reduce((n, q) => n + q.length, 0),
        error: cfg.lastError || t(cfg.locale, "none"),
        sent: String(dispatch.metrics?.sent ?? 0),
        dropped: String(dispatch.metrics?.dropped ?? 0),
      }),
      ephemeral: true,
    });
  }

  if (sub === "test") {
    const cfg = dispatch.guildCfg(interaction.guildId);
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const embed = buildEmbed(cfg, "test", [
      ["field.channel", `${channel}`],
      ["field.user", interaction.user.tag],
    ], { description: t(cfg.locale, "bot.credit") });
    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: t(cfg.locale, "cmd.test_sent", { channel: `${channel}` }), ephemeral: true });
  }

  if (sub === "pack") {
    const { applyPack } = require("./packs");
    const name = interaction.options.getString("name", true);
    const channel = interaction.options.getChannel("channel");
    const keys = applyPack(db, interaction.guildId, name, channel?.id);
    dispatch.refreshGuild(interaction.guildId);
    if (!keys) return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: "pack" }) });
    return interaction.reply({ content: t(locale, "cmd.group_on", { group: name, channel: channel ? `${channel}` : t(locale, "none") }) });
  }

  if (sub === "setup") {
    const { applyPack } = require("./packs");
    const channel = interaction.options.getChannel("channel", true);
    db.setGuild(interaction.guildId, { default_channel: channel.id });
    applyPack(db, interaction.guildId, "quiet", channel.id);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.channel_set", { channel: `${channel}` }) });
  }

  if (sub === "fields") {
    const key = interaction.options.getString("key", true);
    const hide = interaction.options.getString("hide") || "";
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    extra.hiddenFields = extra.hiddenFields || {};
    extra.hiddenFields[key] = hide.split(",").map((s) => s.trim()).filter(Boolean);
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.filter_set", { name: `fields.${key}`, value: hide || "—" }) });
  }

  if (sub === "export") {
    const { exportGuild } = require("./configTransfer");
    const config = exportGuild(db, interaction.guildId);
    const body = JSON.stringify(config, null, 2);
    const file = new AttachmentBuilder(Buffer.from(body, "utf8"), {
      name: `logyazicam-config-${interaction.guildId}.json`,
    });
    return interaction.reply({
      content: t(locale, "cmd.config_export", {
        routes: config.routes.length,
        ignores: config.ignores.length,
      }),
      files: [file],
      ephemeral: true,
    });
  }

  if (sub === "import") {
    const { readAttachment, importGuild, MAX_BYTES } = require("./configTransfer");
    // The attachment download can take up to 10 seconds. Slash interactions
    // must be acknowledged within 3 seconds, so defer before fetching. Prefix
    // messages have no such deadline and simply reply when the import finishes.
    let deferred = false;
    if (typeof interaction.deferReply === "function") {
      try {
        await interaction.deferReply({ ephemeral: hidden });
        deferred = true;
      } catch {
        // Already acknowledged by another path; keep going with a normal reply.
      }
    }
    const reply = (payload) => {
      if (!deferred || typeof interaction.editReply !== "function") return interaction.reply(payload);
      const data = typeof payload === "string" ? { content: payload } : { ...payload };
      delete data.ephemeral;
      return interaction.editReply(data);
    };
    const attachment = interaction.options.getAttachment("file", true);
    if (!attachment) {
      return reply({ content: t(locale, "cmd.config_import_file"), ephemeral: true });
    }
    if (!String(attachment.name || "").toLowerCase().endsWith(".json")) {
      return reply({ content: t(locale, "cmd.config_import_file"), ephemeral: true });
    }
    if (Number(attachment.size) > MAX_BYTES) {
      return reply({
        content: t(locale, "cmd.config_import_too_big", { max: MAX_BYTES / 1024 }),
        ephemeral: true,
      });
    }
    let payload;
    try {
      payload = await readAttachment(attachment);
    } catch (error) {
      return reply({
        content: t(locale, "cmd.config_import_invalid", { error: error.message }),
        ephemeral: true,
      });
    }
    const fallback = interaction.options.getChannel("channel")?.id || null;
    const resolveChannel = (id) => (interaction.guild.channels.cache.has(id) ? id : fallback);
    const resolveRole = (id) => (interaction.guild.roles.cache.has(id) ? id : null);
    let result;
    try {
      result = importGuild(db, interaction.guildId, payload, { resolveChannel, resolveRole });
    } catch (error) {
      return reply({
        content: t(locale, "cmd.config_import_invalid", { error: error.message }),
        ephemeral: true,
      });
    }
    dispatch.refreshGuild(interaction.guildId);
    return reply({
      content: t(locale, "cmd.config_import", {
        ...result,
        skipped: result.skipped,
      }),
      ephemeral: true,
    });
  }

  if (sub === "history") {
    const limit = clampHistoryLimit(
      interaction.options.getInteger("limit"),
      processCfg.historyExportDefault || 50,
    );
    const key = interaction.options.getString("key") || "";
    const format = (interaction.options.getString("format") || "jsonl").toLowerCase();
    const rows = db.queryHistory.all(interaction.guildId, 0, Date.now() + 1, key, key, limit);
    if (!rows.length) return interaction.reply({ content: t(locale, "cmd.history_empty"), ephemeral: true });
    let body;
    let name;
    if (format === "csv") {
      body = ["created_at,event_key,payload", ...rows.map((r) => `${r.created_at},${r.event_key},"${String(r.payload).replaceAll('"', '""')}"`)].join("\n");
      name = `logyazicam-${interaction.guildId}.csv`;
    } else {
      body = rows.map((r) => JSON.stringify({ at: r.created_at, event: r.event_key, payload: r.payload })).join("\n");
      name = `logyazicam-${interaction.guildId}.jsonl.txt`;
    }
    const file = new AttachmentBuilder(Buffer.from(body, "utf8"), { name });
    return interaction.reply({
      content: t(locale, "cmd.export", { count: rows.length }),
      files: [file],
      ephemeral: true,
    });
  }

  if (sub === "reload") {
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.reload"), ephemeral: true });
  }

  if (sub === "string") {
    const key = interaction.options.getString("key", true);
    const value = interaction.options.getString("value", true);
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    extra.strings = extra.strings || {};
    extra.strings[key] = value;
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.filter_set", { name: key, value }), ephemeral: true });
  }

  if (sub === "color") {
    const slot = interaction.options.getString("slot", true);
    const hex = interaction.options.getString("hex", true);
    const n = parseHexColor(hex);
    if (n == null) {
      return interaction.reply({ content: t(locale, "cmd.invalid_hex"), ephemeral: true });
    }
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    extra.colors = extra.colors || {};
    extra.colors[slot] = n;
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.filter_set", { name: `color.${slot}`, value: `#${String(hex).trim().replace(/^#/, "")}` }), ephemeral: true });
  }

  if (sub === "mention") {
    if (interaction.options.getBoolean("clear")) {
      db.setGuild(interaction.guildId, { mention_role: null, mention_on_delete: 0 });
    } else {
      const role = interaction.options.getRole("role");
      if (role) db.setGuild(interaction.guildId, { mention_role: role.id, mention_on_delete: 1 });
    }
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.reload"), ephemeral: true });
  }

  if (sub === "languages") {
    const { LOCALES, reloadLocales } = require("./locales");
    reloadLocales();
    return interaction.reply({
      content: t(locale, "cmd.languages", {
        count: LOCALES.length,
        list: LOCALES.map((c) => `\`${c}\``).join(" "),
      }),
      ephemeral: true,
    });
  }

  if (sub === "set") {
    const requested = interaction.options.getString("name", true);
    const name = Object.prototype.hasOwnProperty.call(SETTING_ALIASES, requested)
      ? SETTING_ALIASES[requested]
      : (SETTING_NAMES.has(requested) ? requested : null);
    if (!name) {
      return interaction.reply({ content: t(locale, "cmd.invalid_option", { name: requested }), ephemeral: true });
    }
    const raw = interaction.options.getString("value", true);
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    const invalid = () => interaction.reply({
      content: t(locale, "cmd.invalid_option", { name: requested }),
      ephemeral: true,
    });

    if (BOOL_SETTINGS.has(name)) {
      const flag = parseBoolSetting(raw);
      if (flag == null) return invalid();
      extra[name] = flag;
    } else if (Object.prototype.hasOwnProperty.call(NUMBER_SETTINGS, name)) {
      const [min, max] = NUMBER_SETTINGS[name];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < min || value > max) return invalid();
      extra[name] = value;
    } else if (TIME_SETTINGS.has(name)) {
      if (raw === "clear" || raw === "-") extra[name] = null;
      else if (TIME_VALUE.test(raw)) extra[name] = raw;
      else return invalid();
    } else if (name === "actors") {
      if (!["all", "humans", "bots"].includes(raw)) return invalid();
      extra.actors = raw;
    } else if (name === "quietDays") {
      const days = parseQuietDays(raw);
      if (days == null) return invalid();
      extra.quietDays = days;
    } else if (name === "delivery") {
      if (!["embed", "plain", "webhook"].includes(raw)) return invalid();
      extra.delivery = raw;
      extra.plainText = raw === "plain";
    } else if (name === "staffChannel") {
      extra.staffChannel = raw === "clear" || raw === "-" ? null : (raw.replace(/[<#>]/g, "") || null);
    } else if (name === "redactUrl") {
      const flag = parseBoolSetting(raw);
      if (flag == null) return invalid();
      extra.redact = extra.redact || {};
      extra.redact.url = flag;
    } else if (name === "webhookName" || name === "webhookAvatar" || name === "prefix") {
      extra[name] = raw === "clear" || raw === "-" ? null : raw;
    } else {
      return invalid();
    }
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({
      content: t(locale, "cmd.filter_set", {
        name: requested,
        value: name === "quietDays"
          ? (extra.quietDays.length ? extra.quietDays.join(",") : "all")
          : extra[name] == null ? "clear" : String(extra[name]),
      }),
      ephemeral: true,
    });
  }

  if (group === "watch") {
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    extra.includeChannels = Array.isArray(extra.includeChannels) ? extra.includeChannels : [];
    if (sub === "add") {
      extra.includeChannels.push(interaction.options.getChannel("channel", true).id);
      extra.includeChannels = [...new Set(extra.includeChannels)];
    } else if (sub === "remove") {
      const id = interaction.options.getChannel("channel", true).id;
      extra.includeChannels = extra.includeChannels.filter((x) => x !== id);
    } else if (sub === "clear") {
      extra.includeChannels = [];
    } else {
      const list = extra.includeChannels.map((id) => `<#${id}>`).join(" ") || t(locale, "none");
      return interaction.reply({ content: list, ephemeral: true });
    }
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.reload"), ephemeral: true });
  }

  if (sub === "events") {
    const lines = GROUPS.map((g) => {
      const keys = EVENTS.filter((e) => e.group === g).map((e) => e.key);
      return `**${g}**\n${keys.map((k) => `\`${k}\``).join(" ")}`;
    });
    return interaction.reply({ content: lines.join("\n\n").slice(0, 3900), ephemeral: true });
  }

  return interaction.reply({ content: t(locale, "cmd.denied"), ephemeral: true });
}

module.exports = {
  data,
  execute,
  autocomplete,
  clampHistoryLimit,
  MAX_HISTORY_LIMIT,
  FILTER_NAMES,
  SETTING_NAMES,
  SETTING_ALIASES,
};
