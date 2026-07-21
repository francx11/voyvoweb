// Integration tests for online ordering: server-side pricing, schedule
// gating, order lifecycle and the Stripe webhook. Same harness as
// api.test.js — real app, ephemeral port, temp DATA_DIR.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voyvoweb-orders-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.PUBLIC_DIR = path.join(tmp, 'public');
process.env.ADMIN_PASSWORD = 'test-password-123';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const { createApp } = require('../src/app');
const orderLimiter = require('../src/services/order-limiter');

let server;
let base;
let cookie = '';

const api = async (method, route, body, opts = {}) => {
  const res = await fetch(base + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie && opts.auth !== false ? { Cookie: cookie } : {}),
      ...(opts.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
};

const ORDERING = {
  enabled: true,
  tiers: {
    clasica: {
      label: 'Clásicas',
      sizes: [
        { id: 'peq', label: 'Pequeña 30cm', price: 6.7 },
        { id: 'fam', label: 'Familiar 40cm', price: 11.7 },
      ],
    },
  },
  modifierGroups: {
    'pizza-mods': {
      label: 'Personaliza',
      required: false,
      maxSelect: 2,
      options: [
        { id: 'mitad', label: 'Mitad y mitad', price: 1 },
        { id: 'gruesa', label: 'Masa gruesa', price: 2 },
      ],
    },
    'salsa-alitas': {
      label: 'Elige tu salsa',
      required: true,
      maxSelect: 1,
      options: [
        { id: 'bbq', label: 'Barbacoa', price: 0 },
        { id: 'picante', label: 'Picante', price: 0 },
      ],
    },
  },
  delivery: { fee: 1, minimum: 10, zones: ['Santa Fe'] },
  schedule: {
    mon: [['00:00', '24:00']],
    tue: [['00:00', '24:00']],
    wed: [['00:00', '24:00']],
    thu: [['00:00', '24:00']],
    fri: [['00:00', '24:00']],
    sat: [['00:00', '24:00']],
    sun: [['00:00', '24:00']],
  },
  holidayDates: [],
  closedDates: [],
};

const writeOrdering = (cfg) =>
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'ordering.json'), JSON.stringify(cfg));

const ids = {}; // name → menu item id

before(async () => {
  writeOrdering(ORDERING);
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  await api('POST', '/api/login', { password: 'test-password-123' });
  const seed = [
    {
      name: 'Margarita',
      pricing: { mode: 'tier', tierId: 'clasica' },
      modifierGroupIds: ['pizza-mods'],
    },
    {
      name: 'Prosciutto',
      pricing: { mode: 'tier', tierId: 'clasica' },
      modifierGroupIds: ['pizza-mods'],
    },
    {
      name: 'Papas cheddar',
      pricing: {
        mode: 'sizes',
        sizes: [
          { id: 'med', label: 'Medianas', price: 3.4 },
          { id: 'gra', label: 'Grandes', price: 4.9 },
        ],
      },
    },
    { name: 'Alitas', price: 4.5, modifierGroupIds: ['salsa-alitas'] },
    { name: 'Ensalada', price: 5 },
    { name: 'Oferta familiar', price: 10, fulfillment: 'pickup_only' },
    { name: 'Sin precio', price: null },
  ];
  for (const item of seed) {
    const r = await api('POST', '/api/menu', item);
    assert.equal(r.status, 200, `seeding ${item.name}`);
    ids[item.name] = r.json.id;
  }
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const order = (over = {}) => ({
  customer: { name: 'Ana', phone: '600123456' },
  fulfillment: { type: 'pickup' },
  paymentMethod: 'on_receipt',
  items: [{ itemId: ids['Margarita'], sizeId: 'fam', qty: 1 }],
  ...over,
});

test('menu sanitizer: bad tierId falls back to fixed, sizes survive', async () => {
  const bad = await api('POST', '/api/menu', {
    name: 'Rota',
    pricing: { mode: 'tier', tierId: 'nope' },
  });
  assert.equal(bad.json.pricing, undefined);
  const papas = (await api('GET', '/api/menu')).json.find((p) => p.name === 'Papas cheddar');
  assert.equal(papas.pricing.mode, 'sizes');
  assert.equal(papas.pricing.sizes.length, 2);
  await api('DELETE', `/api/menu/${bad.json.id}`);
});

test('public ordering config exposes the safe subset', async () => {
  const r = await api('GET', '/api/ordering/config', undefined, { auth: false });
  assert.equal(r.status, 200);
  assert.equal(r.json.enabled, true);
  assert.equal(r.json.open, true);
  assert.equal(r.json.stripeEnabled, false);
  assert.equal(r.json.tiers.clasica.sizes[1].price, 11.7);
});

test('pickup order is priced by the server, client prices ignored', async () => {
  const r = await api(
    'POST',
    '/api/orders',
    order({
      items: [
        { itemId: ids['Margarita'], sizeId: 'fam', qty: 1, modifierIds: ['gruesa'], price: 0.01 },
        { itemId: ids['Ensalada'], qty: 2, unitPrice: 0.01 },
      ],
    }),
    { auth: false }
  );
  assert.equal(r.status, 201);
  assert.equal(r.json.total, 23.7); // (11.70 + 2) + 5×2 — never 0.01
  assert.match(r.json.code, /^VV-\d{3}$/);
  assert.equal(typeof r.json.token, 'string');
  ids._firstOrder = r.json;
});

test('delivery: minimum enforced, fee added, zone validated', async () => {
  const below = await api(
    'POST',
    '/api/orders',
    order({
      fulfillment: { type: 'delivery', zone: 'Santa Fe', address: 'C/ Real 1' },
      items: [{ itemId: ids['Ensalada'], qty: 1 }],
    }),
    { auth: false }
  );
  assert.equal(below.status, 422);

  const badZone = await api(
    'POST',
    '/api/orders',
    order({ fulfillment: { type: 'delivery', zone: 'Marte', address: 'C/ Real 1' } }),
    { auth: false }
  );
  assert.equal(badZone.status, 422);

  const ok = await api(
    'POST',
    '/api/orders',
    order({ fulfillment: { type: 'delivery', zone: 'Santa Fe', address: 'C/ Real 1' } }),
    { auth: false }
  );
  assert.equal(ok.status, 201);
  assert.equal(ok.json.total, 12.7); // 11.70 + 1 delivery fee
});

test('mitad y mitad: half pizza is required, validated, and priced without extra cost', async () => {
  const missing = await api(
    'POST',
    '/api/orders',
    order({
      items: [{ itemId: ids['Margarita'], sizeId: 'fam', qty: 1, modifierIds: ['mitad'] }],
    }),
    { auth: false }
  );
  assert.equal(missing.status, 422); // 'mitad' selected but no halfItemId

  const sameItem = await api(
    'POST',
    '/api/orders',
    order({
      items: [
        {
          itemId: ids['Margarita'],
          sizeId: 'fam',
          qty: 1,
          modifierIds: ['mitad'],
          halfItemId: ids['Margarita'],
        },
      ],
    }),
    { auth: false }
  );
  assert.equal(sameItem.status, 422); // can't be half of itself

  const notHalvable = await api(
    'POST',
    '/api/orders',
    order({
      items: [
        {
          itemId: ids['Margarita'],
          sizeId: 'fam',
          qty: 1,
          modifierIds: ['mitad'],
          halfItemId: ids['Ensalada'], // no pizza-mods group at all
        },
      ],
    }),
    { auth: false }
  );
  assert.equal(notHalvable.status, 422);

  const ok = await api(
    'POST',
    '/api/orders',
    order({
      items: [
        {
          itemId: ids['Margarita'],
          sizeId: 'fam',
          qty: 1,
          modifierIds: ['mitad'],
          halfItemId: ids['Prosciutto'],
        },
      ],
    }),
    { auth: false }
  );
  assert.equal(ok.status, 201);
  assert.equal(ok.json.total, 12.7); // 11.70 + 1 (mitad supplement); the half itself is free
  const stored = (await api('GET', '/api/orders')).json.orders.find(
    (o) => o.id === ok.json.orderId
  );
  assert.deepEqual(stored.items[0].half, { itemId: ids['Prosciutto'], name: 'Prosciutto' });
});

test('delivery: needsCardTerminal is sanitized to a boolean and stored', async () => {
  const withTerminal = await api(
    'POST',
    '/api/orders',
    order({
      fulfillment: {
        type: 'delivery',
        zone: 'Santa Fe',
        address: 'C/ Real 1',
        needsCardTerminal: 'yes',
      },
    }),
    { auth: false }
  );
  assert.equal(withTerminal.status, 201);
  let stored = (await api('GET', '/api/orders')).json.orders.find(
    (o) => o.id === withTerminal.json.orderId
  );
  assert.equal(stored.fulfillment.needsCardTerminal, true);

  const withoutTerminal = await api(
    'POST',
    '/api/orders',
    order({ fulfillment: { type: 'delivery', zone: 'Santa Fe', address: 'C/ Real 1' } }),
    { auth: false }
  );
  stored = (await api('GET', '/api/orders')).json.orders.find(
    (o) => o.id === withoutTerminal.json.orderId
  );
  assert.equal(stored.fulfillment.needsCardTerminal, false);

  const pickup = await api('POST', '/api/orders', order(), { auth: false }); // fulfillment.type: pickup
  stored = (await api('GET', '/api/orders')).json.orders.find((o) => o.id === pickup.json.orderId);
  assert.equal(stored.fulfillment.needsCardTerminal, undefined);

  // This test and the one above create a handful of extra orders from the
  // same IP the rest of the file also orders from; the later tests are
  // tuned tight against ORDER_MAX_FAILS, so reset the shared counter rather
  // than let it bleed into their expectations.
  orderLimiter._resetForTests();
});

test('customer email is optional but validated when given', async () => {
  const bad = await api(
    'POST',
    '/api/orders',
    order({ customer: { name: 'Ana', phone: '600123456', email: 'not-an-email' } }),
    { auth: false }
  );
  assert.equal(bad.status, 400);

  const withoutEmail = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(withoutEmail.status, 201);

  const withEmail = await api(
    'POST',
    '/api/orders',
    order({ customer: { name: 'Ana', phone: '600123456', email: 'ana@example.com' } }),
    { auth: false }
  );
  assert.equal(withEmail.status, 201);
  const list = await api('GET', '/api/orders');
  const stored = list.json.orders.find((o) => o.id === withEmail.json.orderId);
  assert.equal(stored.customer.email, 'ana@example.com');
});

test('validation rejections: sizes, modifiers, quantities, availability', async () => {
  const cases = [
    order({ items: [{ itemId: ids['Margarita'], sizeId: 'xxl', qty: 1 }] }),
    order({ items: [{ itemId: ids['Margarita'], sizeId: 'fam', qty: 1, modifierIds: ['bbq'] }] }),
    order({ items: [{ itemId: ids['Alitas'], qty: 1 }] }), // required salsa missing
    order({ items: [{ itemId: ids['Margarita'], sizeId: 'fam', qty: 0 }] }),
    order({ items: [{ itemId: ids['Margarita'], sizeId: 'fam', qty: 50 }] }),
    order({ items: [{ itemId: ids['Sin precio'], qty: 1 }] }),
    order({ items: [] }),
    order({
      fulfillment: { type: 'delivery', zone: 'Santa Fe', address: 'C/ Real 1' },
      items: [
        { itemId: ids['Oferta familiar'], qty: 1 },
        { itemId: ids['Margarita'], sizeId: 'fam', qty: 1 },
      ],
    }), // pickup_only item on a delivery order
  ];
  for (const [i, payload] of cases.entries()) {
    const r = await api('POST', '/api/orders', payload, { auth: false });
    assert.equal(r.status, 422, `case ${i} should be 422, got ${r.status}`);
  }
  const alitas = await api(
    'POST',
    '/api/orders',
    order({ items: [{ itemId: ids['Alitas'], qty: 2, modifierIds: ['bbq'] }] }),
    { auth: false }
  );
  assert.equal(alitas.status, 201);
  assert.equal(alitas.json.total, 9);
});

test('orders outside opening hours are rejected server-side', async () => {
  writeOrdering({ ...ORDERING, schedule: {} });
  const r = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(r.status, 422);
  writeOrdering({ ...ORDERING, enabled: false });
  const off = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(off.status, 503);
  writeOrdering(ORDERING);
});

test('forceOpen bypasses the schedule (and closedDates), but not the enabled flag', async () => {
  writeOrdering({ ...ORDERING, schedule: {}, forceOpen: true });
  const openConfig = await api('GET', '/api/ordering/config', undefined, { auth: false });
  assert.equal(openConfig.json.open, true);
  const r = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(r.status, 201);

  writeOrdering({ ...ORDERING, schedule: {}, forceOpen: true, enabled: false });
  const off = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(off.status, 503); // enabled: false still wins over forceOpen

  writeOrdering(ORDERING);
});

test('stripe payment without configured keys → 503, no order stored', async () => {
  const r = await api('POST', '/api/orders', order({ paymentMethod: 'stripe' }), { auth: false });
  assert.equal(r.status, 503);
});

test('public status needs the right token', async () => {
  const { orderId, token } = ids._firstOrder;
  const bad = await api('GET', `/api/orders/${orderId}/status?t=wrong`, undefined, { auth: false });
  assert.equal(bad.status, 404);
  const good = await api('GET', `/api/orders/${orderId}/status?t=${token}`, undefined, {
    auth: false,
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.status, 'confirmed'); // on_receipt orders are born confirmed
  assert.equal(good.json.publicToken, undefined);
  assert.equal(good.json.customer, undefined);
});

test('order cancellation: within window ok, wrong token 404, late/expired 409', async () => {
  const created = await api('POST', '/api/orders', order(), { auth: false });
  assert.equal(created.status, 201);
  const { orderId, token } = created.json;

  const before = await api('GET', `/api/orders/${orderId}/status?t=${token}`, undefined, {
    auth: false,
  });
  assert.equal(before.json.cancellable, true);

  const wrongToken = await api('POST', `/api/orders/${orderId}/cancel?t=wrong`, undefined, {
    auth: false,
  });
  assert.equal(wrongToken.status, 404);

  const ok = await api('POST', `/api/orders/${orderId}/cancel?t=${token}`, undefined, {
    auth: false,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'cancelled');

  const again = await api('POST', `/api/orders/${orderId}/cancel?t=${token}`, undefined, {
    auth: false,
  });
  assert.equal(again.status, 409); // already cancelled

  // Past "preparing": too late to self-cancel even inside the time window.
  const prepping = await api('POST', '/api/orders', order(), { auth: false });
  await api('PUT', `/api/orders/${prepping.json.orderId}/status`, { status: 'preparing' });
  const lateStatus = await api(
    'POST',
    `/api/orders/${prepping.json.orderId}/cancel?t=${prepping.json.token}`,
    undefined,
    { auth: false }
  );
  assert.equal(lateStatus.status, 409);

  // Outside the 5-minute time window, even though the status alone would qualify.
  const stale = await api('POST', '/api/orders', order(), { auth: false });
  const ordersFile = path.join(process.env.DATA_DIR, 'orders.json');
  const db = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
  const rec = db.orders.find((o) => o.id === stale.json.orderId);
  rec.createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  fs.writeFileSync(ordersFile, JSON.stringify(db));
  const expired = await api(
    'POST',
    `/api/orders/${stale.json.orderId}/cancel?t=${stale.json.token}`,
    undefined,
    { auth: false }
  );
  assert.equal(expired.status, 409);
});

test('admin cancellation: reason stored, idempotent on repeat, no refund needed for cash', async () => {
  const created = await api('POST', '/api/orders', order(), { auth: false });
  const { orderId } = created.json;

  const cancelled = await api('PUT', `/api/orders/${orderId}/status`, {
    status: 'cancelled',
    reason: 'Sin ingredientes para esta pizza',
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.status, 'cancelled');
  assert.equal(cancelled.json.cancelReason, 'Sin ingredientes para esta pizza');
  assert.equal(cancelled.json.payment.status, 'on_receipt'); // nothing to refund

  // Repeat cancel: idempotent, no error even though refund logic is skipped.
  const again = await api('PUT', `/api/orders/${orderId}/status`, { status: 'cancelled' });
  assert.equal(again.status, 200);
  assert.equal(again.json.status, 'cancelled');

  const status = await api(
    'GET',
    `/api/orders/${orderId}/status?t=${created.json.token}`,
    undefined,
    { auth: false }
  );
  assert.equal(status.json.cancelReason, 'Sin ingredientes para esta pizza');
});

test('admin endpoints require the session', async () => {
  assert.equal((await api('GET', '/api/orders', undefined, { auth: false })).status, 401);
  assert.equal(
    (await api('PUT', `/api/orders/x/status`, { status: 'ready' }, { auth: false })).status,
    401
  );
  assert.equal(
    (await api('GET', '/api/ordering/settings', undefined, { auth: false })).status,
    401
  );
});

test('status transitions: forward ok, backwards 409, unknown 400', async () => {
  const { orderId } = ids._firstOrder;
  const prep = await api('PUT', `/api/orders/${orderId}/status`, { status: 'preparing' });
  assert.equal(prep.json.status, 'preparing');
  const done = await api('PUT', `/api/orders/${orderId}/status`, { status: 'delivered' });
  assert.equal(done.json.status, 'delivered');
  const back = await api('PUT', `/api/orders/${orderId}/status`, { status: 'preparing' });
  assert.equal(back.status, 409);
  const bogus = await api('PUT', `/api/orders/${orderId}/status`, { status: 'confirmed' });
  assert.equal(bogus.status, 400); // webhook-only status, not settable by hand
});

test('admin list filters by today and status', async () => {
  const r = await api('GET', '/api/orders');
  assert.equal(r.status, 200);
  assert.ok(r.json.orders.length >= 3);
  const delivered = await api('GET', '/api/orders?status=delivered');
  assert.equal(delivered.json.orders.length, 1);
});

test('stripe webhook: signed → confirms; bad signature → 400; replay → no-op', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_testsecret';

  // Seed a pending Stripe order directly in the store (creating one through
  // the API would call the real Stripe API for the Checkout session).
  const ordersFile = path.join(process.env.DATA_DIR, 'orders.json');
  const db = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
  const pending = {
    id: 'test-stripe-order',
    code: 'VV-900',
    publicToken: 'tok900',
    createdAt: new Date().toISOString(),
    status: 'pending_payment',
    payment: { method: 'stripe', status: 'pending', stripeSessionId: 'cs_test_1' },
    customer: { name: 'Ana', phone: '600123456' },
    fulfillment: { type: 'pickup', notes: '' },
    items: [],
    subtotal: 13.7,
    deliveryFee: 0,
    total: 13.7,
    events: [{ at: new Date().toISOString(), status: 'pending_payment' }],
  };
  db.orders.push(pending);
  fs.writeFileSync(ordersFile, JSON.stringify(db));

  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        metadata: { orderId: 'test-stripe-order' },
        amount_total: 1370,
        payment_status: 'paid',
        payment_intent: 'pi_test_1',
      },
    },
  });
  const stripe = new (require('stripe'))('sk_test_dummy');
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_testsecret',
  });
  const send = (body, signature) =>
    fetch(base + '/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
      body,
    });

  const badSig = await send(payload, sig.replace(/v1=\w{4}/, 'v1=dead'));
  assert.equal(badSig.status, 400);

  const ok = await send(payload, sig);
  assert.equal(ok.status, 200);
  const status = await api('GET', '/api/orders/test-stripe-order/status?t=tok900', undefined, {
    auth: false,
  });
  assert.equal(status.json.status, 'confirmed');
  assert.equal(status.json.paymentStatus, 'paid');

  // Stripe retries webhooks: a replay must be acknowledged without effect.
  const replay = await send(payload, sig);
  assert.equal(replay.status, 200);
  const after = JSON.parse(fs.readFileSync(ordersFile, 'utf-8')).orders.find(
    (o) => o.id === 'test-stripe-order'
  );
  assert.equal(after.events.filter((e) => e.status === 'confirmed').length, 1);
});

test('webhook rejects a session whose amount does not match the order', async () => {
  const ordersFile = path.join(process.env.DATA_DIR, 'orders.json');
  const db = JSON.parse(fs.readFileSync(ordersFile, 'utf-8'));
  db.orders.push({
    id: 'test-mismatch',
    code: 'VV-901',
    publicToken: 'tok901',
    createdAt: new Date().toISOString(),
    status: 'pending_payment',
    payment: { method: 'stripe', status: 'pending', stripeSessionId: 'cs_test_2' },
    customer: { name: 'Ana', phone: '600123456' },
    fulfillment: { type: 'pickup', notes: '' },
    items: [],
    subtotal: 20,
    deliveryFee: 0,
    total: 20,
    events: [{ at: new Date().toISOString(), status: 'pending_payment' }],
  });
  fs.writeFileSync(ordersFile, JSON.stringify(db));

  const payload = JSON.stringify({
    id: 'evt_2',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_2',
        metadata: { orderId: 'test-mismatch' },
        amount_total: 100, // paid 1 € for a 20 € order
        payment_status: 'paid',
      },
    },
  });
  const stripe = new (require('stripe'))('sk_test_dummy');
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_testsecret',
  });
  const r = await fetch(base + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
  assert.equal(r.status, 200); // acknowledged so Stripe stops retrying…
  const after = JSON.parse(
    fs.readFileSync(path.join(process.env.DATA_DIR, 'orders.json'), 'utf-8')
  ).orders.find((o) => o.id === 'test-mismatch');
  assert.equal(after.status, 'pending_payment'); // …but never confirmed
});

test('ordering settings round-trip with sanitization', async () => {
  const put = await api('PUT', '/api/ordering/settings', {
    delivery: { fee: 1.5, minimum: 15, zones: ['Santa Fe', '', 'Jau'] },
    schedule: {
      mon: [
        ['20:00', '24:00'],
        ['bad', 'data'],
      ],
    },
  });
  assert.equal(put.status, 200);
  const got = (await api('GET', '/api/ordering/settings')).json;
  assert.deepEqual(got.delivery.zones, ['Santa Fe', 'Jau']);
  assert.equal(got.delivery.minimum, 15);
  assert.deepEqual(got.schedule.mon, [['20:00', '24:00']]);
  assert.equal(got.stripe.configured, true);
  assert.equal(got.stripe.mode, 'test');
  await api('PUT', '/api/ordering/settings', ORDERING); // restore
});

test('order rate limit: repeated orders from one IP hit 429', async () => {
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await api('POST', '/api/orders', order(), { auth: false });
    if (r.status === 429) limited = true;
    else assert.equal(r.status, 201, `attempt ${i} should be 201 until the limit`);
  }
  assert.equal(limited, true);
});
