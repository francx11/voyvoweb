require('dotenv').config();

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const GALLERY_DIR = path.join(PUBLIC_DIR, 'assets', 'gallery');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR)); // only public/ — never data/ or src/

// ── JSON helpers (atomic write: tmp + rename) ─────────────────────────────────
const dataFile = (f) => path.join(DATA_DIR, f);
const readJSON = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(f), 'utf-8'));
  } catch {
    return fallback;
  }
};
const writeJSON = (f, d) => {
  const fp = dataFile(f);
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, fp);
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });

// ── Admin credentials (data/auth.json, outside git) ───────────────────────────
// Supported formats: { sha256: "<hex>" } (legacy) or { scrypt: { salt, hash } }
function initAuth() {
  let auth = readJSON('auth.json', null);
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
  writeJSON('auth.json', auth);
  return auth;
}
function scryptRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { scrypt: { salt, hash } };
}
function verifyPassword(password) {
  const auth = readJSON('auth.json', {});
  if (auth.scrypt) {
    const h = crypto.scryptSync(password, auth.scrypt.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(auth.scrypt.hash));
  }
  if (auth.sha256) {
    return crypto.timingSafeEqual(Buffer.from(sha256(password)), Buffer.from(auth.sha256));
  }
  return false;
}
initAuth();

// ── In-memory sessions with expiry ────────────────────────────────────────────
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8h
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
    `vv_sess=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (PROD) parts.push('Secure');
  return parts.join('; ');
}

function requireAuth(req, res, next) {
  if (!isSessionValid(getCookie(req, 'vv_sess'))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ── Login rate limiting (in-memory, per IP) ───────────────────────────────────
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 min
const loginFails = new Map(); // ip → { count, first }

function isLoginLimited(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW) {
    loginFails.delete(ip);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILS;
}
function registerLoginFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW) {
    loginFails.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

// ── Multer: upload to memory, sharp writes the final file ────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (isLoginLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
  if (verifyPassword(password)) {
    loginFails.delete(ip);
    const token = createSession();
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL));
    res.json({ ok: true });
  } else {
    registerLoginFail(ip);
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(getCookie(req, 'vv_sess'));
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isSessionValid(getCookie(req, 'vv_sess')) });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !verifyPassword(currentPassword)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  writeJSON('auth.json', scryptRecord(newPassword));
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════════════════════════════

const sanitizeMenuItem = (p) => ({
  emoji: String(p.emoji || '🍕').slice(0, 8),
  name: String(p.name || '').slice(0, 80),
  description: String(p.description || '').slice(0, 500),
  tag: String(p.tag || '').slice(0, 40),
  tagColor: /^#[0-9a-fA-F]{6}$/.test(p.tagColor || '') ? p.tagColor : '#C41E3A',
  category: String(p.category || '').slice(0, 40),
  price:
    p.price === null || p.price === undefined || p.price === ''
      ? null
      : Math.max(0, Number(p.price) || 0),
  allergens: Array.isArray(p.allergens) ? p.allergens.map(String).slice(0, 14) : [],
  active: p.active !== false,
});

app.get('/api/menu', (_req, res) => {
  res.json(readJSON('menu.json', []));
});

app.post('/api/menu', requireAuth, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Nombre requerido' });
  const menu = readJSON('menu.json', []);
  const item = { id: Date.now().toString(), ...sanitizeMenuItem(req.body) };
  menu.push(item);
  writeJSON('menu.json', menu);
  res.json(item);
});

app.put('/api/menu/order', requireAuth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[] esperado' });
  const menu = readJSON('menu.json', []);
  const byId = new Map(menu.map((p) => [p.id, p]));
  const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const p of menu) if (!ids.includes(p.id)) sorted.push(p);
  writeJSON('menu.json', sorted);
  res.json({ ok: true });
});

app.put('/api/menu/:id', requireAuth, (req, res) => {
  const menu = readJSON('menu.json', []);
  const idx = menu.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  menu[idx] = { id: req.params.id, ...sanitizeMenuItem({ ...menu[idx], ...req.body }) };
  writeJSON('menu.json', menu);
  res.json(menu[idx]);
});

app.delete('/api/menu/:id', requireAuth, (req, res) => {
  const menu = readJSON('menu.json', []).filter((p) => p.id !== req.params.id);
  writeJSON('menu.json', menu);
  res.json({ ok: true });
});

// ── Menu as PDF (the client usually loads it this way) ────────────────────────
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permite PDF'));
  },
});

app.post('/api/menu/pdf', requireAuth, uploadPdf.single('menu'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
  const cfg = readJSON('config.json', {});
  const previous = cfg.site?.menu?.pdf;
  const name = `menu-${Date.now()}.pdf`; // timestamp-versioned: avoids stale cache
  fs.writeFileSync(path.join(PUBLIC_DIR, 'assets', name), req.file.buffer);
  if (previous) {
    const prevInAssets = path.join(PUBLIC_DIR, 'assets', path.basename(previous));
    const prevInRoot = path.join(PUBLIC_DIR, path.basename(previous));
    if (fs.existsSync(prevInAssets)) fs.unlinkSync(prevInAssets);
    else if (fs.existsSync(prevInRoot)) fs.unlinkSync(prevInRoot);
  }
  cfg.site = cfg.site || {};
  cfg.site.menu = { ...(cfg.site.menu || {}), pdf: `/assets/${name}` };
  writeJSON('config.json', cfg);
  res.json({ ok: true, pdf: cfg.site.menu.pdf });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONTHLY SPECIAL ("pizza del mes")
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/monthly-special', (_req, res) => {
  res.json(readJSON('monthly-special.json', { active: false }));
});

app.put('/api/monthly-special', requireAuth, (req, res) => {
  const b = req.body || {};
  writeJSON('monthly-special.json', {
    active: b.active === true,
    emoji: String(b.emoji || '🔥').slice(0, 8),
    name: String(b.name || '').slice(0, 80),
    description: String(b.description || '').slice(0, 500),
    badge: String(b.badge || '').slice(0, 40),
    cta: String(b.cta || '').slice(0, 60),
  });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GALLERY (order persisted in data/gallery.json, sharp-optimized on upload)
// ═══════════════════════════════════════════════════════════════════════════════

function galleryFilesOnDisk() {
  return fs.readdirSync(GALLERY_DIR).filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f));
}

// Reconciles data/gallery.json with what's actually on disk
function galleryList() {
  const onDisk = new Set(galleryFilesOnDisk());
  const order = readJSON('gallery.json', []).filter((e) => onDisk.has(e.filename));
  const known = new Set(order.map((e) => e.filename));
  for (const f of onDisk) if (!known.has(f)) order.push({ filename: f, alt: '' });
  return order;
}

app.get('/api/gallery', (_req, res) => {
  res.json(galleryList().map((e) => ({ ...e, url: `/assets/gallery/${e.filename}` })));
});

app.post('/api/gallery/upload', requireAuth, upload.array('photos', 30), async (req, res) => {
  try {
    const saved = [];
    for (const file of req.files || []) {
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
      await sharp(file.buffer)
        .rotate() // respects EXIF orientation
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(GALLERY_DIR, name));
      saved.push({ filename: name, url: `/assets/gallery/${name}` });
    }
    writeJSON('gallery.json', galleryList()); // folds new files in at the end
    res.json(saved);
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

app.put('/api/gallery/order', requireAuth, (req, res) => {
  const { filenames } = req.body || {};
  if (!Array.isArray(filenames)) return res.status(400).json({ error: 'filenames[] esperado' });
  const current = galleryList();
  const byName = new Map(current.map((e) => [e.filename, e]));
  const sorted = filenames.map((f) => byName.get(path.basename(f))).filter(Boolean);
  for (const e of current) if (!sorted.includes(e)) sorted.push(e);
  writeJSON('gallery.json', sorted);
  res.json({ ok: true });
});

app.delete('/api/gallery/:filename', requireAuth, (req, res) => {
  const name = path.basename(req.params.filename); // prevents path traversal
  const fp = path.join(GALLERY_DIR, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  writeJSON('gallery.json', galleryList());
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SITE CONTENT (hero, contact, hours, editorial copy)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/site', (_req, res) => {
  const cfg = readJSON('config.json', {});
  res.json(cfg.site || {});
});

app.put('/api/site', requireAuth, (req, res) => {
  const cfg = readJSON('config.json', {});
  const previous = cfg.site || {};
  cfg.site = { ...previous, ...req.body };
  if (req.body.menu) {
    // deep merge: switching mode must not clobber an already-uploaded PDF path
    cfg.site.menu = { ...(previous.menu || {}), ...req.body.menu };
  }
  writeJSON('config.json', cfg);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE REVIEWS (API key only via environment variable)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/reviews', (_req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  const placeId = readJSON('config.json', {}).googlePlaceId || '';
  if (!apiKey || !placeId) {
    return res.json({ configured: false, reviews: [] });
  }
  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}` +
    '&fields=reviews,rating,user_ratings_total' +
    '&language=es' +
    `&key=${encodeURIComponent(apiKey)}`;

  https
    .get(url, (apiRes) => {
      let raw = '';
      apiRes.on('data', (c) => (raw += c));
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.status !== 'OK') {
            return res
              .status(502)
              .json({ error: `Google: ${json.status}`, details: json.error_message });
          }
          res.json({
            configured: true,
            rating: json.result?.rating,
            total: json.result?.user_ratings_total,
            reviews: json.result?.reviews || [],
          });
        } catch {
          res.status(500).json({ error: 'Respuesta inválida de Google' });
        }
      });
    })
    .on('error', (e) => res.status(500).json({ error: e.message }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS (non-sensitive data only)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/config', requireAuth, (_req, res) => {
  const cfg = readJSON('config.json', {});
  res.json({
    googlePlaceId: cfg.googlePlaceId || '',
    googleApiKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
  });
});

app.put('/api/config', requireAuth, (req, res) => {
  const cfg = readJSON('config.json', {});
  if (typeof req.body.googlePlaceId === 'string') {
    cfg.googlePlaceId = req.body.googlePlaceId.trim().slice(0, 120);
  }
  writeJSON('config.json', cfg);
  res.json({ ok: true });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍕  Voy Volando · http://localhost:${PORT}`);
  console.log(`🔧  Admin panel  · http://localhost:${PORT}/admin.html`);
});
