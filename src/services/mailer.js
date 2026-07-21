// Thin wrapper around nodemailer. Same opt-in policy as Stripe/Google: keys
// live only in env, and missing config just disables notifications instead
// of breaking anything (order state is always the source of truth).
let transporter = null;

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transport() {
  if (!transporter) {
    transporter = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Best-effort: called after the order is already cancelled/refunded, so a
// mail failure must never surface as a failed cancellation to the caller.
async function sendCancellationEmail(order, { refunded, reason } = {}) {
  if (!isConfigured() || !order.customer.email) return false;

  const paymentLine =
    order.payment.method === 'stripe' && refunded
      ? 'Ya hemos iniciado el reembolso a tu tarjeta; puede tardar unos días en aparecer.'
      : 'No se te ha cobrado nada.';

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: order.customer.email,
    subject: `Pedido ${order.code} cancelado — Pizzería Voy Volando`,
    text:
      `Hola ${order.customer.name},\n\n` +
      `Tu pedido ${order.code} ha sido cancelado` +
      (reason ? ` (motivo: ${reason})` : '') +
      `.\n\n${paymentLine}\n\nSi tienes cualquier duda, llámanos.\n\nPizzería Voy Volando`,
  });
  return true;
}

module.exports = { isConfigured, sendCancellationEmail };
