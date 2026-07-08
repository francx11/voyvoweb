// Google Places reviews with an in-memory cache: without it every page view
// would hit the (billed, quota-limited) Places API.
const { REVIEWS_CACHE_TTL } = require('../config');

let cache = { placeId: null, expires: 0, data: null };

function apiError(message, status, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

async function getReviews(apiKey, placeId) {
  if (cache.placeId === placeId && Date.now() < cache.expires) return cache.data;

  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}` +
    '&fields=reviews,rating,user_ratings_total' +
    '&language=es' +
    `&key=${encodeURIComponent(apiKey)}`;

  let json;
  try {
    const res = await fetch(url);
    json = await res.json();
  } catch (e) {
    throw apiError(e.message || 'Respuesta inválida de Google', 500);
  }
  if (json.status !== 'OK') {
    throw apiError(`Google: ${json.status}`, 502, json.error_message);
  }

  const data = {
    rating: json.result?.rating,
    total: json.result?.user_ratings_total,
    reviews: json.result?.reviews || [],
  };
  cache = { placeId, expires: Date.now() + REVIEWS_CACHE_TTL, data };
  return data;
}

module.exports = { getReviews };
