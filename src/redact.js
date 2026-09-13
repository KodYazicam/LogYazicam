const PATTERNS = [
  { kind: "discord-token", re: /[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g },
  { kind: "github-token", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { kind: "openai", re: /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "openai", re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { kind: "url", re: /https?:\/\/[^\s<]+/gi },
  { kind: "invite", re: /(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+/gi },
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "mention", re: /<@!?\d+>/g },
];

function redactText(text, flags) {
  if (!text || !flags) return text;
  let out = String(text);
  for (const { kind, re } of PATTERNS) {
    if (!flags[kind] && kind !== "invite") continue;
    if (kind === "invite" && !flags.url && !flags.invite) continue;
    re.lastIndex = 0;
    out = out.replace(re, `[${kind}]`);
  }
  if (flags.mention) out = out.replace(/<@!?\d+>/g, "[user]");
  return out;
}

function redactEmbeds(embeds, flags) {
  if (!flags || !embeds?.length) return embeds;
  return embeds.map((embed) => {
    const data = typeof embed.toJSON === "function" ? embed.toJSON() : { ...embed };
    if (data.description) data.description = redactText(data.description, flags);
    if (data.title) data.title = redactText(data.title, flags);
    if (data.fields) {
      data.fields = data.fields.map((f) => ({
        ...f,
        value: redactText(f.value, flags),
      }));
    }
    const { EmbedBuilder } = require("discord.js");
    try {
      return EmbedBuilder.from(data);
    } catch {
      return embed;
    }
  });
}

function flagsFrom(cfg, processCfg) {
  const extra = cfg?.extra?.redact || {};
  return {
    url: extra.url != null ? extra.url : processCfg.redactUrls,
    mention: extra.mention != null ? extra.mention : processCfg.redactMentions,
    email: extra.email != null ? extra.email : processCfg.redactEmails,
    invite: extra.invite != null ? extra.invite : processCfg.redactInvites,
    "discord-token": true,
    "github-token": true,
    openai: true,
  };
}

module.exports = { redactText, redactEmbeds, flagsFrom, PATTERNS };
