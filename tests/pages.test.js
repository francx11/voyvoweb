// La carta estática: cómo decide /carta/ qué prometer en su enlace de vuelta a
// la portada. Se prueba aquí y no en build-static.test.js porque aquel ejecuta
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

test('sin fotos subidas, /carta/ no promete fotos en la portada', async () => {
  const html = await carta({ menu: { mode: 'products' } });
  assert.ok(!html.includes('con fotos'), 'la carta promete fotos que no existen');
  assert.ok(html.includes('filtrar por alérgenos'), 'falta lo que la portada sí ofrece');
});

test('con una sola foto subida, "auto" ya promete fotos', async () => {
  const menu = [{ ...MENU[0], image: '/assets/menu/abc.webp' }, MENU[1]];
  const html = await carta({ menu: { photos: 'auto' } }, menu);
  assert.ok(html.includes('Ver la carta con fotos'));
});

test('"never" no promete fotos aunque haya alguna subida', async () => {
  const menu = [{ ...MENU[0], image: '/assets/menu/abc.webp' }, MENU[1]];
  const html = await carta({ menu: { photos: 'never' } }, menu);
  assert.ok(!html.includes('con fotos'));
});

test('"always" promete fotos aunque no haya ninguna subida', async () => {
  const html = await carta({ menu: { photos: 'always' } });
  assert.ok(html.includes('Ver la carta con fotos'));
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
