const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function writeFileSink(dir, guildId, eventKey, payload) {
  if (!dir) return false;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const folder = path.join(dir, guildId);
    fs.mkdirSync(folder, { recursive: true });
    const line = JSON.stringify({ at: Date.now(), eventKey, ...payload }) + "\n";
    fs.appendFile(path.join(folder, `${day}.jsonl`), line, () => {});
    return true;
  } catch {
    // An optional sink must never break Discord delivery.
    return false;
  }
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

module.exports = { writeFileSink, postHttpSink };
