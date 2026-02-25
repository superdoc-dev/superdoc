import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listItems } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/lists/sd-1658-lists-same-level.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('same-level list indicators remain preserved instead of auto-sequencing (SD-1658)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const result = await listItems(superdoc.page);
  expect(result.total).toBeGreaterThan(0);

  const orderedItems = result.items.filter(
    (item) => item.kind === 'ordered' && typeof item.marker === 'string' && item.level !== undefined,
  );
  expect(orderedItems.length).toBeGreaterThan(0);

  // Count markers per level — duplicates prove indicators are preserved, not auto-sequenced.
  const markerCounts = new Map<string, number>();
  for (const item of orderedItems) {
    const key = `${item.level}::${item.marker}`;
    markerCounts.set(key, (markerCounts.get(key) ?? 0) + 1);
  }

  const duplicateSameLevelMarkers = [...markerCounts.entries()].filter(([, count]) => count >= 2).map(([key]) => key);

  expect(duplicateSameLevelMarkers.length).toBeGreaterThan(0);
});
