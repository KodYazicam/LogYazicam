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

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return server;
}

function portOf(server) {
  return server.address().port;
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
  await new Promise((resolve, reject) => {
    const ok = writeFileSink(dir, "g1", "messageDelete", { summary: "x", userId: "u1" }, (error) => {
      if (error) reject(error);
      else resolve();
    });
    assert.equal(ok, true);
  });

  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, "g1", `${day}.jsonl`);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.endsWith("\n"));
  const line = JSON.parse(text.trim());
  assert.equal(typeof line.at, "number");
  assert.equal(line.eventKey, "messageDelete");
  assert.equal(line.summary, "x");
  assert.equal(line.userId, "u1");
});

test("postHttpSink ignores empty and invalid URLs", async () => {
  await new Promise((resolve) => {
    postHttpSink("", { eventKey: "messageDelete" }, (error) => {
      assert.equal(error, null);
      resolve();
    });
  });
  await new Promise((resolve) => {
    postHttpSink("not a url", { eventKey: "messageDelete" }, (error) => {
      assert.ok(error);
      resolve();
    });
  });
});

test("postHttpSink swallows connection errors", async (t) => {
  let received;
  const requestSeen = new Promise((resolve) => {
    received = resolve;
  });
  const server = await listen(t, (req) => {
    received();
    req.socket.destroy();
  });

  const error = await new Promise((resolve) => {
    postHttpSink(`http://127.0.0.1:${portOf(server)}/hook`, { eventKey: "messageDelete" }, resolve);
  });
  await requestSeen;

  assert.ok(error, "the client error reaches the optional completion callback");
});

test("postHttpSink posts JSON to an HTTP endpoint", async (t) => {
  let resolveRequest;
  const received = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const server = await listen(t, (req, res) => {
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

  const completed = new Promise((resolve, reject) => {
    postHttpSink(
      `http://127.0.0.1:${portOf(server)}/hook`,
      { eventKey: "messageDelete", summary: "x" },
      (error) => (error ? reject(error) : resolve()),
    );
  });
  const request = await received;
  await completed;

  assert.equal(request.method, "POST");
  assert.equal(request.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), {
    eventKey: "messageDelete",
    summary: "x",
  });
});
