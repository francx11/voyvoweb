/* CSP y Referrer-Policy como <meta> para el build estático.
 *
 * GitHub Pages no permite cabeceras propias, así que la política viaja dentro
 * de cada HTML publicado. Va justo después de <meta charset>: el navegador
 * solo aplica una CSP de <meta> a lo que aparece DESPUÉS de ella en el
 * documento, y cualquier <link> o <script> anterior quedaría fuera.
 *
 * Los <script> inline (window.VV_STATIC, la redirección de las URLs viejas)
 * se autorizan por su hash SHA-256, calculado sobre el texto exacto que queda
 * en el fichero. Por eso esto corre al final del build, después de cualquier
 * reescritura del HTML: un cambio posterior de un solo byte invalidaría el
 * hash y el script dejaría de ejecutarse. Los bloques JSON-LD no son código
 * ejecutable y la CSP no les aplica.
 */
import { createHash } from 'node:crypto';

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const CHARSET = /<meta charset="UTF-8">\n/i;

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const [, attrs, body] of html.matchAll(INLINE_SCRIPT)) {
    if (/type="application\/ld\+json"/i.test(attrs)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...new Set(hashes)];
}

export function cspFor(html, directives) {
  const hashes = inlineScriptHashes(html);
  return Object.entries(directives)
    .map(([name, values]) => {
      const all = name === 'script-src' ? [...values, ...hashes] : values;
      return all.length ? `${name} ${all.join(' ')}` : name;
    })
    .join('; ');
}

export function applySecurityMeta(html, { csp, referrer }) {
  if (!CHARSET.test(html)) throw new Error('sin <meta charset="UTF-8">');
  if (html.includes('http-equiv="Content-Security-Policy"')) return html;
  const tags =
    `  <meta http-equiv="Content-Security-Policy" content="${cspFor(html, csp)}">\n` +
    `  <meta name="referrer" content="${referrer}">\n`;
  return html.replace(CHARSET, (m) => m + tags);
}
