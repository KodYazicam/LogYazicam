const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const scripts = JSON.parse(read("package.json")).scripts;

function flag(name) {
  const match = scripts["test:coverage"].match(
    new RegExp(`--${name}=(?:"([^"]+)"|'([^']+)'|(\\S+))`),
  );
  return match ? match[1] || match[2] || match[3] : null;
}

test("test:coverage enables Node's native coverage reporter", () => {
  assert.match(scripts["test:coverage"], /^node --test\s/);
  assert.match(scripts["test:coverage"], /--experimental-test-coverage\b/);
});

test("test:coverage measures src only so the tests cannot inflate the score", () => {
  // Quoting keeps the shell from expanding src/** into directory names.
  assert.equal(flag("test-coverage-include"), "src/**");
});

test("test:coverage enforces the source floors", () => {
  assert.equal(flag("test-coverage-lines"), "94");
  assert.equal(flag("test-coverage-branches"), "80");
  assert.equal(flag("test-coverage-functions"), "90");
});

test("plain npm test still runs the suite without coverage flags", () => {
  assert.equal(scripts.test, "node --test");
});

test("CI runs the coverage gate on Node 22", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /name: Coverage \(Node 22\)/);
  assert.match(workflow, /if: matrix\.node-version == 22/);
  assert.match(workflow, /run: npm run test:coverage/);
});
