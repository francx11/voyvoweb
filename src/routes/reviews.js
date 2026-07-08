// Google reviews proxy: the API key never reaches the browser.
const { Router } = require('express');
const { readJSON } = require('../lib/json-store');
const { getReviews } = require('../services/google-reviews');

const router = Router();

router.get('/', async (_req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  const placeId = readJSON('config.json', {}).googlePlaceId || '';
  if (!apiKey || !placeId) {
    return res.json({ configured: false, reviews: [] });
  }
  try {
    const data = await getReviews(apiKey, placeId);
    res.json({ configured: true, ...data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details });
  }
});

module.exports = router;
