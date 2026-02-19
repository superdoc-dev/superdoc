import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMENTS_TCS_DIR = path.resolve(__dirname, '../../test-data/comments-tcs');

type RegressionExpectation = {
  file: string;
  comments: number;
  trackChanges: number;
  highlights: number;
  trackTypes: { insert: number; delete: number; format: number };
  highlightTexts: string[];
};

const expectationsPath = path.join(COMMENTS_TCS_DIR, 'expectations.json');
const EXPECTATIONS: RegressionExpectation[] = fs.existsSync(expectationsPath)
  ? JSON.parse(fs.readFileSync(expectationsPath, 'utf-8'))
  : [];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function listHighlightTexts(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.superdoc-comment-highlight'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
}

test.skip(!fs.existsSync(COMMENTS_TCS_DIR), 'Test documents not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

for (const expectation of EXPECTATIONS) {
  test(`comments+tcs regression: ${expectation.file}`, async ({ superdoc }) => {
    const filePath = path.join(COMMENTS_TCS_DIR, expectation.file);
    if (!fs.existsSync(filePath)) {
      test.skip(true, `Missing fixture: ${expectation.file}`);
      return;
    }

    await superdoc.loadDocument(filePath);
    await superdoc.waitForStable();
    await assertDocumentApiReady(superdoc.page);

    await expect
      .poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total)
      .toBe(expectation.comments);

    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(expectation.trackChanges);

    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
      .toBe(expectation.trackTypes.insert);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { type: 'delete' })).total)
      .toBe(expectation.trackTypes.delete);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { type: 'format' })).total)
      .toBe(expectation.trackTypes.format);

    await expect.poll(async () => (await listHighlightTexts(superdoc.page)).length).toBe(expectation.highlights);

    const expectedHighlightTexts = expectation.highlightTexts.map(normalizeText).sort();
    await expect
      .poll(async () => (await listHighlightTexts(superdoc.page)).map(normalizeText).sort())
      .toEqual(expectedHighlightTexts);
  });
}
