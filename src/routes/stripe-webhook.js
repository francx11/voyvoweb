// Stripe webhook. Mounted in app.js BEFORE express.json: signature
// verification needs the raw request body, byte for byte. No requireAuth —
// the HMAC signature is the authentication. After the (synchronous) parse
// and verify, every mutation is synchronous, so no interleaving races.
const { Router } = require('express');
const express = require('express');
const orders = require('../services/orders-store');
const stripeClient = require('../services/stripe-client');

const router = Router();

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = stripeClient.verifyWebhook(req.body, req.headers['stripe-signature']);
  } catch {
    return res.status(400).json({ error: 'Firma no válida' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const order = orders.getOrder(session.metadata && session.metadata.orderId);
    // Unknown order or already-final state: acknowledge anyway — Stripe
    // retries anything that isn't a 2xx and the retry would never succeed.
    if (order && order.status === 'pending_payment') {
      if (event.type === 'checkout.session.completed') {
        // Belt and braces: the charged amount must match what we priced.
        if (session.amount_total !== Math.round(order.total * 100)) {
          console.error(`Webhook amount mismatch on ${order.code}:`, session.amount_total);
        } else {
          orders.applyTransition(order.id, 'confirmed', (o) => {
            o.payment.status = 'paid';
            o.payment.paidAt = new Date().toISOString();
            if (session.payment_intent) o.payment.stripePaymentIntentId = session.payment_intent;
          });
        }
      } else {
        orders.applyTransition(order.id, 'expired');
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
