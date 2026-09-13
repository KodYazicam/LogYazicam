const fs = require("fs");
const path = require("path");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function createLogger(env) {
  const levelName = String(env.LOG_LEVEL || "info").toLowerCase();
  const level = LEVELS[levelName] ?? 2;
  const file = env.LOG_FILE ? path.resolve(env.LOG_FILE) : null;
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true });

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
  };
}

module.exports = { createLogger, LEVELS };
