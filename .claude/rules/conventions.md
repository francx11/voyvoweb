## Convenciones de código (siempre aplican)

- **Una feature nueva de API** = un fichero en `src/routes/` (+ servicio en `src/services/` si
  tiene lógica propia) y su montaje en `src/app.js`. Las rutas no tocan disco directamente: pasan
  por `src/lib/json-store.js` o un servicio.
- **La API siempre responde JSON**, también en errores: cualquier `throw`/`next(err)` acaba en
  `src/middleware/error-handler.js`. Los errores esperados llevan `err.status` (< 500).
- **Constantes ajustables** (límites de subida, TTLs, tamaños de imagen) viven en `src/config.js`,
  no repartidas por el código.
- Sin frontend framework ni paso de build: `public/` es HTML/CSS/JS vanilla servido tal cual.
- **Pedidos (`src/services/orders-store.js`)**: toda mutación de `orders.json` es read→mutate→write
  síncrono, sin `await` entre medias (el event loop la serializa). Las llamadas de red (Stripe)
  se hacen SIEMPRE antes de mutar; nunca dentro del callback de `updateOrder`.
