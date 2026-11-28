// Vygeneruje turnusy_palubak.json stejně jako tlačítko „Stáhnout turnusy_palubak.json“ ve VVJŘ
// (spustí vvjr.html v prohlížeči bez okna). Palubák si soubor stahuje z GitHubu.
// Použití: node tools/export_palubak.mjs <adresa vvjr.html> <výstup>
import pw from 'playwright';
const { chromium } = pw;
const [url = 'http://127.0.0.1:8000/vvjr.html', out = 'turnusy_palubak.json'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('chyba stránky:', e.message));
if (process.env.ROUTE_LOCAL) {   // test: GTFS a turnusy z lokálních souborů
  const fs = await import('node:fs');
  await p.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(url.split('/vvjr.html')[0])) return r.continue();
    if (u.includes('/main/turnusy.json')) return r.fulfill({ path: process.env.ROUTE_LOCAL + '/turnusy.json', contentType: 'application/json' });
    if (u.includes('/gtfs/')) return r.fulfill({ path: process.env.ROUTE_GTFS + '/' + u.split('/gtfs/')[1].split('?')[0] });
    return r.abort();
  });
}
await p.goto(url);
let st = '';
for (let i = 0; i < 900; i++) {
  await p.waitForTimeout(1000);
  st = await p.textContent('#stav');
  if (/Chyba/i.test(st)) break;
  if (/oběh/i.test(st) && !/Čtu|Načítám|Stahuji|Zpracov/i.test(st)) break;
}
console.log('stav:', st.replace(/\s+/g, ' ').trim());
const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#palExport')]);
await d.saveAs(out);
console.log(await p.textContent('#palStav'));
await b.close();
