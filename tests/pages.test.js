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
