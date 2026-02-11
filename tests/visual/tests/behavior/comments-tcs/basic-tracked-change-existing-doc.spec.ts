import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'comments-tcs/tracked-changes.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior tracked change replacement in existing document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-existing-doc-loaded');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select text via evaluate for precise positioning
  await superdoc.page.evaluate((word: string) => {
    const span = document.querySelector('.superdoc-fragment[data-block-id="1-paragraph"] span');
    if (!span) throw new Error('First paragraph span not found');
    const textNode = Array.from(span.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
    if (!textNode?.textContent) throw new Error('Text node not found');
    const startIndex = textNode.textContent.indexOf(word);
    if (startIndex === -1) throw new Error(`Word "${word}" not found`);
    const range = document.createRange();
    range.setStart(textNode, startIndex);
    range.setEnd(textNode, startIndex + word.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, 'some');

  await superdoc.waitForStable();
  await superdoc.type('programmatically inserted');
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-existing-doc-replaced');
});
