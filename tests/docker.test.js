const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("compose uses a named data volume that the image user can write", () => {
  const compose = read("docker-compose.yml");
  const dockerfile = read("Dockerfile");

  assert.match(compose, /logyazicam-data:\/app\/data/);
  assert.match(compose, /^volumes:\s*$/m);
  assert.match(compose, /name:\s*logyazicam-data/);
  assert.doesNotMatch(compose, /\.\/data:\/app\/data/);
  assert.match(compose, /\.\/\.env:\/app\/\.env:ro/);
  assert.match(compose, /ENV_FILE_WINS:\s*"true"/);
  assert.match(compose, /init:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(read(".dockerignore"), /^\.env$/m);

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS deps/);
  assert.match(dockerfile, /COPY --from=deps \/app\/node_modules/);
  assert.doesNotMatch(dockerfile, /npm (?:ci|install) --omit=dev \|\|/);

  const userIndex = dockerfile.indexOf("USER 10001");
  const dataIndex = dockerfile.indexOf("chown -R 10001:10001 /app/data");
  assert.ok(dataIndex !== -1, "Dockerfile must own /app/data");
  assert.ok(dataIndex < userIndex, "chown must run before dropping privileges");
});

test("README Docker quickstart covers start, deploy, logs, and backup", () => {
  const readme = read("README.md");
  for (const command of [
    "docker compose up -d --build",
    "docker compose run --rm logyazicam npm run deploy",
    "docker compose logs -f logyazicam",
    "docker compose cp logyazicam:/app/data",
  ]) {
    assert.ok(readme.includes(command), command);
  }
});
