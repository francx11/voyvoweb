# VoyvoWeb

Web + CMS de la Pizzería Voy Volando (Santa Fe, Granada). Node.js + Express, datos en JSON plano
con escritura atómica, sin frontend framework. Detalle completo en [README.md](README.md) y
[docs/stack-tecnico.md](docs/stack-tecnico.md).

## No negociable

- **pnpm siempre.** Nunca `npm install` ni `npm run` en este repo (rompe el lockfile).
- Tras cualquier cambio de código: `pnpm check` (lint + format + tests).
- Nunca commitear `.env`, `data/auth.json` ni secretos — ya están en `.gitignore`.

@.claude/rules/conventions.md
@.claude/rules/security-baseline.md

## Contexto adicional (carga bajo demanda)

Reglas detalladas en `.claude/skills/`, cada una con su propio disparador — no hace falta leerlas
enteras salvo que la tarea toque ese área:

- `image-pipeline` — subida/optimización de imágenes (sharp, galería)
- `auth-deep-dive` — sesiones, contraseñas, rate limiting de login
- `deployment` — Railway, dominio, backups, checklist de despliegue
- `stack-rationale` — por qué no Astro/SQLite/frontend framework, umbrales de migración
