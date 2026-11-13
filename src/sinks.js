const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function writeFileSink(dir, guildId, eventKey, payload, done) {
  if (!dir) return false;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const folder = path.join(dir, guildId);
    fs.mkdirSync(folder, { recursive: true });
    const line = JSON.stringify({ at: Date.now(), eventKey, ...payload }) + "\n";
    fs.appendFile(path.join(folder, `${day}.jsonl`), line, (error) => {
      if (typeof done === "function") done(error || null);
    });
    return true;
  } catch {
    // An optional sink must never break Discord delivery.
    return false;
  }
}

function postHttpSink(url, body, done) {
  const finish = typeof done === "function" ? done : () => {};
  if (!url) {
    finish(null);
    return;
  }
  try {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      finish(error || null);
    };
    const req = lib.request(parsed, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      res.resume();
    });
    req.on("error", (error) => settle(error));
    req.on("close", () => settle(null));
    req.setTimeout(5000, () => req.destroy(new Error("sink timeout")));
    req.end(JSON.stringify(body));
  } catch (error) {
    // invalid URL — ignore for callers, but let an optional test hook observe it
    finish(error);
  }
}

module.exports = { writeFileSink, postHttpSink };
