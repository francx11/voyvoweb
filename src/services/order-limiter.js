// Per-IP cap on order creation (in-memory), mirroring login-limiter.
// Counts every accepted attempt: creating orders is cheap for an attacker
// and each one writes to disk and rings the kitchen.
const { ORDER_MAX_FAILS, ORDER_WINDOW } = require('../config');

const hits = new Map(); // ip → { count, first }

function isLimited(ip) {
  const rec = hits.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > ORDER_WINDOW) {
    hits.delete(ip);
    return false;
  }
  return rec.count >= ORDER_MAX_FAILS;
}

function register(ip) {
  const rec = hits.get(ip);
  if (!rec || Date.now() - rec.first > ORDER_WINDOW) {
    hits.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

setInterval(
  () => {
    const now = Date.now();
    for (const [ip, rec] of hits) if (now - rec.first > ORDER_WINDOW) hits.delete(ip);
  },
  10 * 60 * 1000
).unref();

// Test-only escape hatch: the counter is in-memory and keyed by IP, so a
// test file that creates more than ORDER_MAX_FAILS orders from 127.0.0.1
// would otherwise bleed rate-limiting into unrelated later tests.
function _resetForTests() {
  hits.clear();
}

module.exports = { isLimited, register, _resetForTests };
