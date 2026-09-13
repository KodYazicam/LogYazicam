const PACKS = {
  moderation: ["guildBanAdd", "guildBanRemove", "guildMemberTimeout", "guildMemberRemove", "guildAuditLogEntryCreate"],
  voice: ["voiceJoin", "voiceLeave", "voiceMove", "voiceServerMute", "voiceServerDeafen"],
  message: ["messageDelete", "messageUpdate", "messageDeleteBulk", "messagePin", "messageUnpin"],
  server: ["channelCreate", "channelDelete", "channelUpdate", "roleCreate", "roleDelete", "roleUpdate", "guildUpdate", "guildUnavailable"],
  quiet: ["guildBanAdd", "guildMemberTimeout", "messageDelete", "guildUnavailable"],
};

function applyPack(db, guildId, name, channelId) {
  const keys = PACKS[name];
  if (!keys) return null;
  for (const key of keys) db.setRoute(guildId, key, { enabled: true, channelId });
  return keys;
}

module.exports = { PACKS, applyPack };
