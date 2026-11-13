#!/usr/bin/env node
const path = require("path");
const { loadEnvFile } = require("./config");
const { runDoctor, formatResults, summarize, exitCode } = require("./doctor");

const USAGE = "Usage: logyazicam doctor";

function main(argv = process.argv.slice(2), { cwd = process.cwd(), stdout = console.log, stderr = console.error } = {}) {
  const command = argv[0] || "doctor";
  if (command === "doctor") {
    const env = loadEnvFile(path.join(cwd, ".env"));
    const results = runDoctor({ cwd, env });
    stdout("LogYazicam doctor");
    stdout(formatResults(results));
    stdout(summarize(results));
    return exitCode(results);
  }
  if (command === "help" || command === "--help" || command === "-h") {
    stdout(USAGE);
    return 0;
  }
  stderr(`Unknown command: ${command}`);
  stderr(USAGE);
  return 2;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, USAGE };
