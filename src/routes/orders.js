// Online orders: public creation/status plus the admin list and state
// changes. Prices are never taken from the client (see order-pricing.js).
const { Router } = require('express');
const { ORDERING_FILE, ORDER_CANCEL_WINDOW } = require('../config');
const { readJSON } = require('../lib/json-store');
const requireAuth = require('../middleware/require-auth');
const { priceOrder } = require('../services/order-pricing');
const { isOpenNow, madridParts } = require('../services/ordering-schedule');
const orders = require('../services/orders-store');
const orderLimiter = require('../services/order-limiter');
const stripeClient = require('../services/stripe-client');

const router = Router();

const bad = (status, message) => {
  const err = new Error(message);
  err.status = status;
  err.expose = true; // customer-readable by construction
  return err;
};

const CANCELLABLE_STATUSES = ['pending_payment', 'confirmed'];

function isCancellable(order) {
  return (
    CANCELLABLE_STATUSES.includes(order.status) &&
    Date.now() - Date.parse(order.createdAt) <= ORDER_CANCEL_WINDOW
  );
}

function sanitizeCustomer(body, zones) {
  const c = body.customer || {};
  const name = String(c.name || '')
    .trim()
    .slice(0, 80);
  const phone = String(c.phone || '')
    .replace(/[^\d+ ]/g, '')
    .trim()
    .slice(0, 20);
  if (name.length < 2) throw bad(400, 'Nombre requerido');
  if (phone.replace(/\D/g, '').length < 9) throw bad(400, 'Teléfono no válido');

  const f = body.fulfillment || {};
  const type = f.type === 'delivery' ? 'delivery' : f.type === 'pickup' ? 'pickup' : null;
  if (!type) throw bad(400, 'Tipo de pedido no válido');
  const fulfillment = { type, notes: String(f.notes || '').slice(0, 300) };
  if (type === 'delivery') {
    fulfillment.zone = String(f.zone || '');
    if (!zones.includes(fulfillment.zone)) throw bad(422, 'Zona de reparto no disponible');
    fulfillment.address = String(f.address || '')
      .trim()
      .slice(0, 200);
    if (fulfillment.address.length < 5) throw bad(400, 'Dirección requerida');
  }
  return { customer: { name, phone }, fulfillment };
}

// Public: create an order. Persists before any Stripe call so a crash can
// never lose a paid-for order.
router.post('/', async (req, res, next) => {
  try {
    const ordering = readJSON(ORDERING_FILE, {});
    if (ordering.enabled === false) throw bad(503, 'Los pedidos online están desactivados');
    if (orderLimiter.isLimited(req.ip)) {
      throw bad(429, 'Demasiados pedidos seguidos, inténtalo más tarde');
    }
    if (!isOpenNow(ordering)) {
      throw bad(422, 'Ahora mismo estamos cerrados. Consulta el horario de pedidos');
    }

    const paymentMethod = req.body.paymentMethod === 'stripe' ? 'stripe' : 'on_receipt';
    if (paymentMethod === 'stripe' && !stripeClient.isConfigured()) {
      throw bad(503, 'El pago con tarjeta no está disponible ahora mismo');
    }

    const zones = (ordering.delivery && ordering.delivery.zones) || [];
    const { customer, fulfillment } = sanitizeCustomer(req.body, zones);
    const pricing = priceOrder(req.body.items, fulfillment.type);

    orderLimiter.register(req.ip);
    const order = orders.createOrder({ customer, fulfillment, paymentMethod, pricing });

    let checkoutUrl;
    if (paymentMethod === 'stripe') {
      let session;
      try {
        session = await stripeClient.createCheckoutSession(order);
      } catch (e) {
        console.error('Stripe session failed:', e.message);
        orders.applyTransition(order.id, 'cancelled');
        throw bad(502, 'No se pudo iniciar el pago, inténtalo de nuevo');
      }
      orders.updateOrder(order.id, (o) => {
        o.payment.stripeSessionId = session.id;
      });
      checkoutUrl = session.url;
    }

    res.status(201).json({
      orderId: order.id,
      code: order.code,
      token: order.publicToken,
      total: order.total,
      ...(checkoutUrl ? { checkoutUrl } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// Admin list — registered before '/:id/status' params can shadow it.
router.get('/', requireAuth, (req, res) => {
  const date =
    typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : madridParts(new Date()).isoDate;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ orders: orders.listOrders({ status, date }), date });
});

// Public: order status for the confirmation page. The token gates access;
// ids alone reveal nothing. Lazily reconciles against Stripe so a missed
// webhook cannot strand a paid order (also lets local dev skip webhooks).
router.get('/:id/status', async (req, res, next) => {
  try {
    let order = orders.getOrder(req.params.id);
    if (!order || order.publicToken !== req.query.t) throw bad(404, 'Pedido no encontrado');

    if (
      order.status === 'pending_payment' &&
      order.payment.stripeSessionId &&
      stripeClient.isConfigured()
    ) {
      try {
        const session = await stripeClient.retrieveSession(order.payment.stripeSessionId);
        if (session.payment_status === 'paid') {
          order = orders.applyTransition(order.id, 'confirmed', (o) => {
            o.payment.status = 'paid';
            o.payment.paidAt = new Date().toISOString();
            if (session.payment_intent) o.payment.stripePaymentIntentId = session.payment_intent;
          });
        }
      } catch {
        /* Stripe unreachable: report the stored state */
      }
    }

    res.json({
      code: order.code,
      status: order.status,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status,
      total: order.total,
      fulfillmentType: order.fulfillment.type,
      items: order.items,
      createdAt: order.createdAt,
      cancellable: isCancellable(order),
      cancelDeadline: new Date(Date.parse(order.createdAt) + ORDER_CANCEL_WINDOW).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Public: customer self-cancel within the no-questions-asked window. Refunds
// (or expires the Checkout session) BEFORE touching order state — same
// network-before-mutate rule as everywhere else in this file.
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const order = orders.getOrder(req.params.id);
    if (!order || order.publicToken !== req.query.t) throw bad(404, 'Pedido no encontrado');
    if (!isCancellable(order)) {
      throw bad(409, 'Ya no se puede cancelar este pedido, llámanos si necesitas ayuda');
    }

    let refunded = false;
    if (order.payment.method === 'stripe') {
      if (order.payment.status === 'paid' && order.payment.stripePaymentIntentId) {
        try {
          await stripeClient.refundPayment(order.payment.stripePaymentIntentId);
          refunded = true;
        } catch (e) {
          console.error('Stripe refund failed:', e.message);
          throw bad(502, 'No se pudo procesar el reembolso, llámanos para cancelarlo');
        }
      } else if (order.payment.stripeSessionId) {
        try {
          await stripeClient.expireCheckoutSession(order.payment.stripeSessionId);
        } catch {
          /* best-effort: link may already be paid/expired */
        }
      }
    }

    const updated = orders.applyTransition(order.id, 'cancelled', (o) => {
      if (refunded) o.payment.status = 'refunded';
    });
    res.json({ status: updated.status, paymentStatus: updated.payment.status });
  } catch (err) {
    next(err);
  }
});

// Admin: validated state change (409 on an illegal transition).
router.put('/:id/status', requireAuth, (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!orders.ADMIN_STATUSES.includes(status)) throw bad(400, 'Estado no válido');
    const order = orders.applyTransition(req.params.id, status);
    if (!order) throw bad(404, 'Pedido no encontrado');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
