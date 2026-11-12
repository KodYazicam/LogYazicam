const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const roots = ["src", "tests", "scripts"];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
}

for (const name of roots) {
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) walk(dir);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(result.stderr || `syntax check failed: ${file}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`${failed} file(s) failed the syntax check.\n`);
  process.exit(1);
}
console.log(`syntax ok: ${files.length} file(s)`);
