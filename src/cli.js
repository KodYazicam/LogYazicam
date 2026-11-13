#!/usr/bin/env node
const path = require("path");

const USAGE = [
  "Usage: logyazicam doctor",
  "       logyazicam backup [--out FILE]",
  "       logyazicam restore FILE [--force]",
].join("\n");

function backupUsage() {
  return "Usage: logyazicam backup [--out FILE]";
}

function restoreUsage() {
  return "Usage: logyazicam restore FILE [--force]";
}

function parseBackupArgs(argv) {
  let out = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) return { error: "--out requires a file" };
      out = value;
      index += 1;
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      if (!out) return { error: "--out requires a file" };
    } else {
      return { error: `unknown option: ${arg}` };
    }
  }
  return { out };
}

function parseRestoreArgs(argv) {
  let file = "";
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("-")) {
      return { error: `unknown option: ${arg}` };
    } else if (file) {
      return { error: "only one restore file is accepted" };
    } else {
      file = arg;
    }
  }
  if (!file) return { error: "a restore file is required" };
  return { file, force };
}

async function main(
  argv = process.argv.slice(2),
  { cwd = process.cwd(), stdout = console.log, stderr = console.error, env } = {},
) {
  const command = argv[0] || "doctor";
  if (command === "help" || command === "--help" || command === "-h") {
    stdout(USAGE);
    return 0;
  }

  const resolvedEnv = env === undefined ? require("./config").loadEnvFile(path.join(cwd, ".env")) : env;

  if (command === "doctor") {
    const { runDoctor, formatResults, summarize, exitCode } = require("./doctor");
    const results = runDoctor({ cwd, env: resolvedEnv });
    stdout("LogYazicam doctor");
    stdout(formatResults(results));
    stdout(summarize(results));
    return exitCode(results);
  }

  if (command === "backup") {
    const { backupDatabase } = require("./backupRestore");
    const options = parseBackupArgs(argv.slice(1));
    if (options.error) {
      stderr(backupUsage());
      stderr(options.error);
      return 2;
    }
    try {
      const result = await backupDatabase({ cwd, env: resolvedEnv, out: options.out });
      stdout(`Backup written: ${result.destination}`);
      return 0;
    } catch (error) {
      stderr(`Backup failed: ${error.message}`);
      return 1;
    }
  }

  if (command === "restore") {
    const { restoreDatabase } = require("./backupRestore");
    const options = parseRestoreArgs(argv.slice(1));
    if (options.error) {
      stderr(restoreUsage());
      stderr(options.error);
      return 2;
    }
    try {
      const result = await restoreDatabase({
        cwd,
        env: resolvedEnv,
        file: options.file,
        force: options.force,
      });
      stdout(`Restored: ${result.target} from ${result.source}`);
      if (result.autoBackup) stdout(`Previous database backed up: ${result.autoBackup}`);
      return 0;
    } catch (error) {
      stderr(`Restore failed: ${error.message}`);
      return 1;
    }
  }

  stderr(`Unknown command: ${command}`);
  stderr(USAGE);
  return 2;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  main,
  USAGE,
  parseBackupArgs,
  parseRestoreArgs,
};
