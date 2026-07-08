require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

const ROOT       = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR   = path.join(ROOT, 'data');
const GALLERY    = path.join(PUBLIC_DIR, 'assets', 'gallery');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR)); // solo public/ — nunca data/ ni src/

// ── Helpers JSON (escritura atómica: tmp + rename) ───────────────────────────
const dataFile = (f) => path.join(DATA_DIR, f);
const readJSON = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(dataFile(f), 'utf-8')); }
  catch { return fallback; }
};
const writeJSON = (f, d) => {
  const fp  = dataFile(f);
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, fp);
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

if (!fs.existsSync(GALLERY)) fs.mkdirSync(GALLERY, { recursive: true });

// ── Credenciales admin (data/auth.json, fuera de git) ─────────────────────────
// Formatos soportados: { sha256: "<hex>" } (legado) o { scrypt: { salt, hash } }
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
    console.log('  ⚠️  Contraseña por defecto: admin1234');
    console.log('  👉  Cámbiala en el panel de admin → Configuración');
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

// ── Sesiones en memoria con expiración ────────────────────────────────────────
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 h
const sessions = new Map(); // token → expiresAt

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}
function validSession(token) {
  if (!token || !sessions.has(token)) return false;
  if (Date.now() > sessions.get(token)) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TTL); // expiración deslizante
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (now > exp) sessions.delete(t);
}, 10 * 60 * 1000).unref();

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
  if (!validSession(getCookie(req, 'vv_sess'))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ── Rate limit de login (en memoria, por IP) ─────────────────────────────────
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW    = 15 * 60 * 1000; // 15 min
const loginFails = new Map(); // ip → { count, first }

function loginLimited(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW) { loginFails.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_FAILS;
}
function registerFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW) {
    loginFails.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

// ── Multer: subida a memoria, sharp escribe el archivo final ─────────────────
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
  if (loginLimited(ip)) {
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
    registerFail(ip);
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(getCookie(req, 'vv_sess'));
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: validSession(getCookie(req, 'vv_sess')) });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !verifyPassword(actual)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  if (!nueva || nueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  writeJSON('auth.json', scryptRecord(nueva));
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CARTA
// ═══════════════════════════════════════════════════════════════════════════════

const sanitizePizza = (p) => ({
  emoji:       String(p.emoji || '🍕').slice(0, 8),
  nombre:      String(p.nombre || '').slice(0, 80),
  descripcion: String(p.descripcion || '').slice(0, 500),
  tag:         String(p.tag || '').slice(0, 40),
  tagColor:    /^#[0-9a-fA-F]{6}$/.test(p.tagColor || '') ? p.tagColor : '#C41E3A',
  categoria:   String(p.categoria || '').slice(0, 40),
  precio:      p.precio === null || p.precio === undefined || p.precio === ''
                 ? null : Math.max(0, Number(p.precio) || 0),
  alergenos:   Array.isArray(p.alergenos) ? p.alergenos.map(String).slice(0, 14) : [],
  activa:      p.activa !== false,
});

app.get('/api/carta', (_req, res) => {
  res.json(readJSON('carta.json', []));
});

app.post('/api/carta', requireAuth, (req, res) => {
  if (!req.body.nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const carta = readJSON('carta.json', []);
  const pizza = { id: Date.now().toString(), ...sanitizePizza(req.body) };
  carta.push(pizza);
  writeJSON('carta.json', carta);
  res.json(pizza);
});

app.put('/api/carta/orden', requireAuth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[] esperado' });
  const carta  = readJSON('carta.json', []);
  const byId   = new Map(carta.map((p) => [p.id, p]));
  const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const p of carta) if (!ids.includes(p.id)) sorted.push(p);
  writeJSON('carta.json', sorted);
  res.json({ ok: true });
});

app.put('/api/carta/:id', requireAuth, (req, res) => {
  const carta = readJSON('carta.json', []);
  const idx   = carta.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  carta[idx] = { id: req.params.id, ...sanitizePizza({ ...carta[idx], ...req.body }) };
  writeJSON('carta.json', carta);
  res.json(carta[idx]);
});

app.delete('/api/carta/:id', requireAuth, (req, res) => {
  const carta = readJSON('carta.json', []).filter((p) => p.id !== req.params.id);
  writeJSON('carta.json', carta);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIZZA DEL MES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/pizzames', (_req, res) => {
  res.json(readJSON('pizzames.json', { activa: false }));
});

app.put('/api/pizzames', requireAuth, (req, res) => {
  const b = req.body || {};
  writeJSON('pizzames.json', {
    activa:      b.activa === true,
    emoji:       String(b.emoji || '🔥').slice(0, 8),
    nombre:      String(b.nombre || '').slice(0, 80),
    descripcion: String(b.descripcion || '').slice(0, 500),
    badge:       String(b.badge || '').slice(0, 40),
    cta:         String(b.cta || '').slice(0, 60),
  });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GALERÍA (orden persistido en data/galeria.json, optimización con sharp)
// ═══════════════════════════════════════════════════════════════════════════════

function galleryFilesOnDisk() {
  return fs.readdirSync(GALLERY).filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f));
}

// Reconcilia data/galeria.json con lo que hay en disco
function galleryList() {
  const onDisk = new Set(galleryFilesOnDisk());
  const order  = readJSON('galeria.json', []).filter((e) => onDisk.has(e.filename));
  const known  = new Set(order.map((e) => e.filename));
  for (const f of onDisk) if (!known.has(f)) order.push({ filename: f, alt: '' });
  return order;
}

app.get('/api/galeria', (_req, res) => {
  res.json(galleryList().map((e) => ({ ...e, url: `/assets/gallery/${e.filename}` })));
});

app.post('/api/galeria/upload', requireAuth, upload.array('fotos', 30), async (req, res) => {
  try {
    const saved = [];
    for (const file of req.files || []) {
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
      await sharp(file.buffer)
        .rotate() // respeta orientación EXIF
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(GALLERY, name));
      saved.push({ filename: name, url: `/assets/gallery/${name}` });
    }
    writeJSON('galeria.json', galleryList()); // incorpora los nuevos al final
    res.json(saved);
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

app.put('/api/galeria/orden', requireAuth, (req, res) => {
  const { filenames } = req.body || {};
  if (!Array.isArray(filenames)) return res.status(400).json({ error: 'filenames[] esperado' });
  const current = galleryList();
  const byName  = new Map(current.map((e) => [e.filename, e]));
  const sorted  = filenames.map((f) => byName.get(path.basename(f))).filter(Boolean);
  for (const e of current) if (!sorted.includes(e)) sorted.push(e);
  writeJSON('galeria.json', sorted);
  res.json({ ok: true });
});

app.delete('/api/galeria/:filename', requireAuth, (req, res) => {
  const name = path.basename(req.params.filename); // evita path traversal
  const fp   = path.join(GALLERY, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  writeJSON('galeria.json', galleryList());
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENIDO DEL SITIO (hero, contacto, horarios, textos)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/site', (_req, res) => {
  const cfg = readJSON('config.json', {});
  res.json(cfg.site || {});
});

app.put('/api/site', requireAuth, (req, res) => {
  const cfg = readJSON('config.json', {});
  cfg.site = { ...(cfg.site || {}), ...req.body };
  writeJSON('config.json', cfg);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESEÑAS GOOGLE (API key solo por variable de entorno)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/reviews', (_req, res) => {
  const apiKey  = process.env.GOOGLE_API_KEY || '';
  const placeId = readJSON('config.json', {}).googlePlaceId || '';
  if (!apiKey || !placeId) {
    return res.json({ configured: false, reviews: [] });
  }
  const url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + `?place_id=${encodeURIComponent(placeId)}`
    + '&fields=reviews,rating,user_ratings_total'
    + '&language=es'
    + `&key=${encodeURIComponent(apiKey)}`;

  https.get(url, (apiRes) => {
    let raw = '';
    apiRes.on('data', (c) => (raw += c));
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json.status !== 'OK') {
          return res.status(502).json({ error: `Google: ${json.status}`, details: json.error_message });
        }
        res.json({
          configured: true,
          rating:  json.result?.rating,
          total:   json.result?.user_ratings_total,
          reviews: json.result?.reviews || [],
        });
      } catch {
        res.status(500).json({ error: 'Respuesta inválida de Google' });
      }
    });
  }).on('error', (e) => res.status(500).json({ error: e.message }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN (solo datos no sensibles)
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
  console.log(`🔧  Panel admin  · http://localhost:${PORT}/admin.html`);
});
