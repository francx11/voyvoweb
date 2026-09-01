/* Voy Volando — shopping cart + checkout for online ordering.
   No frameworks: fetch + event delegation, same IIFE style as main.js.
   The cart only ever stores references (itemId/sizeId/modifierIds/qty) in
   localStorage; every price shown here is a client-side mirror of
   src/services/order-pricing.js for display only — the server is the sole
   authority on what gets charged. */
(function () {
  'use strict';

  var VV = window.VV = window.VV || {};
  var esc = VV.esc || function (s) { return String(s == null ? '' : s); };
  var formatPrice = VV.formatPrice || function (n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; };

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var CART_KEY = 'vv_cart';
  var cart = [];
  var menuItems = [];
  var orderingConfig = null;
  var checkoutBuilt = false;
  var submitting = false;
  var openOverlays = 0;

  /* ── Persistence ─────────────────────────────────────── */
  function loadCart() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage blocked */ }
  }
  cart = loadCart();

  /* ── Pricing/lookup helpers (mirror order-pricing.js) ───────────────── */
  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  function getItem(itemId) {
    return menuItems.filter(function (m) { return m.id === itemId; })[0] || null;
  }
  function itemSizes(item) {
    var pricing = item.pricing || {};
    if (pricing.mode === 'tier') {
      var tier = (orderingConfig.tiers || {})[pricing.tierId];
      return tier && Array.isArray(tier.sizes) ? tier.sizes : [];
    }
    if (pricing.mode === 'sizes') return Array.isArray(pricing.sizes) ? pricing.sizes : [];
    return null;
  }
  function findSize(item, sizeId) {
    var sizes = itemSizes(item);
    if (!sizes) return null;
    return sizes.filter(function (s) { return s.id === sizeId; })[0] || null;
  }
  function resolveModifiers(item, modifierIds) {
    var groups = (item.modifierGroupIds || [])
      .map(function (gid) { return (orderingConfig.modifierGroups || {})[gid]; })
      .filter(Boolean);
    var result = [];
    (modifierIds || []).forEach(function (id) {
      for (var i = 0; i < groups.length; i++) {
        var opt = (groups[i].options || []).filter(function (o) { return o.id === id; })[0];
        if (opt) { result.push(opt); return; }
      }
    });
    return result;
  }
  function lineUnitPrice(item, sizeId) {
    var sizes = itemSizes(item);
    if (sizes) {
      var size = findSize(item, sizeId);
      return size ? Number(size.price) : 0;
    }
    return item.price != null ? Number(item.price) : 0;
  }
  function lineTotal(line) {
    var item = getItem(line.itemId);
    if (!item) return 0;
    var unit = lineUnitPrice(item, line.sizeId);
    var mods = resolveModifiers(item, line.modifierIds);
    var modsSum = mods.reduce(function (sum, m) { return sum + Number(m.price); }, 0);
    return round2((unit + modsSum) * line.qty);
  }
  function cartSubtotal() {
    return round2(cart.reduce(function (sum, line) { return sum + lineTotal(line); }, 0));
  }
  function lineBlocked(line, fulfillmentType) {
    var item = getItem(line.itemId);
    if (!item) return false;
    if (item.fulfillment === 'pickup_only' && fulfillmentType !== 'pickup') return true;
    var size = findSize(item, line.sizeId);
    return !!(size && size.fulfillment && size.fulfillment !== fulfillmentType);
  }
  function lineBlockedLabel(line, fulfillmentType) {
    var item = getItem(line.itemId);
    var size = item && findSize(item, line.sizeId);
    if ((item && item.fulfillment === 'pickup_only') || (size && size.fulfillment === 'pickup')) {
      return fulfillmentType !== 'pickup' ? '(solo recogida)' : '';
    }
    if (size && size.fulfillment === 'delivery') {
      return fulfillmentType !== 'delivery' ? '(solo domicilio)' : '';
    }
    return '';
  }

  // If the panel removed an item (or its size) since it was added to the
  // cart, drop that line silently rather than let it crash the pricing.
  function sanitizeCartAgainstMenu() {
    var before = cart.length;
    var halfDropped = false;
    cart = cart.filter(function (line) {
      var item = getItem(line.itemId);
      if (!item) return false;
      var sizes = itemSizes(item);
      if (sizes && !findSize(item, line.sizeId)) return false;
      if (line.halfItemId && !getItem(line.halfItemId)) { delete line.halfItemId; halfDropped = true; }
      return true;
    });
    if (cart.length !== before || halfDropped) saveCart();
  }

  /* ── Scroll lock while a drawer/modal is open ───────────────────────── */
  function lockScroll() { openOverlays++; document.body.classList.add('cart-scroll-lock'); }
  function unlockScroll() {
    openOverlays = Math.max(0, openOverlays - 1);
    if (openOverlays === 0) document.body.classList.remove('cart-scroll-lock');
  }

  /* ── DOM skeleton (injected once; index.html only carries the <script>) ─ */
  var FAB_HTML =
    '<button type="button" id="vv-cart-fab" class="cart-fab" hidden aria-label="Ver carrito">' +
      '<span class="cart-fab-icon" aria-hidden="true">🛒</span>' +
      '<span class="cart-fab-badge" id="vv-cart-badge">0</span>' +
    '</button>';

  var DRAWER_HTML =
    '<div class="cart-drawer-overlay" id="vv-cart-overlay">' +
      '<aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="vv-cart-title">' +
        '<div class="cart-drawer-header">' +
          '<h2 id="vv-cart-title">Tu pedido</h2>' +
          '<button type="button" class="modal-close" id="vv-cart-close" aria-label="Cerrar carrito">&times;</button>' +
        '</div>' +
        '<div class="cart-drawer-body">' +
          '<div id="vv-cart-lines"></div>' +
          '<div id="vv-cart-checkout-wrap"></div>' +
        '</div>' +
        '<div class="cart-drawer-footer" id="vv-cart-footer" hidden></div>' +
      '</aside>' +
    '</div>';

  var ITEM_MODAL_HTML =
    '<div class="modal-overlay" id="vv-item-overlay">' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="vv-item-title">' +
        '<div class="modal-header">' +
          '<h2 class="modal-title" id="vv-item-title"></h2>' +
          '<button type="button" class="modal-close" id="vv-item-close" aria-label="Cerrar">&times;</button>' +
        '</div>' +
        '<div class="modal-body" id="vv-item-body"></div>' +
        '<div class="modal-footer">' +
          '<span class="cart-modal-price" id="vv-item-price"></span>' +
          '<button type="button" class="btn btn-primary" id="vv-item-add">Añadir</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var fabEl, badgeEl, cartOverlayEl, linesEl, checkoutWrapEl, footerEl;
  var itemOverlayEl, itemTitleEl, itemBodyEl, itemPriceEl;

  function initDom() {
    document.body.insertAdjacentHTML('beforeend', FAB_HTML + DRAWER_HTML + ITEM_MODAL_HTML);

    fabEl = $('#vv-cart-fab');
    badgeEl = $('#vv-cart-badge');
    cartOverlayEl = $('#vv-cart-overlay');
    linesEl = $('#vv-cart-lines');
    checkoutWrapEl = $('#vv-cart-checkout-wrap');
    footerEl = $('#vv-cart-footer');
    itemOverlayEl = $('#vv-item-overlay');
    itemTitleEl = $('#vv-item-title');
    itemBodyEl = $('#vv-item-body');
    itemPriceEl = $('#vv-item-price');

    fabEl.addEventListener('click', openDrawer);
    $('#vv-cart-close').addEventListener('click', closeDrawer);
    cartOverlayEl.addEventListener('click', function (e) { if (e.target === cartOverlayEl) closeDrawer(); });
    linesEl.addEventListener('click', onLinesClick);

    $('#vv-item-close').addEventListener('click', closeItemModal);
    itemOverlayEl.addEventListener('click', function (e) { if (e.target === itemOverlayEl) closeItemModal(); });
    $('#vv-item-add').addEventListener('click', onAddItemToCart);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (itemOverlayEl.classList.contains('open')) closeItemModal();
      else if (cartOverlayEl.classList.contains('open')) closeDrawer();
    });

    // The "Añadir" buttons live inside menu items rendered by main.js —
    // delegate from the document so nothing needs wiring per-item.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.btn-add-item');
      if (btn) openItemModal(btn.getAttribute('data-item-id'));
    });
  }

  /* ── Floating button + badge ─────────────────────────────────────────── */
  function updateBadge() {
    var count = cart.reduce(function (sum, l) { return sum + l.qty; }, 0);
    badgeEl.textContent = String(count);
    badgeEl.hidden = count === 0;
    fabEl.hidden = false;
  }

  /* ── Drawer ──────────────────────────────────────────────────────────── */
  function openDrawer() {
    renderDrawer();
    cartOverlayEl.classList.add('open');
    lockScroll();
  }
  function closeDrawer() {
    cartOverlayEl.classList.remove('open');
    unlockScroll();
  }

  function getSelectedFulfillmentType() {
    var checked = document.querySelector('input[name="fulfillment"]:checked');
    return checked ? checked.value : 'pickup';
  }

  function renderDrawer() {
    renderLines();
    if (!cart.length) {
      checkoutWrapEl.innerHTML = '';
      footerEl.innerHTML = '';
      footerEl.hidden = true;
      checkoutBuilt = false;
      return;
    }
    if (!checkoutBuilt) buildCheckout();
    else updateCheckoutDerived();
  }

  function renderLines() {
    if (!cart.length) {
      linesEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
      return;
    }
    var fulfillmentType = getSelectedFulfillmentType();
    linesEl.innerHTML =
      '<ul class="cart-lines">' +
        cart.map(function (line, idx) { return renderLineHtml(line, idx, fulfillmentType); }).join('') +
      '</ul>' +
      '<div class="cart-subtotal-row"><span>Subtotal</span><span>' + formatPrice(cartSubtotal()) + '</span></div>';
  }

  function renderLineHtml(line, idx, fulfillmentType) {
    var item = getItem(line.itemId);
    if (!item) return '';
    var size = findSize(item, line.sizeId);
    var mods = resolveModifiers(item, line.modifierIds);
    var blocked = lineBlocked(line, fulfillmentType);
    var blockedLabel = lineBlockedLabel(line, fulfillmentType);
    return '<li class="cart-line' + (blocked ? ' cart-line-blocked' : '') + '">' +
      '<div class="cart-line-main">' +
        '<span class="cart-line-name">' + esc(item.name) + (size ? ' — ' + esc(size.label) : '') + '</span>' +
        '<span class="cart-line-price">' + formatPrice(lineTotal(line)) + '</span>' +
      '</div>' +
      (mods.length
        ? '<p class="cart-line-mods">' + mods.map(function (m) { return esc(m.label); }).join(', ') + '</p>'
        : '') +
      (line.halfItemId && getItem(line.halfItemId)
        ? '<p class="cart-line-mods">🍕 Mitad: ' + esc(getItem(line.halfItemId).name) + '</p>'
        : '') +
      (line.notes ? '<p class="cart-line-notes">«' + esc(line.notes) + '»</p>' : '') +
      (blockedLabel ? '<p class="cart-line-warning">' + esc(blockedLabel) + '</p>' : '') +
      '<div class="cart-line-actions">' +
        '<div class="cart-qty">' +
          '<button type="button" class="cart-qty-btn" data-action="dec" data-idx="' + idx + '" aria-label="Quitar una unidad">–</button>' +
          '<span class="cart-qty-val">' + line.qty + '</span>' +
          '<button type="button" class="cart-qty-btn" data-action="inc" data-idx="' + idx + '" aria-label="Añadir una unidad">+</button>' +
        '</div>' +
        '<button type="button" class="cart-line-remove" data-action="remove" data-idx="' + idx + '">Quitar</button>' +
      '</div>' +
    '</li>';
  }

  function onLinesClick(e) {
    var btn = e.target.closest && e.target.closest('button[data-action]');
    if (!btn) return;
    var idx = Number(btn.getAttribute('data-idx'));
    var line = cart[idx];
    if (!line) return;
    var action = btn.getAttribute('data-action');
    if (action === 'remove') cart.splice(idx, 1);
    else if (action === 'inc') line.qty = Math.min(20, line.qty + 1);
    else if (action === 'dec') { line.qty -= 1; if (line.qty <= 0) cart.splice(idx, 1); }
    saveCart();
    updateBadge();
    renderDrawer();
  }

  /* ── Checkout (built once per drawer session; never rebuilt on cart
     mutation so typed name/phone/address survive qty tweaks elsewhere) ─── */
  function closedBannerHtml() {
    var windows = (orderingConfig.todayWindows || []).map(function (w) { return w[0] + '–' + w[1]; }).join(', ');
    return '<p class="cart-banner cart-banner-closed">Ahora estamos cerrados.' +
      (windows ? ' Hoy abrimos: ' + esc(windows) + '.' : '') + '</p>';
  }

  function checkoutFormHtml() {
    var zones = (orderingConfig.delivery && orderingConfig.delivery.zones) || [];
    var stripeEnabled = !!orderingConfig.stripeEnabled;
    return '<form class="cart-checkout" id="vv-checkout-form" novalidate>' +
      (orderingConfig.open === false ? closedBannerHtml() : '') +
      '<div class="field"><label for="vv-c-name">Nombre</label>' +
        '<input type="text" id="vv-c-name" name="name" autocomplete="name" autocapitalize="words" required></div>' +
      '<div class="field"><label for="vv-c-phone">Teléfono</label>' +
        '<input type="tel" id="vv-c-phone" name="phone" autocomplete="tel" required></div>' +
      '<div class="field"><label for="vv-c-email">Email (opcional)</label>' +
        '<input type="email" id="vv-c-email" name="email" autocomplete="email">' +
        '<p class="cart-delivery-note">Para avisarte si hay algún problema con tu pedido.</p></div>' +
      '<fieldset class="cart-fulfillment"><legend>¿Cómo lo quieres?</legend>' +
        '<label class="cart-radio"><input type="radio" name="fulfillment" value="pickup" checked> Recogida</label>' +
        '<label class="cart-radio"><input type="radio" name="fulfillment" value="delivery"> Domicilio</label>' +
      '</fieldset>' +
      '<div class="cart-delivery-fields" id="vv-c-delivery-fields" hidden>' +
        '<div class="field"><label for="vv-c-zone">Zona</label>' +
          '<select id="vv-c-zone" name="zone">' +
            '<option value="">Selecciona tu zona</option>' +
            zones.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label for="vv-c-address">Dirección</label>' +
          '<div class="cart-address-wrap">' +
            '<input type="text" id="vv-c-address" name="address" autocomplete="off">' +
            '<ul class="cart-address-suggestions" id="vv-c-address-suggestions" hidden></ul>' +
          '</div>' +
        '</div>' +
        '<label class="cart-radio" id="vv-c-terminal-wrap" hidden>' +
          '<input type="checkbox" id="vv-c-terminal"> Necesito datáfono para pagar con tarjeta al recibir</label>' +
        '<p class="cart-delivery-note" id="vv-c-delivery-note"></p>' +
      '</div>' +
      '<div class="field"><label for="vv-c-notes">Notas del pedido</label>' +
        '<textarea id="vv-c-notes" name="notes" maxlength="300" placeholder="Instrucciones para el reparto o la recogida"></textarea></div>' +
      '<fieldset class="cart-payment"><legend>Pago</legend>' +
        (stripeEnabled
          ? '<label class="cart-radio"><input type="radio" name="paymentMethod" value="stripe" checked> Pagar con tarjeta</label>'
          : '') +
        '<label class="cart-radio"><input type="radio" name="paymentMethod" value="on_receipt"' +
          (stripeEnabled ? '' : ' checked') + '> Pagar al recibir</label>' +
      '</fieldset>' +
    '</form>';
  }

  function checkoutFooterHtml() {
    var cancelMin = orderingConfig.cancelWindowMinutes || 5;
    return '<div class="cart-total-row"><span>Total</span><span id="vv-c-total">' + formatPrice(cartSubtotal()) + '</span></div>' +
      '<p class="cart-cancel-notice">Puedes cancelar tu pedido gratis durante los primeros ' + cancelMin +
        ' minutos desde la confirmación. Pasado ese tiempo, llámanos si necesitas ayuda.</p>' +
      '<p class="cart-error" id="vv-c-error" hidden></p>' +
      '<button type="submit" form="vv-checkout-form" class="btn btn-primary cart-submit" id="vv-c-submit">Confirmar pedido</button>';
  }

  function buildCheckout() {
    checkoutWrapEl.innerHTML = checkoutFormHtml();
    footerEl.innerHTML = checkoutFooterHtml();
    footerEl.hidden = false;
    checkoutBuilt = true;
    $('#vv-checkout-form').addEventListener('submit', onSubmitOrder);
    $$('input[name="fulfillment"]').forEach(function (r) { r.addEventListener('change', onFulfillmentChange); });
    $$('input[name="paymentMethod"]').forEach(function (r) { r.addEventListener('change', updateTerminalVisibility); });
    wireAddressAutocomplete();
    onFulfillmentChange();
  }

  function onFulfillmentChange() {
    var type = getSelectedFulfillmentType();
    var deliveryFields = $('#vv-c-delivery-fields');
    if (deliveryFields) deliveryFields.hidden = type !== 'delivery';
    updateTerminalVisibility();
    renderLines(); // re-highlight lines blocked for the newly chosen type
    updateCheckoutDerived();
  }

  // Datáfono only matters when the courier will collect payment in person:
  // a delivery order paid on receipt. Prepaid-by-card or pickup orders hide it.
  function updateTerminalVisibility() {
    var wrap = $('#vv-c-terminal-wrap');
    if (!wrap) return;
    var type = getSelectedFulfillmentType();
    var payMethod = (document.querySelector('input[name="paymentMethod"]:checked') || {}).value || 'on_receipt';
    var show = type === 'delivery' && payMethod === 'on_receipt';
    wrap.hidden = !show;
    if (!show) { var box = $('#vv-c-terminal'); if (box) box.checked = false; }
  }

  /* ── Address autocomplete (server-proxied Google Places; degrades to a
     plain text field when unconfigured or offline) ─────────────────── */
  var addressDebounceTimer = null;
  var addressAbortController = null;

  function wireAddressAutocomplete() {
    var input = $('#vv-c-address');
    var list = $('#vv-c-address-suggestions');
    if (!input || !list) return;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(addressDebounceTimer);
      if (q.length < 3) { hideAddressSuggestions(); return; }
      addressDebounceTimer = setTimeout(function () { fetchAddressSuggestions(q); }, 300);
    });
    // Delay the hide so a click on a suggestion registers before it disappears.
    input.addEventListener('blur', function () { setTimeout(hideAddressSuggestions, 150); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest && e.target.closest('li[data-desc]');
      if (!li) return;
      input.value = li.getAttribute('data-desc');
      hideAddressSuggestions();
    });
  }

  function hideAddressSuggestions() {
    var list = $('#vv-c-address-suggestions');
    if (list) { list.hidden = true; list.innerHTML = ''; }
  }

  function fetchAddressSuggestions(q) {
    if (addressAbortController) addressAbortController.abort();
    addressAbortController = ('AbortController' in window) ? new AbortController() : null;
    fetch('/api/places/autocomplete?input=' + encodeURIComponent(q), {
      signal: addressAbortController ? addressAbortController.signal : undefined,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = $('#vv-c-address-suggestions');
        if (!list) return;
        var preds = (data && data.predictions) || [];
        if (!preds.length) { hideAddressSuggestions(); return; }
        list.innerHTML = preds.map(function (p) {
          return '<li data-desc="' + esc(p.description) + '">' + esc(p.description) + '</li>';
        }).join('');
        list.hidden = false;
      })
      .catch(function () { /* offline/unconfigured: field still works as plain text */ });
  }

  function updateCheckoutDerived() {
    if (!checkoutBuilt) return;
    var type = getSelectedFulfillmentType();
    var subtotal = cartSubtotal();
    var delivery = orderingConfig.delivery || {};
    var fee = type === 'delivery' ? Number(delivery.fee || 0) : 0;
    var total = round2(subtotal + fee);

    var totalEl = $('#vv-c-total');
    if (totalEl) totalEl.textContent = formatPrice(total);

    var missing = 0;
    var noteEl = $('#vv-c-delivery-note');
    if (type === 'delivery' && noteEl) {
      missing = round2(Number(delivery.minimum || 0) - subtotal);
      var parts = [];
      if (fee) parts.push('Envío +' + formatPrice(fee));
      if (delivery.minimum) parts.push('Pedido mínimo ' + formatPrice(delivery.minimum));
      if (missing > 0) parts.push('Faltan ' + formatPrice(missing) + ' para el mínimo');
      noteEl.textContent = parts.join(' · ');
    }

    var hasBlockedLine = cart.some(function (line) { return lineBlocked(line, type); });
    var belowMinimum = type === 'delivery' && missing > 0;
    var closed = orderingConfig.open === false;
    var submitBtn = $('#vv-c-submit');
    if (submitBtn) submitBtn.disabled = closed || hasBlockedLine || belowMinimum || cart.length === 0 || submitting;
  }

  function onSubmitOrder(e) {
    e.preventDefault();
    if (submitting) return;

    var errorEl = $('#vv-c-error');
    errorEl.hidden = true;
    errorEl.textContent = '';

    var type = getSelectedFulfillmentType();
    var fulfillment = {
      type: type,
      notes: $('#vv-c-notes').value.trim(),
    };
    if (type === 'delivery') {
      fulfillment.zone = ($('#vv-c-zone') || {}).value || '';
      fulfillment.address = (($('#vv-c-address') || {}).value || '').trim();
      fulfillment.needsCardTerminal = !!($('#vv-c-terminal') || {}).checked;
    }
    var paymentMethod = (document.querySelector('input[name="paymentMethod"]:checked') || {}).value || 'on_receipt';
    var items = cart.map(function (line) {
      var out = { itemId: line.itemId, modifierIds: line.modifierIds || [], qty: line.qty, notes: line.notes || '' };
      if (line.sizeId) out.sizeId = line.sizeId;
      if (line.halfItemId) out.halfItemId = line.halfItemId;
      return out;
    });
    var body = {
      customer: {
        name: $('#vv-c-name').value.trim(),
        phone: $('#vv-c-phone').value.trim(),
        email: $('#vv-c-email').value.trim(),
      },
      fulfillment: fulfillment,
      paymentMethod: paymentMethod,
      items: items,
    };

    submitting = true;
    var submitBtn = $('#vv-c-submit');
    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (json) { return { ok: r.ok, json: json }; }); })
      .then(function (res) {
        if (!res.ok) {
          submitting = false;
          submitBtn.textContent = originalLabel;
          errorEl.textContent = (res.json && res.json.error) || 'No se pudo enviar el pedido.';
          errorEl.hidden = false;
          updateCheckoutDerived();
          return;
        }
        if (res.json.checkoutUrl) {
          window.location.href = res.json.checkoutUrl;
          return;
        }
        try { localStorage.removeItem(CART_KEY); } catch (err) { /* storage blocked */ }
        window.location.href = '/pedido.html?id=' + encodeURIComponent(res.json.orderId) +
          '&t=' + encodeURIComponent(res.json.token);
      })
      .catch(function () {
        submitting = false;
        submitBtn.textContent = originalLabel;
        errorEl.textContent = 'No se pudo enviar el pedido. Comprueba tu conexión e inténtalo de nuevo.';
        errorEl.hidden = false;
        updateCheckoutDerived();
      });
  }

  /* ── Item modal (add to cart) ────────────────────────────────────────── */
  var modalItem = null;
  var modalSizeId = null;
  var modalModifiers = {}; // gid -> array of selected option ids
  var modalHalfId = null; // id of the pizza chosen for the other half, if any
  var modalQty = 1;

  function groupsForItem(item) {
    return (item.modifierGroupIds || [])
      .map(function (gid) { return { gid: gid, group: (orderingConfig.modifierGroups || {})[gid] }; })
      .filter(function (g) { return g.group; });
  }

  // "Mitad y mitad" is just a modifier option (+price); it doesn't by itself
  // say which pizza the other half should be. When an item offers it, show
  // a picker limited to the other pizzas that also offer it.
  function itemOffersHalf(item) {
    return groupsForItem(item).some(function (g) {
      return (g.group.options || []).some(function (o) { return o.id === 'mitad'; });
    });
  }
  function halfPizzaOptions(excludeId) {
    return menuItems.filter(function (m) {
      return m.id !== excludeId && m.active !== false && itemOffersHalf(m);
    });
  }
  function modalHasMitadSelected() {
    return Object.keys(modalModifiers).some(function (gid) { return modalModifiers[gid].indexOf('mitad') !== -1; });
  }
  function updateHalfFieldVisibility() {
    var field = $('#vv-half-field');
    if (!field) return;
    var show = modalHasMitadSelected();
    field.hidden = !show;
    if (!show) {
      modalHalfId = null;
      var sel = $('#vv-half-select');
      if (sel) sel.value = '';
    }
  }

  function openItemModal(itemId) {
    var item = getItem(itemId);
    if (!item) return;
    modalItem = item;
    modalQty = 1;
    modalModifiers = {};
    modalHalfId = null;
    var sizes = itemSizes(item);
    modalSizeId = sizes && sizes.length ? sizes[0].id : null;

    groupsForItem(item).forEach(function (g) {
      var single = g.group.required && g.group.maxSelect === 1;
      modalModifiers[g.gid] = single && g.group.options.length ? [g.group.options[0].id] : [];
    });

    itemTitleEl.textContent = item.name;
    itemBodyEl.innerHTML = itemModalBodyHtml(item, sizes);
    attachItemModalListeners(item);
    updateHalfFieldVisibility();
    updateItemModalPrice();
    itemOverlayEl.classList.add('open');
    lockScroll();
  }

  function itemModalBodyHtml(item, sizes) {
    var html = '';
    if (item.description) html += '<p class="cart-modal-desc">' + esc(item.description) + '</p>';
    if (sizes && sizes.length) {
      html += '<fieldset class="cart-modal-sizes"><legend>Tamaño</legend>' +
        sizes.map(function (s, i) {
          var suffix = s.fulfillment === 'pickup' ? ' (solo recoger)' :
            s.fulfillment === 'delivery' ? ' (solo domicilio)' : '';
          return '<label class="cart-radio"><input type="radio" name="vv-size" value="' + esc(s.id) + '"' +
            (i === 0 ? ' checked' : '') + '> ' + esc(s.label) + esc(suffix) + ' — ' + formatPrice(s.price) + '</label>';
        }).join('') +
      '</fieldset>';
    }
    groupsForItem(item).forEach(function (g) {
      var single = g.group.required && g.group.maxSelect === 1;
      html += '<fieldset class="cart-modal-mods" data-gid="' + esc(g.gid) + '">' +
        '<legend>' + esc(g.group.label) + (g.group.required ? ' *' : '') + '</legend>' +
        g.group.options.map(function (o, i) {
          var checked = single && i === 0 ? ' checked' : '';
          var priceLabel = o.price ? ' (+' + formatPrice(o.price) + ')' : '';
          return '<label class="cart-radio"><input type="' + (single ? 'radio' : 'checkbox') + '" ' +
            'name="vv-mod-' + esc(g.gid) + '" value="' + esc(o.id) + '"' + checked + '> ' +
            esc(o.label) + priceLabel + '</label>';
        }).join('') +
      '</fieldset>';
    });
    if (itemOffersHalf(item)) {
      var halfOpts = halfPizzaOptions(item.id);
      html += '<div class="field cart-modal-half" id="vv-half-field" hidden>' +
        '<label for="vv-half-select">¿Con qué pizza quieres la otra mitad?</label>' +
        '<select id="vv-half-select"><option value="">Selecciona una pizza</option>' +
        halfOpts.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>'; }).join('') +
        '</select></div>';
    }
    html += '<div class="cart-modal-qty-row"><span>Cantidad</span><div class="cart-qty">' +
      '<button type="button" class="cart-qty-btn" id="vv-item-qty-dec" aria-label="Menos">–</button>' +
      '<span class="cart-qty-val" id="vv-item-qty-val">1</span>' +
      '<button type="button" class="cart-qty-btn" id="vv-item-qty-inc" aria-label="Más">+</button>' +
    '</div></div>';
    html += '<div class="field"><label for="vv-item-notes">Notas</label>' +
      '<textarea id="vv-item-notes" maxlength="200" placeholder="ej.: sin cebolla, sabor del refresco…"></textarea></div>';
    return html;
  }

  function attachItemModalListeners(item) {
    $$('input[name="vv-size"]').forEach(function (r) {
      r.addEventListener('change', function () { modalSizeId = r.value; updateItemModalPrice(); });
    });
    groupsForItem(item).forEach(function (g) {
      $$('input[name="vv-mod-' + g.gid + '"]').forEach(function (inp) {
        inp.addEventListener('change', function () { onModifierChange(g); });
      });
    });
    var dec = $('#vv-item-qty-dec');
    var inc = $('#vv-item-qty-inc');
    if (dec) dec.addEventListener('click', function () { setModalQty(modalQty - 1); });
    if (inc) inc.addEventListener('click', function () { setModalQty(modalQty + 1); });

    var halfSelect = $('#vv-half-select');
    if (halfSelect) halfSelect.addEventListener('change', function () {
      modalHalfId = halfSelect.value || null;
      var field = $('#vv-half-field');
      if (field) field.classList.remove('cart-modal-invalid');
    });
  }

  function onModifierChange(g) {
    var single = g.group.required && g.group.maxSelect === 1;
    if (single) {
      var checked = document.querySelector('input[name="vv-mod-' + g.gid + '"]:checked');
      modalModifiers[g.gid] = checked ? [checked.value] : [];
    } else {
      var inputs = $$('input[name="vv-mod-' + g.gid + '"]');
      var selected = inputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
      modalModifiers[g.gid] = selected;
      var atMax = g.group.maxSelect && selected.length >= g.group.maxSelect;
      inputs.forEach(function (i) { i.disabled = atMax && !i.checked; });
    }
    var fs = itemBodyEl.querySelector('fieldset[data-gid="' + g.gid + '"]');
    if (fs) fs.classList.remove('cart-modal-invalid');
    updateHalfFieldVisibility();
    updateItemModalPrice();
  }

  function setModalQty(q) {
    modalQty = Math.max(1, Math.min(20, q));
    var el = $('#vv-item-qty-val');
    if (el) el.textContent = String(modalQty);
    updateItemModalPrice();
  }

  function updateItemModalPrice() {
    if (!modalItem) return;
    var unit = lineUnitPrice(modalItem, modalSizeId);
    var allSelectedIds = Object.keys(modalModifiers).reduce(function (acc, gid) {
      return acc.concat(modalModifiers[gid]);
    }, []);
    var mods = resolveModifiers(modalItem, allSelectedIds);
    var modsSum = mods.reduce(function (sum, m) { return sum + Number(m.price); }, 0);
    itemPriceEl.textContent = formatPrice(round2((unit + modsSum) * modalQty));
  }

  function closeItemModal() {
    if (!itemOverlayEl.classList.contains('open')) return;
    itemOverlayEl.classList.remove('open');
    modalItem = null;
    unlockScroll();
  }

  function onAddItemToCart() {
    if (!modalItem) return;
    var invalidGroup = groupsForItem(modalItem).filter(function (g) {
      return g.group.required && (modalModifiers[g.gid] || []).length === 0;
    })[0];
    if (invalidGroup) {
      var fs = itemBodyEl.querySelector('fieldset[data-gid="' + invalidGroup.gid + '"]');
      if (fs) { fs.classList.add('cart-modal-invalid'); fs.scrollIntoView({ block: 'center' }); }
      return;
    }
    var halfField = $('#vv-half-field');
    if (halfField && !halfField.hidden && !modalHalfId) {
      halfField.classList.add('cart-modal-invalid');
      halfField.scrollIntoView({ block: 'center' });
      return;
    }
    var allSelectedIds = Object.keys(modalModifiers).reduce(function (acc, gid) {
      return acc.concat(modalModifiers[gid]);
    }, []);
    var notesEl = $('#vv-item-notes');
    var line = {
      itemId: modalItem.id,
      modifierIds: allSelectedIds,
      qty: modalQty,
      notes: notesEl ? notesEl.value.trim().slice(0, 200) : '',
    };
    if (modalSizeId) line.sizeId = modalSizeId;
    if (modalHalfId) line.halfItemId = modalHalfId;
    cart.push(line);
    saveCart();
    updateBadge();
    closeItemModal();
    openDrawer();
  }

  /* ── Init ─────────────────────────────────────────────────────────────
     main.js fetches /api/menu + /api/ordering/config and dispatches
     'vv:menu-ready' once both are available on window.VV; ordering being
     disabled or unavailable means there is nothing this file can safely
     price, so it stays fully inert (no button, no fab). ── */
  function onMenuReady() {
    menuItems = VV.menuItems || [];
    orderingConfig = VV.orderingConfig || null;
    if (!orderingConfig || orderingConfig.enabled === false) return;
    sanitizeCartAgainstMenu();
    updateBadge();
  }

  initDom();
  document.addEventListener('vv:menu-ready', onMenuReady);
  if (VV.menuItems && VV.menuItems.length) onMenuReady(); // defensive: event already fired
})();
