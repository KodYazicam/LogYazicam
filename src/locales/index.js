const en = require("./en");
const tr = require("./tr");
const de = require("./de");
const fr = require("./fr");
const es = require("./es");

const PACKS = { en, tr, de, fr, es };
const LOCALES = Object.keys(PACKS);

function t(locale, key, vars = {}) {
  const pack = PACKS[locale] || PACKS.en;
  let text = pack[key] ?? PACKS.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, value == null ? "—" : String(value));
  }
  return text;
}

module.exports = { PACKS, LOCALES, t };
