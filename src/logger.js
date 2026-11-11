const fs = require("fs");
const path = require("path");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function formatValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    try {
      return String(value);
    } catch {
      return "[unloggable]";
    }
  }
}

function createLogger(env = {}) {
  let level = 2;
  let file = null;

  function configure(config = {}) {
    const levelName = String(config.LOG_LEVEL ?? config.logLevel ?? "info").toLowerCase();
    level = LEVELS[levelName] ?? 2;
    const fileValue = config.LOG_FILE ?? config.logFile;
    let nextFile = fileValue ? path.resolve(fileValue) : null;
    if (nextFile) {
      try {
        fs.mkdirSync(path.dirname(nextFile), { recursive: true });
      } catch {
        // Logging must never stop startup; fall back to stdout/stderr only.
        nextFile = null;
      }
    }
    file = nextFile;
    return { level, file };
  }

  configure(env);

  const write = (name, args) => {
    if ((LEVELS[name] ?? 9) > level) return;
    const line = `[${new Date().toISOString()}] ${name.toUpperCase()} ${args
      .map(formatValue)
      .join(" ")}`;
    const stream = name === "error" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
    if (file) {
      try {
        fs.appendFileSync(file, `${line}\n`);
      } catch {
        // never throw from the logger
      }
    }
  };

  return {
    error: (...args) => write("error", args),
    warn: (...args) => write("warn", args),
    info: (...args) => write("info", args),
    debug: (...args) => write("debug", args),
    configure,
  };
}

module.exports = { createLogger, LEVELS };
