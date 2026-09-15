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

// Two build-time rewrites of the published index.html:
//
//   1. window.VV_STATIC, so main.js asks for /api/menu.json instead of /api/menu
//      — the one behavioural difference between the two deployments.
//   2. SITE_DOMAIN in the handful of URLs that have to be absolute (canonical,
//      og:url, og:image, JSON-LD). Asset paths are root-relative and carry no
//      domain, but these cannot be: a relative canonical or og:image is ignored
//      by Google and by WhatsApp. The domain they are written with in the
//      source file is taken from <link rel="canonical">, so the value lives in
//      one place and `SITE_DOMAIN=otro.com pnpm build:static` comes out whole.
async function rewriteIndexHtml() {
  const file = path.join(DIST_DIR, 'index.html');
  let html = await fs.readFile(file, 'utf-8');

  const marker = '<script src="/js/main.js"';
  if (!html.includes(marker)) throw new Error('index.html: main.js script tag not found');
  html = html.replace(marker, `<script>window.VV_STATIC = true;</script>\n  ${marker}`);

  const canonical = html.match(/<link rel="canonical" href="https:\/\/([^/"]+)\//);
  if (!canonical) throw new Error('index.html: <link rel="canonical"> not found');
  const sourceDomain = canonical[1];
  let rewritten = 0;
  if (sourceDomain !== SITE_DOMAIN) {
    html = html.replaceAll(`https://${sourceDomain}`, () => {
      rewritten += 1;
      return `https://${SITE_DOMAIN}`;
    });
    if (!rewritten) throw new Error(`index.html: no absolute ${sourceDomain} URL to rewrite`);
  }

  await fs.writeFile(file, html);
  return rewritten;
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
  await fs.writeFile(
    path.join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://${SITE_DOMAIN}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`
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

  const rewritten = await rewriteIndexHtml();
  if (rewritten) log(`index.html: ${rewritten} URLs absolutas → ${SITE_DOMAIN}`);
  await writeHostingFiles();
  log(`CNAME ${SITE_DOMAIN}, robots.txt, sitemap.xml, 404.html, .nojekyll`);
  console.log('\nListo. Sirve dist/ con cualquier estático (GitHub Pages incluido).\n');
}

main().catch((err) => {
  console.error('\nBuild estático fallido:', err.message);
  process.exit(1);
});
