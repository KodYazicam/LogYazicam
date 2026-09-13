const { REST, Routes } = require("discord.js");
const { loadEnvFile, processConfig } = require("./config");
const { data } = require("./commands");

const env = loadEnvFile();
const cfg = processConfig(env);
if (!cfg.token || !cfg.clientId) {
  console.error("Missing TOKEN or CLIENT_ID.");
  process.exit(1);
}

const body = [data().toJSON()];
if (cfg.commandName && cfg.commandName !== "log") {
  body[0].name = cfg.commandName;
}
const rest = new REST({ version: "10" }).setToken(cfg.token);

(async () => {
  try {
    if (cfg.guildId) {
      const result = await rest.put(Routes.applicationGuildCommands(cfg.clientId, cfg.guildId), { body });
      console.log(`Registered ${result.length} guild command(s) on ${cfg.guildId}.`);
    } else {
      const result = await rest.put(Routes.applicationCommands(cfg.clientId), { body });
      console.log(`Registered ${result.length} global command(s).`);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
