// Express app assembly. Exported as a factory so the tests can build an
// app without opening a port; src/server.js is the real entry point.
const path = require('path');
const express = require('express');
const { PROD, PUBLIC_DIR } = require('./config');
const { initAuth } = require('./services/passwords');
const securityHeaders = require('./middleware/security-headers');
const errorHandler = require('./middleware/error-handler');

function createApp() {
  initAuth();

  const app = express();
  // Behind Railway's proxy req.ip would be the proxy address and the login
  // rate limit would throttle every visitor as one — trust the first hop.
  if (PROD) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  // Clean URL for the admin panel: registered before static so
  // express.static never serves admin.html directly. Old links/bookmarks
  // to admin.html keep working via redirect instead of breaking outright.
  app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.get('/admin.html', (_req, res) => res.redirect(301, '/admin'));

  app.use(express.static(PUBLIC_DIR)); // only public/ — never data/ or src/

  app.use('/api', require('./routes/auth'));
  app.use('/api/menu', require('./routes/menu'));
  app.use('/api/monthly-special', require('./routes/monthly-special'));
  app.use('/api/gallery', require('./routes/gallery'));
  app.use('/api/site', require('./routes/site'));
  app.use('/api/reviews', require('./routes/reviews'));
  app.use('/api/config', require('./routes/settings'));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
