# Vídeo del hero (portada)

El hero de la portada («Pizza artesanal en Santa Fe a domicilio») lleva un vídeo vertical del
horno: `public/assets/video/horno.mp4` (720×1280, 15,5 s, H.264, sin audio, 4,8 MB). Se sube tal
cual sale del móvil, sin recomprimir, para no perder calidad.

## Cómo se ve

- **Escritorio:** enmarcado como una foto vertical en el hueco de la pizza, a la derecha, con la
  mascota y el sello encima como pegatinas.
- **Móvil y tablet (≤ 860 px):** fondo de todo el cartel, con un velo azul arriba para que se lea
  el titular y la parte de abajo limpia.
- Mientras no se reproduce (carga, «reducir movimiento», ahorro de datos, navegador sin H.264) se
  ve la pizza girando, como antes. `public/js/ui.js` pone `.hero--video` solo cuando el vídeo ya
  se está viendo, y el cambio no mueve nada de sitio (CLS 0).
- Sin autoplay en el HTML: se reproduce solo mientras el hero está a la vista.

## Cómo cambiarlo

1. Sustituye `public/assets/video/horno.mp4` por el nuevo (mismo nombre).
2. `pnpm check` y PR como cualquier cambio.

## Cómo tiene que ser el vídeo

- Vertical 9:16 (720×1280 o 1080×1920). Lo importante, en el centro: en escritorio se ve entero,
  pero en móvil se recorta un poco por los lados.
- 8–15 segundos que empalmen bien en bucle. Sin sonido (se reproduce en silencio).
- MP4 con H.264 (lo normal al grabar con el móvil). Más de ~6 MB empieza a notarse en móvil con
  datos.
- Grabado en el local, sin texto encima y con permiso de quien salga en él.
