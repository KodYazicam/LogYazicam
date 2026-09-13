const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function writeFileSink(dir, guildId, eventKey, payload) {
  if (!dir) return;
  const day = new Date().toISOString().slice(0, 10);
  const folder = path.join(dir, guildId);
  fs.mkdirSync(folder, { recursive: true });
  const line = JSON.stringify({ at: Date.now(), eventKey, ...payload }) + "\n";
  fs.appendFile(path.join(folder, `${day}.jsonl`), line, () => {});
}

function postHttpSink(url, body) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(parsed, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      res.resume();
    });
    req.on("error", () => {});
    req.setTimeout(5000, () => req.destroy());
    req.end(JSON.stringify(body));
  } catch {
    // invalid URL — ignore
  }
}

function backupSqlite(src, destDir) {
  if (!destDir || !src) return;
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFile(src, path.join(destDir, `logyazicam-${stamp}.sqlite`), () => {});
}

module.exports = { writeFileSink, postHttpSink, backupSqlite };
