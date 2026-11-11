const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePrefix, fakeInteraction } = require("../src/prefix");

test("parsePrefix requires prefix + log", () => {
  assert.equal(parsePrefix("hello", "!"), null);
  assert.deepEqual(parsePrefix("!log status", "!"), ["status"]);
  assert.deepEqual(parsePrefix("!log event on key:messageDelete", "!"), [
    "event",
    "on",
    "key:messageDelete",
  ]);
  assert.equal(parsePrefix("!help", "!"), null);
  assert.deepEqual(parsePrefix("?audit status", "?", "audit"), ["status"]);
  assert.equal(parsePrefix("!log status", "!", "audit"), null);
});

function fake(tokens) {
  return fakeInteraction(
    {
      guild: { channels: { cache: new Map() }, roles: { cache: new Map() } },
      channel: {},
      author: {},
      member: {},
    },
    tokens,
  );
}

test("prefix integer options reject fractional, infinite, and empty values", () => {
  for (const value of ["2.5", "abc", "Infinity", ""]) {
    assert.equal(fake([`limit:${value}`]).options.getInteger("limit"), null, value);
  }
  assert.equal(fake(["limit:50"]).options.getInteger("limit"), 50);
  assert.equal(fake(["limit:-5"]).options.getInteger("limit"), -5);
});

test("prefix options work after the subcommand and keep positional tokens", () => {
  const set = fake(["set", "name:quiet_days", "value:mon,tue"]);
  assert.equal(set.options.getSubcommand(), "set");
  assert.equal(set.options.getString("name"), "quiet_days");
  assert.equal(set.options.getString("value"), "mon,tue");

  const group = fake(["group", "on", "name:voice", "channel:#123"]);
  assert.equal(group.options.getSubcommandGroup(), "group");
  assert.equal(group.options.getSubcommand(), "on");
  assert.equal(group.options.getString("name"), "voice");
  assert.equal(group.options.getChannel("channel").id, "123");

  const event = fake(["event", "on", "key:messageDelete", "channel:#456"]);
  assert.equal(event.options.getSubcommandGroup(), "event");
  assert.equal(event.options.getSubcommand(), "on");
  assert.equal(event.options.getString("key"), "messageDelete");
  assert.equal(event.options.getChannel("channel").id, "456");
});

test("prefix URL values are not mistaken for new options", () => {
  const url = fake(["set", "name:webhook_avatar", "value:https://example.com/a.png"]);
  assert.equal(url.options.getString("name"), "webhook_avatar");
  assert.equal(url.options.getString("value"), "https://example.com/a.png");
});
