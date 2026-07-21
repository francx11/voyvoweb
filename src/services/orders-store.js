// Orders persistence on the flat-file store. Concurrency rule: every
// read-modify-write here is fully synchronous (no await between readJSON and
// writeJSON), so the event loop serializes mutations. Callers doing network
// I/O (Stripe) must finish it BEFORE calling updateOrder/applyTransition.
const crypto = require('crypto');
const { ORDERS_FILE, ORDER_PENDING_TTL, ORDER_RETENTION_DAYS } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const { madridParts } = require('./ordering-schedule');

const EMPTY = { seq: 0, orders: [] };

// status → statuses it may move to. Forward jumps are allowed on purpose so
// staff can go confirmed→ready without clicking through every step.
const TRANSITIONS = {
  pending_payment: ['confirmed', 'expired', 'cancelled'],
  confirmed: ['preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
  preparing: ['ready', 'out_for_delivery', 'delivered', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  expired: [],
  cancelled: [],
};

// Statuses the admin panel may set by hand (webhook/expiry set the rest).
const ADMIN_STATUSES = ['preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

function load() {
  const db = readJSON(ORDERS_FILE, EMPTY);
  return db && Array.isArray(db.orders) ? db : { ...EMPTY };
}

// Expire stale unpaid Stripe orders and drop ancient history. Mutates db;
// returns true when something changed and the file needs rewriting.
function maintain(db, now = Date.now()) {
  let dirty = false;
  for (const order of db.orders) {
    if (
      order.status === 'pending_payment' &&
      now - Date.parse(order.createdAt) > ORDER_PENDING_TTL
    ) {
      order.status = 'expired';
      order.events.push({ at: new Date(now).toISOString(), status: 'expired' });
      dirty = true;
    }
  }
  const cutoff = now - ORDER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const kept = db.orders.filter((o) => Date.parse(o.createdAt) > cutoff);
  if (kept.length !== db.orders.length) {
    db.orders = kept;
    dirty = true;
  }
  return dirty;
}

function createOrder({ customer, fulfillment, paymentMethod, pricing }) {
  const db = load();
  maintain(db);
  db.seq += 1;
  const now = new Date().toISOString();
  const status = paymentMethod === 'stripe' ? 'pending_payment' : 'confirmed';
  const order = {
    id: crypto.randomUUID(),
    code: 'VV-' + String(db.seq).padStart(3, '0'),
    publicToken: crypto.randomBytes(16).toString('hex'),
    createdAt: now,
    status,
    payment: {
      method: paymentMethod,
      status: paymentMethod === 'stripe' ? 'pending' : 'on_receipt',
    },
    customer,
    fulfillment,
    items: pricing.items,
    subtotal: pricing.subtotal,
    deliveryFee: pricing.deliveryFee,
    total: pricing.total,
    events: [{ at: now, status }],
  };
  db.orders.push(order);
  writeJSON(ORDERS_FILE, db);
  return order;
}

function getOrder(id) {
  return load().orders.find((o) => o.id === id) || null;
}

// Synchronous read→mutate→write. `fn` MUST NOT await; it receives the fresh
// order and mutates it in place. Returns the updated order or null.
function updateOrder(id, fn) {
  const db = load();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return null;
  fn(order);
  writeJSON(ORDERS_FILE, db);
  return order;
}

// Validated state change. Returns the order; throws 409 on an illegal move.
// Idempotent: transitioning to the current status is a no-op.
function applyTransition(id, newStatus, extra) {
  const db = load();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return null;
  if (order.status !== newStatus) {
    const allowed = TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      const err = new Error(`No se puede pasar de "${order.status}" a "${newStatus}"`);
      err.status = 409;
      throw err;
    }
    order.status = newStatus;
    order.events.push({ at: new Date().toISOString(), status: newStatus });
    if (extra) extra(order);
    writeJSON(ORDERS_FILE, db);
  }
  return order;
}

function listOrders({ status, date } = {}) {
  const db = load();
  if (maintain(db)) writeJSON(ORDERS_FILE, db);
  let orders = db.orders;
  if (date) {
    orders = orders.filter((o) => madridParts(new Date(o.createdAt)).isoDate === date);
  }
  if (status) orders = orders.filter((o) => o.status === status);
  return orders.slice().reverse(); // newest first
}

module.exports = {
  createOrder,
  getOrder,
  updateOrder,
  applyTransition,
  listOrders,
  ADMIN_STATUSES,
};
