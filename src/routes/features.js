// Public feature flags. One request the browser (and the admin panel) can
// make to know which halves of the site are actually wired up on this
// deployment — the static export freezes it to a file just like the rest.
const { Router } = require('express');
const { FEATURES } = require('../config');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ ordering: FEATURES.ordering, static: false });
});

module.exports = router;
