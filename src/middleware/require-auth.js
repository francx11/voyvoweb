const { isSessionValid, sessionTokenFrom } = require('../services/sessions');

module.exports = function requireAuth(req, res, next) {
  if (!isSessionValid(sessionTokenFrom(req))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
};
