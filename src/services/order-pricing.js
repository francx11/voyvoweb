// Server-side order pricing. The client only ever sends references
// (itemId, sizeId, modifierIds, qty); every price is resolved here from
// menu.json + ordering.json. All money math is done in integer cents and
// converted back to euros only at the edges.
const { ORDERING_FILE, ORDER_MAX_QTY, ORDER_MAX_ITEMS } = require('../config');
const { readJSON } = require('../lib/json-store');

const MENU_FILE = 'menu.json';

const toCents = (eur) => Math.round(Number(eur) * 100);
const toEuros = (cents) => cents / 100;

function reject(message) {
  const err = new Error(message);
  err.status = 422;
  throw err;
}

// Resolve the size choices available to an item: tier sizes for pizzas,
// per-item sizes otherwise, or null when the item has a single fixed price.
function itemSizes(item, ordering) {
  const pricing = item.pricing || {};
  if (pricing.mode === 'tier') {
    const tier = (ordering.tiers || {})[pricing.tierId];
    return tier && Array.isArray(tier.sizes) ? tier.sizes : [];
  }
  if (pricing.mode === 'sizes') {
    return Array.isArray(pricing.sizes) ? pricing.sizes : [];
  }
  return null; // fixed price
}

function priceLine(raw, item, ordering, fulfillmentType) {
  const qty = Number(raw.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > ORDER_MAX_QTY) {
    reject(`Cantidad inválida para "${item.name}"`);
  }
  if (item.fulfillment === 'pickup_only' && fulfillmentType !== 'pickup') {
    reject(`"${item.name}" solo está disponible para recoger`);
  }

  // Base price: size variant or fixed.
  const sizes = itemSizes(item, ordering);
  let unitCents;
  let sizeId = null;
  let sizeLabel = null;
  if (sizes) {
    const size = sizes.find((s) => s.id === raw.sizeId);
    if (!size) reject(`Tamaño inválido para "${item.name}"`);
    if (size.fulfillment && size.fulfillment !== fulfillmentType) {
      reject(`Ese tamaño de "${item.name}" no está disponible para este tipo de pedido`);
    }
    unitCents = toCents(size.price);
    sizeId = size.id;
    sizeLabel = size.label;
  } else {
    if (item.price == null) reject(`"${item.name}" no se puede pedir online`);
    unitCents = toCents(item.price);
  }

  // Modifiers: only ids belonging to the item's allowed groups, honoring
  // each group's required/maxSelect. Prices come from ordering.json.
  const allowedGroups = (item.modifierGroupIds || [])
    .map((gid) => ({ gid, group: (ordering.modifierGroups || {})[gid] }))
    .filter((g) => g.group);
  const requestedIds = Array.isArray(raw.modifierIds) ? raw.modifierIds.map(String) : [];
  if (requestedIds.length > 10) reject(`Demasiados extras para "${item.name}"`);
  const seen = new Set();
  const modifiers = [];
  for (const id of requestedIds) {
    if (seen.has(id)) reject(`Extra repetido en "${item.name}"`);
    seen.add(id);
    const match = allowedGroups
      .map(({ gid, group }) => {
        const opt = group.options.find((o) => o.id === id);
        return opt ? { gid, group, opt } : null;
      })
      .find(Boolean);
    if (!match) reject(`Extra no permitido para "${item.name}"`);
    modifiers.push({
      id: match.opt.id,
      label: match.opt.label,
      price: match.opt.price,
      gid: match.gid,
    });
  }
  for (const { gid, group } of allowedGroups) {
    const count = modifiers.filter((m) => m.gid === gid).length;
    if (group.required && count === 0) reject(`Falta elegir "${group.label}" en "${item.name}"`);
    if (group.maxSelect && count > group.maxSelect) {
      reject(`Demasiadas opciones de "${group.label}" en "${item.name}"`);
    }
  }

  const modsCents = modifiers.reduce((sum, m) => sum + toCents(m.price), 0);
  const lineCents = (unitCents + modsCents) * qty;
  return {
    itemId: item.id,
    name: item.name,
    sizeId,
    sizeLabel,
    unitPrice: toEuros(unitCents),
    qty,
    modifiers: modifiers.map(({ id, label, price }) => ({ id, label, price })),
    notes: String(raw.notes || '').slice(0, 200),
    lineTotal: toEuros(lineCents),
    _cents: lineCents,
  };
}

// Validates and prices a whole order. Returns the snapshot to persist,
// or throws err.status = 422 with a customer-readable message.
function priceOrder(rawItems, fulfillmentType) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) reject('El pedido está vacío');
  if (rawItems.length > ORDER_MAX_ITEMS) reject('Demasiadas líneas en el pedido');

  const ordering = readJSON(ORDERING_FILE, {});
  const menu = readJSON(MENU_FILE, []);
  const byId = new Map(menu.map((p) => [p.id, p]));

  const items = rawItems.map((raw) => {
    const item = byId.get(String(raw.itemId));
    if (!item || item.active === false) reject('Un producto del carrito ya no está disponible');
    return priceLine(raw, item, ordering, fulfillmentType);
  });

  const subtotalCents = items.reduce((sum, li) => sum + li._cents, 0);
  const delivery = ordering.delivery || {};
  let feeCents = 0;
  if (fulfillmentType === 'delivery') {
    const minimumCents = toCents(delivery.minimum || 0);
    if (subtotalCents < minimumCents) {
      reject(`El pedido mínimo a domicilio es ${(minimumCents / 100).toFixed(2)} €`);
    }
    feeCents = toCents(delivery.fee || 0);
  }

  for (const li of items) delete li._cents;
  return {
    items,
    subtotal: toEuros(subtotalCents),
    deliveryFee: toEuros(feeCents),
    total: toEuros(subtotalCents + feeCents),
  };
}

module.exports = { priceOrder };
