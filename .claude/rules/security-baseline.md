## Seguridad (invariantes, siempre aplican)

- Sesión de admin: cookie `httpOnly` + `SameSite=Strict` (+ `Secure` con `NODE_ENV=production`).
- Contraseñas nuevas con scrypt + salt; el hash vive fuera del repo (`data/auth.json`, gitignored).
- La API key de Google (`GOOGLE_API_KEY`) va en `.env`, nunca en el repo ni expuesta en el panel.
- Rate limit de login ya existe (5 fallos / 15 min por IP) — no lo elimines ni lo debilites sin
  pedir confirmación explícita.
