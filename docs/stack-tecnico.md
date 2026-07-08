# Stack técnico — decisión y justificación

**Fecha:** 8 de julio de 2026

## Resumen de la decisión

| Capa               | Elección                                              | Alternativa descartada                 |
| ------------------ | ----------------------------------------------------- | -------------------------------------- |
| Frontend           | HTML/CSS/JS vanilla + GSAP (lo migrado)               | Astro                                  |
| Backend            | Node.js + Express 4                                   | Funciones serverless / Astro endpoints |
| Persistencia       | JSON plano con escritura atómica                      | SQLite                                 |
| Imágenes           | sharp (resize + WebP q80 al subir) + `loading="lazy"` | Servicio externo (Cloudinary)          |
| Gestor de paquetes | pnpm                                                  | npm                                    |

## Frontend: vanilla, no Astro

Astro era el candidato obvio (islands, HTML-first, JS mínimo) y se descarta **con datos, no por
preferencia**:

1. **La web es UNA página** (más el panel). El beneficio de Astro (routing, componentes,
   code-splitting entre páginas) escala con el número de páginas; aquí escala a cero.
2. **El peso real ya es mínimo.** El HTML público pesa ~45 KB sin comprimir; el único JS externo
   es GSAP + ScrollTrigger (~90 KB min gzip combinados desde CDN con caché compartida). Un build
   de Astro con las mismas animaciones cargaría exactamente el mismo GSAP: la ganancia de bundle
   sería ~0 KB.
3. **Requisito de la Tarea 3: publicar cambios sin redeploy.** Un sitio Astro estático necesita
   rebuild al cambiar la carta (o volverse SSR, que reintroduce un servidor Node = lo que ya
   tenemos). Con el modelo actual, el contenido vive en la API y se publica al instante.
4. **Coste de mantenimiento.** Sin toolchain, sin `node_modules` de build, sin breaking changes
   de framework. Para un negocio pequeño, cada dependencia es una factura futura.

Se pierde: DX de componentes y optimización automática `<Image/>`. Se compensa: sharp ya optimiza
en el punto de subida (mejor sitio para hacerlo, se hace una sola vez).

## Backend: Express se queda

- Ya funciona, son ~450 líneas auditables y la API es CRUD simple sobre archivos.
- **Serverless se descarta** porque el CMS escribe en disco local (JSON + imágenes). En Vercel/
  Netlify Functions el filesystem es efímero: habría que añadir S3/blob storage + una base de
  datos gestionada → tres servicios más para evitar un proceso Node de 60 MB de RAM.
- Un VPS/PaaS con disco persistente ejecuta esto por ~5 €/mes (ver `plan-despliegue.md`).
- Express 4 se mantiene (no se migra a 5) para no introducir breaking changes sin beneficio.

## Persistencia: JSON plano, SQLite documentado como umbral

Criterio del plan: "SQLite si el CMS hace escrituras frecuentes". Medición honesta del caso real:

- **Escritores:** 1 (el dueño, sesión única de admin). No hay concurrencia real de escritura.
- **Frecuencia:** ráfagas al editar la carta (decenas/día como mucho), no continuas.
- **Volumen:** carta completa < 10 KB. Leer y reescribir el archivo entero es ~1 ms.

Con eso, SQLite añadiría un binario nativo y un esquema a mantener sin resolver ningún problema
existente. Los riesgos del JSON se mitigan directamente:

- Corrupción por escritura parcial → **escritura atómica** (tmp + `rename`), ya implementada.
- Pérdida de datos → **backups** (`pnpm backup`, ver plan de despliegue).

**Umbral de migración a SQLite** (documentado para el futuro): pedidos online con estado,
múltiples usuarios de admin simultáneos, o histórico consultable (ventas, reservas). El día que
exista una de esas tres cosas, migrar `data/*.json` a SQLite con `better-sqlite3` es un cambio
localizado en `src/server.js` (los helpers `readJSON`/`writeJSON` son el único punto de acceso).

## Imágenes

- **Al subir (sharp):** rotación EXIF, resize a máx. 1600 px, conversión a **WebP q80**. Una foto
  de móvil de 4 MB queda en ~150-300 KB. Se hace una vez, en el único punto de entrada.
- **Al servir:** `loading="lazy"` en galería (ya estaba) + caché del navegador vía Express static.
- **AVIF descartado** por ahora: 10-20% más pequeño que WebP pero codificación mucho más lenta
  (peor UX de subida en el panel) y soporte WebP ya es universal. Cambiar es una línea si se quiere.

## Core Web Vitals esperados

- **TTFB:** HTML estático servido por Express sin render — decenas de ms en un VPS europeo.
- **LCP:** el hero es un gradiente CSS (sin imagen ni vídeo por defecto) — LCP lo marca el H1.
- **CLS:** la galería usa `aspect-ratio` fijo; las secciones dinámicas están ocultas hasta tener datos.
- **INP:** sin framework, sin hidratación; GSAP anima con transform/opacity (compositor).

Único punto flojo: fuentes de Google Fonts y GSAP desde CDN (2 orígenes externos). Mitigación
opcional en despliegue: self-host de fuentes y GSAP (documentado como mejora, no bloqueante).
