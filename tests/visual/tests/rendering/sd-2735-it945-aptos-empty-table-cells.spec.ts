import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../test-data/rendering/sd-2735-it945-aptos-empty-table-cells.docx'),
  path.resolve(__dirname, '../../../../test-corpus/rendering/sd-2735-it945-aptos-empty-table-cells.docx'),
];
const DOC_PATH = DOC_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? DOC_PATH_CANDIDATES[0];

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

// SD-2735 / IT-945: Aptos paragraphs inside a TableGrid-styled table with
// empty and text-bearing cells. The TableGrid style carries
// w:line="240" w:lineRule="auto" (single spacing) over docDefaults
// w:line="278". Empty cells must match the height of text-bearing cells —
// measuring-dom has to thread Aptos's calibrated naturalSingleLine through
// calculateEmptyParagraphMetrics rather than fall back to 1.15 × fontSize.
//
// To regenerate baselines:
//   pnpm --filter @superdoc-testing/visual docs:upload <fixture path> \
//     --issue SD-2735 --description it945-aptos-empty-table-cells
test('@rendering SD-2735 IT-945 Aptos empty table cells match text-bearing cells', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshotPages('rendering/sd-2735-it945-aptos-empty-table-cells');
});
