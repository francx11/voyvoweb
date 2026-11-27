# Vídeo de fondo del hero (portada)

El hero de la portada («Pizza artesanal en Santa Fe a domicilio») admite un vídeo de fondo.
Mientras no haya vídeo, o si el navegador no lo reproduce (ahorro de datos, «reducir
movimiento»), el hero se queda como está: fondo azul y la pizza girando a la derecha. En cuanto
el vídeo empieza a verse, `public/js/ui.js` pone `.hero--video`: el vídeo pasa a ser el fondo de
todo el cartel, con un velo azul por la izquierda para que se lea el titular.

## Cómo activarlo

1. Crea `public/assets/video/` y deja ahí `horno.mp4` (y, si se puede, `horno.webm`, que pesa
   menos).
2. En `public/index.html`, sección «HERO», descomenta las dos líneas `<source>` del `<video>`.
3. `pnpm check` y PR como cualquier cambio.

## Cómo tiene que ser el vídeo

- Horizontal 16:9, 1920×1080 como máximo.
- En escritorio el texto tapa la mitad izquierda: lo importante, en la mitad derecha.
- En móvil se recorta a vertical por los lados: lo importante, también cerca del centro.
- 8–15 segundos que empalmen bien en bucle. Sin sonido (se reproduce en silencio).
- Peso: menos de 4 MB el mp4 (H.264) y menos de 3 MB el webm (VP9). Es lo primero que se
  descarga al abrir la web.
- Ideas de plano: la masa estirándose a mano, la pizza entrando o saliendo del horno, el corte
  en porciones, la caja cerrándose y saliendo el repartidor.
- Grabado en el local y con permiso de quien salga en él.
