/* Propaga el color del tema a los sitios donde el CSS no llega.
 *
 * <meta name="theme-color"> tiene que estar en el HTML: lo lee el navegador
 * para la primera pintura y para la miniatura del conmutador de apps, antes de
 * que exista ninguna hoja de estilo. Automatizar la reescritura desde el panel
 * generaría un commit por cada guardado, así que en su lugar es un comando
 * explícito y el build comprueba que se ha ejecutado (assertThemeColor).
 *
 * Uso: pnpm theme:sync
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PUBLIC_DIR } = require('../src/config');
const { themeColor } = require('../src/services/theme-store');

// Página → ruta relativa a public/. El manifest va aparte: es JSON.
export const HTML_PAGES = [
  'index.html',
  'pedido.html',
  'aviso-legal/index.html',
  'privacidad/index.html',
];
export const MANIFEST = 'site.webmanifest';

// Un solo <meta> no puede cubrir los dos temas, así que se emite el par con
// `media`. Es lo que hoy faltaba: el valor estaba fijo al color claro y la
// barra del navegador quedaba en crema sobre una página oscura.
export const metaTags = ({ light, dark }) =>
  `<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">\n` +
  `  <meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">`;

const META_RE = /[ \t]*<meta name="theme-color"[^>]*>\n?/g;

export async function syncTheme(publicDir = PUBLIC_DIR) {
  const colors = themeColor();
  const touched = [];

  for (const page of HTML_PAGES) {
    const file = path.join(publicDir, page);
    const before = await fs.readFile(file, 'utf-8');
    const first = before.match(META_RE);
    if (!first) throw new Error(`${page}: no tiene <meta name="theme-color">`);

    // Sustituye el bloque entero (uno o dos metas) por el par actual.
    let done = false;
    const after = before.replace(META_RE, (m) => {
      if (done) return '';
      done = true;
      const indent = m.match(/^[ \t]*/)[0];
      return `${indent}${metaTags(colors)}\n`;
    });
    if (after !== before) {
      await fs.writeFile(file, after);
      touched.push(page);
    }
  }

  const manifestPath = path.join(publicDir, MANIFEST);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  if (manifest.theme_color !== colors.light || manifest.background_color !== colors.light) {
    manifest.theme_color = colors.light;
    manifest.background_color = colors.light;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    touched.push(MANIFEST);
  }

  return { colors, touched };
}

// Sólo actúa como script; importado desde el build sirve de biblioteca.
// pathToFileURL y no una plantilla file://: en Windows la ruta lleva unidad
// («C:\…») y la comparación ingenua nunca casa, así que el script no haría nada.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { colors, touched } = await syncTheme();
  console.log(`\ntheme-color → claro ${colors.light} · oscuro ${colors.dark}`);
  console.log(touched.length ? `  actualizado: ${touched.join(', ')}\n` : '  ya estaba al día\n');
}
