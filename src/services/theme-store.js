// Theme engine: turns a preset (data/themes/<id>.json) plus the panel's
// overrides (data/theme.json) into public/css/theme.css.
//
// theme.css is a generated artifact, gitignored, served by express.static like
// any other file. That is what keeps the static export honest: copyPublic() in
// the build is a literal fs.cp of public/ -> dist/, so the file rides along
// with no build step of its own.
//
// Six colours per mode are authored; the other eleven tokens are derived.
// A preset may still name any derived token explicitly and win - the brand
// document's greys are hand-picked and no formula reproduces them.
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, DATA_DIR } = require('../config');
const { readJSON } = require('../lib/json-store');
const {
  isHex,
  toTriplet,
  luminance,
  ratio,
  mix,
  darken,
  lighten,
  bestOn,
} = require('../lib/contrast');

const THEME_FILE = 'theme.json';
const PRESETS_DIR = path.join(DATA_DIR, 'themes');
const THEME_CSS = path.join(PUBLIC_DIR, 'css', 'theme.css');
const FALLBACK_PRESET = 'actual';

// Last resort, mirroring data/themes/actual.json. createApp() generates
// theme.css on boot, so the engine must produce *something* valid even when
// DATA_DIR holds no presets at all — a fresh clone, a volume not mounted yet,
// or a test pointing DATA_DIR at an empty temp dir. Same spirit as readJSON's
// silent fallback: a missing data file must never stop the app from booting.
const BUILTIN_PRESET = {
  id: 'builtin',
  name: 'Respaldo integrado',
  light: {
    paper: '#faf6ee',
    ink: '#2b2620',
    tomato: '#a83226',
    tomatoBtn: '#a83226',
    navy: '#0a2a6b',
    gold: '#f0c24b',
    paper2: '#f3ecdf',
    inkSoft: '#5c544a',
    tomatoDark: '#87281f',
    tomatoBtnHover: '#87281f',
    scrimRgb: '20 16 12',
  },
  dark: {
    paper: '#211c17',
    ink: '#f2ece1',
    tomato: '#e2664f',
    tomatoBtn: '#c2301d',
    navy: '#0a2a6b',
    gold: '#f0c24b',
    paper2: '#29231c',
    inkSoft: '#b9ae9d',
    tomatoDark: '#f08672',
    tomatoBtnHover: '#d13a24',
    scrimRgb: '20 16 12',
  },
};

// Authored per mode. Everything else is derived unless the preset says otherwise.
const CORE = ['paper', 'ink', 'tomato', 'tomatoBtn', 'navy', 'gold'];

// camelCase key -> CSS custom property. Order here is the order in the output.
const CSS_NAMES = {
  paper: '--paper',
  paper2: '--paper-2',
  ink: '--ink',
  inkSoft: '--ink-soft',
  tomato: '--tomato',
  tomatoDark: '--tomato-dark',
  tomatoBtn: '--tomato-btn',
  tomatoBtnHover: '--tomato-btn-hover',
  onTomato: '--on-tomato',
  navy: '--navy',
  onNavy: '--on-navy',
  gold: '--gold',
  onGold: '--on-gold',
  line: '--line',
  lineStrong: '--line-strong',
  shadowRgb: '--shadow-rgb',
  scrimRgb: '--scrim-rgb',
};

const isDarkMode = (paper) => luminance(paper) < 0.5;

// Derives the eleven non-authored tokens. Every rule is written so it holds in
// both modes without asking which mode it is in by name.
function derive(c) {
  const dark = isDarkMode(c.paper);

  // A shadow has to be darker than the surface it falls on. --ink is wrong in
  // dark mode (near-white: a halo), and --paper is wrong too (it *is* the
  // surface). So: the ink when the ink is the darker of the two, black when it
  // is not.
  const shadow = luminance(c.ink) < luminance(c.paper) ? c.ink : '#000000';

  // A scrim always darkens. Take the darkest colour in the palette so the veil
  // keeps the theme's tint, then push it most of the way to black.
  const scrimBase = luminance(c.ink) < luminance(c.paper) ? c.ink : c.paper;

  const inkTriplet = toTriplet(c.ink);

  return {
    paper2: mix(c.paper, c.ink, 0.07),
    inkSoft: mix(c.ink, c.paper, 0.3),
    // Hairlines are the ink at low alpha. Dark mode needs less of it: the same
    // alpha over a dark surface reads much heavier.
    line: 'rgb(' + inkTriplet + ' / ' + (dark ? 0.14 : 0.18) + ')',
    lineStrong: 'rgb(' + inkTriplet + ' / ' + (dark ? 0.4 : 0.55) + ')',
    tomatoDark: dark ? lighten(c.tomato, 0.12) : darken(c.tomato, 0.2),
    tomatoBtnHover: dark ? lighten(c.tomatoBtn, 0.12) : darken(c.tomatoBtn, 0.2),
    // Never pick a foreground by eye. The dark candidate cannot be --ink: in
    // dark mode --ink is near-white, so both candidates would be light and the
    // pick would be nonsense (white on gold is 1.9:1). `shadow` is already
    // "the ink, or black when the ink is light", which is exactly right here.
    onTomato: bestOn(c.tomatoBtn, ['#ffffff', shadow]),
    onNavy: bestOn(c.navy, ['#ffffff', shadow]),
    onGold: bestOn(c.gold, ['#ffffff', shadow]),
    shadowRgb: toTriplet(shadow),
    scrimRgb: toTriplet(darken(scrimBase, 0.55)),
  };
}

function listPresets() {
  let files;
  try {
    files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files
    .map((f) => readJSON(path.join('themes', f), null))
    .filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name || p.id, notes: p.notes || '' }));
}

const loadPreset = (id) => readJSON(path.join('themes', id + '.json'), null);

function readTheme() {
  const t = readJSON(THEME_FILE, null) || {};
  return {
    preset: typeof t.preset === 'string' ? t.preset : FALLBACK_PRESET,
    overrides: {
      light: (t.overrides && t.overrides.light) || {},
      dark: (t.overrides && t.overrides.dark) || {},
    },
  };
}

// Rejects anything that is not a #rrggbb colour, and anything that is not a
// token we know.
function sanitizeOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (CSS_NAMES[k] && isHex(v)) out[k] = v.toLowerCase();
  }
  return out;
}

// preset + overrides -> the full token set for both modes.
function resolve(theme) {
  const t = theme || readTheme();
  const preset = loadPreset(t.preset) || loadPreset(FALLBACK_PRESET) || BUILTIN_PRESET;

  const modes = {};
  for (const mode of ['light', 'dark']) {
    const authored = { ...(preset[mode] || {}) };
    for (const key of CORE) {
      if (!isHex(authored[key])) {
        throw new Error(
          'Preset "' + preset.id + '" is missing core colour "' + key + '" in ' + mode
        );
      }
    }
    // derived < the preset's explicit values < the panel's overrides
    modes[mode] = {
      ...derive(authored),
      ...authored,
      ...sanitizeOverrides(t.overrides[mode]),
    };
  }
  return { preset: preset.id, name: preset.name || preset.id, ...modes };
}

const block = (tokens, indent) =>
  Object.entries(CSS_NAMES)
    .filter(([key]) => tokens[key] !== undefined)
    .map(([key, css]) => indent + css + ': ' + tokens[key] + ';')
    .join('\n');

// The three selectors must keep this order. :root:not([data-theme="light"]) and
// :root[data-theme="dark"] have identical specificity (0,2,0), so the manual
// override only beats the media query by coming later in the document.
function serialize(resolved) {
  const r = resolved || resolve();
  return [
    '/* GENERADO por src/services/theme-store.js - no editar a mano.',
    '   Tema activo: "' + r.preset + '". Se regenera al arrancar, al guardar',
    '   desde el panel y antes de cada build estatico. Para cambiarlo:',
    '   panel -> Tema, o data/theme.json. */',
    '',
    ':root {',
    block(r.light, '  '),
    '  color-scheme: light;',
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    block(r.dark, '    '),
    '    color-scheme: dark;',
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    block(r.dark, '  '),
    '  color-scheme: dark;',
    '}',
    '',
  ].join('\n');
}

// Idempotent on purpose: tests/build-static.test.js runs the real build against
// the real working tree, so rewriting on every boot would churn the file's
// mtime for nothing. Plain writeFileSync rather than tmp+rename - the file is
// ~1 KB and on Windows renaming over a file express.static may have open can
// raise a spurious EPERM.
function ensureThemeCss() {
  const css = serialize();
  try {
    if (fs.readFileSync(THEME_CSS, 'utf-8') === css) return false;
  } catch {
    /* missing or unreadable: fall through and write it */
  }
  fs.mkdirSync(path.dirname(THEME_CSS), { recursive: true });
  fs.writeFileSync(THEME_CSS, css);
  return true;
}

// The accent of the active theme, for the menu badge default colour.
const accent = () => resolve().light.tomato;

// Page background per mode, for <meta name="theme-color">.
function themeColor() {
  const r = resolve();
  return { light: r.light.paper, dark: r.dark.paper };
}

// Contrast pairs the panel shows. The "hard" ones are those a save must not
// break: they are the difference between an ugly palette and an unusable site.
function audit(tokens) {
  const pair = (a, b) => Number(ratio(tokens[a], tokens[b]).toFixed(2));
  return {
    hard: {
      'ink/paper': pair('ink', 'paper'),
      'ink/paper-2': pair('ink', 'paper2'),
      'on-tomato/tomato-btn': pair('onTomato', 'tomatoBtn'),
    },
    soft: {
      'ink-soft/paper': pair('inkSoft', 'paper'),
      'tomato/paper': pair('tomato', 'paper'),
      'on-navy/navy': pair('onNavy', 'navy'),
    },
  };
}

module.exports = {
  BUILTIN_PRESET,
  CORE,
  CSS_NAMES,
  PRESETS_DIR,
  THEME_CSS,
  derive,
  listPresets,
  loadPreset,
  readTheme,
  sanitizeOverrides,
  resolve,
  serialize,
  ensureThemeCss,
  accent,
  themeColor,
  audit,
};
