// In-memory admin sessions with sliding expiration, plus cookie helpers.
// Sessions do not survive a restart by design: single admin, low stakes.
const crypto = require('crypto');
const { PROD, SESSION_TTL, SESSION_COOKIE } = require('../config');

const sessions = new Map(); // token → expiresAt

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function isSessionValid(token) {
  if (!token || !sessions.has(token)) return false;
  if (Date.now() > sessions.get(token)) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL); // sliding expiration
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

setInterval(
  () => {
    const now = Date.now();
    for (const [t, exp] of sessions) if (now > exp) sessions.delete(t);
  },
  10 * 60 * 1000
).unref();

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function sessionCookie(token, maxAgeMs) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (PROD) parts.push('Secure');
  return parts.join('; ');
}

const sessionTokenFrom = (req) => getCookie(req, SESSION_COOKIE);

module.exports = { createSession, isSessionValid, destroySession, sessionCookie, sessionTokenFrom };
