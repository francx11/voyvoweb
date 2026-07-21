// Thin wrapper around the Stripe SDK. Keys live only in env (same policy as
// GOOGLE_API_KEY): the admin panel sees configured/mode flags, never values.
const { PUBLIC_BASE_URL } = require('../config');

let client = null;
function stripe() {
  if (!client) client = new (require('stripe'))(process.env.STRIPE_SECRET_KEY);
  return client;
}

const isConfigured = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

const mode = () => ((process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test');

// Hosted Checkout session built from the server-priced snapshot; amounts in
// cents. metadata.orderId is how the webhook finds its way back.
function createCheckoutSession(order) {
  const lineItems = order.items.map((li) => {
    const modsCents = li.modifiers.reduce((sum, m) => sum + Math.round(m.price * 100), 0);
    const label =
      li.name +
      (li.sizeLabel ? ' — ' + li.sizeLabel : '') +
      (li.modifiers.length ? ' (' + li.modifiers.map((m) => m.label).join(', ') + ')' : '');
    return {
      price_data: {
        currency: 'eur',
        product_data: { name: label },
        unit_amount: Math.round(li.unitPrice * 100) + modsCents,
      },
      quantity: li.qty,
    };
  });
  if (order.deliveryFee > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: 'Gastos de envío' },
        unit_amount: Math.round(order.deliveryFee * 100),
      },
      quantity: 1,
    });
  }
  return stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: { orderId: order.id },
    success_url: `${PUBLIC_BASE_URL}/pedido.html?id=${order.id}&t=${order.publicToken}`,
    cancel_url: `${PUBLIC_BASE_URL}/#carta`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });
}

// Throws if the signature doesn't match; body must be the raw Buffer.
function verifyWebhook(rawBody, signature) {
  return stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

const retrieveSession = (id) => stripe().checkout.sessions.retrieve(id);

module.exports = { isConfigured, mode, createCheckoutSession, verifyWebhook, retrieveSession };
