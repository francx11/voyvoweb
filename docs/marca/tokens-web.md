# Tokens web — Dirección A "Correo Aéreo"

Sustitución directa del bloque de variables de [public/css/main.css](../../public/css/main.css).
Mismos nombres de variable que ya usa el sitio, para que el cambio sea de una sola tacada.
La única variable nueva es `--gold`.

```css
:root {
  --paper: #faf2e2;
  --paper-2: #f0e4cc;
  --ink: #16181d;
  --ink-soft: #3a4152;
  --navy: #0a2a6b; /* nuevo rol estructural: cabeceras, footer, bandas */
  --gold: #f0c24b; /* nuevo: solo sobre navy o rojo */
  --tomato: #b00e14; /* texto/acento sobre --paper: 6,5:1 */
  --tomato-dark: #8c0a10;
  --tomato-btn: #b00e14;
  --tomato-btn-hover: #8c0a10;
  --on-tomato: #fff;
  --line: rgba(22, 24, 29, 0.18);
  --line-strong: rgba(22, 24, 29, 0.55);
  --display: 'Alfa Slab One', Rockwell, Georgia, serif;
  --heading: 'Barlow Condensed', 'Arial Narrow', sans-serif;
  --body: 'Barlow', 'Segoe UI', sans-serif;
}
```

Tema oscuro (mismos selectores que ya existen: `@media (prefers-color-scheme: dark)`
con guarda `:root:not([data-theme="light"])`, y `:root[data-theme="dark"]`):

```css
--paper: #0c1730; /* azul noche, no gris */
--paper-2: #12203f;
--ink: #f3ece0;
--ink-soft: #b7c2da;
--navy: #0a2a6b;
--gold: #f0c24b;
--tomato: #e8564c; /* 4,9:1 sobre --paper */
--tomato-dark: #ff7a6e;
--tomato-btn: #b00e14;
--tomato-btn-hover: #c81620;
--line: rgba(243, 236, 224, 0.14);
--line-strong: rgba(243, 236, 224, 0.4);
```

## Cambios que no son de color

- Añadir el `<link>` de Google Fonts para `Alfa Slab One`, `Barlow Condensed` (500/600/700)
  y `Barlow` (400/500/600), y retirar Fraunces y Karla.
- `--heading` es nueva: nav, etiquetas de categoría, botones y cabeceras de tarjeta van en
  Barlow Condensed 700 mayúsculas con `letter-spacing: 0.14em`.
- Botones y tarjetas destacadas: `box-shadow: 4px 4px 0 var(--gold)`, sin blur y sin
  `border-radius`. El radio queda solo para los sellos circulares.
- Banda `par avion` reutilizable, la misma que en carta y flyer:

  ```css
  .airmail-rule {
    height: 6px;
    background: repeating-linear-gradient(
      45deg,
      var(--tomato) 0 10px,
      var(--paper) 10px 20px,
      var(--navy) 20px 30px,
      var(--paper) 30px 40px
    );
  }
  ```

- El logo (`docs/marca/logo-voyvolando.png`, 256 px con alfa, extraído del PDF de la carta)
  sustituye al wordmark de texto `Voy <em>Volando</em>` en la cabecera. Conviene un SVG
  vectorial del original para retina; el PNG sirve mientras tanto.

## Contraste comprobado

| Combinación                | Ratio                            |
| -------------------------- | -------------------------------- |
| Crema sobre azul `#0A2A6B` | 12,0:1                           |
| Crema sobre rojo `#B00E14` | 6,5:1                            |
| Rojo sobre crema           | 6,5:1                            |
| Oro sobre azul             | 7,8:1                            |
| Oro sobre crema            | **1,5:1 — prohibido para texto** |
