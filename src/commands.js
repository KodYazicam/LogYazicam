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
    .setDescription("Configure LogYazicam for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((g) =>
      g
        .setName("event")
        .setDescription("Enable or disable a single event")
        .addSubcommand((s) =>
          s
            .setName("on")
            .setDescription("Turn an event on")
            .addStringOption((o) =>
              o.setName("key").setDescription("Event key (English id)").setRequired(true).setAutocomplete(true),
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
        .setDescription("Enable or disable a whole group")
        .addSubcommand((s) =>
          s
            .setName("on")
            .setDescription("Turn a group on")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Group name")
                .setRequired(true)
                .addChoices(...GROUPS.map((name) => ({ name, value: name }))),
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
            .setDescription("Turn a group off")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Group name")
                .setRequired(true)
                .addChoices(...GROUPS.map((name) => ({ name, value: name }))),
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
            .setDescription("Set the default log channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Text channel")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
            ),
        )
        .addSubcommand((s) => s.setName("clear").setDescription("Clear the default log channel")),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("ignore")
        .setDescription("Ignore users, channels, roles, or categories")
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
        .setDescription("Set embed language")
        .addStringOption((o) =>
          o
            .setName("code")
            .setDescription("en | tr | de | fr | es")
            .setRequired(true)
            .addChoices(...LOCALES.map((code) => ({ name: code, value: code }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("timezone")
        .setDescription("Set IANA timezone")
        .addStringOption((o) => o.setName("tz").setDescription("e.g. Europe/Istanbul").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("filter")
        .setDescription("Toggle a boolean filter")
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
        .setDescription("Use a webhook for this guild")
        .addStringOption((o) => o.setName("id").setDescription("Webhook id"))
        .addStringOption((o) => o.setName("token").setDescription("Webhook token"))
        .addBooleanOption((o) => o.setName("clear").setDescription("Clear webhook")),
    )
    .addSubcommand((s) =>
      s
        .setName("footer")
        .setDescription("Custom embed footer (credit is always appended)")
        .addStringOption((o) => o.setName("text").setDescription("Footer text").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("status").setDescription("Show current configuration"))
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription("Send a test embed")
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
        .setDescription("Export recent stored events")
        .addIntegerOption((o) => o.setName("limit").setDescription("Rows (max 200)").setMinValue(1).setMaxValue(200)),
    )
    .addSubcommand((s) => s.setName("reload").setDescription("Reload this guild from SQLite + env"))
    .addSubcommand((s) => s.setName("events").setDescription("List every event key and group"));
  return cmd;
}

function canRun(interaction, processCfg) {
  if (processCfg.owners.includes(interaction.user.id)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "key") return interaction.respond([]);
  const q = String(focused.value || "").toLowerCase();
  const picks = EVENTS.filter((e) => e.key.toLowerCase().includes(q)).slice(0, 25);
  return interaction.respond(picks.map((e) => ({ name: `${e.key} (${e.group})`, value: e.key })));
}

async function execute(interaction, { db, dispatch, processCfg }) {
  const locale = dispatch.guildCfg(interaction.guildId)?.locale || processCfg.defaultLocale;
  if (!canRun(interaction, processCfg)) {
    return interaction.reply({ content: t(locale, "cmd.denied"), ephemeral: true });
  }
  dispatch.refreshGuild(interaction.guildId);
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
    const code = interaction.options.getString("code", true);
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

  if (sub === "history") {
    const limit = interaction.options.getInteger("limit") || 50;
    const rows = db.listHistory.all(interaction.guildId, limit);
    if (!rows.length) return interaction.reply({ content: t(locale, "cmd.history_empty"), ephemeral: true });
    const body = rows
      .map((r) => `${new Date(r.created_at).toISOString()} ${r.event_key} ${r.payload}`)
      .join("\n");
    const file = new AttachmentBuilder(Buffer.from(body, "utf8"), { name: `logyazicam-${interaction.guildId}.jsonl.txt` });
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
