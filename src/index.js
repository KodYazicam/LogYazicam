const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
} = require("discord.js");
const { loadEnvFile, processConfig } = require("./config");
const { openDb } = require("./db");
const { createLogger } = require("./logger");
const { createDispatcher } = require("./dispatcher");
const { bindEvents } = require("./events");
const commands = require("./commands");
const { t, reloadLocales } = require("./locales");
const { parsePrefix, fakeInteraction, canPrefix } = require("./prefix");

let env = loadEnvFile();
let processCfg = processConfig(env);

if (!processCfg.token) {
  console.error("Missing TOKEN. Copy .env.example to .env.");
  process.exit(1);
}

const log = createLogger(processCfg);
const db = openDb(processCfg.databasePath);
const cache = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
    Partials.ThreadMember,
    Partials.GuildScheduledEvent,
  ],
});

const dispatch = createDispatcher({ client, db, processCfg, log, cache });

function reportError(error, where) {
  log.error(where, error);
  const text = `LogYazicam error in ${where}: ${error?.stack || error}`;
  if (processCfg.errorChannelId) {
    client.channels
      .fetch(processCfg.errorChannelId)
      .then((ch) => ch.isTextBased() && ch.send({ content: text.slice(0, processCfg.errorMax || 1900) }))
      .catch((err) => log.warn("error channel failed", err.message));
  }
  if (processCfg.errorDmOwner && processCfg.owners[0]) {
    client.users
      .fetch(processCfg.owners[0])
      .then((u) => u.send({ content: text.slice(0, processCfg.errorMax || 1900) }))
      .catch((err) => log.warn("error dm failed", err.message));
  }
}

process.on("unhandledRejection", (error) => reportError(error, "unhandledRejection"));
process.on("uncaughtException", (error) => reportError(error, "uncaughtException"));

bindEvents(client, { dispatch, processCfg, log });

client.on("messageCreate", async (message) => {
  try {
    if (!message.inGuild() || message.author.bot) return;
    const cfg = dispatch.guildCfg(message.guildId) || dispatch.refreshGuild(message.guildId);
    if (cfg.prefixOn === false) return;
    const prefix = cfg.prefix || processCfg.prefix;
    const tokens = parsePrefix(message.content, prefix, processCfg.commandName);
    if (!tokens) return;
    if (!canPrefix(message, processCfg)) {
      await message.reply({ content: t(cfg.locale, "cmd.denied"), allowedMentions: { repliedUser: false } });
      return;
    }
    const fake = fakeInteraction(message, tokens, processCfg.commandName);
    await commands.execute(fake, { db, dispatch, processCfg });
  } catch (error) {
    reportError(error, "prefix");
  }
});

client.on("guildCreate", (guild) => {
  try {
    dispatch.refreshGuild(guild.id);
  } catch (error) {
    reportError(error, "guildCreate");
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.inGuild()) {
      const cfg = dispatch.guildCfg(interaction.guildId) || dispatch.refreshGuild(interaction.guildId);
      if (cfg.slashOn === false) return;
    }
    if (interaction.isAutocomplete() && interaction.commandName === processCfg.commandName) {
      await commands.autocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() || interaction.commandName !== processCfg.commandName) return;
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Guild only.", ephemeral: true });
      return;
    }
    await commands.execute(interaction, { db, dispatch, processCfg });
  } catch (error) {
    reportError(error, "interactionCreate");
    const payload = { content: `Error: ${error.message}`.slice(0, 500), ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

function applyPresence() {
  if (!client.user) return;
  const typeName = String(processCfg.activityType || "Watching");
  const type = ActivityType[typeName] ?? ActivityType.Watching;
  const status = ["online", "idle", "dnd", "invisible"].includes(processCfg.activityStatus)
    ? processCfg.activityStatus
    : "online";
  client.user.setPresence({
    status,
    activities: processCfg.activityText
      ? [{ name: processCfg.activityText.slice(0, 128), type }]
      : [],
  });
}

client.once("ready", () => {
  for (const guild of client.guilds.cache.values()) dispatch.refreshGuild(guild.id);
  applyPresence();
  log.info(t(processCfg.defaultLocale, "bot.ready", { tag: client.user.tag, guilds: client.guilds.cache.size }));
  log.info(t(processCfg.defaultLocale, "bot.credit"));
});

if (processCfg.hotReloadMs > 0) {
  setInterval(() => {
    try {
      const nextEnv = loadEnvFile();
      const token = processCfg.token;
      processCfg = processConfig(nextEnv);
      processCfg.token = token;
      reloadLocales();
      applyPresence();
      for (const id of cache.keys()) dispatch.refreshGuild(id);
      log.debug("hot-reload applied");
    } catch (error) {
      reportError(error, "hot-reload");
    }
  }, processCfg.hotReloadMs).unref();
}

client.login(processCfg.token).catch((error) => {
  log.error("login failed", error);
  process.exit(1);
});
