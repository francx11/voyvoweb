// Theme: the active palette and the panel's editor for it.
//
// GET / is public because the storefront's own scripts need the accent colour
// (the menu badge default). Everything that writes needs the session.
const { Router } = require('express');
const { writeJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');
const theme = require('../services/theme-store');

const THEME_FILE = 'theme.json';

// A save may leave the palette ugly, but not unusable: these three pairs are
// the difference between "I don't like it" and "I can't read the page, and the
// panel I would fix it from is a page too".
const AA = 4.5;

const router = Router();

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Resolves a draft and refuses it if any hard contrast pair falls below AA.
// Returns the resolved tokens plus the numbers the panel displays.
function check(draft) {
  let resolved;
  try {
    resolved = theme.resolve(draft);
  } catch (err) {
    throw bad(err.message);
  }

  const failures = [];
  const contrast = {};
  for (const mode of ['light', 'dark']) {
    const report = theme.audit(resolved[mode]);
    contrast[mode] = report;
    for (const [pair, value] of Object.entries(report.hard)) {
      if (value < AA) failures.push(`${mode}: ${pair} ${value}:1`);
    }
  }
  return { resolved, contrast, failures };
}

// Warnings are the soft pairs: worth showing, never worth blocking on.
const warnings = (contrast) => {
  const out = [];
  for (const mode of ['light', 'dark']) {
    for (const [pair, value] of Object.entries(contrast[mode].soft)) {
      if (value < AA) out.push(`${mode}: ${pair} ${value}:1 (por debajo de AA)`);
    }
  }
  return out;
};

router.get('/', (_req, res) => {
  const active = theme.readTheme();
  const resolved = theme.resolve(active);
  res.json({
    preset: resolved.preset,
    name: resolved.name,
    overrides: active.overrides,
    light: resolved.light,
    dark: resolved.dark,
  });
});

router.get('/presets', requireAuth, (_req, res) => {
  res.json(theme.listPresets());
});

// Draft in, numbers out. Writes nothing — this is what the live preview calls
// on every picker move.
router.post('/preview', requireAuth, (req, res) => {
  const draft = {
    preset: String(req.body.preset || theme.readTheme().preset),
    overrides: {
      light: theme.sanitizeOverrides(req.body.overrides && req.body.overrides.light),
      dark: theme.sanitizeOverrides(req.body.overrides && req.body.overrides.dark),
    },
  };
  const { resolved, contrast, failures } = check(draft);
  res.json({
    css: theme.serialize(resolved),
    light: resolved.light,
    dark: resolved.dark,
    contrast,
    failures,
    warnings: warnings(contrast),
  });
});

router.put('/', requireAuth, (req, res) => {
  const preset = String(req.body.preset || '').trim();
  if (!preset) throw bad('Falta el preset');
  if (!theme.loadPreset(preset)) throw bad(`No existe el preset "${preset}"`);

  const next = {
    preset,
    overrides: {
      light: theme.sanitizeOverrides(req.body.overrides && req.body.overrides.light),
      dark: theme.sanitizeOverrides(req.body.overrides && req.body.overrides.dark),
    },
  };

  const { contrast, failures } = check(next);
  if (failures.length) {
    throw bad(`Contraste insuficiente (mínimo ${AA}:1) — ${failures.join('; ')}`);
  }

  writeJSON(THEME_FILE, next);
  theme.ensureThemeCss();
  res.json({ ok: true, preset, contrast, warnings: warnings(contrast) });
});

module.exports = router;
