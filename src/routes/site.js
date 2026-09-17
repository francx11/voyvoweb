// Editable site content: hero, story, contact, hours, menu display mode.
const { Router } = require('express');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');

const CONFIG_FILE = 'config.json';
const MENU_MODES = ['products', 'pdf', 'both'];
// Cuándo la carta reserva hueco de foto por plato. "auto" es el defecto en todas
// partes (cliente y build estático) y no necesita que este valor exista en
// config.json: con auto, cada plato enseña su foto solo si la tiene subida, así
// que subir la primera foto desde el panel la publica sin tocar ajustes.
const MENU_PHOTOS = ['auto', 'always', 'never'];

const router = Router();

router.get('/', (_req, res) => {
  const cfg = readJSON(CONFIG_FILE, {});
  res.json(cfg.site || {});
});

router.put('/', requireAuth, (req, res) => {
  const cfg = readJSON(CONFIG_FILE, {});
  const previous = cfg.site || {};
  cfg.site = { ...previous, ...req.body };
  if (req.body.menu) {
    // deep merge: switching mode must not clobber an already-uploaded PDF path
    cfg.site.menu = { ...(previous.menu || {}), ...req.body.menu };
    if (req.body.menu.mode !== undefined && !MENU_MODES.includes(cfg.site.menu.mode)) {
      cfg.site.menu.mode = 'products';
    }
    if (req.body.menu.photos !== undefined && !MENU_PHOTOS.includes(cfg.site.menu.photos)) {
      cfg.site.menu.photos = 'auto';
    }
  }
  writeJSON(CONFIG_FILE, cfg);
  res.json({ ok: true });
});

module.exports = router;
