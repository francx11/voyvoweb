/* Static export for GitHub Pages.
 *
 * Phase 1 of the migration off WordPress: the site goes live on the official
 * domain with no server behind it. There is no second renderer — this script
 * boots the real Express app on an ephemeral port and freezes every public
 * GET to dist/api/<name>.json, so the shipped HTML/CSS/JS is byte-identical
 * to what the Node deployment serves and the two can never drift.
 *
 * What is left out: the admin panel and the order-status page (both need the
 * API), and online ordering, which is forced off — a static host cannot take
 * an order. Content changes go through the panel locally, then a rebuild.
 *
 * Usage: pnpm build:static   →   dist/
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { renderCarta, renderContacto } from './lib/pages.mjs';

// Must be set before src/config is required: the flag is read at load time,
// and an ordering-enabled .env must never leak into a backendless build.
process.env.ORDERING_ENABLED = 'false';

const require = createRequire(import.meta.url);
const { PUBLIC_DIR, DIST_DIR, SITE_DOMAIN, STATIC_EXCLUDE } = require('../src/config');
const { createApp } = require('../src/app');

// Public GETs the storefront makes, mirroring apiUrl() in public/js/main.js.
const ENDPOINTS = [
  'site',
  'menu',
  'monthly-special',
  'offers',
  'gallery',
  'reviews',
  'ordering/config',
  'features',
];

const log = (msg) => console.log(`  ${msg}`);

async function snapshot(base) {
  for (const name of ENDPOINTS) {
    const res = await fetch(`${base}/api/${name}`);
    if (!res.ok) throw new Error(`GET /api/${name} → ${res.status}`);
    const body = await res.json();
    if (name === 'features') body.static = true;
    const file = path.join(DIST_DIR, 'api', `${name}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(body, null, 2));
    log(`api/${name}.json`);
  }
}

async function copyPublic() {
  const skip = new Set(STATIC_EXCLUDE.map((f) => path.join(PUBLIC_DIR, f)));
  await fs.cp(PUBLIC_DIR, DIST_DIR, {
    recursive: true,
    filter: (src) => !skip.has(src),
  });
}

// Two build-time rewrites of the published HTML:
//
//   1. window.VV_STATIC in index.html, so main.js asks for /api/menu.json
//      instead of /api/menu — the one behavioural difference between the two
//      deployments.
//   2. SITE_DOMAIN in every absolute URL of every page. Asset paths are
//      root-relative and carry no domain, but canonical, og:url, og:image and
//      the JSON-LD cannot be: a relative canonical or og:image is ignored by
//      Google and by WhatsApp. The domain they are written with in the source
//      files is taken from index.html's <link rel="canonical">, so the value
//      lives in one place and `SITE_DOMAIN=otro.com pnpm build:static` comes
//      out whole — legal pages included.
async function htmlFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

async function rewriteHtml() {
  const index = path.join(DIST_DIR, 'index.html');
  let html = await fs.readFile(index, 'utf-8');

  const marker = '<script src="/js/main.js"';
  if (!html.includes(marker)) throw new Error('index.html: main.js script tag not found');
  html = html.replace(marker, `<script>window.VV_STATIC = true;</script>\n  ${marker}`);
  await fs.writeFile(index, html);

  const canonical = html.match(/<link rel="canonical" href="https:\/\/([^/"]+)\//);
  if (!canonical) throw new Error('index.html: <link rel="canonical"> not found');
  const sourceDomain = canonical[1];
  if (sourceDomain === SITE_DOMAIN) return 0;

  let rewritten = 0;
  for (const file of await htmlFiles(DIST_DIR)) {
    const before = await fs.readFile(file, 'utf-8');
    const after = before.replaceAll(`https://${sourceDomain}`, () => {
      rewritten += 1;
      return `https://${SITE_DOMAIN}`;
    });
    if (after !== before) await fs.writeFile(file, after);
  }
  if (!rewritten) throw new Error(`no absolute ${sourceDomain} URL to rewrite`);
  return rewritten;
}

// The old WordPress had real pages at these paths and Google has had them
// indexed since 2024. GitHub Pages cannot issue a 30x, so each one becomes a
// directory with a meta-refresh page: Google treats a 0-second refresh as a
// permanent redirect and the canonical tells it which URL to keep, while a
// visitor arriving from a stale search result lands on the right section
// instead of on a 404.
//
// /carta/ and /contacto/ are NOT here: Search Console shows they still earn
// real traffic (534 and 21 clicks a year), so they keep their own indexable
// page with the content inside — see writeContentPages().
//
// No `noindex` on these stubs on purpose: Google asks not to combine a
// redirect with noindex, because the noindex can end up applied to the target.
const LEGACY_PATHS = {
  galeria: '/#gallery',
  'quienes-somos': '/#story',
  resenas: '/',
};

async function writeLegacyRedirects() {
  for (const [from, to] of Object.entries(LEGACY_PATHS)) {
    const dir = path.join(DIST_DIR, from);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <title>Pizzería Voy Volando</title>\n  <link rel="canonical" href="https://${SITE_DOMAIN}${to.split('#')[0]}">\n  <meta http-equiv="refresh" content="0; url=${to}">\n</head>\n<body>\n  <p>Esta página se ha movido. <a href="${to}">Ir a la página actual</a>.</p>\n  <script>location.replace('${to}');</script>\n</body>\n</html>\n`
    );
  }
  return Object.keys(LEGACY_PATHS).length;
}

// /carta/ and /contacto/ as real, indexable pages.
//
// The storefront is one page with anchored sections and the menu is painted in
// the browser from /api/menu.json, so for Google the whole site is a single
// URL — a #fragment is not indexable on its own. Search Console says /carta/
// brought 534 clicks in 12 months (30 % of the site) and /contacto/ another 21,
// which is more than enough to justify two real URLs.
//
// They are rendered from the JSON snapshot that snapshot() just froze, not
// from data/ directly: whatever the storefront shows is exactly what these
// pages say, with no second source of truth to drift.
async function readSnapshot(name) {
  return JSON.parse(await fs.readFile(path.join(DIST_DIR, 'api', `${name}.json`), 'utf-8'));
}

async function writeContentPages() {
  const [menu, ordering, site] = await Promise.all([
    readSnapshot('menu'),
    readSnapshot('ordering/config'),
    readSnapshot('site'),
  ]);

  const pages = {
    carta: renderCarta({ domain: SITE_DOMAIN, menu, ordering, site }),
    contacto: renderContacto({ domain: SITE_DOMAIN, site, ordering }),
  };
  for (const [dir, html] of Object.entries(pages)) {
    await fs.mkdir(path.join(DIST_DIR, dir), { recursive: true });
    await fs.writeFile(path.join(DIST_DIR, dir, 'index.html'), html);
  }
  return { pages: Object.keys(pages).length, items: menu.filter((i) => i.active !== false).length };
}

// Crawlers must be able to fetch the frozen JSON — the menu is rendered from
// it client-side, so a Disallow: /api/ would hide the whole carta from Google.
// /admin and the API routes do not exist in this build anyway.
async function writeHostingFiles() {
  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(DIST_DIR, 'CNAME'), `${SITE_DOMAIN}\n`);
  await fs.writeFile(path.join(DIST_DIR, '.nojekyll'), ''); // keep _-prefixed paths
  await fs.writeFile(
    path.join(DIST_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: https://${SITE_DOMAIN}/sitemap.xml\n`
  );
  const urls = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/carta/', changefreq: 'weekly', priority: '0.9' },
    { loc: '/contacto/', changefreq: 'monthly', priority: '0.7' },
    { loc: '/aviso-legal/', changefreq: 'yearly', priority: '0.3' },
    { loc: '/privacidad/', changefreq: 'yearly', priority: '0.3' },
  ]
    .map(
      (u) =>
        `  <url>
    <loc>https://${SITE_DOMAIN}${u.loc}</loc>
` +
        `    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
` +
        `    <priority>${u.priority}</priority>
  </url>
`
    )
    .join('');
  await fs.writeFile(
    path.join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>
`
  );
  await fs.writeFile(
    path.join(DIST_DIR, '404.html'),
    `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Página no encontrada — Pizzería Voy Volando</title>\n  <meta name="robots" content="noindex">\n  <link rel="stylesheet" href="/css/main.css">\n</head>\n<body>\n  <main class="section">\n    <div class="container-narrow" style="text-align:center">\n      <h1 class="section-title">Esta página no existe</h1>\n      <p>Vuelve a la portada para ver la carta y contactar con nosotros.</p>\n      <p><a class="btn btn-primary" href="/">Ir a la portada</a></p>\n    </div>\n  </main>\n</body>\n</html>\n`
  );
}

async function main() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  console.log(`\nBuild estático → ${DIST_DIR}`);
  await copyPublic();
  log(`public/ copiado (sin ${STATIC_EXCLUDE.join(', ')})`);

  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await snapshot(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }

  const rewritten = await rewriteHtml();
  if (rewritten) log(`${rewritten} URLs absolutas → ${SITE_DOMAIN}`);
  const content = await writeContentPages();
  log(`${content.pages} páginas indexables (carta con ${content.items} platos)`);
  const redirects = await writeLegacyRedirects();
  log(`${redirects} redirecciones de URLs antiguas`);
  await writeHostingFiles();
  log(`CNAME ${SITE_DOMAIN}, robots.txt, sitemap.xml, 404.html, .nojekyll`);
  console.log('\nListo. Sirve dist/ con cualquier estático (GitHub Pages incluido).\n');
}

main().catch((err) => {
  console.error('\nBuild estático fallido:', err.message);
  process.exit(1);
});
