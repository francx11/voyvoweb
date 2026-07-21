---
name: stack-rationale
description: Justificación de decisiones de stack y umbrales de migración. Usar cuando se pregunte por qué no se usa Astro/framework frontend, por qué no SQLite, o cuándo migrar. Detalle completo en docs/stack-tecnico.md.
---

# Por qué este stack (no repetir sin releer docs/stack-tecnico.md)

- **No Astro / no framework frontend**: la web es una sola página; el beneficio de un framework
  (routing, code-splitting) escala con nº de páginas, aquí escala a cero. Requisito clave: el
  panel publica cambios de contenido al instante, sin rebuild — un sitio estático lo rompe.
- **No SQLite (todavía)**: un solo escritor (el dueño), ráfagas de escritura no concurrentes,
  carta completa < 10 KB. JSON plano + escritura atómica (tmp + rename) ya cubre el caso real.
  **Umbral real de migración**: pedidos online con estado, múltiples admins simultáneos, o
  histórico consultable (ventas/reservas). Si aparece uno de esos tres, migrar es un cambio
  localizado porque `readJSON`/`writeJSON` (`src/lib/json-store.js`) son el único punto de acceso.
- **No serverless**: el CMS escribe en disco local; Vercel/Netlify Functions tienen filesystem
  efímero (añadiría S3 + DB gestionada = 3 servicios más para evitar un proceso Node de 60 MB).
- **AVIF descartado** por ahora (ver [[image-pipeline]]): WebP ya es universal y más rápido de
  codificar.
