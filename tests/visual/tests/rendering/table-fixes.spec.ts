import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../test-data/rendering');

const SD_1859_PATH = path.join(DOCS_DIR, 'SD-1859-mixed-orientation.docx');
const SD_1895_PATH = path.join(DOCS_DIR, 'SD-1895-autofit-issue.docx');
const SD_1797_PATH = path.join(DOCS_DIR, 'table-autofit-colspan.docx');
const SD_1494_PATH = path.join(DOCS_DIR, 'sd-1494-table-left-indent.docx');

async function runRenderingDocTest(superdoc: SuperDocFixture, docPath: string, screenshotPath: string): Promise<void> {
  test.skip(!fs.existsSync(docPath), 'Test document not available');
  await superdoc.loadDocument(docPath);
  await superdoc.screenshotPages(screenshotPath);
}

// SD-1859: Percent-width table in mixed portrait/landscape document
// Table measured at landscape width but rendered in portrait — cells should not overflow
test('@rendering SD-1859 percent-width table fits within portrait page bounds', async ({ superdoc }) => {
  await runRenderingDocTest(superdoc, SD_1859_PATH, 'rendering/sd-1859-mixed-orientation');
});

// SD-1895: Auto-layout table from DOCX should fill page width
// Grid columns should scale up proportionally to fill available content area
test('@rendering SD-1895 autofit table fills page width', async ({ superdoc }) => {
  await runRenderingDocTest(superdoc, SD_1895_PATH, 'rendering/sd-1895-autofit-table');
});

// SD-1797: Autofit table with colspan should not drop columns
// Rows with rowspan continuations have fewer physical cells — all grid columns must be preserved
test('@rendering SD-1797 autofit table with colspan preserves all columns', async ({ superdoc }) => {
  await runRenderingDocTest(superdoc, SD_1797_PATH, 'rendering/sd-1797-autofit-colspan');
});

// SD-1494: table with tblInd should preserve grid width and only apply left offset once
test('@rendering SD-1494 table left indent preserves width', async ({ superdoc }) => {
  await runRenderingDocTest(superdoc, SD_1494_PATH, 'rendering/sd-1494-table-left-indent');
});
