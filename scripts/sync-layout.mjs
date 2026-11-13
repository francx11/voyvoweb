/* Reescribe la cabecera y el pie de los HTML de public/ desde
 * scripts/lib/layout.mjs, para que `pnpm dev` sirva lo mismo que se publica.
 *
 * El build estático aplica el mismo layout sobre dist/ por su cuenta, así que
 * olvidarse de ejecutar esto no publica nada desfasado: solo deja la vista
 * local del servidor Node con la cabecera o el pie anteriores.
 *
 * Uso: pnpm layout:sync
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { applyLayout, LAYOUT_PAGES } from './lib/layout.mjs';

const require = createRequire(import.meta.url);
const { PUBLIC_DIR, DATA_DIR } = require('../src/config');

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf-8'));
}

export async function syncLayout(publicDir = PUBLIC_DIR) {
  const [config, ordering] = await Promise.all([
    readJson('config.json'),
    readJson('ordering.json'),
  ]);
  const site = config.site || {};
  const touched = [];
  for (const [page, route] of Object.entries(LAYOUT_PAGES)) {
    const file = path.join(publicDir, page);
    const before = await fs.readFile(file, 'utf-8');
    let after;
    try {
      after = applyLayout(before, { path: route, site, ordering });
    } catch (err) {
      throw new Error(`${page}: ${err.message}`, { cause: err });
    }
    if (after !== before) {
      await fs.writeFile(file, after);
      touched.push(page);
    }
  }
  return touched;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const touched = await syncLayout();
  console.log(
    touched.length
      ? `\nlayout → actualizado: ${touched.join(', ')}\n`
      : '\nlayout ya estaba al día\n'
  );
}
