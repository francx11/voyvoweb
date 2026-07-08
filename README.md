# VoyvoWeb 🍕

Web y gestor de contenidos de la **Pizzería Voy Volando** (C. Cristóbal Colón 7, Santa Fe, Granada).

- **Web pública** (`/`): one-page con animaciones de scroll (GSAP), carta con precios y filtro de
  alérgenos, galería, pizza del mes, reseñas de Google y contacto.
- **Panel de admin** (`/admin.html`): edita carta, galería (con optimización automática de imagen),
  pizza del mes, textos del hero/historia, contacto y horarios. Todo se publica al instante, sin
  redeploy.

## Stack

Node.js + Express, datos en JSON plano con escritura atómica, imágenes optimizadas con sharp
(WebP, máx. 1600 px). Sin framework de frontend ni paso de build. Justificación completa en
[docs/stack-tecnico.md](docs/stack-tecnico.md).

## Arranque

```bash
pnpm install
cp .env.example .env   # opcional: contraseña inicial y API key de Google
pnpm dev               # desarrollo (recarga con --watch)
pnpm start             # producción
```

- Web: http://localhost:3000 · Admin: http://localhost:3000/admin.html
- Primera vez sin `ADMIN_PASSWORD` en `.env`: la contraseña es `admin1234` — cámbiala desde el
  panel (Configuración) en el primer uso.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm start` | Servidor en desarrollo / producción |
| `pnpm test` | Tests de integración de la API (node:test, sin dependencias extra) |
| `pnpm check` | ESLint + Prettier + tests (correr antes de cada deploy) |
| `pnpm format` | Formatea código y docs |
| `pnpm backup` | Copia `data/` y la galería a `backups/<fecha>/` |

## Estructura

```
src/
  server.js            Punto de entrada: arranque + apagado graceful (SIGTERM)
  app.js               Ensamblado de la app Express (factory, usada por los tests)
  config.js            Entorno, rutas de disco y constantes ajustables
  lib/json-store.js    Persistencia JSON con escritura atómica (tmp + rename)
  services/            Lógica de negocio sin HTTP:
    passwords.js         hash y verificación de contraseña (scrypt / sha256 legado)
    sessions.js          sesiones en memoria + cookies
    login-limiter.js     rate limit de login por IP
    gallery-store.js     reconciliación disco ↔ gallery.json
    google-reviews.js    Places API con caché (10 min)
  middleware/          security headers, requireAuth, multer, error handler JSON
  routes/              un router por dominio: auth, menu, gallery, site,
                       monthly-special, reviews, settings
tests/api.test.js      Tests de integración contra la app real (datos en tmp)
public/index.html      Web pública (+ css/main.css, js/main.js)
public/admin.html      Panel de administración (+ css/admin.css, js/admin.js)
public/assets/gallery/ Fotos subidas (optimizadas a WebP)
data/*.json            Contenido editable (carta, config, pizza del mes, orden de galería)
data/auth.json         Hash de contraseña (gitignored, se autogenera)
docs/                  Análisis de competencia, stack y plan de despliegue
scripts/backup.mjs     Backup de datos y galería
```

### Convenciones para evolucionar el código

- **Una feature nueva de API** = un fichero en `routes/` (+ servicio en `services/` si tiene
  lógica propia) y su montaje en `app.js`. Las rutas no tocan disco directamente: pasan por
  `lib/json-store.js` o un servicio.
- **La API siempre responde JSON**, también en errores: cualquier `throw`/`next(err)` acaba en
  `middleware/error-handler.js`. Los errores esperados llevan `err.status` (< 500).
- **Constantes ajustables** (límites de subida, TTLs, tamaños de imagen) viven en `src/config.js`,
  no repartidas por el código.
- Tras cualquier cambio: `pnpm check`.

## Seguridad

- Sesión de admin por cookie `httpOnly` + `SameSite=Strict` (+ `Secure` con `NODE_ENV=production`).
- Rate limit de login: 5 fallos / 15 min por IP.
- Contraseñas nuevas con scrypt + salt; el hash vive fuera del repo (`data/auth.json`).
- La API key de Google va en `.env` (`GOOGLE_API_KEY`), nunca en el repo ni en el panel.

## Despliegue

Checklist completo con hosting, dominio, backups y monitorización en
[docs/plan-despliegue.md](docs/plan-despliegue.md).

## Datos pendientes del negocio (no inventados)

- Horarios reales, número de WhatsApp, precios y alérgenos por pizza → se rellenan desde el panel.
- Fotos de la galería (el proyecto origen no tenía ninguna) → se suben desde el panel.
