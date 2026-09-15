const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { ASSETS_DIR, PUBLIC_DIR, MENU_IMG_DIR, ORDERING_FILE } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const { saveWebp, removeImage } = require('../services/image-store');
const requireAuth = require('../middleware/require-auth');
const { pdfUpload, imageUpload } = require('../middleware/uploads');

if (!fs.existsSync(MENU_IMG_DIR)) fs.mkdirSync(MENU_IMG_DIR, { recursive: true });

const MENU_FILE = 'menu.json';
const CONFIG_FILE = 'config.json';

const sanitizePrice = (v) =>
  v === null || v === undefined || v === '' ? null : Math.max(0, Number(v) || 0);

// Pricing modes: absent/fixed → single `price`; sizes → per-item variants;
// tier → shared pizza price table in ordering.json. Invalid input falls back
// to fixed so a bad payload can never leave an item in an unpriceable state.
function sanitizePricing(p, ordering) {
  const pricing = p.pricing || {};
  if (pricing.mode === 'tier' && (ordering.tiers || {})[pricing.tierId]) {
    return { mode: 'tier', tierId: String(pricing.tierId) };
  }
  if (pricing.mode === 'sizes' && Array.isArray(pricing.sizes)) {
    const sizes = pricing.sizes
      .slice(0, 8)
      .map((s, i) => ({
        id: String(s.id || i + 1).slice(0, 24),
        label: String(s.label || '').slice(0, 40),
        price: sanitizePrice(s.price) ?? 0,
        ...(s.fulfillment === 'pickup' || s.fulfillment === 'delivery'
          ? { fulfillment: s.fulfillment }
          : {}),
      }))
      .filter((s) => s.label);
    if (sizes.length) return { mode: 'sizes', sizes };
  }
  return undefined; // fixed pricing via `price`
}

// Every field is length-capped and type-coerced: the payload comes from the
// admin panel but the session cookie could be riding a hijacked browser.
const sanitizeMenuItem = (p) => {
  const ordering = readJSON(ORDERING_FILE, {});
  const pricing = sanitizePricing(p, ordering);
  const modifierGroupIds = (Array.isArray(p.modifierGroupIds) ? p.modifierGroupIds : [])
    .map(String)
    .filter((gid) => (ordering.modifierGroups || {})[gid])
    .slice(0, 5);
  return {
    emoji: String(p.emoji || '🍕').slice(0, 8),
    name: String(p.name || '').slice(0, 80),
    description: String(p.description || '').slice(0, 500),
    tag: String(p.tag || '').slice(0, 40),
    tagColor: /^#[0-9a-fA-F]{6}$/.test(p.tagColor || '') ? p.tagColor : '#C41E3A',
    category: String(p.category || '').slice(0, 40),
    price: sanitizePrice(p.price),
    allergens: Array.isArray(p.allergens) ? p.allergens.map(String).slice(0, 14) : [],
    active: p.active !== false,
    ...(p.image ? { image: String(p.image).slice(0, 200) } : {}),
    ...(pricing ? { pricing } : {}),
    ...(modifierGroupIds.length ? { modifierGroupIds } : {}),
    ...(p.fulfillment === 'pickup_only' ? { fulfillment: 'pickup_only' } : {}),
  };
};

// Deletes an item's uploaded photo from disk (basename guards against
// traversal). No-op when the item has no image or the file is already gone.
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

// Per-item photo into MENU_IMG_DIR, same pipeline as the gallery.
// The old photo is removed so replacements never orphan a file on disk.
router.post('/:id/image', requireAuth, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
  const menu = readJSON(MENU_FILE, []);
  const idx = menu.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  try {
    const name = await saveWebp(req.file.buffer, MENU_IMG_DIR);
    removeImage(MENU_IMG_DIR, menu[idx].image);
    menu[idx].image = `/assets/menu/${name}`;
    writeJSON(MENU_FILE, menu);
    res.json({ ok: true, image: menu[idx].image });
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

router.delete('/:id/image', requireAuth, (req, res) => {
  const menu = readJSON(MENU_FILE, []);
  const idx = menu.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  removeImage(MENU_IMG_DIR, menu[idx].image);
  delete menu[idx].image;
  writeJSON(MENU_FILE, menu);
  res.json({ ok: true });
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
  const menu = readJSON(MENU_FILE, []);
  const removed = menu.find((p) => p.id === req.params.id);
  if (removed) removeImage(MENU_IMG_DIR, removed.image);
  writeJSON(
    MENU_FILE,
    menu.filter((p) => p.id !== req.params.id)
  );
  res.json({ ok: true });
});

module.exports = router;
