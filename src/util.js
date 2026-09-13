const { EmbedBuilder } = require("discord.js");
const { t } = require("./locales");
const { byKey } = require("./catalog");

function truncate(text, max = 1024) {
  const value = text == null ? "" : String(text);
  if (value.length <= max) return value || "—";
  return `${value.slice(0, max - 1)}…`;
}

function code(value) {
  const s = value == null ? "—" : String(value);
  return `\`${s.replaceAll("`", "'")}\``;
}

function userTag(user) {
  if (!user) return "—";
  return `${user.tag || user.username || user.id} (${user.id})`;
}

function channelTag(channel) {
  if (!channel) return "—";
  return `${channel} (\`${channel.id}\`)`;
}

function diff(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const lines = [];
  for (const key of keys) {
    const a = before?.[key];
    const b = after?.[key];
    if (String(a) === String(b)) continue;
    lines.push(`**${key}:** ${truncate(a, 80)} → ${truncate(b, 80)}`);
  }
  return lines.join("\n") || "—";
}

function when(ts, timezone = "UTC") {
  const date = ts instanceof Date ? ts : new Date(ts || Date.now());
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function buildEmbed(guildCfg, eventKey, fields, { description, thumbnail, url } = {}) {
  const meta = byKey[eventKey] || { color: "info" };
  const color = guildCfg.colors[meta.color] || guildCfg.colors.info;
  const locale = guildCfg.locale;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(t(locale, `event.${eventKey}`, {}, guildCfg.extra?.strings))
    .setTimestamp(new Date());
  if (description) embed.setDescription(truncate(description, 4000));
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (url) embed.setURL(url);
  const compact = guildCfg.embedCompact;
  for (const [name, value] of fields) {
    if (value == null || value === "") continue;
    embed.addFields({
      name: t(locale, name, {}, guildCfg.extra?.strings),
      value: truncate(value),
      inline: compact,
    });
  }
  const footer = [guildCfg.embedFooter, t(locale, "bot.credit", {}, guildCfg.extra?.strings)].filter(Boolean).join(" · ");
  embed.setFooter({ text: footer.slice(0, 2048) });
  return embed;
}

async function audit(guild, type, targetId, maxAge) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const now = Date.now();
    for (const entry of logs.entries.values()) {
      if (targetId && entry.target?.id && entry.target.id !== targetId) continue;
      if (maxAge && now - entry.createdTimestamp > maxAge) continue;
      return entry;
    }
  } catch {
    return null;
  }
  return null;
}

function ignored(guildCfg, { user, channel, roleIds = [] }) {
  for (const row of guildCfg.ignores) {
    if (row.kind === "user" && user && row.target_id === user.id) return true;
    if (row.kind === "channel" && channel && row.target_id === channel.id) return true;
    if (row.kind === "category" && channel?.parentId && row.target_id === channel.parentId) return true;
    if (row.kind === "role" && roleIds.includes(row.target_id)) return true;
  }
  return false;
}

module.exports = { truncate, code, userTag, channelTag, diff, when, buildEmbed, audit, ignored };
