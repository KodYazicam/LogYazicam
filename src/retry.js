const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 1000;

function headerValue(headers, name) {
  if (!headers) return undefined;

  if (typeof headers.get === "function") {
    const value = headers.get(name);
    if (value != null) return value;
  }

  if (headers instanceof Map) {
    for (const [key, value] of headers) {
      if (String(key).toLowerCase() === name) return value;
    }
  }

  if (Array.isArray(headers)) {
    for (let index = 0; index + 1 < headers.length; index += 2) {
      if (String(headers[index]).toLowerCase() === name) return headers[index + 1];
    }
  }

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return headers[key];
  }
  return undefined;
}

function retryAfterHeader(error, name = "retry-after") {
  const carriers = [
    error?.headers,
    error?.response?.headers,
    error?.rawError?.headers,
    error?.cause?.headers,
    error?.request?.headers,
  ];
  for (const headers of carriers) {
    const value = headerValue(headers, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function clampDelay(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.ceil(value), MAX_RETRY_DELAY_MS);
}

function parseRetryAfter(value, now = Date.now()) {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return null;

  if (typeof raw === "number") {
    return clampDelay(raw * 1000);
  }

  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return clampDelay(Number(text) * 1000);
  }
  if (text.startsWith("-")) return null;

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return clampDelay(Math.max(0, timestamp - now));
}

function embeddedRetryAfterMs(error) {
  const direct = error?.retryAfter;
  if (direct != null) {
    const value = Number(direct);
    if (Number.isFinite(value) && value >= 0) {
      const milliseconds = error?.timeToReset != null || String(error?.name || "").startsWith("RateLimitError")
        ? value
        : value * 1000;
      return clampDelay(milliseconds);
    }
  }

  for (const raw of [error?.retry_after, error?.rawError?.retry_after, error?.rawError?.retryAfter]) {
    if (raw == null) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return clampDelay(value * 1000);
  }
  return null;
}

function statusOf(error) {
  const status = Number(error?.httpStatus ?? error?.status ?? error?.response?.status);
  return Number.isInteger(status) && status > 0 ? status : 0;
}

function retryDecision(error, now = Date.now()) {
  const status = statusOf(error);
  const headerDelay = parseRetryAfter(retryAfterHeader(error), now);
  const embeddedDelay = embeddedRetryAfterMs(error);
  const retryable = status === 429 || status === 503 || headerDelay != null || embeddedDelay != null;
  const delayMs = headerDelay != null
    ? headerDelay
    : embeddedDelay != null
      ? embeddedDelay
      : DEFAULT_RETRY_DELAY_MS;
  return { retryable, delayMs, status };
}

module.exports = {
  MAX_RETRY_DELAY_MS,
  DEFAULT_RETRY_DELAY_MS,
  parseRetryAfter,
  retryDecision,
};
