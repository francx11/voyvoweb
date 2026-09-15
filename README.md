# VoyvoWeb 🍕

Web y gestor de contenidos de la **Pizzería Voy Volando** (C. Cristóbal Colón 7, Santa Fe, Granada).

- **Web pública** (`/`): one-page con animaciones de scroll (GSAP), carta con precios y filtro de
  alérgenos, galería, pizza del mes, reseñas de Google y contacto.
- **Panel de admin** (`/admin`): edita carta, galería (con optimización automática de imagen),
  pizza del mes, textos del hero/historia, contacto y horarios. Todo se publica al instante, sin
  redeploy.
- **Pedidos online** (carrito, checkout, Stripe, panel de Pedidos): apagados por defecto, se
  encienden con `ORDERING_ENABLED=true` — ver *Pedidos online* más abajo.

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

- Web: http://localhost:3000 · Admin: http://localhost:3000/admin
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
| `pnpm build:static` | Export estático a `dist/` para GitHub Pages (sin backend) |

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
    image-store.js       pipeline única de imágenes (EXIF + resize + WebP)
    google-reviews.js    Places API con caché (10 min)
  middleware/          security headers, requireAuth, multer, error handler JSON
  routes/              un router por dominio: auth, menu, gallery, site,
                       monthly-special, offers, reviews, settings
tests/api.test.js      Tests de integración contra la app real (datos en tmp)
public/index.html      Web pública (+ css/main.css, js/main.js)
public/admin.html      Panel de administración, servido en /admin (+ css/admin.css, js/admin.js)
public/assets/gallery/ Fotos subidas (optimizadas a WebP)
public/assets/ofertas/ Fotos de las ofertas · assets/especial/ foto de la pizza del mes
data/*.json            Contenido editable (carta, config, pizza del mes, ofertas, galería)
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

## Pedidos online (desactivados por defecto)

Toda la tienda online vive tras el flag `ORDERING_ENABLED` (`.env`, leído en `src/config.js` como
`FEATURES.ordering`). Con el flag apagado:

- no se montan `/api/orders`, `/api/places` ni el webhook de Stripe (responden 404);
- `/api/ordering/config` devuelve `enabled:false`, así que la web se dibuja sin carrito ni botones
  de "Pedir" — la carta sigue mostrando precios;
- el panel oculta la sección **Pedidos** y avisa en **Config. pedidos** de que el servidor manda.

El flag tiene prioridad sobre el interruptor "Pedidos online activados" del panel: ese sigue
siendo el interruptor del día a día (cerrar pedidos puntualmente), y `ORDERING_ENABLED` el de la
fase del proyecto. Las tarifas, extras y horarios se pueden preparar con la función apagada.

Para encenderlo: `ORDERING_ENABLED=true` + claves de Stripe en `.env`, y un hosting con backend
(no GitHub Pages).

## Despliegue estático (GitHub Pages)

Mientras no haya pedidos, la web se publica sin servidor. `pnpm build:static` levanta la propia
app Express en un puerto efímero, congela cada endpoint público en `dist/api/<nombre>.json` y
copia `public/` sin el panel ni la página de estado de pedido; `public/js/main.js` detecta
`window.VV_STATIC` y pide los `.json` en lugar de las rutas vivas. `.github/workflows/pages.yml`
lo reconstruye y publica en cada push a `main`.

Para cambiar contenido en esta fase: `pnpm dev` → editar en el panel local → commit de
`data/*.json` (+ `public/assets/`) → push.

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
