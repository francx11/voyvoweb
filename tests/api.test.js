// Integration tests against the real Express app on an ephemeral port.
// DATA_DIR/PUBLIC_DIR point to a temp dir so real content is never touched.
// Run: pnpm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voyvoweb-test-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.PUBLIC_DIR = path.join(tmp, 'public');
process.env.ADMIN_PASSWORD = 'test-password-123';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const sharp = require('sharp');
const { createApp } = require('../src/app');

let server;
let base;
let cookie = '';

const api = async (method, route, body, opts = {}) => {
  const res = await fetch(base + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(opts.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && opts.keepCookie !== false) cookie = setCookie.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
};

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('GET /api/menu is public and starts empty', async () => {
  const r = await api('GET', '/api/menu');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, []);
});

test('mutations without session are rejected with 401 JSON', async () => {
  const r = await api('POST', '/api/menu', { name: 'Margarita' });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'No autorizado');
});

test('login rejects a wrong password', async () => {
  const r = await api('POST', '/api/login', { password: 'nope' });
  assert.equal(r.status, 401);
});

test('login accepts ADMIN_PASSWORD and sets the session cookie', async () => {
  const r = await api('POST', '/api/login', { password: 'test-password-123' });
  assert.equal(r.status, 200);
  assert.match(cookie, /^vv_sess=/);
  const s = await api('GET', '/api/session');
  assert.equal(s.json.authenticated, true);
});

test('menu CRUD: create, sanitize, reorder, update, delete', async () => {
  const a = await api('POST', '/api/menu', { name: 'Margarita', price: '8.5', tagColor: 'red' });
  assert.equal(a.status, 200);
  assert.equal(a.json.price, 8.5);
  assert.equal(a.json.tagColor, '#C41E3A'); // invalid hex falls back to brand color

  const b = await api('POST', '/api/menu', { name: 'Diavola', price: 10 });
  const list = (await api('GET', '/api/menu')).json;
  assert.deepEqual(
    list.map((p) => p.name),
    ['Margarita', 'Diavola']
  );

  const order = await api('PUT', '/api/menu/order', { ids: [b.json.id, a.json.id] });
  assert.equal(order.status, 200);
  assert.deepEqual(
    (await api('GET', '/api/menu')).json.map((p) => p.name),
    ['Diavola', 'Margarita']
  );

  const upd = await api('PUT', `/api/menu/${a.json.id}`, { active: false });
  assert.equal(upd.json.active, false);
  assert.equal(upd.json.name, 'Margarita'); // partial update keeps other fields

  await api('DELETE', `/api/menu/${b.json.id}`);
  assert.equal((await api('GET', '/api/menu')).json.length, 1);
});

test('PUT /api/site deep-merges menu so the PDF path survives a mode switch', async () => {
  await api('PUT', '/api/site', { menu: { pdf: '/assets/menu-1.pdf' } });
  await api('PUT', '/api/site', { menu: { mode: 'pdf' } });
  const site = (await api('GET', '/api/site')).json;
  assert.equal(site.menu.pdf, '/assets/menu-1.pdf');
  assert.equal(site.menu.mode, 'pdf');
});

test('monthly special round-trips and coerces active to boolean', async () => {
  await api('PUT', '/api/monthly-special', { active: 'yes', name: 'Trufa' });
  const ms = (await api('GET', '/api/monthly-special')).json;
  assert.equal(ms.active, false); // only active === true counts
  assert.equal(ms.name, 'Trufa');
});

test('offers: public read, admin write, untitled cards dropped', async () => {
  assert.deepEqual((await api('GET', '/api/offers')).json, {
    active: false,
    intro: '',
    items: [],
  });

  const saved = await api('PUT', '/api/offers', {
    active: true,
    intro: 'Promos de la semana',
    items: [
      { id: 'familiares-10', title: 'Familiares a 10 EUR', description: 'Solo a recoger' },
      { id: 'vacia', title: '', description: 'sin titulo, se descarta' },
    ],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.items.length, 1);
  assert.equal(saved.json.items[0].id, 'familiares-10');
  assert.equal((await api('GET', '/api/offers')).json.active, true);
});

// Photos are uploaded to their own endpoint, so the whole-document save has to
// carry them across by id: without that, editing a title would blank the photo,
// and deleting a card would leave its WebP orphaned in public/assets/ofertas.
test('offers: the photo survives a text save and dies with its card', async () => {
  const png = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#c00' },
  })
    .png()
    .toBuffer();

  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'oferta.png');
  const up = await fetch(base + '/api/offers/familiares-10/image', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  const uploaded = await up.json();
  assert.equal(up.status, 200);
  assert.match(uploaded.image, /^\/assets\/ofertas\/\d+-\w+\.webp$/);

  const onDisk = path.join(
    process.env.PUBLIC_DIR,
    'assets',
    'ofertas',
    path.basename(uploaded.image)
  );
  assert.ok(fs.existsSync(onDisk), 'la imagen tendria que estar en disco');

  // Guardar solo texto no puede perder la foto.
  const kept = await api('PUT', '/api/offers', {
    active: true,
    intro: 'Promos de la semana',
    items: [{ id: 'familiares-10', title: 'Familiares a 10 EUR (editado)' }],
  });
  assert.equal(kept.json.items[0].image, uploaded.image);
  assert.ok(fs.existsSync(onDisk));

  // Quitar la tarjeta se lleva su fichero por delante.
  await api('PUT', '/api/offers', { active: true, intro: '', items: [] });
  assert.equal(fs.existsSync(onDisk), false, 'la imagen huerfana tendria que borrarse');
});

test('offers: uploading to an unknown card is a 404 and writes nothing', async () => {
  const dir = path.join(process.env.PUBLIC_DIR, 'assets', 'ofertas');
  const before = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const png = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#00c' },
  })
    .png()
    .toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'x.png');
  const r = await fetch(base + '/api/offers/no-existe/image', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  assert.equal(r.status, 404);
  const after = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  assert.deepEqual(after, before, 'no tendria que haber dejado ningun fichero');
});

test('monthly special: a text save keeps the photo', async () => {
  const png = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#0c0' },
  })
    .png()
    .toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'pizza.png');
  const up = await fetch(base + '/api/monthly-special/image', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  const { image } = await up.json();
  assert.match(image, /^\/assets\/especial\//);

  await api('PUT', '/api/monthly-special', { active: true, name: 'Guanciale' });
  assert.equal((await api('GET', '/api/monthly-special')).json.image, image);

  await api('DELETE', '/api/monthly-special/image');
  assert.equal((await api('GET', '/api/monthly-special')).json.image, undefined);
  assert.equal(
    fs.existsSync(path.join(process.env.PUBLIC_DIR, 'assets', 'especial', path.basename(image))),
    false
  );
});

test('password change validates current password and length', async () => {
  const wrong = await api('POST', '/api/password', {
    currentPassword: 'bad',
    newPassword: 'new-password-1',
  });
  assert.equal(wrong.status, 401);
  const short = await api('POST', '/api/password', {
    currentPassword: 'test-password-123',
    newPassword: 'short',
  });
  assert.equal(short.status, 400);
});

test('malformed JSON body gets a JSON 400, not an HTML error page', async () => {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type').includes('application/json'), true);
  assert.equal((await res.json()).error, 'JSON inválido');
});

test('reviews endpoint reports unconfigured without leaking anything', async () => {
  delete process.env.GOOGLE_API_KEY;
  const r = await api('GET', '/api/reviews');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { configured: false, reviews: [] });
});

// ── Online ordering kill switch (ORDERING_ENABLED unset in this file) ──────

test('features endpoint reports ordering off', async () => {
  const r = await api('GET', '/api/features');
  assert.equal(r.status, 200);
  assert.equal(r.json.ordering, false);
});

test('ordering disabled: order routes are not mounted at all', async () => {
  const post = await api('POST', '/api/orders', { items: [] });
  assert.equal(post.status, 404);
  const places = await api('GET', '/api/places/autocomplete?input=calle');
  assert.equal(places.status, 404);
});

test('ordering disabled: public config says enabled:false but keeps prices', async () => {
  fs.writeFileSync(
    path.join(process.env.DATA_DIR, 'ordering.json'),
    JSON.stringify({
      enabled: true,
      tiers: { clasica: { label: 'C', sizes: [{ id: 'peq', label: 'Peq', price: 7 }] } },
    })
  );
  const r = await api('GET', '/api/ordering/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.enabled, false, 'the env flag overrides ordering.json');
  assert.equal(r.json.open, false);
  // The carta still prices tier items, ordering or not.
  assert.equal(r.json.tiers.clasica.sizes[0].price, 7);
});

test('ordering disabled: admin settings still editable, flagged as overridden', async () => {
  const r = await api('GET', '/api/ordering/settings');
  assert.equal(r.status, 200);
  assert.equal(r.json.featureEnabled, false);
});

test('logout invalidates the session', async () => {
  await api('POST', '/api/logout');
  cookie = cookie.replace(/=.*/, '=deadbeef');
  const r = await api('POST', '/api/menu', { name: 'X' });
  assert.equal(r.status, 401);
  cookie = '';
});

test('login rate limit: 5 failures → 429', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/api/login', { password: 'wrong' });
    assert.equal(r.status, 401, `fail ${i + 1} should still be 401`);
  }
  const blocked = await api('POST', '/api/login', { password: 'test-password-123' });
  assert.equal(blocked.status, 429);
});
