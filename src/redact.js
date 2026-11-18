const PATTERNS = [
  { kind: "discord-token", re: /[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g },
  { kind: "github-token", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { kind: "github-token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: "openai", re: /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "openai", re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { kind: "anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "stripe", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { kind: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
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

function redactFiles(files, flags) {
  if (!files?.length || !flags) return files;
  let changed = false;
  const out = files.map((file) => {
    const buffer = file?.attachment;
    if (!Buffer.isBuffer(buffer) || !/\.txt$/i.test(file.name || "")) return file;
    const text = buffer.toString("utf8");
    const redacted = redactText(text, flags);
    if (redacted === text) return file;
    changed = true;
    const { AttachmentBuilder } = require("discord.js");
    return new AttachmentBuilder(Buffer.from(redacted, "utf8"), {
      name: file.name,
      description: file.description ?? undefined,
    });
  });
  return changed ? out : files;
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
    anthropic: true,
    "aws-key": true,
    stripe: true,
    "slack-token": true,
  };
}

const EVENT_FLAGS = ["url", "mention", "email", "invite"];

function eventRedactFlags(cfg, eventKey, base) {
  const flags = { ...base };
  const overrides = cfg?.eventRedact?.[eventKey];
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return flags;
  for (const flag of EVENT_FLAGS) {
    if (typeof overrides[flag] === "boolean") flags[flag] = overrides[flag];
  }
  return flags;
}

module.exports = { redactText, redactEmbeds, redactFiles, flagsFrom, eventRedactFlags, EVENT_FLAGS, PATTERNS };
