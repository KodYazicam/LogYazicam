const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { writeFileSink, postHttpSink } = require("../src/sinks");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logyazicam-sinks-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("writeFileSink returns false instead of throwing on a blocked directory", (t) => {
  const dir = tempDir(t);
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "not a directory");

  assert.doesNotThrow(() => {
    const ok = writeFileSink(blocker, "g1", "messageDelete", { summary: "x" });
    assert.equal(ok, false);
  });
});

test("writeFileSink returns false when no directory is configured", () => {
  assert.equal(writeFileSink("", "g1", "messageDelete", {}), false);
});

test("writeFileSink appends one JSONL record under the guild and day", async (t) => {
  const dir = tempDir(t);
  assert.equal(writeFileSink(dir, "g1", "messageDelete", { summary: "x", userId: "u1" }), true);

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, "g1", `${day}.jsonl`);
  let text = "";
  for (let i = 0; i < 50 && !text; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      // appendFile is asynchronous; retry briefly.
    }
  }

  assert.ok(text.endsWith("\n"));
  const line = JSON.parse(text.trim());
  assert.equal(typeof line.at, "number");
  assert.equal(line.eventKey, "messageDelete");
  assert.equal(line.summary, "x");
  assert.equal(line.userId, "u1");
});

test("postHttpSink ignores empty and invalid URLs", () => {
  assert.doesNotThrow(() => postHttpSink("", { eventKey: "messageDelete" }));
  assert.doesNotThrow(() => postHttpSink("not a url", { eventKey: "messageDelete" }));
});

test("postHttpSink swallows connection errors", async (t) => {
  const server = http.createServer((req) => req.socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  await new Promise((resolve) => {
    postHttpSink(`http://127.0.0.1:${port}/hook`, { eventKey: "messageDelete" });
    setTimeout(resolve, 100);
  });
});

test("postHttpSink posts JSON to an HTTP endpoint", async (t) => {
  let resolveRequest;
  const received = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(204);
      res.end();
      resolveRequest({
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  postHttpSink(`http://127.0.0.1:${port}/hook`, {
    eventKey: "messageDelete",
    summary: "x",
  });
  const request = await received;

  assert.equal(request.method, "POST");
  assert.equal(request.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), {
    eventKey: "messageDelete",
    summary: "x",
  });
});
