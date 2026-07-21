// Address autocomplete for checkout, backed by Google Places. Same shape
// as routes/reviews.js: no key configured just means "no suggestions",
// never an error — the address field always still works as plain text.
const { Router } = require('express');
const { autocompleteAddress } = require('../services/google-places');

const router = Router();

router.get('/autocomplete', async (req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  const input = String(req.query.input || '')
    .trim()
    .slice(0, 200);
  if (!apiKey || input.length < 3) {
    return res.json({ configured: Boolean(apiKey), predictions: [] });
  }
  try {
    const predictions = await autocompleteAddress(apiKey, input);
    res.json({ configured: true, predictions });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details });
  }
});

module.exports = router;
