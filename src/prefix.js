const { PermissionFlagsBits } = require("discord.js");

function parsePrefix(content, prefix) {
  if (!content || !prefix || !content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  if (!body) return null;
  const [head, ...rest] = body.split(/\s+/);
  if (head.toLowerCase() !== "log") return null;
  return rest;
}

function fakeInteraction(message, tokens) {
  const options = {};
  const consume = () => {
    const next = tokens[0];
    if (!next || next.startsWith("-")) return undefined;
    return tokens.shift();
  };
  while (tokens[0] && tokens[0].includes(":")) {
    const piece = tokens.shift();
    const idx = piece.indexOf(":");
    options[piece.slice(0, idx)] = piece.slice(idx + 1);
  }
  const groupOrSub = consume() || "status";
  let group = null;
  let sub = groupOrSub;
  const groups = new Set(["event", "group", "channel", "ignore", "watch"]);
  if (groups.has(groupOrSub) && tokens[0] && !tokens[0].includes(":")) {
    group = groupOrSub;
    sub = consume();
  }
  const get = (name, required) => {
    if (options[name] != null) return options[name];
    if (required) return consume();
    return undefined;
  };
  return {
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions,
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => sub,
      getString: (name, required) => {
        const v = get(name, required);
        return v == null ? null : String(v);
      },
      getInteger: (name) => {
        const v = get(name, false);
        return v == null ? null : Number(v);
      },
      getBoolean: (name) => {
        const v = get(name, false);
        if (v == null) return null;
        return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
      },
      getChannel: (name) => {
        const raw = get(name, false);
        if (!raw) return null;
        const id = String(raw).replace(/[<#>]/g, "");
        return message.guild.channels.cache.get(id) || { id, toString: () => `<#${id}>` };
      },
      getRole: (name) => {
        const raw = get(name, false);
        if (!raw) return null;
        const id = String(raw).replace(/[<@&>]/g, "");
        return message.guild.roles.cache.get(id) || { id };
      },
    },
    reply: (payload) => {
      const content = typeof payload === "string" ? payload : payload.content;
      const files = typeof payload === "object" ? payload.files : undefined;
      return message.reply({ content, files, allowedMentions: { repliedUser: false } });
    },
    inGuild: () => true,
    isChatInputCommand: () => true,
    commandName: "log",
  };
}

function canPrefix(message, processCfg) {
  if (processCfg.owners.includes(message.author.id)) return true;
  return message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = { parsePrefix, fakeInteraction, canPrefix };
