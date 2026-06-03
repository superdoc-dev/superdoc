import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../test-data/rendering/sd-2527-list-styles.docx'),
  path.resolve(__dirname, '../../../../test-corpus/rendering/sd-2527-list-styles.docx'),
];
const DOC_PATH = DOC_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? DOC_PATH_CANDIDATES[0];

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

// SD-2527: PR #2873 introduces 3 bullet styles (disc, circle, square) and 8 ordered styles
// (decimal, decimal-paren, upper-roman, lower-roman, upper-alpha, upper-alpha-paren,
// lower-alpha, lower-alpha-paren).
// This fixture should contain one section per style, 3 items each, so visual baselines can
// catch regressions in marker rendering for any of the 11 styles.
//
// To generate baselines:
//   pnpm --filter @superdoc-testing/visual docs:upload <fixture path> \
//     --issue SD-2527 --description list-styles
test('@rendering SD-2527 list styles render the right markers', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshotPages('rendering/sd-2527-list-styles');
});
