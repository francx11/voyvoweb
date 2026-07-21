// Central error handler: the API must always answer JSON, never Express's
// HTML error page (the admin panel does res.json() on every response).
const multer = require('multer');

module.exports = function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Archivo demasiado grande'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Demasiados archivos'
          : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Cuerpo de la petición demasiado grande' });
  }
  // Expected errors carry err.status. 5xx ones (e.g. 503 payments disabled,
  // 502 Stripe unreachable) must opt in with err.expose so an accidental
  // status on an internal error never leaks its message.
  if (err.status && (err.status < 500 || err.expose === true)) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
