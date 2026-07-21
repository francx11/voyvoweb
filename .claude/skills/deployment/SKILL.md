---
name: deployment
description: Despliegue a producción, hosting, dominio y backups. Usar cuando la tarea mencione "deploy", "Railway", "hosting", "dominio", "backup", "producción" o toque scripts/backup.mjs.
---

# Despliegue

Detalle completo y checklist paso a paso en [docs/plan-despliegue.md](../../docs/plan-despliegue.md).
Resumen:

- **Hosting recomendado: Railway (Hobby, ~5 $/mes)** — necesita disco persistente porque el CMS
  escribe `data/*.json` y `public/assets/gallery/` en disco local. Vercel/Netlify están
  descartados (filesystem efímero rompe el CMS).
- Build: `pnpm install --prod`. Start: `pnpm start`.
- Variables de entorno en producción: `NODE_ENV=production` (activa cookie `Secure`),
  `ADMIN_PASSWORD` (solo primer arranque), `GOOGLE_API_KEY` (opcional).
- Dominio real ya existe: `voyvolandosantafe.com` (web WordPress actual) — el cambio de DNS lo
  decide el dueño del negocio, no es automático.
- Backups: `pnpm backup` → `backups/<fecha>/` con `data/` + galería. Ejecutar antes de cambios
  grandes. En producción, activar snapshots de volumen de Railway o cron externo.
