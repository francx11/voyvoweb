// Editable site content: hero, story, contact, hours, menu display mode.
const { Router } = require('express');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');

const CONFIG_FILE = 'config.json';

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
  }
  writeJSON(CONFIG_FILE, cfg);
  res.json({ ok: true });
});

module.exports = router;
