import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const pw = await import(pathToFileURL('C:/Users/Francisco/AppData/Roaming/npm/node_modules/playwright/index.js').href);
const { chromium } = pw.default ?? pw;
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(resolve('carta-print.html')).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const rows = await p.evaluate(() => {
  const px2mm = (v) => +(v / (96 / 25.4)).toFixed(1);
  return [...document.querySelectorAll('.bleed')].map((bl, i) => {
    const body = bl.querySelector('.body');
    if (!body) return { pag: i + 1, tipo: 'portada/contra' };
    const kids = [...body.children];
    const last = kids[kids.length - 1];
    const usado = last.getBoundingClientRect().bottom - body.getBoundingClientRect().top;
    const alto = body.clientHeight;
    const cols = [...body.querySelectorAll('.cols')].map((c) =>
      [...c.querySelectorAll('.col')].map((col) => px2mm(col.getBoundingClientRect().height)).join(' / ')
    );
    return { pag: i + 1, altoBody: px2mm(alto), usado: px2mm(usado), libre: px2mm(alto - usado), cols };
  });
});
console.table(rows);
await b.close();
