const { Router } = require('express');
const { SESSION_TTL } = require('../config');
const { verifyPassword, setPassword } = require('../services/passwords');
const {
  createSession,
  isSessionValid,
  destroySession,
  sessionCookie,
  sessionTokenFrom,
} = require('../services/sessions');
const limiter = require('../services/login-limiter');
const requireAuth = require('../middleware/require-auth');

const router = Router();

router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (limiter.isLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
  if (verifyPassword(password)) {
    limiter.clear(ip);
    const token = createSession();
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL));
    res.json({ ok: true });
  } else {
    limiter.registerFail(ip);
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(sessionTokenFrom(req));
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  res.json({ authenticated: isSessionValid(sessionTokenFrom(req)) });
});

router.post('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !verifyPassword(currentPassword)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  setPassword(newPassword);
  res.json({ ok: true });
});

module.exports = router;
