import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// NODE_PATH no aplica a ESM: se importa Playwright global por ruta absoluta.
const pw = await import(
  pathToFileURL('C:/Users/Francisco/AppData/Roaming/npm/node_modules/playwright/index.js').href
);
const { chromium } = pw.default ?? pw;

const jobs = [
  { html: 'carta-print.html', pdf: 'carta-voy-volando-imprenta.pdf', w: '226mm', h: '313mm' },
  { html: 'flyer-print.html', pdf: 'flyer-3x2-voy-volando-imprenta.pdf', w: '164mm', h: '226mm' },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const job of jobs) {
  const url = pathToFileURL(resolve(job.html)).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const loaded = await page.evaluate(() => {
    const probe = (family) => document.fonts.check(`16px "${family}"`);
    return {
      alfa: probe('Alfa Slab One'),
      cond: probe('Barlow Condensed'),
      body: probe('Barlow'),
      imgs: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    };
  });
  console.log(`${job.html} fuentes/imagenes:`, JSON.stringify(loaded));

  await page.pdf({
    path: job.pdf,
    width: job.w,
    height: job.h,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log(`  -> ${job.pdf}`);
}

await browser.close();
