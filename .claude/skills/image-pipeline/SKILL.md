---
name: image-pipeline
description: Subida y optimización de imágenes (sharp, galería, multer). Usar cuando la tarea toque public/assets/gallery, src/services/gallery-store.js, src/middleware/uploads.js o mencione "galería", "subir foto", "imagen", "sharp", "webp".
---

# Pipeline de imágenes

- Al subir (multer → sharp): rotación EXIF, resize a máx. 1600 px, conversión a **WebP q80**. Se
  hace una sola vez, en el único punto de entrada (`src/middleware/uploads.js` +
  `src/services/gallery-store.js`).
- Al servir: `loading="lazy"` en la galería pública + caché de navegador vía Express static. No
  hay CDN ni servicio externo (Cloudinary descartado, ver `stack-rationale`).
- AVIF descartado por ahora (codificación más lenta, peor UX de subida). Cambiar formato es
  cambiar un parámetro de sharp, no una reescritura.
- `src/services/gallery-store.js` reconcilia disco ↔ `data/gallery.json` (orden, metadatos). Si
  añades/borras archivos a mano en `public/assets/gallery/`, ese servicio es el que hay que tocar
  para que el JSON no quede desincronizado.
