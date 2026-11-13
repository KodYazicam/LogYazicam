function createBoundedCache({ max, ttlMs = 0, now = Date.now, onEvict } = {}) {
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError("max must be a positive integer");
  }
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new RangeError("ttlMs must be a non-negative number");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (onEvict != null && typeof onEvict !== "function") {
    throw new TypeError("onEvict must be a function");
  }

  const entries = new Map();
  const expired = (entry, at) => ttlMs > 0 && at - entry.at >= ttlMs;
  const evict = (key, entry) => {
    entries.delete(key);
    if (onEvict) onEvict(entry.value, key);
  };

  function prune(at = now()) {
    for (const [key, entry] of entries) {
      if (!expired(entry, at)) break;
      evict(key, entry);
    }
    return entries.size;
  }

  function get(key, at = now()) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (expired(entry, at)) {
      evict(key, entry);
      return undefined;
    }
    return entry.value;
  }

  function has(key, at = now()) {
    const entry = entries.get(key);
    if (!entry) return false;
    if (expired(entry, at)) {
      evict(key, entry);
      return false;
    }
    return true;
  }

  function set(key, value, at = now()) {
    if (entries.has(key)) entries.delete(key);
    entries.set(key, { value, at });
    while (entries.size > max) {
      const oldestKey = entries.keys().next().value;
      evict(oldestKey, entries.get(oldestKey));
    }
    return value;
  }

  function remove(key) {
    return entries.delete(key);
  }

  function clear() {
    for (const [key, entry] of entries) {
      if (onEvict) onEvict(entry.value, key);
    }
    entries.clear();
  }

  function keys(at = now()) {
    prune(at);
    return [...entries.keys()];
  }

  function values(at = now()) {
    prune(at);
    return [...entries.values()].map((entry) => entry.value);
  }

  return {
    get,
    set,
    has,
    delete: remove,
    clear,
    prune,
    keys,
    values,
    get size() {
      return prune();
    },
    max,
    ttlMs,
  };
}

module.exports = { createBoundedCache };
