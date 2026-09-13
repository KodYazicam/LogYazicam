const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");
const { EVENTS, GROUPS, byKey } = require("./catalog");
const { LOCALES, t } = require("./locales");
const { buildEmbed } = require("./util");

function data() {
  const cmd = new SlashCommandBuilder()
    .setName("log")
    .setDescription("Configure logging")
    .setDefaultMemberPermissions(PermissionFlagsBits[process.env.CONFIG_PERMISSION || "ManageGuild"] || PermissionFlagsBits.ManageGuild)
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
      return interaction.reply({ content: t(locale, "cmd.unknown_event", { key: code }), ephemeral: true });
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
      return interaction.reply({ content: `Invalid IANA timezone: ${tz}`, ephemeral: true });
    }
    db.setGuild(interaction.guildId, { timezone: tz });
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.tz_set", { tz }), ephemeral: true });
  }

  if (sub === "filter") {
    const name = interaction.options.getString("name", true);
    const value = interaction.options.getBoolean("value", true);
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
    if (!keys) return interaction.reply({ content: t(locale, "cmd.unknown_event", { key: name }) });
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

  if (sub === "history") {
    const limit = interaction.options.getInteger("limit") || processCfg.historyExportDefault || 50;
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
    const hex = interaction.options.getString("hex", true).replace("#", "");
    const n = Number.parseInt(hex, 16);
    if (!Number.isFinite(n) || hex.length < 6) {
      return interaction.reply({ content: "hex must be #rrggbb", ephemeral: true });
    }
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    extra.colors = extra.colors || {};
    extra.colors[slot] = n;
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({ content: t(locale, "cmd.filter_set", { name: `color.${slot}`, value: `#${hex}` }), ephemeral: true });
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
    const name = interaction.options.getString("name", true);
    const raw = interaction.options.getString("value", true);
    const row = db.ensureGuild(interaction.guildId);
    const extra = db.extraOf(row);
    const boolish = ["paused", "plainText", "showThumbnails", "showTimestamp", "attachLong", "prefixOn", "slashOn", "ephemeral", "showCredit", "snapshotOn"];
    if (boolish.includes(name)) {
      extra[name] = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
    } else if (name === "cooldownSec" || name === "minAccountDays" || name === "digestMs") {
      extra[name] = Number(raw) || 0;
    } else if (name === "actors") {
      extra.actors = ["all", "humans", "bots"].includes(raw) ? raw : "all";
    } else if (name === "delivery") {
      extra.delivery = ["embed", "plain", "webhook"].includes(raw) ? raw : "embed";
      extra.plainText = extra.delivery === "plain";
    } else if (name === "staffChannel") {
      extra.staffChannel = raw.replace(/[<#>]/g, "") || null;
    } else if (name === "redactUrl") {
      extra.redact = extra.redact || {};
      extra.redact.url = ["1", "true", "yes", "on"].includes(raw.toLowerCase());
    } else {
      extra[name] = raw === "clear" || raw === "-" ? null : raw;
    }
    db.setExtra(interaction.guildId, extra);
    dispatch.refreshGuild(interaction.guildId);
    return interaction.reply({
      content: t(locale, "cmd.filter_set", { name, value: String(extra[name]) }),
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

module.exports = { data, execute, autocomplete };
