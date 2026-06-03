import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../test-data/rendering/sd-1949-ghost-list-rendering.docx'),
  path.resolve(__dirname, '../../../../test-corpus/rendering/sd-1949-ghost-list-rendering.docx'),
];
const DOC_PATH = DOC_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? DOC_PATH_CANDIDATES[0];

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@rendering SD-1949 ghost list rendering imports without visual regressions', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshotPages('rendering/sd-1949-ghost-list-rendering');
});
