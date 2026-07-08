# Análisis competitivo — Pizzerías con presencia web en Granada

**Fecha:** 8 de julio de 2026
**Ámbito:** Granada capital y área metropolitana (incluida Santa Fe).
**Criterio:** solo pizzerías con sitio web propio (no solo redes sociales o ficha de Google Business).

## Contexto importante: la web actual de Voy Volando

Durante la investigación se descubrió que el negocio **ya tiene una web publicada en
[voyvolandosantafe.com](https://voyvolandosantafe.com/)** (aparente WordPress con builder), con
secciones de carta, servicios, galería, reseñas y un formulario de pedido básico. También aparece
en Just Eat. Esto no invalida este proyecto: VoyvoWeb es la candidata a sustituirla con una web
más rápida (sin el peso de WordPress), con CMS propio sin cuotas de plugins y con el
diferenciador descrito abajo. Pero **hay que decidir la migración del dominio** (ver
`plan-despliegue.md`).

## Tabla comparativa

| Pizzería                                                | Web propia                                                                  | Tecnología aparente                                                      | Lo que hace bien                                                                                                              | Lo que hace mal / le falta                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pedro Pepperoni** (8 locales, Granada y metro)        | [pedropepperoni.com](https://pedropepperoni.com/)                           | WordPress + SmartMenu/AgoraPos (pedido propio) + CoverManager (reservas) | Pedido online propio, reservas, tabla de alérgenos, SEO local por localidad, marca fuerte                                     | Carta en PDF (mala UX móvil, mal SEO); alérgenos en tabla estática separada de la carta                                                                      |
| **Pizzería Verace** (Granada + Armilla)                 | [pizzaverace.es](https://pizzaverace.es/)                                   | WordPress + Delitbee (pedido) + Last.app (reservas)                      | Programa de fidelización "La Famiglia", precios visibles en carta, buen relato de producto (fermentación 72 h), redes activas | Pedido delegado en plataforma de terceros (comisiones, datos del cliente fuera de casa)                                                                      |
| **Vulcano** (2 locales, centro)                         | [vulcanogranada.es](https://vulcanogranada.es/)                             | WordPress + Elementor                                                    | Reservas integradas, SEO local con mapas por local, carta por categorías                                                      | Delivery solo vía Uber Eats (comisión ~30%); Elementor = web pesada; popups                                                                                  |
| **Voy Volando (web actual)**                            | [voyvolandosantafe.com](https://voyvolandosantafe.com/)                     | WordPress + builder                                                      | Existe, tiene todas las secciones básicas, SEO local decente                                                                  | Formulario de pedido genérico sin carrito; blog placeholder; sin precios detallados en portada; dependiente de WordPress (mantenimiento, plugins, velocidad) |
| **Pizzería Desi**                                       | pizzeriadesi.com                                                            | No verificable (sitio caído/DNS falló el 08-07-2026)                     | Según terceros: app móvil propia de pedidos                                                                                   | Web no accesible durante el análisis — mala señal de fiabilidad                                                                                              |
| **Di Taglio's**                                         | ditaglios.com                                                               | No verificable (DNS falló el 08-07-2026)                                 | Según buscadores: pedido online con "mejores precios" que agregadores                                                         | Web no accesible durante el análisis                                                                                                                         |
| **La Vin Qué Pizza**                                    | Solo tienda en [delitbee.shop](https://pedidos.delitbee.shop/lavinquepizza) | Delitbee (marca blanca)                                                  | Pedido online funcional                                                                                                       | Sin web propia real: su identidad vive en una URL de terceros                                                                                                |
| **Telepizza Santa Fe** (competidor directo en Santa Fe) | [telepizza.es](https://www.telepizza.es/info/pizzerias-granada.html)        | Plataforma corporativa de cadena                                         | Pedido online maduro, app, promociones                                                                                        | Cero identidad local; no compite en "artesanal"                                                                                                              |

Notas: Tívoli, Da Michele, La Fralisani y otros locales bien valorados en agregadores
(TripAdvisor, Gastroranking) operan principalmente con ficha de Google/redes o páginas de
directorios, no con web propia potente — por eso no entran en la tabla.

## Lecturas del panorama

1. **Todos los que tienen web usan WordPress** + plugins de terceros. Ninguna web local es
   especialmente rápida. Una web ligera (HTML + JS mínimo, imágenes WebP) gana Core Web Vitals
   sin esfuerzo frente a este campo.
2. **El pedido online existe pero siempre delegado o aparte de la carta**: PDF + formulario,
   plataforma externa (Delitbee, Uber Eats) o sistema de cadena. Las plataformas cobran comisión
   y se quedan los datos del cliente.
3. **Los alérgenos son una tabla PDF aparte** (Pedro Pepperoni) o directamente no están. Nadie
   los integra en la carta de forma filtrable.
4. En **Santa Fe** el único competidor con maquinaria web seria es Telepizza (cadena). El hueco
   "artesanal local con buena web" está libre.

## Diferenciador elegido: carta interactiva con pedido directo por WhatsApp + filtro de alérgenos en vivo

**Qué es:** en la carta de la web, cada producto muestra precio y alérgenos; el cliente puede
filtrar la carta por alérgenos ("sin gluten", "sin lácteos"...) y el botón de pedido abre
WhatsApp con el mensaje precompuesto. Sin apps, sin comisiones de agregadores, sin pasarela de
pago que mantener.

**Por qué este y no otro:**

- **Nadie de la tabla lo tiene.** El pedido por WhatsApp aparece en cero competidores analizados;
  el filtro de alérgenos en carta, tampoco (el mejor caso es un PDF estático).
- **Coste marginal ~0** para un negocio pequeño: WhatsApp ya es el canal que el cliente usa, y no
  requiere TPV online, pasarela ni cumplimiento PCI.
- **Encaja con el CMS ya construido:** los alérgenos y precios se editan desde el panel de admin y
  se publican al instante.
- Alternativas descartadas: _pedido online con pago_ (requiere pasarela + gestión de estados: caro
  de mantener para un local); _fidelización_ (Verace ya lo tiene, no diferencia); _reservas online_
  (commodity vía Last.app/CoverManager, y el local funciona bien por teléfono); _vídeo scroll-driven_
  (no hay vídeo del local en el material de origen — sería inventar activos).

**Cómo se implementa (estado actual):**

1. ✅ Campo `alergenos[]` y `precio` por producto en el CMS (hecho, Tarea 3).
2. ✅ Campo `whatsapp` editable en el panel; si está relleno, los CTA "Pedir ahora"/"Pedir por
   teléfono" de la web pasan a abrir `wa.me/<número>` con mensaje precompuesto (hecho).
3. ✅ Filtro de alérgenos en la carta pública: chips "Sin gluten", "Sin lácteos"… que ocultan los
   productos que contienen el alérgeno. Solo aparece si hay datos de alérgenos cargados (hecho).
4. ⚠️ PENDIENTE (dato real del negocio): número de WhatsApp del local y alérgenos/precios reales
   de cada pizza — los introduce el dueño desde el panel; no se han inventado.
5. Fase 2 (opcional): mensaje de WhatsApp con el detalle de productos seleccionados (mini-carrito
   sin pago), horarios de apertura visibles junto al CTA.

## Fuentes

- [Telepizza — pizzerías en Granada](https://www.telepizza.es/info/pizzerias-granada.html)
- [Pedro Pepperoni — pedidos y reservas](https://pedropepperoni.com/pedidos/)
- [Vulcano Granada](https://vulcanogranada.es/)
- [Pizzería Verace](https://pizzaverace.es/)
- [Pizzería Desi](https://pizzeriadesi.com/reparto-a-domicilio-granada/) (inaccesible en el análisis)
- [Di Taglio's](https://www.ditaglios.com/) (inaccesible en el análisis)
- [La Vin Qué Pizza en Delitbee](https://pedidos.delitbee.shop/lavinquepizza)
- [Web actual de Voy Volando](https://voyvolandosantafe.com/) · [Carta](https://voyvolandosantafe.com/carta/)
- [Voy Volando en Just Eat](https://www.just-eat.es/restaurants-pizzeria-voy-volando-santa-fe-santa-fe/menu)
- Rankings consultados: [Gastronosfera](https://www.gastronosfera.com/top-lists/pizzerias-en-granada-tres-lugares-imperdibles-para-disfrutar-la-mejor-pizza), [DisfrutarGranada](https://www.disfrutargranada.com/mejores-pizzerias/), [GranadaNews](https://granadanews.es/mejores-pizzerias-en-granada/), [Gastroranking](https://gastroranking.es/restaurantes/pasta-y-pizzeria/granada/), [TripAdvisor](https://www.tripadvisor.com/Restaurants-g187441-c31-Granada_Province_of_Granada_Andalucia.html), [Amor a Primera Pizza](https://amoraprimerapizza.com/loc-granada/)
