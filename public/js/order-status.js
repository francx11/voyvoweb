/* Voy Volando — order confirmation page (pedido.html). Standalone: this
   page doesn't load main.js, so esc()/formatPrice() are duplicated here
   rather than shared through window.VV. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatPrice(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

  var CART_KEY = 'vv_cart';
  var POLL_MS = 5000;

  var STATUS_LABELS = {
    pending_payment: 'Esperando confirmación del pago…',
    confirmed: '¡Pedido confirmado!',
    preparing: 'En preparación',
    ready: 'Listo para recoger',
    out_for_delivery: 'En reparto',
    delivered: 'Entregado',
    expired: 'Pago no completado',
    cancelled: 'Cancelado',
  };
  // Statuses reached once payment/confirmation has gone through: the
  // customer's cart is spent and should be emptied (mirrors what cart.js
  // already does immediately for pay-on-receipt orders).
  var POST_PAYMENT_STATUSES = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

  function statusClass(status) {
    if (status === 'pending_payment') return 'order-status-pending';
    if (POST_PAYMENT_STATUSES.indexOf(status) !== -1) {
      return status === 'delivered' ? 'order-status-done' : 'order-status-active';
    }
    return 'order-status-muted'; // expired, cancelled
  }

  function fulfillmentLabel(type) {
    return type === 'delivery' ? 'A domicilio' : 'Recogida en el local';
  }

  function itemLineHtml(item) {
    var mods = (item.modifiers || []).map(function (m) {
      return esc(m.label) + (m.price ? ' (+' + formatPrice(m.price) + ')' : '');
    });
    return '<li class="order-item">' +
      '<div class="order-item-main">' +
        '<span class="order-item-name">' + item.qty + '× ' + esc(item.name) +
          (item.sizeLabel ? ' — ' + esc(item.sizeLabel) : '') + '</span>' +
        '<span class="order-item-price">' + formatPrice(item.lineTotal) + '</span>' +
      '</div>' +
      (mods.length ? '<p class="order-item-mods">' + mods.join(', ') + '</p>' : '') +
      (item.notes ? '<p class="order-item-notes">«' + esc(item.notes) + '»</p>' : '') +
    '</li>';
  }

  function renderOrder(order) {
    var box = document.getElementById('order-box');
    box.innerHTML =
      '<p class="order-code">' + esc(order.code) + '</p>' +
      '<p class="order-status-line ' + statusClass(order.status) + '">' +
        esc(STATUS_LABELS[order.status] || order.status) +
      '</p>' +
      '<p class="order-meta">' + esc(fulfillmentLabel(order.fulfillmentType)) + ' · ' +
        (order.paymentMethod === 'stripe' ? 'Pagado con tarjeta' : 'Pago al recibir') +
      '</p>' +
      '<ul class="order-items">' + order.items.map(itemLineHtml).join('') + '</ul>' +
      '<div class="cart-total-row order-total-row"><span>Total</span><span>' + formatPrice(order.total) + '</span></div>';

    if (POST_PAYMENT_STATUSES.indexOf(order.status) !== -1) {
      try { localStorage.removeItem(CART_KEY); } catch (e) { /* storage blocked */ }
    }
  }

  function renderNotFound() {
    document.getElementById('order-box').innerHTML =
      '<p class="menu-empty">Pedido no encontrado. Comprueba el enlace o llámanos si necesitas ayuda.</p>';
  }

  function renderError() {
    document.getElementById('order-box').innerHTML =
      '<p class="menu-empty">No se pudo cargar tu pedido ahora mismo. Recarga la página en unos segundos.</p>';
  }

  function params() {
    var p = new URLSearchParams(window.location.search);
    return { id: p.get('id'), token: p.get('t') };
  }

  function poll(id, token) {
    fetch('/api/orders/' + encodeURIComponent(id) + '/status?t=' + encodeURIComponent(token))
      .then(function (r) {
        if (r.status === 404) { renderNotFound(); return null; }
        if (!r.ok) { renderError(); return null; }
        return r.json();
      })
      .then(function (order) {
        if (!order) return;
        renderOrder(order);
        if (order.status === 'pending_payment') setTimeout(function () { poll(id, token); }, POLL_MS);
      })
      .catch(renderError);
  }

  var ids = params();
  if (!ids.id || !ids.token) renderNotFound();
  else poll(ids.id, ids.token);
})();
