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
