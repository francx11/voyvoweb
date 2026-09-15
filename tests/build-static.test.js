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

  // Las páginas legales llevan su propio canonical absoluto: si la reescritura
  // solo mirara index.html, se quedarían apuntando al dominio anterior.
  for (const page of ['aviso-legal', 'privacidad']) {
    const legal = fs.readFileSync(path.join(OUT, page, 'index.html'), 'utf-8');
    assert.match(legal, new RegExp(`<link rel="canonical" href="https://${DOMAIN}/${page}/"`));
    assert.ok(!legal.includes('voyvolandosantafe.com/'), `${page}: URL sin reescribir`);
  }

  // Las URLs del WordPress viejo siguen indexadas: cada una tiene que seguir
  // llevando a algún sitio en vez de a un 404. Sin noindex: Google pide no
  // mezclar redirección y noindex, porque acaba aplicándolo al destino.
  for (const [from, to] of [
    ['galeria', '/#gallery'],
    ['quienes-somos', '/#story'],
    ['resenas', '/'],
  ]) {
    const page = fs.readFileSync(path.join(OUT, from, 'index.html'), 'utf-8');
    assert.match(page, new RegExp(`content="0; url=${to}"`));
    assert.ok(!page.includes('noindex'), `${from}: la redirección no debe llevar noindex`);
  }

  // /carta/ y /contacto/ no son redirecciones: son las dos páginas con tráfico
  // real del sitio (534 y 21 clics al año) y tienen que ser indexables, con el
  // contenido dentro del HTML y no pintado por JavaScript.
  for (const page of ['carta', 'contacto']) {
    const html = fs.readFileSync(path.join(OUT, page, 'index.html'), 'utf-8');
    assert.match(html, new RegExp(`<link rel="canonical" href="https://${DOMAIN}/${page}/"`));
    assert.ok(!html.includes('noindex'), `${page}: la página debe ser indexable`);
    assert.ok(!html.includes('voyvolandosantafe.com/'), `${page}: URL sin reescribir`);
    assert.match(html, /<h1[^>]*>/, `${page}: falta el h1`);
    assert.ok(html.includes('Santa Fe'), `${page}: el título local no aparece`);
  }

  // La carta tiene que traer los platos y sus precios escritos, que es lo que
  // se perdía al redirigir /carta/ a un fragmento (#menu no se indexa aparte).
  const carta = fs.readFileSync(path.join(OUT, 'carta', 'index.html'), 'utf-8');
  const menu = JSON.parse(fs.readFileSync(path.join(OUT, 'api', 'menu.json'), 'utf-8'));
  // Con los pedidos apagados —que es como sale el build estático— la categoría
  // "Ofertas" no entra: repite las promos de #offers y aquí sería contenido
  // duplicado en otra URL.
  const activos = menu.filter((item) => item.active !== false && item.category !== 'Ofertas');
  const promos = menu.filter((item) => item.active !== false && item.category === 'Ofertas');
  assert.ok(activos.length > 0, 'la carta de prueba está vacía');
  for (const item of activos) {
    assert.ok(carta.includes(item.name), `la carta no incluye "${item.name}"`);
  }
  for (const item of promos) {
    assert.ok(!carta.includes(item.name), `la carta duplica la oferta "${item.name}"`);
  }
  assert.ok(carta.includes('"@type": "Menu"'), 'falta el JSON-LD de tipo Menu');
  assert.match(carta, /\d+,\d{2} €/, 'la carta no muestra ningún precio');

  // Sin enlaces desde la portada las dos páginas quedan huérfanas y Google
  // tarda mucho más en encontrarlas.
  assert.ok(html.includes('href="/carta/"'), 'la portada no enlaza /carta/');
  assert.ok(html.includes('href="/contacto/"'), 'la portada no enlaza /contacto/');

  assert.strictEqual(fs.readFileSync(path.join(OUT, 'CNAME'), 'utf-8').trim(), DOMAIN);
  assert.ok(fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8').includes(`https://${DOMAIN}/`));
  assert.ok(fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf-8').includes(`https://${DOMAIN}/`));

  const sitemap = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf-8');
  for (const loc of ['/', '/carta/', '/contacto/', '/aviso-legal/', '/privacidad/']) {
    assert.ok(sitemap.includes(`<loc>https://${DOMAIN}${loc}</loc>`), `sitemap sin ${loc}`);
  }
});
