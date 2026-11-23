const fs = require("fs");
const path = require("path");

function loadPacks() {
  const packs = {};
  for (const file of fs.readdirSync(__dirname)) {
    if (!file.endsWith(".js") || file === "index.js") continue;
    const code = file.slice(0, -3);
    const full = path.join(__dirname, file);
    delete require.cache[require.resolve(full)];
    packs[code] = require(full);
  }
  return packs;
}

let PACKS = loadPacks();
let LOCALES = Object.keys(PACKS);

function reloadLocales() {
  PACKS = loadPacks();
  LOCALES = Object.keys(PACKS);
  return LOCALES;
}

function t(locale, key, vars = {}, overrides = {}) {
  const override = overrides?.[key];
  // Discord rejects empty embed titles and field names (1-256 characters), and
  // buildEmbed throws before a send when a title is empty. An empty override
  // therefore means "unset" so the pack value can be used. The credit footer is
  // the one exception: buildEmbed filters an empty credit out, which is the
  // documented way to hide it.
  if (typeof override === "string" && (override.length > 0 || key === "bot.credit")) {
    let text = override;
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, value == null ? "—" : String(value));
    }
    return text;
  }
  const pack = PACKS[locale] || PACKS.en;
  let text = pack?.[key] ?? PACKS.en?.[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, value == null ? "—" : String(value));
  }
  return text;
}

module.exports = { get PACKS() { return PACKS; }, get LOCALES() { return LOCALES; }, t, reloadLocales };
