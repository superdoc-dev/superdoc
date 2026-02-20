/* @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { createDOMGlobalsLifecycle } from '../helpers/dom-globals-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads a DOCX fixture file from the test data directory.
 *
 * This helper reads a binary DOCX file and returns its buffer for use in tests.
 * The fixture files are located in the ../data directory relative to this test file.
 *
 * @param {string} filename - The name of the DOCX file to load (e.g., 'blank-doc.docx')
 * @returns {Promise<Buffer>} A promise that resolves to the file buffer
 * @throws {Error} If the file cannot be read or does not exist
 *
 * @example
 * ```js
 * const buffer = await loadDocxFixture('blank-doc.docx');
 * const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
 * ```
 */
const loadDocxFixture = async (filename) => {
  return readFile(join(__dirname, '../data', filename));
};

describe('Headless HTML/Markdown in Node via injected Document', () => {
  const domLifecycle = createDOMGlobalsLifecycle();

  beforeEach(() => {
    domLifecycle.setup();
  });

  afterEach(() => {
    domLifecycle.teardown();
  });

  it('initializes from markdown and exports HTML/Markdown without DOM globals', async () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    const injectedDocument = new JSDOM('').window.document;

    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      document: injectedDocument,
      documentId: 'node-md-injection-test',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
      markdown: '# Hello\n\n**World**',
    });

    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();
    expect(editor.view).toBeUndefined();
    expect(editor.state.doc.textContent).toContain('Hello');

    const html = editor.getHTML();
    expect(html).toContain('Hello');
    expect(html).toContain('World');

    const markdown = await editor.getMarkdown();
    expect(markdown).toContain('Hello');
    expect(markdown).toContain('World');

    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    editor.destroy();
  }, 60_000);

  it('throws a clear error when markdown is provided without a DOM', async () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    expect(
      () =>
        new Editor({
          mode: 'docx',
          documentId: 'node-md-missing-dom-test',
          extensions: getStarterExtensions(),
          content,
          mediaFiles,
          fonts,
          markdown: '# Hello',
        }),
    ).toThrow(/HTML\/Markdown import requires a DOM/);
  }, 60_000);
});
