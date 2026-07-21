---
name: auth-deep-dive
description: Sesiones, contraseñas y rate limiting del panel de admin. Usar cuando la tarea toque src/routes/auth.js, src/services/sessions.js, src/services/passwords.js, src/services/login-limiter.js o mencione "login", "contraseña", "sesión", "rate limit".
---

# Auth del panel de admin

- `services/passwords.js`: hash con scrypt (nuevas contraseñas) o sha256 legado (compatibilidad
  con instalaciones antiguas). No elimines el path legado sin migrar `data/auth.json` primero.
- `services/sessions.js`: sesiones en memoria (no persistidas, no compartidas entre procesos) +
  cookie `httpOnly`/`SameSite=Strict`. Reiniciar el proceso cierra todas las sesiones — esperado
  en un CMS de un solo admin, no es un bug.
- `services/login-limiter.js`: 5 fallos / 15 min por IP, también en memoria. Mismo motivo: no hay
  Redis ni store externo porque hay un único escritor.
- Primera contraseña sin `ADMIN_PASSWORD` en `.env`: `admin1234` — el panel obliga/permite
  cambiarla desde Configuración.
- Ver también [[security-baseline]] para los invariantes que no deben romperse.
