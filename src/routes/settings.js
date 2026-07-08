// Admin settings (non-sensitive data only — the API key stays in env).
const { Router } = require('express');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');

const CONFIG_FILE = 'config.json';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const cfg = readJSON(CONFIG_FILE, {});
  res.json({
    googlePlaceId: cfg.googlePlaceId || '',
    googleApiKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
  });
});

router.put('/', requireAuth, (req, res) => {
  const cfg = readJSON(CONFIG_FILE, {});
  if (typeof req.body.googlePlaceId === 'string') {
    cfg.googlePlaceId = req.body.googlePlaceId.trim().slice(0, 120);
  }
  writeJSON(CONFIG_FILE, cfg);
  res.json({ ok: true });
});

module.exports = router;
