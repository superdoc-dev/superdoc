import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/headers/longer-header.docx');

test.use({ config: { hideSelection: false } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior search and navigate to results in document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('search-navigate-loaded');

  // Cross-paragraph search
  const query1 = 'works of the Licensed Material; (b) distribute, sell,';
  const matches1 = await superdoc.page.evaluate((q: string) => {
    return (window as any).editor?.commands?.search?.(q) ?? [];
  }, query1);

  if (matches1.length > 0) {
    await superdoc.page.evaluate((match: any) => {
      (window as any).editor.commands.goToSearchResult(match);
    }, matches1[0]);
    await superdoc.waitForStable();
    await superdoc.screenshot('search-navigate-first-result');
  }

  // Multi-paragraph search
  const query2 = 'Law This Agreement shall be governed by';
  const matches2 = await superdoc.page.evaluate((q: string) => {
    return (window as any).editor?.commands?.search?.(q) ?? [];
  }, query2);

  if (matches2.length > 0) {
    await superdoc.page.evaluate((match: any) => {
      (window as any).editor.commands.goToSearchResult(match);
    }, matches2[0]);
    await superdoc.waitForStable();
    await superdoc.screenshot('search-navigate-second-result');
  }
});
