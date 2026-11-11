const fs = require("fs");
const path = require("path");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

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
      .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : JSON.stringify(a)))
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
