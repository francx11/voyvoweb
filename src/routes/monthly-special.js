const { Router } = require('express');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');

const FILE = 'monthly-special.json';

const router = Router();

router.get('/', (_req, res) => {
  res.json(readJSON(FILE, { active: false }));
});

router.put('/', requireAuth, (req, res) => {
  const b = req.body || {};
  writeJSON(FILE, {
    active: b.active === true,
    emoji: String(b.emoji || '🔥').slice(0, 8),
    name: String(b.name || '').slice(0, 80),
    description: String(b.description || '').slice(0, 500),
    badge: String(b.badge || '').slice(0, 40),
    cta: String(b.cta || '').slice(0, 60),
  });
  res.json({ ok: true });
});

module.exports = router;
