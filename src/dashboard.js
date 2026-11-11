const http = require("http");
const crypto = require("crypto");

const MAX_LIMIT = 500;

const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

function isLoopback(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function tokenMatches(expected, header) {
  if (!expected) return true;
  const want = Buffer.from(`Bearer ${expected}`, "utf8");
  const got = Buffer.from(String(header || ""), "utf8");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function eventRow(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch {
    payload = {};
  }
  return {
    guildId: row.guild_id,
    eventKey: row.event_key,
    at: row.created_at,
    channelId: typeof payload.channelId === "string" ? payload.channelId : null,
    summary: typeof payload.summary === "string" ? payload.summary.slice(0, 500) : row.event_key,
  };
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LogYazicam · Recent events</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { margin: 0 auto; max-width: 1100px; padding: 24px; line-height: 1.45; }
  h1 { margin: 0 0 4px; font-size: 1.5rem; }
  p { margin: 0 0 18px; opacity: .75; }
  form { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 16px; }
  label { display: grid; gap: 4px; font-size: .85rem; }
  input { padding: 6px 8px; border: 1px solid #888; border-radius: 6px; }
  input[type=number] { width: 90px; }
  button { padding: 7px 14px; border: 0; border-radius: 6px; background: #5865f2; color: #fff; cursor: pointer; }
  #status { font-size: .85rem; opacity: .8; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #8884; vertical-align: top; }
  th { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
  td.summary { overflow-wrap: anywhere; }
  .empty { padding: 24px 8px; opacity: .7; }
</style>
</head>
<body>
<h1>LogYazicam</h1>
<p>Read-only recent events from SQLite history. This page cannot change the bot.</p>
<form id="controls">
  <label>Token <input id="token" type="password" autocomplete="off" placeholder="only if configured"></label>
  <label>Limit <input id="limit" type="number" min="1" max="${MAX_LIMIT}" value="50"></label>
  <button type="submit">Refresh</button>
  <span id="status" role="status"></span>
</form>
<table>
  <thead><tr><th>Time</th><th>Guild</th><th>Event</th><th>Channel</th><th>Summary</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<script>
(function () {
  var form = document.getElementById("controls");
  var tokenInput = document.getElementById("token");
  var limitInput = document.getElementById("limit");
  var status = document.getElementById("status");
  var rows = document.getElementById("rows");
  tokenInput.value = sessionStorage.getItem("logyazicam-token") || "";

  function cell(text) {
    var td = document.createElement("td");
    td.textContent = text == null || text === "" ? "—" : String(text);
    return td;
  }

  async function load() {
    var token = tokenInput.value.trim();
    sessionStorage.setItem("logyazicam-token", token);
    var limit = Math.max(1, Math.min(${MAX_LIMIT}, Number(limitInput.value) || 50));
    limitInput.value = limit;
    status.textContent = "Loading…";
    var headers = token ? { authorization: "Bearer " + token } : {};
    try {
      var response = await fetch("/api/events?limit=" + encodeURIComponent(limit), { headers: headers });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var data = await response.json();
      rows.replaceChildren();
      if (!data.events.length) {
        var empty = document.createElement("tr");
        var td = document.createElement("td");
        td.colSpan = 5;
        td.className = "empty";
        td.textContent = "No stored events yet.";
        empty.appendChild(td);
        rows.appendChild(empty);
      }
      for (var event of data.events) {
        var tr = document.createElement("tr");
        tr.appendChild(cell(new Date(event.at).toLocaleString()));
        tr.appendChild(cell(event.guildId));
        tr.appendChild(cell(event.eventKey));
        tr.appendChild(cell(event.channelId));
        var summary = cell(event.summary);
        summary.className = "summary";
        tr.appendChild(summary);
        rows.appendChild(tr);
      }
      status.textContent = data.events.length + " event(s)";
    } catch (error) {
      status.textContent = "Failed: " + error.message;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    load();
  });
  load();
})();
</script>
</body>
</html>`;
}

function send(res, status, body, contentType, headers = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": CSP,
    ...headers,
  });
  res.end(body);
}

function json(res, status, body, headers) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8", headers);
}

function createDashboard({ db, processCfg, log }) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (req.method !== "GET") {
        return json(res, 405, { error: "method not allowed" }, { allow: "GET" });
      }
      if (url.pathname === "/") {
        return send(res, 200, page(), "text/html; charset=utf-8");
      }
      if (url.pathname !== "/api/health" && url.pathname !== "/api/events") {
        return json(res, 404, { error: "not found" });
      }
      if (!tokenMatches(processCfg.dashboardToken, req.headers.authorization)) {
        return json(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
      }
      if (url.pathname === "/api/health") {
        return json(res, 200, {
          ok: true,
          guilds: db.listGuilds.all().length,
          events: db.historyCount(),
        });
      }

      const guildId = String(url.searchParams.get("guildId") || "");
      if (guildId && !/^[0-9]{1,32}$/.test(guildId)) {
        return json(res, 400, { error: "invalid guildId" });
      }
      const rawConfigured = Number(processCfg.dashboardLimit);
      const configured = Number.isInteger(rawConfigured) && rawConfigured > 0
        ? Math.min(rawConfigured, MAX_LIMIT)
        : 50;
      const requested = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : configured;
      const limit = Number.isInteger(requested) && requested > 0
        ? Math.min(requested, MAX_LIMIT)
        : configured;
      const events = db.recentHistory(limit, guildId).map(eventRow);
      return json(res, 200, { events, count: events.length, limit });
    } catch (error) {
      if (log) log.error("dashboard request", error);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else res.end();
    }
  });

  function start(port = processCfg.dashboardPort, host = processCfg.dashboardHost) {
    return new Promise((resolve, reject) => {
      if (!isLoopback(host) && !processCfg.dashboardToken) {
        reject(new Error("DASHBOARD_TOKEN is required when DASHBOARD_HOST is not loopback"));
        return;
      }
      const value = Number(port);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        reject(new Error("invalid DASHBOARD_PORT"));
        return;
      }
      const onError = (error) => reject(error);
      server.once("error", onError);
      server.listen(value, host, () => {
        server.off("error", onError);
        resolve(server.address());
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    });
  }

  return { server, start, close };
}

module.exports = { createDashboard, isLoopback, tokenMatches, eventRow, MAX_LIMIT };
