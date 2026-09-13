const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
const { loadEnvFile, processConfig } = require("./config");
const { openDb } = require("./db");
const { createLogger } = require("./logger");
const { createDispatcher } = require("./dispatcher");
const { bindEvents } = require("./events");
const commands = require("./commands");
const { t, reloadLocales } = require("./locales");

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
      .then((ch) => ch.isTextBased() && ch.send({ content: text.slice(0, 1900) }))
      .catch((err) => log.warn("error channel failed", err.message));
  }
  if (processCfg.errorDmOwner && processCfg.owners[0]) {
    client.users
      .fetch(processCfg.owners[0])
      .then((u) => u.send({ content: text.slice(0, 1900) }))
      .catch((err) => log.warn("error dm failed", err.message));
  }
}

process.on("unhandledRejection", (error) => reportError(error, "unhandledRejection"));
process.on("uncaughtException", (error) => reportError(error, "uncaughtException"));

bindEvents(client, { dispatch, processCfg, log });

client.on("guildCreate", (guild) => {
  try {
    dispatch.refreshGuild(guild.id);
  } catch (error) {
    reportError(error, "guildCreate");
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === "log") {
      await commands.autocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() || interaction.commandName !== "log") return;
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

client.once("ready", () => {
  for (const guild of client.guilds.cache.values()) dispatch.refreshGuild(guild.id);
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
