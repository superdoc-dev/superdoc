// NOTE: local validation only — run `npm i -D playwright && npx playwright install chromium` first.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.env.OUT || 'out';
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:4173/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

console.log('navigating…');
await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
console.log('waiting for pages…');
await page.waitForSelector('.superdoc-page', { timeout: 90000 });
await page.waitForTimeout(3000); // normal viewport now; exporter scrolls to paint

const stats = await page.evaluate(() => ({
  pages: document.querySelectorAll('.superdoc-page').length,
  runs: document.querySelectorAll('.superdoc-text-run').length,
  links: document.querySelectorAll('a.superdoc-link[href]').length,
  imgs: document.querySelectorAll('.superdoc-page img').length,
}));
console.log('STATS', JSON.stringify(stats));
await page.screenshot({ path: `${OUT}/render-full.png`, fullPage: true });

console.log('triggering export…');
const [ download ] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.evaluate(() => window.superdoc.export({ exportType: ['pdf'], triggerDownload: true, exportedName: 'calibre-demo' })),
]);
await download.saveAs(`${OUT}/output.pdf`);
console.log('WROTE', `${OUT}/output.pdf`, fs.statSync(`${OUT}/output.pdf`).size, 'bytes');

await browser.close();
console.log('DONE');
