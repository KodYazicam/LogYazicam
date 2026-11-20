const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SCANNED_DIRS = ["src", "tests", "scripts", "docs"];
const SCANNED_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
  ".txt",
]);

// Assembled from fragments on purpose: a literal key ID in this file would make
// the guard flag itself, and would re-open the secret-scanning alert it prevents.
const LONG_TERM_PREFIX = "AK" + "IA";
const TEMPORARY_PREFIX = "AS" + "IA";
const AWS_KEY_ID = new RegExp(
  `\\b(?:${LONG_TERM_PREFIX}|${TEMPORARY_PREFIX})[0-9A-Z]{16}\\b`,
);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCANNED_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(full);
  }
  return files;
}

test("the AWS key-ID guard detects both prefixes and ignores prose", () => {
  assert.match(`${LONG_TERM_PREFIX}1234567890ABCDEF`, AWS_KEY_ID);
  assert.match(`${TEMPORARY_PREFIX}1234567890ABCDEF`, AWS_KEY_ID);
  assert.doesNotMatch("AKIA and ASIA are words, not keys", AWS_KEY_ID);
});

test("no literal AWS access key IDs in shipped or test sources", () => {
  const hits = [];
  for (const dir of SCANNED_DIRS) {
    const root = path.join(ROOT, dir);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (AWS_KEY_ID.test(line)) {
          hits.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(
    hits,
    [],
    `literal AWS access key IDs would trigger secret scanning:\n${hits.join("\n")}`,
  );
});
