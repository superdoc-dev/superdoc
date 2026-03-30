/* @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { createDOMGlobalsLifecycle } from '../helpers/dom-globals-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadDocxFixture = async (filename) => {
  return readFile(join(__dirname, '../data', filename));
};

describe('Editor.currentTotalPages', () => {
  const domLifecycle = createDOMGlobalsLifecycle();

  beforeEach(() => {
    domLifecycle.setup();
  });

  afterEach(() => {
    domLifecycle.teardown();
  });

  it('returns undefined when presentationEditor is null', async () => {
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      documentId: 'test-no-pagination',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    expect(editor.presentationEditor).toBeNull();
    expect(editor.currentTotalPages).toBeUndefined();

    editor.destroy();
  });

  it('returns undefined when presentationEditor has no pages yet', async () => {
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      documentId: 'test-empty-pages',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    // Simulate a presentationEditor with empty pages (before first layout)
    editor.presentationEditor = /** @type {any} */ ({
      getPages: vi.fn(() => []),
    });

    expect(editor.currentTotalPages).toBeUndefined();

    editor.presentationEditor = null;
    editor.destroy();
  });

  it('returns the page count when presentationEditor has pages', async () => {
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const editor = new Editor({
      mode: 'docx',
      documentId: 'test-with-pages',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    // Simulate a presentationEditor after layout completes
    editor.presentationEditor = /** @type {any} */ ({
      getPages: vi.fn(() => [
        { number: 1, size: { w: 612, h: 792 } },
        { number: 2, size: { w: 612, h: 792 } },
        { number: 3, size: { w: 612, h: 792 } },
      ]),
    });

    expect(editor.currentTotalPages).toBe(3);

    editor.presentationEditor = null;
    editor.destroy();
  });
});
