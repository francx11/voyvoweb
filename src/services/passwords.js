// Admin password storage and verification (data/auth.json, outside git).
// Supported formats: { sha256: "<hex>" } (legacy) or { scrypt: { salt, hash } }.
const crypto = require('crypto');
const { readJSON, writeJSON } = require('../lib/json-store');

const AUTH_FILE = 'auth.json';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function scryptRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { scrypt: { salt, hash } };
}

// Creates auth.json on first boot: from env if provided, otherwise a
// well-known default that the panel prompts to change.
function initAuth() {
  let auth = readJSON(AUTH_FILE, null);
  if (auth && (auth.sha256 || auth.scrypt)) return auth;
  if (process.env.ADMIN_PASSWORD_HASH) {
    auth = { sha256: process.env.ADMIN_PASSWORD_HASH };
  } else if (process.env.ADMIN_PASSWORD) {
    auth = scryptRecord(process.env.ADMIN_PASSWORD);
  } else {
    auth = { sha256: sha256('admin1234') };
    console.log('');
    console.log('  ⚠️  Default password: admin1234');
    console.log('  👉  Change it from the admin panel → Configuración');
    console.log('');
  }
  writeJSON(AUTH_FILE, auth);
  return auth;
}

function verifyPassword(password) {
  const auth = readJSON(AUTH_FILE, {});
  if (auth.scrypt) {
    const h = crypto.scryptSync(password, auth.scrypt.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(auth.scrypt.hash));
  }
  if (auth.sha256) {
    return crypto.timingSafeEqual(Buffer.from(sha256(password)), Buffer.from(auth.sha256));
  }
  return false;
}

function setPassword(newPassword) {
  writeJSON(AUTH_FILE, scryptRecord(newPassword));
}

module.exports = { initAuth, verifyPassword, setPassword };
