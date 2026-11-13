const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { GatewayIntentBits } = require("discord.js");
const { buildIntents } = require("./intents");

const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;

function result(name, status, message) {
  return { name, status, message };
}

function defaultDatabasePath(env) {
  return env.DATABASE_PATH || "./data/logyazicam.sqlite";
}

function checkNode(version = process.versions.node) {
  const clean = String(version || "").replace(/^v/i, "");
  const major = Number(clean.split(".")[0]);
  if (!Number.isInteger(major)) {
    return result("node", FAIL, `Cannot parse Node version "${version}".`);
  }
  if (major < 22) {
    return result("node", FAIL, `Node ${clean} is too old; LogYazicam 2.x requires Node >= 22.`);
  }
  return result("node", PASS, `Node ${clean} (>= 22).`);
}

function checkToken(env = process.env) {
  let token = String(env.TOKEN || "").trim();
  let botPrefix = false;
  if (/^Bot\s+/i.test(token)) {
    botPrefix = true;
    token = token.replace(/^Bot\s+/i, "").trim();
  }
  if (!token) {
    return result("token", FAIL, "TOKEN is missing; set it in .env or the environment.");
  }
  if (!TOKEN_SHAPE.test(token)) {
    return result("token", FAIL, "TOKEN is not shaped like a Discord bot token (three dot-separated parts).");
  }
  let note = "";
  try {
    const id = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    if (!/^\d{10,}$/.test(id)) note = " The first segment does not decode to a numeric application id.";
  } catch {
    // The shape check above is enough; decoding is only a hint.
  }
  if (botPrefix) {
    return result("token", WARN, `TOKEN is valid but starts with "Bot "; store the raw token only.${note}`);
  }
  return result("token", PASS, `TOKEN is present and shaped like a Discord bot token.${note}`);
}

function checkIntents(env = process.env) {
  const raw = env.PRESENCE_INTENT;
  const normalized = raw == null ? "" : String(raw).trim().toLowerCase();
  const presence = TRUTHY.has(normalized);
  if (normalized && !presence && !FALSY.has(normalized)) {
    return result(
      "intents",
      WARN,
      `PRESENCE_INTENT="${raw}" is not a boolean; it is treated as false. Use true or false.`,
    );
  }

  const intents = buildIntents({ presenceIntent: presence });
  const required = [
    ["GuildMembers", GatewayIntentBits.GuildMembers],
    ["MessageContent", GatewayIntentBits.MessageContent],
  ];
  const missing = required.filter(([, bit]) => !intents.includes(bit)).map(([name]) => name);
  if (missing.length) {
    return result("intents", FAIL, `buildIntents is missing required intents: ${missing.join(", ")}.`);
  }
  const names = ["GuildMembers", "MessageContent"];
  if (presence) names.push("Presence");
  return result(
    "intents",
    PASS,
    `${names.join(" + ")} requested. Enable the same privileged intents in the Discord Developer Portal.`,
  );
}

function nearestExistingDirectory(start) {
  let current = start;
  while (true) {
    try {
      return fs.statSync(current).isDirectory() ? current : null;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function checkDataDir({ cwd = process.cwd(), env = process.env, platform = process.platform } = {}) {
  const dbPath = path.resolve(cwd, defaultDatabasePath(env));
  const dir = path.dirname(dbPath);

  let stat;
  try {
    stat = fs.statSync(dir);
  } catch (error) {
    if (error.code !== "ENOENT") {
      return result("data", FAIL, `Cannot inspect ${dir}: ${error.message}`);
    }
    const parent = nearestExistingDirectory(dir);
    if (!parent) {
      return result("data", FAIL, `Cannot create ${dir}: no existing parent directory.`);
    }
    try {
      fs.accessSync(parent, fs.constants.W_OK);
    } catch {
      return result("data", FAIL, `Cannot create ${dir}: ${parent} is not writable.`);
    }
    return result("data", PASS, `${dir} does not exist yet and will be created (${parent} is writable).`);
  }

  if (!stat.isDirectory()) {
    return result("data", FAIL, `${dir} exists but is not a directory.`);
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return result("data", FAIL, `${dir} is not writable.`);
  }

  const mode = stat.mode & 0o777;
  const octal = mode.toString(8).padStart(3, "0");
  if (platform !== "win32" && (mode & 0o002)) {
    return result("data", WARN, `${dir} is writable but world-writable (mode ${octal}); run chmod 755 ${dir}.`);
  }
  return result("data", PASS, `${dir} is writable (mode ${octal}).`);
}

function checkDatabase({ cwd = process.cwd(), env = process.env, DatabaseImpl = Database } = {}) {
  const dbPath = path.resolve(cwd, defaultDatabasePath(env));
  let stat;
  try {
    stat = fs.statSync(dbPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return result("sqlite", WARN, `${dbPath} does not exist yet; it is created on first start.`);
    }
    return result("sqlite", FAIL, `Cannot inspect ${dbPath}: ${error.message}`);
  }
  if (!stat.isFile()) {
    return result("sqlite", FAIL, `${dbPath} exists but is not a regular file.`);
  }

  let db;
  try {
    db = new DatabaseImpl(dbPath, { readonly: true, fileMustExist: true });
    const check = db.pragma("integrity_check", { simple: true });
    const text = Array.isArray(check) ? check.join("; ") : String(check);
    if (text !== "ok") {
      return result("sqlite", FAIL, `PRAGMA integrity_check returned: ${text.slice(0, 200)}`);
    }
    return result("sqlite", PASS, `${dbPath} PRAGMA integrity_check = ok.`);
  } catch (error) {
    return result("sqlite", FAIL, `SQLite integrity check failed for ${dbPath}: ${error.message}`);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Closing a failed handle must not hide the original check.
      }
    }
  }
}

function checkEnvFile({ cwd = process.cwd(), platform = process.platform } = {}) {
  const file = path.join(cwd, ".env");
  let link;
  let stat;
  try {
    link = fs.lstatSync(file);
    stat = fs.statSync(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return result("env", WARN, `No .env at ${file}; using variables from the environment.`);
    }
    return result("env", FAIL, `Cannot inspect ${file}: ${error.message}`);
  }

  const mode = stat.mode & 0o777;
  const octal = mode.toString(8).padStart(3, "0");
  const symlink = link.isSymbolicLink() ? " (symlink)" : "";
  if (platform === "win32") {
    return result("env", PASS, `${file} exists${symlink}; permission bits are not enforced on Windows.`);
  }
  if (mode & 0o077) {
    return result(
      "env",
      WARN,
      `${file}${symlink} is accessible by group/others (mode ${octal}); run chmod 600 .env.`,
    );
  }
  return result("env", PASS, `${file}${symlink} mode ${octal}.`);
}

function runDoctor({
  cwd = process.cwd(),
  env = process.env,
  nodeVersion = process.versions.node,
  platform = process.platform,
  DatabaseImpl = Database,
} = {}) {
  const safely = (name, check) => {
    try {
      return check();
    } catch (error) {
      return result(name, FAIL, `Check crashed: ${error.message}`);
    }
  };
  return [
    safely("node", () => checkNode(nodeVersion)),
    safely("token", () => checkToken(env)),
    safely("intents", () => checkIntents(env)),
    safely("data", () => checkDataDir({ cwd, env, platform })),
    safely("sqlite", () => checkDatabase({ cwd, env, DatabaseImpl })),
    safely("env", () => checkEnvFile({ cwd, platform })),
  ];
}

function exitCode(results) {
  return results.some((item) => item.status === FAIL) ? 1 : 0;
}

function formatResults(results) {
  return results
    .map((item) => `${item.status.padEnd(4)} ${item.name.padEnd(9)} ${item.message}`)
    .join("\n");
}

function summarize(results) {
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const item of results) counts[item.status] += 1;
  const warnings = counts.WARN === 1 ? "warning" : "warnings";
  return `${counts.PASS} passed, ${counts.WARN} ${warnings}, ${counts.FAIL} failed`;
}

module.exports = {
  PASS,
  WARN,
  FAIL,
  checkNode,
  checkToken,
  checkIntents,
  checkDataDir,
  checkDatabase,
  checkEnvFile,
  runDoctor,
  exitCode,
  formatResults,
  summarize,
};
