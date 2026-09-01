# Ficha para imprenta — Voy Volando

Dirección A "Correo Aéreo". Generado con Chromium desde `carta-print.html` y `flyer-print.html`
(`node render.mjs`). Texto vectorial con fuentes incrustadas y subconjuntadas, no rasterizado.

## Archivos

| Archivo                              | Piezas    | Formato final   | Documento    |
| ------------------------------------ | --------- | --------------- | ------------ |
| `carta-voy-volando-imprenta.pdf`     | 8 páginas | A4 210 × 297 mm | 226 × 313 mm |
| `flyer-3x2-voy-volando-imprenta.pdf` | 1 cara    | A5 148 × 210 mm | 164 × 226 mm |

## Geometría

- **Sangre: 3 mm** por lado, con fondos a sangre reales (bandas azules, franjas _par avion_).
- **Marcas de corte**: 5 mm de largo, arrancan a 3 mm del corte, fuera de la zona de sangre.
- **Margen de seguridad**: ningún texto a menos de 11 mm del corte.

## Paginación de la carta

1. Portada
2. Pizzas clásicas (24)
3. Pizzas especiales (18)
4. Gourmet (6) y gratinados (10)
5. Complementos y combos
6. Ensaladas, pastas y postres
7. Bebidas y promociones
8. Contraportada

8 páginas = **2 pliegos A3 a doble cara**, plegados y grapados a caballete.

## Color

Los PDF salen en **RGB**. La imprenta debe convertir a CMYK con perfil FOGRA39 (papel estucado)
o FOGRA52 (offset no estucado). Equivalencias objetivo:

| Color        | RGB       | CMYK aprox.        |
| ------------ | --------- | ------------------ |
| Azul Piloto  | `#0A2A6B` | 100 / 85 / 10 / 25 |
| Rojo Volando | `#B00E14` | 15 / 100 / 100 / 5 |
| Oro Gafas    | `#F0C24B` | 5 / 25 / 80 / 0    |
| Crema Masa   | `#FAF2E2` | 2 / 3 / 11 / 0     |

**Pide prueba de color impresa antes de tirada larga.** El azul profundo es el riesgo: vira a
morado en papel barato y con exceso de negro.

## Tipografías

Alfa Slab One, Barlow Condensed (600/700) y Barlow (400/500/600), todas de Google Fonts, licencia
SIL Open Font License — uso comercial e impresión permitidos. Van incrustadas en el PDF.

## Papel recomendado

- Carta: estucado mate 170 g, plastificado mate en portada y contraportada si va a mesa.
- Flyer: offset 135 g, sin plastificar (es material de buzoneo).

## Regenerar

```bash
cd docs/marca/print
node render.mjs     # PDFs
node shots.mjs      # PNG de control por página + detección de desbordes
node measure.mjs    # ocupación vertical de cada página en mm
```

`render.mjs` importa Playwright global por ruta absoluta; si cambia la ruta de instalación, se
edita ahí.
