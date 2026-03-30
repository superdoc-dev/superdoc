/* @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Check if dist bundle exists (only available after build)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = resolve(__dirname, '../../../dist/super-editor.es.js');
const DIST_EXISTS = existsSync(distPath);

/**
 * This test verifies that the super-editor can be imported in a Node.js environment
 * WITHOUT requiring browser globals to be set up BEFORE the import.
 *
 * The fix: markdown libraries (unified/rehype/remark) are lazy-loaded in getMarkdown()
 * instead of being imported at the top level, which prevents them from accessing
 * `document.createElement()` at import time.
 */
describe('Node.js import timing - document access', () => {
  const ORIGINAL_GLOBALS = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
  };

  beforeEach(() => {
    // Ensure we start with a clean Node.js environment (no browser globals)
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
    // localStorage may exist in Node.js but without getItem method, so delete it to use polyfill
    delete globalThis.localStorage;
  });

  afterEach(() => {
    // Restore original globals
    if (ORIGINAL_GLOBALS.window === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = ORIGINAL_GLOBALS.window;
    }

    if (ORIGINAL_GLOBALS.document === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = ORIGINAL_GLOBALS.document;
    }

    if (ORIGINAL_GLOBALS.navigator === undefined) {
      delete globalThis.navigator;
    } else {
      globalThis.navigator = ORIGINAL_GLOBALS.navigator;
    }

    if (ORIGINAL_GLOBALS.localStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = ORIGINAL_GLOBALS.localStorage;
    }
  });

  it('should allow importing Editor in Node.js without document global', async () => {
    // Verify we're starting with no browser globals
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    // This should NOT throw "document is not defined"
    let importError = null;
    let EditorModule = null;

    try {
      // Dynamic import to ensure we're testing the import after globals are cleared
      EditorModule = await import('@core/Editor.js');
    } catch (error) {
      importError = error;
    }

    // This should pass because markdown libraries are lazy-loaded
    expect(importError).toBeNull();
    expect(EditorModule).toBeDefined();
    expect(EditorModule.Editor).toBeDefined();
  });

  it('should allow importing getStarterExtensions in Node.js without document global', async () => {
    // Verify we're starting with no browser globals
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    let importError = null;
    let extensionsModule = null;

    try {
      // This is how users typically import the library
      extensionsModule = await import('@extensions/index.js');
    } catch (error) {
      importError = error;
    }

    // This should pass - extensions shouldn't need document at import time
    expect(importError).toBeNull();
    expect(extensionsModule).toBeDefined();
    expect(extensionsModule.getStarterExtensions).toBeDefined();
  });

  it.skipIf(!DIST_EXISTS)(
    'should allow importing the built dist bundle in Node.js without document global',
    async () => {
      // Verify we're starting with no browser globals
      expect(globalThis.document).toBeUndefined();
      expect(globalThis.window).toBeUndefined();

      const distUrl = pathToFileURL(distPath).href;

      let importError = null;
      let bundle = null;

      try {
        // This simulates what end users do: import from the built package
        // WITHOUT setting up JSDOM first
        bundle = await import(distUrl);
      } catch (error) {
        importError = error;
      }

      // This should pass because markdown libraries are lazy-loaded
      expect(importError).toBeNull();
      expect(bundle).toBeDefined();
      expect(bundle.Editor).toBeDefined();
      expect(bundle.getStarterExtensions).toBeDefined();
    },
  );

  it.skipIf(!DIST_EXISTS)('should allow calling getMarkdown() in Node.js with JSDOM setup', async () => {
    const { JSDOM } = await import('jsdom');
    const { readFile } = await import('node:fs/promises');

    // Verify no browser globals initially
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    // Import the dist bundle (can now be done without setting up globals first
    // because markdown libraries are lazy-loaded)
    const distUrl = pathToFileURL(distPath).href;
    const bundle = await import(distUrl);

    // Now set up JSDOM (as users would do)
    const { window: mockWindow } = new JSDOM('<!doctype html><html><body></body></html>');
    const mockDocument = mockWindow.document;

    // Load a test document
    const buffer = await readFile(resolve(__dirname, '../data/blank-doc.docx'));
    const [content, , mediaFiles, fonts] = await bundle.Editor.loadXmlData(buffer, true);

    // Create editor with mockDocument
    const editor = new bundle.Editor({
      isHeadless: true,
      mockDocument,
      mockWindow,
      mode: 'docx',
      documentId: 'markdown-test',
      extensions: bundle.getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
    });

    // Verify global.document was set by Editor
    expect(globalThis.document).toBe(mockDocument);

    // Now call getMarkdown() - this should work because:
    // 1. The markdown libraries are lazy-loaded (not at import time)
    // 2. global.document is now set to the JSDOM document
    let markdown;
    let markdownError = null;

    try {
      markdown = await editor.getMarkdown();
    } catch (error) {
      markdownError = error;
    }

    // This verifies that the dynamically loaded markdown libraries can use the JSDOM document
    expect(markdownError).toBeNull();
    expect(markdown).toBeDefined();
    expect(typeof markdown).toBe('string');

    editor.destroy();
  });
});
