# Prompts para Canva Pro — Carta y flyers Voy Volando

Sistema: **Dirección A "Correo Aéreo"**. Paleta y tipografías derivadas del logo real
(mascota piloto con pizza, rojo + azul marino + oro + crema).

Antes de pegar nada: sube `logo-voyvolando.png` a la carpeta de marca de Canva y crea un
**Brand Kit** con los colores y las fuentes de abajo. Canva respeta mucho mejor el prompt
cuando los tokens ya están en el Brand Kit que cuando se los describes en texto.

---

## 0. Tokens (mételos en el Brand Kit)

| Token        | Hex       | Uso                                |
| ------------ | --------- | ---------------------------------- |
| Rojo Volando | `#B00E14` | precios, promos, botones, sellos   |
| Azul Piloto  | `#0A2A6B` | fondos dominantes, cabeceras, pies |
| Oro Gafas    | `#F0C24B` | acento, sombras duras, subrayados  |
| Crema Masa   | `#FAF2E2` | papel / fondo claro                |
| Crema Sombra | `#F0E4CC` | bandas y cajas secundarias         |
| Tinta        | `#16181D` | ingredientes y texto corrido       |

Fuentes (las tres están en Canva):

- **Alfa Slab One** — títulos y precios grandes.
- **Barlow Condensed 700**, mayúsculas, tracking 0.15em — secciones y etiquetas.
- **Barlow 400/500** — ingredientes y texto corrido, nunca por debajo de 12 pt.

Reparto de color: 60 % crema, 25 % azul, 10 % rojo, 5 % oro.

---

## 1. Prompt maestro (pégalo primero, en Canva AI / Magic Design)

```
Actúa como director de arte de una pizzería de barrio en Santa Fe (Granada) llamada
Voy Volando. Su logo es una mascota piloto de dibujo animado con casco rojo, gafas de
aviador doradas, mono azul y bufanda roja, sosteniendo una pizza de pepperoni, con el
wordmark "VOY VOLANDO" en rojo con contorno azul marino.

Diseña un sistema gráfico llamado "Correo Aéreo" que extienda ese logo a carta impresa,
flyers y web. Estilo: americana vintage de aviación y correo aéreo, años 50, plano y
vectorial, alto contraste, sin fotografías, sin degradados, sin brillos, sin sombras
difuminadas, sin esquinas redondeadas salvo los sellos circulares.

Paleta exacta y obligatoria, no la cambies:
rojo #B00E14, azul marino #0A2A6B, oro #F0C24B, crema #FAF2E2, crema sombra #F0E4CC,
tinta #16181D. Reparto: 60% crema, 25% azul, 10% rojo, 5% oro.

Tipografías obligatorias:
- Alfa Slab One para títulos y precios grandes.
- Barlow Condensed Bold en mayúsculas con tracking amplio para secciones y etiquetas.
- Barlow Regular para ingredientes y texto corrido, mínimo 12 pt.

Recursos del sistema, úsalos y no inventes otros:
- Marco y bandas tipo "par avion": franjas diagonales rojas, cremas y azules a 45 grados,
  de 12 a 14 px de grosor.
- Estela punteada con una flecha roja al final, como separador entre secciones.
- Sello circular rojo con texto corto en Barlow Condensed mayúsculas para novedades y
  promos ("DEL MES", "3x2", "NUEVO").
- Sombra dura y sólida de 5-6 px en oro o en rojo bajo las cajas importantes. Nunca blur.

Reglas del logo: siempre sobre crema o sobre azul, nunca sobre rojo. No rotarlo, no
recolorearlo, no aplicarle sombra ni contorno extra. Margen libre alrededor igual a la
altura del casco.
```

---

## 2. Portada de la carta (A4, 210 × 297 mm, 3 mm de sangre)

```
Diseña la portada A4 vertical de la carta con el sistema "Correo Aéreo".

Fondo azul marino #0A2A6B a página completa. Marco interior de 14 px con franjas
diagonales par avion en rojo, crema y azul, a 6 mm del borde.

De arriba abajo, centrado:
1. "PIZZERÍA · SANTA FE, GRANADA" en Barlow Condensed Bold, oro #F0C24B, mayúsculas,
   tracking muy amplio, 12 pt.
2. El logo de la mascota piloto, grande, unos 90 mm de ancho.
3. La palabra "Carta" en Alfa Slab One, crema, unos 84 pt, con sombra dura roja #B00E14
   desplazada 5 px a la derecha y abajo.
4. Una estela punteada dorada con flecha roja, y a su lado
   "MASA ARTESANA CADA MAÑANA" en Barlow Condensed Bold crema, mayúsculas.
5. Una caja crema #FAF2E2 a todo el ancho útil, con sombra dura roja de 6 px, que contiene
   una tabla de precios de tres filas por tres columnas:
   encabezados PEQUEÑA / MEDIANA / FAMILIAR en Barlow Condensed Bold azul;
   filas Clásicas 6,50 / 9,50 / 11,50 — Especiales 7,50 / 11,00 / 13,00 —
   Gourmet 8,00 / 11,50 / 13,50, con los importes en Alfa Slab One.
   Debajo, separado por una línea de puntos, en Barlow Regular 12 pt:
   "Mitad y mitad: 1 € · especiales 1,50 € · gourmet 2 €. Masa gruesa 2 € · extrafina 1 €.
   Bordes de queso 2 € (cheddar o roquefort 3 €)."
6. Pie a dos columnas: a la izquierda "PEDIDOS" en oro y debajo "958 44 28 47" en Alfa
   Slab One grande, con la dirección "C. Cristóbal Colón, 7 · 18320 Santa Fe (Granada)";
   a la derecha "PIDE ONLINE" en oro y "voyvolandosantafe.com" en Barlow Condensed Bold,
   con "Recogida y domicilio" debajo.

Todo el texto en crema u oro sobre el azul. Nada de fotos de pizza.
```

---

## 3. Interior de la carta (A4, una página por bloque)

Repite este prompt cambiando el nombre de la sección y la lista. Un A4 aguanta cómodo
**24 pizzas en dos columnas**; no metas más o pierdes el mínimo de 12 pt.

```
Diseña una página interior A4 vertical de la carta, sección "Clásicas".

Cabecera: banda azul marino #0A2A6B de 80 px de alto con el logo pequeño a la izquierda,
encima el rótulo "NUESTRAS PIZZAS" en Barlow Condensed Bold oro mayúsculas 10 pt y debajo
"Clásicas" en Alfa Slab One crema 38 pt. A la derecha de la banda, tres cajitas rojas
#B00E14 con PEQ. 6,50 / MED. 9,50 / FAM. 11,50, el precio en Alfa Slab One.

Bajo la cabecera, una franja par avion de 7 px a todo el ancho.

Cuerpo sobre fondo crema #FAF2E2, en dos columnas iguales con 12 mm de calle. Cada pizza
es un bloque de dos líneas: el nombre en Barlow Condensed Bold azul marino mayúsculas
14 pt, y debajo los ingredientes en Barlow Regular tinta #16181D 12 pt. Sin precios por
pizza: el precio va en la cabecera. Sin iconos, sin viñetas, sin fotos.

Pie de página: caja crema sombra #F0E4CC con un sello circular rojo que dice "DEL MES" y,
al lado, el texto de extras. Debajo, banda azul con el teléfono a la izquierda, una estela
punteada con flecha en el centro y voyvolandosantafe.com a la derecha.
```

---

## 4. Flyer de promociones (A5, 148 × 210 mm)

```
Diseña un flyer A5 vertical de promociones con el sistema "Correo Aéreo".

Fondo crema #FAF2E2. Franja par avion de 14 px arriba y otra abajo, a sangre.

Cabecera: logo a la izquierda, 20 mm; al lado "Voy Volando" en Alfa Slab One azul marino
y debajo "SANTA FE · GRANADA" en Barlow Condensed Bold rojo mayúsculas.

Bloque dominante, alineado a la izquierda y que ocupe un tercio de la página:
"3x2" en Alfa Slab One rojo #B00E14 a 128 pt, debajo "en pizzas medianas" en Alfa Slab One
azul marino a 46 pt, y debajo "DE LUNES A JUEVES" en Barlow Condensed Bold tinta,
mayúsculas, 27 pt.

Debajo, caja azul marino con sombra dura oro de 6 px, titulada "Y TODA LA SEMANA" en oro,
con tres líneas separadas por filetes finos, texto a la izquierda y precio a la derecha en
Alfa Slab One:
- Familiar clásica, solo recoger — 10 €
- 3 pizzas pequeñas, solo recoger — 18 €
- Pequeña + refresco + patatas — 8 €

Debajo, un sello circular rojo con "MAR / MIÉ" y a su lado, en dos líneas:
"Martes de papas — gratinado pequeño gratis a domicilio" y
"Miércoles de pizza — 1 litro de refresco gratis a domicilio. Pedidos desde 13 €."

Pie: banda azul marino a sangre con "PIDE YA" en oro, el teléfono 958 44 28 47 en Alfa
Slab One grande, la dirección debajo, y a la derecha voyvolandosantafe.com con
"Recogida y domicilio".

Que el titular se lea a tres metros. Comprueba que sigue funcionando en escala de grises.
```

---

## 5. Ajustes que Canva suele fallar — pídeselos explícitamente

- «No uses degradados ni sombras difuminadas: solo sombras sólidas desplazadas.»
- «No redondees las esquinas de las cajas.»
- «No añadas fotos de pizza ni iconos de emoji.»
- «Mantén los ingredientes en 12 pt como mínimo; si no caben, quita pizzas de la página,
  no reduzcas el cuerpo.»
- «No pongas el logo sobre fondo rojo.»
- «Usa exactamente los hex indicados, sin variaciones de tono.»

---

## 6. Exportación

- Carta y flyer: **PDF para imprenta**, marcas de recorte y sangrado, CMYK.
- El azul `#0A2A6B` en CMYK sale ~100/85/10/25; pide una prueba impresa antes de tirada
  larga, los azules profundos viran a morado en papel barato.
- Versión digital de la carta para la web: **PDF estándar** comprimido.
- Flyer para redes: PNG 1080 × 1350 con el mismo diseño reencuadrado.
