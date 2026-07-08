# Plan de despliegue a producción

**Fecha:** 8 de julio de 2026
**Stack a desplegar:** Node.js (Express) + archivos JSON + galería en disco → necesita **disco persistente**.

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
   - `GOOGLE_API_KEY=<key de Places>` (opcional, para reseñas)
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
