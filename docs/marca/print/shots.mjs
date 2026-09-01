import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const pw = await import(pathToFileURL('C:/Users/Francisco/AppData/Roaming/npm/node_modules/playwright/index.js').href);
const { chromium } = pw.default ?? pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
for (const [file, tag] of [['carta-print.html','carta'],['flyer-print.html','flyer']]) {
  await p.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const sheets = await p.$$('.sheet');
  for (let i = 0; i < sheets.length; i++) {
    await sheets[i].screenshot({ path: `shot-${tag}-${i+1}.png` });
  }
  // desbordes reales dentro del area de arte
  const over = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.bleed').forEach((el, i) => {
      if (el.scrollHeight > el.clientHeight + 1) out.push(`pag ${i+1}: desborde ${el.scrollHeight - el.clientHeight}px`);
      el.querySelectorAll('.body').forEach((bd) => {
        if (bd.scrollHeight > bd.clientHeight + 1) out.push(`pag ${i+1} body: desborde ${bd.scrollHeight - bd.clientHeight}px`);
      });
    });
    return out;
  });
  console.log(tag, over.length ? over : 'sin desbordes');
}
await b.close();
