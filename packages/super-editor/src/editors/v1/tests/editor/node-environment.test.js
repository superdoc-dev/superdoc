/* @vitest-environment node */

import { describe, it, expect, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ORIGINAL_GLOBALS = {
  window: globalThis.window,
  document: globalThis.document,
  navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
};

const resolveFixture = (filename) => join(__dirname, '../data', filename);

const loadDocxFixture = async (filename) => {
  const target = resolveFixture(filename);
  return readFile(target);
};

const createMockDom = () => {
  const { window: mockWindow } = new JSDOM('<!doctype html><html><body></body></html>');
  return { mockWindow, mockDocument: mockWindow.document };
};

describe('Editor node compatibility', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;

    if (ORIGINAL_GLOBALS.window === undefined) delete globalThis.window;
    else globalThis.window = ORIGINAL_GLOBALS.window;

    if (ORIGINAL_GLOBALS.document === undefined) delete globalThis.document;
    else globalThis.document = ORIGINAL_GLOBALS.document;

    if (ORIGINAL_GLOBALS.navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', ORIGINAL_GLOBALS.navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });

  it('instantiates a headless editor with mocked DOM objects in Node', async () => {
    expect(globalThis.window).toBe(ORIGINAL_GLOBALS.window);
    expect(globalThis.document).toBe(ORIGINAL_GLOBALS.document);

    const { mockWindow, mockDocument } = createMockDom();
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const element = { mount: mockDocument.createElement('div') };

    editor = new Editor({
      element,
      isHeadless: true,
      mockDocument,
      mockWindow,
      mode: 'docx',
      documentId: 'node-env-test',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    expect(globalThis.window).toBe(mockWindow);
    expect(globalThis.document).toBe(mockDocument);
    expect(editor).toBeInstanceOf(Editor);

    await new Promise((resolve) => mockWindow.setTimeout(resolve, 0));

    const jsonState = editor.getJSON();
    expect(jsonState?.type).toBe('doc');

    const exported = await editor.exportDocx();
    expect(Buffer.isBuffer(exported)).toBe(true);
    expect(exported.length).toBeGreaterThan(0);

    const [exportedContent] = await Editor.loadXmlData(exported, true);
    expect(Array.isArray(exportedContent)).toBe(true);
    expect(exportedContent.some((file) => file.name === 'word/document.xml')).toBe(true);
  });
});
