// La carta estática (/carta/) y las secciones opcionales de la portada. Se prueba aquí y no en build-static.test.js porque aquel ejecuta
// el build real contra data/ de verdad, así que no puede fijar un escenario.
const test = require('node:test');
const assert = require('node:assert');

const MENU = [
  { name: 'Margarita', category: 'Pizzas Clásicas', active: true, price: 8.5 },
  { name: 'Romana', category: 'Pizzas Clásicas', active: true, price: 9.5 },
];
const ORDERING = { enabled: false, tiers: {} };

async function carta(site, menu = MENU) {
  const { renderCarta } = await import('../scripts/lib/pages.mjs');
  return renderCarta({ domain: 'ejemplo.test', menu, ordering: ORDERING, site });
}

test('/carta/ no lleva botón de vuelta a la carta de la portada (el carrusel ya está aquí)', async () => {
  const menu = [{ ...MENU[0], image: '/assets/menu/abc.webp' }, MENU[1]];
  for (const photos of ['auto', 'always', 'never']) {
    const html = await carta({ menu: { photos } }, menu);
    assert.ok(!html.includes('href="/#menu"'), photos);
    assert.ok(!html.includes('Ver la carta'), photos);
  }
});

const FOTO = (name) => ({
  image: `/assets/menu/${name}-960.webp`,
  imageThumb: `/assets/menu/${name}-240.webp`,
  imageAlt: `Pizza ${name}`,
});
const CARRUSEL = /<section class="dish-carousel"[\s\S]*?<\/section>/;

test('/carta/: sección completa → miniatura en la fila, con alt, tamaño y srcset; sin carrusel', async () => {
  const menu = [
    { ...MENU[0], ...FOTO('margarita'), imageAlt: 'Pizza con tomate, mozzarella y orégano' },
    { ...MENU[1], ...FOTO('romana') },
  ];
  const html = await carta({ menu: { photos: 'auto' } }, menu);
  const imgs = html.match(/<img class="carta-item-photo"[^>]*>/g) || [];
  assert.equal(imgs.length, 2);
  const img = imgs[0];
  assert.match(img, /src="\/assets\/menu\/margarita-240\.webp"/);
  assert.match(img, /srcset="[^"]*-240\.webp 240w, [^"]*-960\.webp 960w"/);
  assert.match(img, /alt="Pizza con tomate, mozzarella y orégano"/);
  assert.match(img, /width="240" height="240"/, 'sin tamaño la página salta al cargar');
  assert.match(img, /loading="lazy"/);
  // El nombre ya es el <h3> de al lado: el alt no lo repite.
  assert.ok(!/alt="Margarita"/.test(html));
  assert.ok(!CARRUSEL.test(html), 'sin secciones a medias no hay carrusel');
  // JSON-LD: la foto grande, con URL absoluta.
  assert.ok(html.includes('"image": "https://ejemplo.test/assets/menu/margarita-960.webp"'));
});

test('/carta/: sección a medias → ninguna miniatura en sus filas y sus fotos en el carrusel', async () => {
  const menu = [
    { ...MENU[0], ...FOTO('margarita') },
    MENU[1],
    { name: 'Coca Cola', category: 'Bebidas', active: true, price: 2, ...FOTO('coca') },
  ];
  const html = await carta({ menu: { photos: 'auto' } }, menu);
  assert.ok(!html.includes('carta-item-photo'), 'Clásicas a medias no enseña miniaturas');
  const carrusel = html.match(CARRUSEL)[0];
  assert.match(carrusel, /aria-labelledby="dish-carousel-title"/);
  assert.match(carrusel, /data-carousel tabindex="0"/, 'la pista se puede pasar con el teclado');
  assert.match(carrusel, /data-carousel-count aria-hidden="true"/, 'contador visible');
  assert.match(
    carrusel,
    /data-carousel-status aria-live="polite"/,
    'el lector de pantalla oye dónde está'
  );
  assert.ok(!/ disabled/.test(carrusel), 'nada disabled: los botones no pierden el foco');
  assert.match(
    carrusel,
    /<img src="\/assets\/menu\/margarita-960\.webp"[^>]*alt="Pizza margarita"/
  );
  assert.match(carrusel, /<span class="dish-carousel-name">Margarita<\/span>/);
  assert.ok(!carrusel.includes('coca'), 'Bebidas nunca lleva foto, ni en el carrusel');
  assert.ok(!/autoplay|setInterval/.test(carrusel));
  // Google sigue viendo la foto: está en el carrusel y en el JSON-LD.
  assert.ok(html.includes('"image": "https://ejemplo.test/assets/menu/margarita-960.webp"'));
});

test('/carta/: foto sin alt revisado sale decorativa (alt vacío), y "never" no pinta ninguna', async () => {
  const menu = [
    { ...MENU[0], image: '/assets/menu/x.webp' },
    { ...MENU[1], image: '/assets/menu/y.webp' },
  ];
  const auto = await carta({ menu: { photos: 'auto' } }, menu);
  assert.match(auto, /<img class="carta-item-photo" src="\/assets\/menu\/x\.webp" alt=""/);
  const never = await carta({ menu: { photos: 'never' } }, menu);
  assert.ok(!never.includes('carta-item-photo'));
  assert.ok(!never.includes('dish-carousel'));
  assert.ok(!never.includes('"image": "https://ejemplo.test/assets/menu/'));
});

test('"always" no inventa fotos en /carta/: el placeholder no es una foto', async () => {
  const html = await carta({ menu: { photos: 'always' } });
  assert.ok(!html.includes('carta-item-photo'));
});

test('Just Eat: sin interruptor o encendido se publica; apagado se quita entera', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { applyJustEat } = await import('../scripts/lib/pages.mjs');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

  assert.strictEqual(applyJustEat(index, {}), index);
  assert.strictEqual(applyJustEat(index, { justEat: { enabled: true } }), index);

  const sin = applyJustEat(index, { justEat: { enabled: false } });
  assert.ok(!sin.includes('id="just-eat"'), 'sigue la sección');
  assert.ok(!sin.includes('just-eat.es'), 'sigue el enlace a Just Eat');
  assert.ok(sin.includes('id="gallery"'), 'se ha llevado la sección siguiente');
  assert.strictEqual(index.length - sin.length < 1200, true, 'ha quitado más de la cuenta');

  // Si alguien cambia el HTML y la sección ya no se reconoce, el build para.
  assert.throws(() => applyJustEat('<main></main>', { justEat: { enabled: false } }), /just-eat/);
});

test('Galería «Momentos»: sin interruptor o encendida se publica; apagada se quita entera', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { applyGallery } = await import('../scripts/lib/pages.mjs');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

  assert.strictEqual(applyGallery(index, {}), index);
  assert.strictEqual(applyGallery(index, { gallery: { enabled: true } }), index);

  const sin = applyGallery(index, { gallery: { enabled: false } });
  assert.ok(!sin.includes('id="gallery"'), 'sigue la sección');
  assert.ok(!sin.includes('Momentos en Voy Volando'), 'sigue el título');
  assert.ok(
    sin.includes('id="reviews"') || sin.includes('</main>'),
    'se ha llevado lo que va detrás'
  );
  assert.strictEqual(index.length - sin.length < 800, true, 'ha quitado más de la cuenta');
  assert.throws(() => applyGallery('<main></main>', { gallery: { enabled: false } }), /gallery/);
});

// Datos del titular (art. 10 LSSI-CE): si alguien deja un [campo] por rellenar
// o pierde el NIF/CIF al editar, se publicaría así en las dos páginas legales.
test('las páginas legales no publican campos de titular sin rellenar', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const page of ['aviso-legal', 'privacidad']) {
    const file = path.join(__dirname, '..', 'public', page, 'index.html');
    const visible = fs.readFileSync(file, 'utf-8').replace(/<!--[\s\S]*?-->/g, '');
    const dl = visible.match(/<dl class="legal-data">[\s\S]*?<\/dl>/);
    assert.ok(dl, `${page}: falta el bloque de datos del titular`);
    assert.ok(!/\[[^\]]+\]/.test(dl[0]), `${page}: hay un [campo] sin rellenar`);
    assert.match(dl[0], /NIF|CIF/, `${page}: falta el NIF/CIF del titular`);
  }
});

test('security-meta: CSP con hash por script inline, tras <meta charset>', async () => {
  const { applySecurityMeta, inlineScriptHashes } =
    await import('../scripts/lib/security-meta.mjs');
  const { createHash } = require('node:crypto');
  const html =
    '<head>\n  <meta charset="UTF-8">\n  <title>x</title>\n' +
    '  <script type="application/ld+json">{"a":1}</script>\n' +
    '  <script>window.VV_STATIC = true;</script>\n  <script src="/js/a.js"></script>\n</head>';
  const sha = createHash('sha256').update('window.VV_STATIC = true;').digest('base64');

  assert.deepStrictEqual(inlineScriptHashes(html), [`'sha256-${sha}'`], 'JSON-LD y src no cuentan');

  const out = applySecurityMeta(html, {
    csp: { 'default-src': ["'self'"], 'script-src': ["'self'"], 'upgrade-insecure-requests': [] },
    referrer: 'strict-origin-when-cross-origin',
  });
  assert.ok(
    out.includes(
      `<meta charset="UTF-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-${sha}'; upgrade-insecure-requests">`
    )
  );
  assert.ok(out.includes('<meta name="referrer" content="strict-origin-when-cross-origin">'));
  assert.strictEqual(applySecurityMeta(out, { csp: {}, referrer: 'x' }), out, 'no duplica');
  assert.throws(() => applySecurityMeta('<head></head>', { csp: {}, referrer: 'x' }), /charset/);
});

test('/carta/: índice antes de la lista, carrusel debajo, un ancla por sección', async () => {
  const menu = [
    // Clásicas a medio fotografiar: su foto va al carrusel.
    { ...MENU[0], image: '/assets/menu/x.webp' },
    MENU[1],
    { name: 'Tiramisú', category: 'Postres', active: true, price: 4 },
  ];
  const html = await carta({ menu: { photos: 'auto' } }, menu);
  const nav = html.indexOf('class="carta-nav"');
  assert.ok(nav > 0, 'sin índice de categorías');
  const carousel = html.indexOf('class="dish-carousel"');
  assert.ok(carousel > 0, 'sin carrusel');
  assert.ok(nav < html.indexOf('class="carta-group"'), 'el índice va antes de la lista');
  assert.ok(
    carousel > html.lastIndexOf('class="carta-group"'),
    'el carrusel va debajo de la lista, no antes'
  );
  for (const id of ['cat-pizzas-clasicas', 'cat-postres']) {
    assert.ok(html.includes(`href="#${id}"`), `sin enlace a ${id}`);
    assert.ok(html.includes(`id="${id}"`), `sin destino ${id}`);
  }
  assert.ok(html.includes('href="/a-domicilio/#zonas"'), 'sin acceso a zonas y condiciones');
});

test('zoneTermsOf: mínimo propio, «Consúltanos» si falta y el general sin zoneTerms', async () => {
  const { zoneTermsOf } = await import('../scripts/lib/pages.mjs');
  const zones = ['Santa Fe', 'Belicena'];
  assert.deepStrictEqual(zoneTermsOf({ fee: 2, minimum: 8, zones }), [
    { name: 'Santa Fe', fee: 2, minimum: 8 },
    { name: 'Belicena', fee: 2, minimum: 8 },
  ]);
  assert.deepStrictEqual(
    zoneTermsOf({
      fee: 2,
      minimum: 8,
      zones,
      zoneTerms: { 'Santa Fe': { minimum: 8 }, Belicena: { fee: 3 } },
    }),
    [
      { name: 'Santa Fe', fee: 2, minimum: 8 },
      { name: 'Belicena', fee: 3, minimum: null },
    ]
  );
});
