# VoyvoWeb

Web + CMS de la Pizzería Voy Volando (Santa Fe, Granada). Node.js + Express, datos en JSON plano
con escritura atómica, sin frontend framework. Detalle completo en [README.md](README.md) y
[docs/stack-tecnico.md](docs/stack-tecnico.md).

**Fase actual:** web de escaparate estática en GitHub Pages (`pnpm build:static` → `dist/`), con
los pedidos online apagados por `ORDERING_ENABLED` (`FEATURES.ordering` en `src/config.js`). El
flag manda sobre el interruptor del panel; con él apagado no se montan `/api/orders`,
`/api/places` ni el webhook de Stripe. Fases y checklist en
[docs/plan-despliegue.md](docs/plan-despliegue.md).

## No negociable

- **pnpm siempre.** Nunca `npm install` ni `npm run` en este repo (rompe el lockfile).
- Tras cualquier cambio de código: `pnpm check` (lint + format + tests).
- Nunca commitear `.env`, `data/auth.json` ni secretos — ya están en `.gitignore`.
- **Cada feature o fix va en su propia rama** creada desde `main` (nunca commits directos a
  `main`). Nombre de rama descriptivo (`feat/...`, `fix/...`).

@.claude/rules/conventions.md
@.claude/rules/security-baseline.md

## Contexto adicional (carga bajo demanda)

Reglas detalladas en `.claude/skills/`, cada una con su propio disparador — no hace falta leerlas
enteras salvo que la tarea toque ese área:

- `image-pipeline` — subida/optimización de imágenes (sharp, galería)
- `auth-deep-dive` — sesiones, contraseñas, rate limiting de login
- `deployment` — Railway, dominio, backups, checklist de despliegue
- `stack-rationale` — por qué no Astro/SQLite/frontend framework, umbrales de migración
