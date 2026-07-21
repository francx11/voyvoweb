// Ordering configuration: a public read (what the cart needs to render)
// and the authenticated admin editor for ordering.json.
const { Router } = require('express');
const { ORDERING_FILE, ORDER_CANCEL_WINDOW } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');
const { isOpenNow, todayWindows } = require('../services/ordering-schedule');
const stripeClient = require('../services/stripe-client');

const router = Router();

const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9-]{1,24}$/;

const num = (v, max) => Math.min(Math.max(0, Number(v) || 0), max);

function sanitizeSizes(sizes) {
  if (!Array.isArray(sizes)) return [];
  return sizes
    .slice(0, 8)
    .map((s, i) => ({
      id: String(s.id || i + 1).slice(0, 24),
      label: String(s.label || '').slice(0, 40),
      price: num(s.price, 999),
      ...(s.fulfillment === 'pickup' || s.fulfillment === 'delivery'
        ? { fulfillment: s.fulfillment }
        : {}),
    }))
    .filter((s) => s.label);
}

// Field-by-field sanitization (same philosophy as sanitizeMenuItem): the
// panel is trusted UI but the cookie could ride a hijacked browser.
function sanitizeOrderingConfig(body, current) {
  const cfg = { ...current };
  if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
  if (typeof body.forceOpen === 'boolean') cfg.forceOpen = body.forceOpen;

  if (body.tiers && typeof body.tiers === 'object') {
    const tiers = {};
    for (const [key, t] of Object.entries(body.tiers).slice(0, 8)) {
      if (!SLUG.test(key) || !t) continue;
      const sizes = sanitizeSizes(t.sizes);
      if (sizes.length) tiers[key] = { label: String(t.label || key).slice(0, 40), sizes };
    }
    cfg.tiers = tiers;
  }

  if (body.modifierGroups && typeof body.modifierGroups === 'object') {
    const groups = {};
    for (const [key, g] of Object.entries(body.modifierGroups).slice(0, 16)) {
      if (!SLUG.test(key) || !g) continue;
      const options = (Array.isArray(g.options) ? g.options : [])
        .slice(0, 12)
        .map((o, i) => ({
          id: String(o.id || i + 1).slice(0, 24),
          label: String(o.label || '').slice(0, 40),
          price: num(o.price, 99),
        }))
        .filter((o) => o.label);
      if (!options.length) continue;
      groups[key] = {
        label: String(g.label || key).slice(0, 60),
        required: g.required === true,
        maxSelect: Math.min(Math.max(1, Number(g.maxSelect) || 1), 8),
        options,
      };
    }
    cfg.modifierGroups = groups;
  }

  if (body.delivery && typeof body.delivery === 'object') {
    cfg.delivery = {
      fee: num(body.delivery.fee, 99),
      minimum: num(body.delivery.minimum, 999),
      zones: (Array.isArray(body.delivery.zones) ? body.delivery.zones : [])
        .map((z) => String(z).trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20),
    };
  }

  if (body.schedule && typeof body.schedule === 'object') {
    const schedule = {};
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const windows = Array.isArray(body.schedule[day]) ? body.schedule[day] : [];
      schedule[day] = windows
        .slice(0, 4)
        .filter((w) => Array.isArray(w) && HHMM.test(w[0]) && HHMM.test(w[1]))
        .map((w) => [w[0], w[1]]);
    }
    cfg.schedule = schedule;
  }

  for (const field of ['holidayDates', 'closedDates']) {
    if (Array.isArray(body[field])) {
      cfg[field] = body[field]
        .map(String)
        .filter((d) => ISO_DATE.test(d))
        .slice(0, 60);
    }
  }
  return cfg;
}

// Public subset: everything the cart UI needs, nothing it doesn't.
router.get('/config', (_req, res) => {
  const cfg = readJSON(ORDERING_FILE, {});
  res.json({
    enabled: cfg.enabled !== false,
    open: isOpenNow(cfg),
    todayWindows: todayWindows(cfg),
    tiers: cfg.tiers || {},
    modifierGroups: cfg.modifierGroups || {},
    delivery: {
      fee: (cfg.delivery && cfg.delivery.fee) || 0,
      minimum: (cfg.delivery && cfg.delivery.minimum) || 0,
      zones: (cfg.delivery && cfg.delivery.zones) || [],
    },
    stripeEnabled: stripeClient.isConfigured(),
    cancelWindowMinutes: Math.round(ORDER_CANCEL_WINDOW / 60000),
  });
});

router.get('/settings', requireAuth, (_req, res) => {
  const cfg = readJSON(ORDERING_FILE, {});
  res.json({
    ...cfg,
    stripe: { configured: stripeClient.isConfigured(), mode: stripeClient.mode() },
  });
});

router.put('/settings', requireAuth, (req, res) => {
  const current = readJSON(ORDERING_FILE, {});
  const cfg = sanitizeOrderingConfig(req.body || {}, current);
  writeJSON(ORDERING_FILE, cfg);
  res.json({ ok: true });
});

module.exports = router;
