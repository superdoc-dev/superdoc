import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getStarterExtensions } from '@extensions/index.js';
import { loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

import { Editor } from './Editor.js';

let blankDocData: { docx: unknown; mediaFiles: unknown; fonts: unknown };
const editors: Editor[] = [];

beforeAll(async () => {
  blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
});

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

function createTestEditor(options: Partial<ConstructorParameters<typeof Editor>[0]> = {}): Editor {
  const editor = new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
  editors.push(editor);
  return editor;
}

function getBlankDocOptions() {
  return {
    mode: 'docx' as const,
    content: blankDocData.docx,
    mediaFiles: blankDocData.mediaFiles,
    fonts: blankDocData.fonts,
  };
}

describe('Editor selection-handle surface inference', () => {
  it('defaults direct header editor captures to the header surface', async () => {
    const editor = createTestEditor({
      isHeaderOrFooter: true,
      headerFooterType: 'header',
    });
    await editor.open(undefined, getBlankDocOptions());

    expect(editor.captureCurrentSelectionHandle().surface).toBe('header');
  });

  it('defaults direct footer editor captures to the footer surface', async () => {
    const editor = createTestEditor({
      isHeaderOrFooter: true,
      headerFooterType: 'footer',
    });
    await editor.open(undefined, getBlankDocOptions());

    expect(editor.captureEffectiveSelectionHandle().surface).toBe('footer');
  });
});
