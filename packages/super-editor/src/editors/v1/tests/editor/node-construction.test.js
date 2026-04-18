/* @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';
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

describe('Editor headless construction in Node', () => {
  const domLifecycle = createDOMGlobalsLifecycle();

  beforeEach(() => {
    domLifecycle.setup();
  });

  afterEach(() => {
    domLifecycle.teardown();
  });

  it('constructs a docx editor without DOM globals', async () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      documentId: 'node-construction-test',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();
    expect(editor.view).toBeUndefined();

    expect(editor.getJSON()?.type).toBe('doc');

    const beforeText = editor.state.doc.textContent;
    editor.dispatch(editor.state.tr.insertText('Hello'));
    expect(editor.state.doc.textContent).toContain('Hello');
    expect(editor.state.doc.textContent).not.toBe(beforeText);

    const exportedXml = await editor.exportDocx({ exportXmlOnly: true });
    expect(typeof exportedXml).toBe('string');

    const exported = await editor.exportDocx();
    expect(Buffer.isBuffer(exported)).toBe(true);
    expect(exported.length).toBeGreaterThan(0);

    const [exportedContent] = await Editor.loadXmlData(exported, true);
    expect(Array.isArray(exportedContent)).toBe(true);
    expect(exportedContent.some((file) => file.name === 'word/document.xml')).toBe(true);

    editor.destroy();
  }, 60_000);

  it('supports suggesting mode in headless editors', async () => {
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      documentId: 'headless-suggesting-test',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    const initialState = TrackChangesBasePluginKey.getState(editor.state);
    expect(initialState?.isTrackChangesActive).toBe(false);

    editor.setDocumentMode('suggesting');
    const suggestingState = TrackChangesBasePluginKey.getState(editor.state);
    expect(suggestingState?.isTrackChangesActive).toBe(true);
    expect(editor.options.documentMode).toBe('suggesting');

    editor.setDocumentMode('editing');
    const editingState = TrackChangesBasePluginKey.getState(editor.state);
    expect(editingState?.isTrackChangesActive).toBe(false);
    expect(editor.options.documentMode).toBe('editing');

    editor.destroy();
  });
});
