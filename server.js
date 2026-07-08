const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(ROOT));

// ── Helpers ───────────────────────────────────────────────────────────────────
const dataFile  = (f) => path.join(ROOT, 'data', f);
const readJSON  = (f) => JSON.parse(fs.readFileSync(dataFile(f), 'utf-8'));
const writeJSON = (f, d) => fs.writeFileSync(dataFile(f), JSON.stringify(d, null, 2));
const sha256    = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Ensure gallery folder exists
const galleryDir = path.join(ROOT, 'assets', 'gallery');
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });

// Auto-set default password on first run
(function initPassword() {
  const cfg = readJSON('config.json');
  if (!cfg.adminPasswordHash) {
    cfg.adminPasswordHash = sha256('admin1234');
    writeJSON('config.json', cfg);
    console.log('');
    console.log('  ⚠️  Contraseña por defecto: admin1234');
    console.log('  👉  Cámbiala en el panel de admin → Configuración');
    console.log('');
  }
})();

// ── Sessions (in-memory) ──────────────────────────────────────────────────────
const sessions = new Set();

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ── Multer (image uploads) ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, galleryDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — AUTH
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
  const cfg = readJSON('config.json');
  if (sha256(password) === cfg.adminPasswordHash) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — CARTA
// ═══════════════════════════════════════════════════════════════════════════════

// GET — público (la web lo usa)
app.get('/api/carta', (_req, res) => {
  res.json(readJSON('carta.json'));
});

// PUT — reemplaza toda la carta
app.put('/api/carta', requireAuth, (req, res) => {
  const pizzas = req.body;
  if (!Array.isArray(pizzas)) return res.status(400).json({ error: 'Array esperado' });
  writeJSON('carta.json', pizzas);
  res.json({ ok: true });
});

// POST — añade una pizza
app.post('/api/carta', requireAuth, (req, res) => {
  const pizza = req.body;
  if (!pizza.nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const carta = readJSON('carta.json');
  pizza.id = Date.now().toString();
  pizza.activa = pizza.activa !== false;
  carta.push(pizza);
  writeJSON('carta.json', carta);
  res.json(pizza);
});

// PUT — edita una pizza por id
app.put('/api/carta/:id', requireAuth, (req, res) => {
  const carta = readJSON('carta.json');
  const idx   = carta.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  carta[idx] = { ...carta[idx], ...req.body, id: req.params.id };
  writeJSON('carta.json', carta);
  res.json(carta[idx]);
});

// DELETE — elimina una pizza
app.delete('/api/carta/:id', requireAuth, (req, res) => {
  let carta = readJSON('carta.json');
  carta = carta.filter(p => p.id !== req.params.id);
  writeJSON('carta.json', carta);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — PIZZA DEL MES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/pizzames', (_req, res) => {
  res.json(readJSON('pizzames.json'));
});

app.put('/api/pizzames', requireAuth, (req, res) => {
  writeJSON('pizzames.json', req.body);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — GALERÍA
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/galeria', (_req, res) => {
  const files = fs.readdirSync(galleryDir)
    .filter(f => /\.(jpe?g|png|webp|gif|avif)$/i.test(f))
    .map(f => ({ filename: f, url: `/assets/gallery/${f}` }));
  res.json(files);
});

app.post('/api/galeria/upload', requireAuth, upload.array('fotos', 30), (req, res) => {
  const files = (req.files || []).map(f => ({
    filename: f.filename,
    url: `/assets/gallery/${f.filename}`
  }));
  res.json(files);
});

app.delete('/api/galeria/:filename', requireAuth, (req, res) => {
  const name = path.basename(req.params.filename); // prevent path traversal
  const fp   = path.join(galleryDir, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — RESEÑAS GOOGLE
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/reviews', (_req, res) => {
  const { googleApiKey, googlePlaceId } = readJSON('config.json');
  if (!googleApiKey || !googlePlaceId) {
    return res.json({ configured: false, reviews: [] });
  }
  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${encodeURIComponent(googlePlaceId)}`
    + `&fields=reviews,rating,user_ratings_total`
    + `&language=es`
    + `&key=${encodeURIComponent(googleApiKey)}`;

  https.get(url, (apiRes) => {
    let raw = '';
    apiRes.on('data', c => raw += c);
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json.status !== 'OK') {
          return res.status(502).json({ error: `Google: ${json.status}`, details: json.error_message });
        }
        res.json({
          configured: true,
          rating:     json.result?.rating,
          total:      json.result?.user_ratings_total,
          reviews:    json.result?.reviews || []
        });
      } catch {
        res.status(500).json({ error: 'Respuesta inválida de Google' });
      }
    });
  }).on('error', (e) => res.status(500).json({ error: e.message }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS — CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/config', requireAuth, (_req, res) => {
  const { adminPasswordHash, ...safe } = readJSON('config.json');
  res.json(safe);
});

app.put('/api/config', requireAuth, (req, res) => {
  const cfg = readJSON('config.json');
  const { newPassword, ...updates } = req.body;
  Object.assign(cfg, updates);
  if (newPassword && newPassword.length >= 6) {
    cfg.adminPasswordHash = sha256(newPassword);
  }
  writeJSON('config.json', cfg);
  res.json({ ok: true });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍕  Voy Volando · http://localhost:${PORT}`);
  console.log(`🔧  Panel admin  · http://localhost:${PORT}/admin.html`);
});
