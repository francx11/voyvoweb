// Theme engine tests. These run against the REAL data/themes presets on
// purpose: a preset that ships an unreadable palette should fail CI, not wait
// to be noticed on the live site.
//
// The most valuable test here is "every token main.css uses is defined in all
// three selectors". The failure mode it catches — a token defined in :root but
// forgotten in the dark blocks — is invisible text in production, and nothing
// else in the suite would see it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contrast = require('../src/lib/contrast');
const theme = require('../src/services/theme-store');

const ROOT = path.join(__dirname, '..');
const MAIN_CSS = fs.readFileSync(path.join(ROOT, 'public/css/main.css'), 'utf-8');

// Tokens main.css defines for itself (geometry and fonts); everything else it
// references has to come from theme.css.
const SELF_DEFINED = new Set([...MAIN_CSS.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

const presetFiles = fs
  .readdirSync(theme.PRESETS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

// ── contrast maths ───────────────────────────────────────────────────────────

test('contrast ratio matches known WCAG reference values', () => {
  assert.equal(Number(contrast.ratio('#000000', '#ffffff').toFixed(2)), 21);
  // The canonical "smallest grey that passes AA on white".
  assert.equal(Number(contrast.ratio('#767676', '#ffffff').toFixed(2)), 4.54);
  // Order must not matter.
  assert.equal(contrast.ratio('#b00e14', '#faf2e2'), contrast.ratio('#faf2e2', '#b00e14'));
});

test('contrast reproduces the brand document table (docs/marca/tokens-web.md)', () => {
  const round = (a, b) => Number(contrast.ratio(a, b).toFixed(1));
  assert.equal(round('#faf2e2', '#0a2a6b'), 12.1); // doc: 12,0
  assert.equal(round('#faf2e2', '#b00e14'), 6.5); // doc: 6,5
  assert.equal(round('#f0c24b', '#0a2a6b'), 8.0); // doc: 7,8
  // The one hard prohibition in the brand document.
  assert.ok(round('#f0c24b', '#faf2e2') < 2, 'gold on cream must stay unreadable');
});

test('toTriplet emits the space-separated form rgb(var(--x) / a) needs', () => {
  assert.equal(contrast.toTriplet('#2b2620'), '43 38 32');
  assert.equal(contrast.toTriplet('#000000'), '0 0 0');
});

// ── the token guard ──────────────────────────────────────────────────────────

test('every var(--x) main.css uses is defined in all three theme selectors', () => {
  const used = new Set([...MAIN_CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  const css = theme.serialize();
  const blocks = css.split(/(?=:root|@media)/).filter((b) => b.includes('--'));
  assert.equal(blocks.length, 3, 'theme.css must emit exactly three selector blocks');

  for (const token of used) {
    if (SELF_DEFINED.has(token)) continue;
    for (const [i, block] of blocks.entries()) {
      assert.ok(
        block.includes(token + ':'),
        `${token} is used by main.css but missing from theme.css block #${i + 1}. ` +
          'A token defined in :root but not in the dark blocks is invisible text.'
      );
    }
  }
});

test('main.css defines no colour of its own', () => {
  // Two #fff are deliberate and annotated (see the comments at each site): the
  // backgrounds under them are arbitrary (a panel-chosen tagColor, and a dark
  // veil over a photo), so no token can determine them.
  const hexes = [...MAIN_CSS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  const unexpected = hexes.filter((h) => h.toLowerCase() !== '#fff');
  assert.deepEqual(unexpected, [], 'colours belong in a theme preset, not in main.css');

  const rgba = [...MAIN_CSS.matchAll(/rgba?\((?!var\()[^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(rgba, [], 'raw rgb()/rgba() belongs in a theme preset');
});

test('the dark override block comes after the media query', () => {
  const css = theme.serialize();
  // Identical specificity (0,2,0) — document order is the only tiebreak, so a
  // reordered serializer would silently stop the manual toggle from winning.
  assert.ok(css.indexOf('@media') < css.indexOf(':root[data-theme="dark"]'));
});

// ── presets ──────────────────────────────────────────────────────────────────

test('every preset in data/themes resolves and names all six core colours', () => {
  assert.ok(presetFiles.length > 0, 'there must be at least one preset');
  for (const id of presetFiles) {
    const resolved = theme.resolve({ preset: id, overrides: { light: {}, dark: {} } });
    for (const mode of ['light', 'dark']) {
      for (const key of theme.CORE) {
        assert.ok(contrast.isHex(resolved[mode][key]), `${id}/${mode}: ${key} must be #rrggbb`);
      }
      for (const key of Object.keys(theme.CSS_NAMES)) {
        assert.ok(resolved[mode][key] !== undefined, `${id}/${mode}: ${key} is undefined`);
      }
    }
  }
});

test('every preset clears the hard contrast bars in both modes', () => {
  for (const id of presetFiles) {
    const resolved = theme.resolve({ preset: id, overrides: { light: {}, dark: {} } });
    for (const mode of ['light', 'dark']) {
      const { hard } = theme.audit(resolved[mode]);
      for (const [pair, value] of Object.entries(hard)) {
        assert.ok(value >= 4.5, `${id}/${mode}: ${pair} is ${value}:1, below AA (4.5:1)`);
      }
    }
  }
});

test('gold is never used as a text colour over a light background', () => {
  // The brand document's only outright prohibition is specifically gold on
  // CREAM: 1,5:1. Over the navy it is 7,8:1 and the same table approves it,
  // which is why the storefront uses it for the hero's accents.
  //
  // So the lint is scoped rather than absolute: gold as a text colour is only
  // allowed inside a selector that establishes a navy background. Anywhere
  // else it is unreadable, and it is cheaper to catch here than to compute,
  // because a stylesheet cannot know statically what is painted behind a rule.
  const NAVY_CONTEXTS = ['.hero', '.section-navy'];

  const offenders = [];
  for (const m of MAIN_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    for (const decl of body.matchAll(/(?<![-\w])color\s*:\s*([^;}]+)/g)) {
      if (!decl[1].includes('--gold')) continue;
      const sel = selector.trim();
      if (!NAVY_CONTEXTS.some((ctx) => sel.includes(ctx)))
        offenders.push(`${sel} { color: …--gold }`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'gold as text is only readable over the navy; over cream it is 1,5:1'
  );
});

test("the active preset's fonts are actually loaded on every page", () => {
  // The <link> to Google Fonts is hand-written in five places, on purpose: an
  // @import inside a stylesheet would chain HTML → CSS → googleapis → font
  // files in series and cost LCP. The price is that a half-done font change
  // falls back to Georgia in silence, so CI checks it instead.
  const active = theme.loadPreset(theme.readTheme().preset);
  assert.ok(active.fonts, 'the active preset must declare its fonts');

  const families = ['display', 'heading', 'body']
    .map((k) => active.fonts[k].match(/'([^']+)'/)[1])
    .filter((v, i, a) => a.indexOf(v) === i);

  const pages = [
    'public/index.html',
    'public/pedido.html',
    'public/aviso-legal/index.html',
    'public/privacidad/index.html',
    'scripts/lib/pages.mjs',
  ];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf-8');
    const link = html.match(/fonts\.googleapis\.com\/css2\?[^"']+/);
    assert.ok(link, `${page}: no carga Google Fonts`);
    for (const family of families) {
      assert.ok(
        link[0].includes(family.replace(/ /g, '+')),
        `${page}: el <link> de fuentes no incluye ${family}`
      );
    }
  }

  // And main.css must actually use them.
  for (const token of ['--display', '--heading', '--body']) {
    assert.ok(MAIN_CSS.includes(token + ':'), `main.css no define ${token}`);
  }
});

test('"actual" reproduces the pre-theme-engine palette byte for byte', () => {
  // The preset that made introducing the engine a no-op visually. If these
  // drift, the claim "phase 1-4 changed no pixels" stops being true.
  const r = theme.resolve({ preset: 'actual', overrides: { light: {}, dark: {} } });
  assert.equal(r.light.paper, '#faf6ee');
  assert.equal(r.light.paper2, '#f3ecdf');
  assert.equal(r.light.ink, '#2b2620');
  assert.equal(r.light.inkSoft, '#5c544a');
  assert.equal(r.light.tomato, '#a83226');
  assert.equal(r.light.tomatoDark, '#87281f');
  assert.equal(r.light.line, 'rgb(43 38 32 / 0.18)');
  assert.equal(r.light.lineStrong, 'rgb(43 38 32 / 0.55)');
  assert.equal(r.light.shadowRgb, '43 38 32');
  assert.equal(r.light.scrimRgb, '20 16 12');
  assert.equal(r.dark.paper, '#211c17');
  assert.equal(r.dark.ink, '#f2ece1');
  assert.equal(r.dark.tomatoBtn, '#c2301d');
  assert.equal(r.dark.line, 'rgb(242 236 225 / 0.14)');
  // The one deliberate improvement: shadows are black in dark mode, where they
  // used to be light ink and therefore invisible.
  assert.equal(r.dark.shadowRgb, '0 0 0');
});

// ── derivation rules ─────────────────────────────────────────────────────────

test('a shadow is always darker than the surface it falls on', () => {
  const light = theme.derive({
    paper: '#ffffff',
    ink: '#111111',
    tomato: '#b00e14',
    tomatoBtn: '#b00e14',
    navy: '#0a2a6b',
    gold: '#f0c24b',
  });
  assert.equal(light.shadowRgb, '17 17 17', 'light mode: the ink');

  const dark = theme.derive({
    paper: '#111111',
    ink: '#eeeeee',
    tomato: '#e8564c',
    tomatoBtn: '#b00e14',
    navy: '#0a2a6b',
    gold: '#f0c24b',
  });
  // Not the ink (near-white: a halo) and not the paper (that IS the surface).
  assert.equal(dark.shadowRgb, '0 0 0', 'dark mode: black');
});

test('derived foregrounds stay readable on gold in both modes', () => {
  for (const [paper, ink] of [
    ['#faf2e2', '#16181d'],
    ['#0c1730', '#f3ece0'],
  ]) {
    const d = theme.derive({
      paper,
      ink,
      tomato: '#b00e14',
      tomatoBtn: '#b00e14',
      navy: '#0a2a6b',
      gold: '#f0c24b',
    });
    assert.ok(
      contrast.ratio(d.onGold, '#f0c24b') >= 4.5,
      `on-gold ${d.onGold} over gold is only ${contrast.ratio(d.onGold, '#f0c24b').toFixed(2)}:1`
    );
  }
});

test('overrides only accept known tokens holding valid colours', () => {
  const clean = theme.sanitizeOverrides({
    paper: '#ABCDEF',
    ink: 'red',
    nonsense: '#000000',
    tomato: '#b00e14',
  });
  assert.deepEqual(clean, { paper: '#abcdef', tomato: '#b00e14' });
  assert.deepEqual(theme.sanitizeOverrides(null), {});
});

test('an unknown preset falls back instead of throwing', () => {
  const r = theme.resolve({ preset: 'no-existe', overrides: { light: {}, dark: {} } });
  assert.equal(r.preset, 'actual');
});
