# Plan de despliegue a producción

**Fecha:** 8 de julio de 2026 · **Actualizado:** 1 de septiembre de 2026 (migración en dos fases)
**Stack a desplegar:** Node.js (Express) + archivos JSON + galería en disco → necesita **disco
persistente** cuando haya pedidos online; hasta entonces basta un hosting estático.

## Dos fases

La migración desde el WordPress actual se hace en dos saltos, no en uno:

| Fase                                     | Hosting                             | Pedidos online | Coste    |
| ---------------------------------------- | ----------------------------------- | -------------- | -------- |
| **1 — web de escaparate** (ahora)        | GitHub Pages (export estático)      | Desactivados   | 0 €      |
| **2 — tienda online** (cuando se decida) | Railway / VPS con disco persistente | Activados      | ~5 $/mes |

La fase 1 sustituye ya al WordPress con el mismo dominio y sin coste. Todo el código de pedidos
sigue en el repo, apagado por `ORDERING_ENABLED`: pasar a fase 2 es desplegar el mismo repo en
Railway con la variable a `true` y mover el DNS.

---

# Fase 1 — GitHub Pages (estático, sin backend)

## Cómo funciona el export

`pnpm build:static` (`scripts/build-static.mjs`) levanta el propio Express en un puerto efímero,
congela cada GET público en `dist/api/<nombre>.json` y copia `public/` a `dist/` sin el panel ni
la página de estado de pedido. No hay un segundo renderizador: el HTML/CSS/JS publicado es el
mismo que sirve Node, así que las dos fases no pueden divergir.

```bash
pnpm build:static     # → dist/  (CNAME, .nojekyll, 404.html, robots, sitemap incluidos)
```

`public/js/main.js` pide `/api/menu.json` en lugar de `/api/menu` cuando detecta
`window.VV_STATIC`, bandera que el build inyecta en `dist/index.html`.

El dominio vive en un único sitio, `SITE_DOMAIN`. Las rutas de CSS, JS e imágenes son absolutas
desde la raíz (`/css/main.css`) y no llevan dominio, así que valen en cualquier host; las cinco
que sí tienen que ser completas (`canonical`, `og:url`, `og:image` y dos del JSON-LD) las reescribe
el build con el valor de `SITE_DOMAIN`, igual que el CNAME, el sitemap y el robots. Cambiar de
dominio es, por tanto, `SITE_DOMAIN=nuevo.com pnpm build:static` (y la variable del workflow).

## Qué se pierde en fase 1 (y es aceptable)

| Función           | Estado en estático                                                               |
| ----------------- | -------------------------------------------------------------------------------- |
| Panel `/admin`    | No se publica. Se usa en local (`pnpm dev`) y los cambios se suben con un commit |
| Pedidos online    | Desactivados (`ORDERING_ENABLED=false`): sin carrito, sin checkout, sin Stripe   |
| Reseñas de Google | Congeladas en el build (se refrescan en cada deploy) si existe el secret         |
| Subida de fotos   | En local; las imágenes ya optimizadas viajan en el repo                          |

**Editar contenido en fase 1:** `pnpm dev` → panel en local → editar → commit de `data/*.json` y
`public/assets/` → push a `main` → GitHub Actions reconstruye y publica (~1 min).

## Analítica (Google Analytics 4 + Tag Manager)

Solo va en el build estático: `injectAnalytics()` en `scripts/build-static.mjs` añade
`js/consent.js` a cada página publicada (no a las redirecciones antiguas). Ese script muestra el
banner de cookies y **no carga nada de Google hasta que el visitante acepta**, como piden la LSSI
y la AEPD; la decisión se guarda en `localStorage` (`vv_consent`) y se cambia desde
`/privacidad/#cookies`. La web carga solo GTM (`GTM-T3G79KW8`, en `ANALYTICS` de `src/config.js`), y GA4
(`G-3RFQEGM4YJ`) vive dentro del contenedor como **Etiqueta de Google** con el activador
**Initialization – All Pages**. Nuevas mediciones (eventos, píxeles) se añaden en GTM y se
publican desde allí, sin commit ni despliegue.

El `<noscript>` con el iframe de GTM que propone Google **no se incluye a propósito**: sin
JavaScript no hay banner, así que ese iframe mediría la visita sin consentimiento.

⚠️ No actives `GA_MEASUREMENT_ID` (GA4 directo) mientras GTM lleve la etiqueta de GA4: cada visita
se contaría dos veces.

## Checklist GitHub Pages

1. [ ] Repo en GitHub (puede ser privado con Pages en plan Pro; si es gratuito, público).
2. [ ] Settings → Pages → **Source: GitHub Actions** (el workflow `.github/workflows/pages.yml`
       ya está en el repo; se dispara en cada push a `main`).
3. [ ] Settings → Secrets → `GOOGLE_API_KEY` (opcional: sin él las reseñas salen vacías).
4. [ ] Settings → Pages → Custom domain: `voyvolandosantafe.com` + **Enforce HTTPS**.
       El workflow ya escribe `dist/CNAME` en cada build (variable `SITE_DOMAIN`).
5. [ ] DNS en el registrador — ⚠️ **antes**, backup/captura de la web WordPress actual:
   - `A` de la raíz → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` de `www` → `<usuario>.github.io`
6. [ ] Esperar la propagación, comprobar `https://voyvolandosantafe.com` y el redirect de `www`.
7. [ ] Actualizar la URL en el perfil de Google Business del local.

## Salto a fase 2

1. [ ] Desplegar el repo en Railway siguiendo el checklist de abajo.
2. [ ] `ORDERING_ENABLED=true` + claves de Stripe en las variables de Railway.
3. [ ] Configurar tarifas, envío y horario en **Panel → Config. pedidos** (editables ya en fase 1).
4. [ ] Mover el DNS de GitHub Pages a Railway (CNAME) y desactivar el workflow de Pages.

---

# Fase 2 — servidor con backend (Railway)

## Hosting recomendado

| Opción                  | Coste               | Disco persistente | Veredicto                                                                                                 |
| ----------------------- | ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Railway (Hobby)**     | ~5 $/mes            | Sí (volumen)      | ✅ **Recomendado**: deploy desde GitHub, volumen para `data/` y galería, HTTPS y dominio custom incluidos |
| Render (Starter + disk) | 7 $/mes + 0,25 $/GB | Sí                | Alternativa equivalente, algo más cara                                                                    |
| VPS (Hetzner CX22)      | ~4 €/mes            | Sí                | Más barato y más control, pero exige administrar Linux, nginx y certificados: solo si hay alguien técnico |
| Vercel / Netlify        | 0 €                 | ❌ No             | Descartado: filesystem efímero rompe CMS y galería (ver `stack-tecnico.md`)                               |
| Fly.io                  | ~3-5 $/mes          | Sí (volumen)      | Válido, pero más fricción (CLI, Dockerfile) que Railway                                                   |

## Checklist paso a paso (Railway)

**Preparación (una vez, ~30 min):**

1. [ ] Subir el repo a GitHub (privado): `git remote add origin <url> && git push -u origin main`.
2. [ ] Crear proyecto en Railway → "Deploy from GitHub repo".
3. [ ] Añadir un **Volume** montado en `/app/storage` y definir en el arranque un symlink o
       (mejor) configurar las rutas: el servidor usa `data/` y `public/assets/gallery/` — moverlas al
       volumen con dos `ln -s` en el start command, o montar dos volúmenes si el plan lo permite.
       Alternativa simple: montar el volumen en `/app/data` y un segundo servicio de estáticos no es
       necesario — la galería puede vivir en `data/gallery` cambiando `GALLERY` por env var (mejora
       de 3 líneas si se elige Railway).
4. [ ] Variables de entorno en Railway:
   - `NODE_ENV=production` (activa cookie `Secure`)
   - `ADMIN_PASSWORD=<contraseña fuerte inicial>` (solo se usa en el primer arranque)
   - `GOOGLE_API_KEY=<key de Places>` (opcional, para reseñas y autocompletado de dirección)
5. [ ] Comando de build: `pnpm install --prod`. Comando de start: `pnpm start`.
6. [ ] Comprobar el deploy en la URL `*.up.railway.app`: home, carta, admin login, subir una foto.

**Dominio y HTTPS (~15 min + propagación DNS):**

7. [ ] El negocio **ya posee `voyvolandosantafe.com`** (web WordPress actual — ver
       `analisis-competencia.md`). Decidir con el dueño el momento del cambio: en el registrador,
       apuntar el dominio (CNAME) al target que da Railway. HTTPS lo emite Railway automáticamente
       (Let's Encrypt). ⚠️ Hacer captura/backup de la web WordPress antes del cambio de DNS.
8. [ ] Probar `https://voyvolandosantafe.com` + redirect de `www`.

**Seguridad y secretos:**

9. [ ] Confirmar que ni `.env` ni `data/auth.json` están en el repo (el `.gitignore` ya los excluye).
10. [ ] Primer login en producción → cambiar la contraseña desde el panel (queda hasheada con
        scrypt en `data/auth.json`, dentro del volumen).
11. [ ] Restringir la Google API key por dominio/IP en Google Cloud Console.

**Backups:**

12. [ ] Local/manual: `pnpm backup` crea `backups/<fecha>/` con `data/` + galería. Ejecutarlo
        antes de cada cambio grande.
13. [ ] Producción: activar los backups de volumen de Railway (snapshot) o un cron mensual que
        haga `tar` del volumen y lo suba a un almacenamiento externo (rclone a Google Drive es la
        opción gratis). Mínimo aceptable: descargar backup manual 1 vez/mes — los datos cambian poco.

**Monitorización (coste 0):**

14. [ ] **UptimeRobot** (gratis): monitor HTTP a la home cada 5 min con alerta por email.
15. [ ] Railway ya guarda logs y reinicia el proceso si muere. Revisar logs tras la primera semana.
16. [ ] Opcional: endpoint `/api/session` sirve como healthcheck (responde JSON sin auth).

**Post-lanzamiento (SEO local, ~30 min):**

17. [ ] Actualizar la URL de la web en el perfil de Google Business del local.
18. [ ] Rellenar desde el panel: horarios reales, WhatsApp, precios y alérgenos de la carta
        (datos PENDIENTES que solo el dueño conoce).
19. [ ] Subir fotos reales del local/pizzas desde el panel (la galería del origen estaba vacía).

## Tiempo estimado total

| Fase                                  | Tiempo                                          |
| ------------------------------------- | ----------------------------------------------- |
| GitHub + Railway + volumen + env vars | 30-45 min                                       |
| Dominio + HTTPS                       | 15 min de trabajo (+ 0-24 h de propagación DNS) |
| Seguridad + backups + monitorización  | 30 min                                          |
| Carga de contenido real (dueño)       | 1-2 h                                           |
| **Total técnico**                     | **~1,5 h de trabajo activo**                    |
