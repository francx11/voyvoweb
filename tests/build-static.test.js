// El export estático es lo que se publica en producción: si el dominio se
// queda a medio reescribir, el canonical y el og:image apuntan al dominio
// viejo y no lo nota nadie hasta que Google indexa mal.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-dist-'));
const DOMAIN = 'dominio-de-prueba.example';

after(() => fs.rmSync(OUT, { recursive: true, force: true }));

test('el build estático reescribe el dominio en todas partes', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.mjs')], {
    cwd: ROOT,
    env: { ...process.env, SITE_DOMAIN: DOMAIN, DIST_DIR: OUT },
    stdio: 'pipe',
  });

  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf-8');
  assert.match(html, new RegExp(`<link rel="canonical" href="https://${DOMAIN}/"`));
  assert.match(html, new RegExp(`<meta property="og:image" content="https://${DOMAIN}/`));
  assert.ok(html.includes('window.VV_STATIC = true'), 'falta la bandera VV_STATIC');

  // Ninguna URL del sitio puede quedarse con el dominio de partida (las de
  // schema.org y Google Fonts son externas y siguen igual, claro).
  const stray = html.match(/https:\/\/[a-z0-9.-]*voyvolandosantafe\.com\S*/gi) || [];
  assert.deepStrictEqual(stray, [], `URLs sin reescribir: ${stray.join(', ')}`);
  // El correo lleva el dominio dentro y no es una URL del sitio: no se toca.
  assert.ok(html.includes('info@voyvolandosantafe.com'), 'el email no debe reescribirse');

  assert.strictEqual(fs.readFileSync(path.join(OUT, 'CNAME'), 'utf-8').trim(), DOMAIN);
  assert.ok(fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8').includes(`https://${DOMAIN}/`));
  assert.ok(fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf-8').includes(`https://${DOMAIN}/`));
});
