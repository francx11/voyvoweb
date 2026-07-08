const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { ASSETS_DIR, PUBLIC_DIR } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');
const { pdfUpload } = require('../middleware/uploads');

const MENU_FILE = 'menu.json';
const CONFIG_FILE = 'config.json';

// Every field is length-capped and type-coerced: the payload comes from the
// admin panel but the session cookie could be riding a hijacked browser.
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

const router = Router();

router.get('/', (_req, res) => {
  res.json(readJSON(MENU_FILE, []));
});

router.post('/', requireAuth, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Nombre requerido' });
  const menu = readJSON(MENU_FILE, []);
  const item = { id: Date.now().toString(), ...sanitizeMenuItem(req.body) };
  menu.push(item);
  writeJSON(MENU_FILE, menu);
  res.json(item);
});

// Registered before '/:id' so "order" is never captured as an id.
router.put('/order', requireAuth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[] esperado' });
  const menu = readJSON(MENU_FILE, []);
  const byId = new Map(menu.map((p) => [p.id, p]));
  const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const p of menu) if (!ids.includes(p.id)) sorted.push(p);
  writeJSON(MENU_FILE, sorted);
  res.json({ ok: true });
});

// Menu as PDF (the client usually loads it this way).
router.post('/pdf', requireAuth, pdfUpload.single('menu'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
  const cfg = readJSON(CONFIG_FILE, {});
  const previous = cfg.site?.menu?.pdf;
  const name = `menu-${Date.now()}.pdf`; // timestamp-versioned: avoids stale cache
  fs.writeFileSync(path.join(ASSETS_DIR, name), req.file.buffer);
  if (previous) {
    const prevInAssets = path.join(ASSETS_DIR, path.basename(previous));
    const prevInRoot = path.join(PUBLIC_DIR, path.basename(previous));
    if (fs.existsSync(prevInAssets)) fs.unlinkSync(prevInAssets);
    else if (fs.existsSync(prevInRoot)) fs.unlinkSync(prevInRoot);
  }
  cfg.site = cfg.site || {};
  cfg.site.menu = { ...(cfg.site.menu || {}), pdf: `/assets/${name}` };
  writeJSON(CONFIG_FILE, cfg);
  res.json({ ok: true, pdf: cfg.site.menu.pdf });
});

router.put('/:id', requireAuth, (req, res) => {
  const menu = readJSON(MENU_FILE, []);
  const idx = menu.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  menu[idx] = { id: req.params.id, ...sanitizeMenuItem({ ...menu[idx], ...req.body }) };
  writeJSON(MENU_FILE, menu);
  res.json(menu[idx]);
});

router.delete('/:id', requireAuth, (req, res) => {
  const menu = readJSON(MENU_FILE, []).filter((p) => p.id !== req.params.id);
  writeJSON(MENU_FILE, menu);
  res.json({ ok: true });
});

module.exports = router;
