// Google Places Autocomplete proxy: same policy as google-reviews.js — the
// API key never reaches the browser, requests are made server-side only.
// Predictions are biased to the shop's delivery area (Santa Fe, Granada and
// the surrounding villages in ordering.json's delivery.zones) rather than
// restricted to it, so a customer typing an out-of-zone address still gets
// suggestions instead of nothing.
const SHOP_LOCATION = '37.1706,-3.7658'; // Santa Fe, Granada
const BIAS_RADIUS_M = 12000;

function apiError(message, status, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

async function autocompleteAddress(apiKey, input) {
  const url =
    'https://maps.googleapis.com/maps/api/place/autocomplete/json' +
    `?input=${encodeURIComponent(input)}` +
    '&language=es' +
    '&components=country:es' +
    `&location=${SHOP_LOCATION}` +
    `&radius=${BIAS_RADIUS_M}` +
    `&key=${encodeURIComponent(apiKey)}`;

  let json;
  try {
    const res = await fetch(url);
    json = await res.json();
  } catch (e) {
    throw apiError(e.message || 'Respuesta inválida de Google', 500);
  }
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw apiError(`Google: ${json.status}`, 502, json.error_message);
  }

  return (json.predictions || []).map((p) => ({
    placeId: p.place_id,
    description: p.description,
  }));
}

module.exports = { autocompleteAddress };
