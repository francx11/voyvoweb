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
| `pnpm check` | ESLint + Prettier + chequeo de sintaxis (correr antes de cada deploy) |
| `pnpm format` | Formatea código y docs |
| `pnpm backup` | Copia `data/` y la galería a `backups/<fecha>/` |

## Estructura

```
src/server.js          API Express + estáticos (solo sirve public/)
public/index.html      Web pública
public/admin.html      Panel de administración
public/assets/gallery/ Fotos subidas (optimizadas a WebP)
data/*.json            Contenido editable (carta, config, pizza del mes, orden de galería)
data/auth.json         Hash de contraseña (gitignored, se autogenera)
docs/                  Análisis de competencia, stack y plan de despliegue
scripts/backup.mjs     Backup de datos y galería
```

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
