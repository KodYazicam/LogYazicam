const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createBoundedCache } = require("../src/boundedCache");

test("evicts the oldest entry in FIFO order", () => {
  let clock = 0;
  const evicted = [];
  const cache = createBoundedCache({
    max: 2,
    now: () => clock,
    onEvict: (value, key) => evicted.push([key, value]),
  });

  cache.set("a", 1);
  clock += 1;
  cache.set("b", 2);
  clock += 1;
  cache.set("c", 3);

  assert.deepEqual(cache.keys(), ["b", "c"]);
  assert.equal(cache.get("a"), undefined);
  assert.deepEqual(evicted, [["a", 1]]);
});

test("refreshing a key moves it behind older keys without evicting it", () => {
  const evicted = [];
  const cache = createBoundedCache({
    max: 3,
    now: () => 0,
    onEvict: (value, key) => evicted.push([key, value]),
  });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  assert.deepEqual(evicted, []);
  cache.set("c", 4);
  cache.set("d", 5);

  assert.deepEqual(cache.keys(), ["a", "c", "d"]);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 3);
  assert.deepEqual(evicted, [["b", 2]]);
});

test("expires entries after their TTL and reports eviction once", () => {
  let clock = 0;
  const evicted = [];
  const cache = createBoundedCache({
    max: 10,
    ttlMs: 100,
    now: () => clock,
    onEvict: (value, key) => evicted.push([key, value]),
  });

  cache.set("a", 1);
  clock = 99;
  assert.equal(cache.get("a"), 1);
  clock = 100;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
  assert.deepEqual(evicted, [["a", 1]]);
});

test("TTL zero keeps entries until the cap evicts them", () => {
  let clock = 0;
  const cache = createBoundedCache({ max: 2, ttlMs: 0, now: () => clock });
  cache.set("a", 1);
  clock = 10 * 60 * 1000;
  assert.equal(cache.get("a"), 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.deepEqual(cache.keys(), ["b", "c"]);
});

test("rejects invalid limits and hooks", () => {
  for (const max of [0, -1, 1.5, Infinity, "2", undefined]) {
    assert.throws(() => createBoundedCache({ max }), /max must be a positive integer/);
  }
  for (const ttlMs of [-1, Infinity, NaN, "100"]) {
    assert.throws(() => createBoundedCache({ max: 1, ttlMs }), /ttlMs must be a non-negative number/);
  }
  assert.throws(() => createBoundedCache({ max: 1, now: 1 }), /now must be a function/);
  assert.throws(() => createBoundedCache({ max: 1, onEvict: 1 }), /onEvict must be a function/);
});

test("interleaved async updates stay within the cap", async () => {
  const cache = createBoundedCache({ max: 3, now: () => 0 });
  await Promise.all(
    Array.from({ length: 50 }, async (_, index) => {
      cache.set(`k${index}`, index);
      await Promise.resolve();
      cache.get(`k${index}`);
    }),
  );

  assert.equal(cache.size, 3);
  assert.deepEqual(cache.keys(), ["k47", "k48", "k49"]);
});
