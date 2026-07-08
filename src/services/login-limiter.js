// Per-IP login rate limiting (in-memory).
// Requires `trust proxy` in production so req.ip is the real client, not the proxy.
const { LOGIN_MAX_FAILS, LOGIN_WINDOW } = require('../config');

const fails = new Map(); // ip → { count, first }

function isLimited(ip) {
  const rec = fails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW) {
    fails.delete(ip);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILS;
}

function registerFail(ip) {
  const rec = fails.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW) {
    fails.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

function clear(ip) {
  fails.delete(ip);
}

setInterval(
  () => {
    const now = Date.now();
    for (const [ip, rec] of fails) if (now - rec.first > LOGIN_WINDOW) fails.delete(ip);
  },
  10 * 60 * 1000
).unref();

module.exports = { isLimited, registerFail, clear };
