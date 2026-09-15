// Colour maths for the theme engine: WCAG 2.x contrast plus the mixing
// helpers the token derivation needs. No dependencies, no colour spaces
// beyond sRGB — every input and output is a `#rrggbb` string.
//
// The regex is the project's single definition of "a valid colour": the menu
// route validates tagColor with it and the theme routes reuse it, so a colour
// the panel accepts is a colour every layer accepts.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const isHex = (v) => typeof v === 'string' && HEX_RE.test(v);

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

function toRgb(hex) {
  if (!isHex(hex)) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) =>
  '#' +
  rgb
    .map(clamp255)
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');

// Space-separated triplet for `rgb(var(--shadow-rgb) / 0.25)` in CSS: the
// colour travels in the token, the alpha stays in the rule that uses it.
const toTriplet = (hex) => toRgb(hex).join(' ');

// WCAG 2.x relative luminance (sRGB gamma expansion).
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio, 1..21. Order of arguments does not matter.
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Linear sRGB mix. amount 0 → a, 1 → b. Matches CSS color-mix closely enough
// for deriving surfaces, and keeps the maths inspectable in tests.
function mix(a, b, amount) {
  const ra = toRgb(a);
  const rb = toRgb(b);
  return toHex(ra.map((c, i) => c + (rb[i] - c) * amount));
}

const darken = (hex, amount) => mix(hex, '#000000', amount);
const lighten = (hex, amount) => mix(hex, '#ffffff', amount);

// Picks whichever candidate reads best on `bg`. Used for --on-tomato and
// friends so a foreground is never chosen by eye.
function bestOn(bg, candidates) {
  return candidates.reduce((best, c) => (ratio(bg, c) > ratio(bg, best) ? c : best));
}

module.exports = {
  HEX_RE,
  isHex,
  toRgb,
  toHex,
  toTriplet,
  luminance,
  ratio,
  mix,
  darken,
  lighten,
  bestOn,
};
