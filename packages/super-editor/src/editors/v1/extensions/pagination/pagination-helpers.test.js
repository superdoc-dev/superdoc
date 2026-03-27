import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockEditor, getStarterExtensions, applyStyleIsolationClass } = vi.hoisted(() => {
  class MockEditor {
    constructor(options) {
      this.options = options;
      this.on = vi.fn();
      this.off = vi.fn();
      this.once = vi.fn();
      this.emit = vi.fn();
      this.setEditable = vi.fn();
      this.view = { dom: document.createElement('div') };
      this.storage = { image: { media: {} } };
    }
  }

  return {
    MockEditor: vi.fn((options) => new MockEditor(options)),
    getStarterExtensions: vi.fn(() => []),
    applyStyleIsolationClass: vi.fn(),
  };
});

vi.mock('@core/Editor.js', () => ({
  Editor: MockEditor,
}));

vi.mock('@extensions/index.js', () => ({
  getStarterExtensions,
}));

vi.mock('@utils/styleIsolation.js', () => ({
  applyStyleIsolationClass,
}));

vi.mock('@extensions/collaboration/part-sync/index.js', () => ({
  isApplyingRemotePartChanges: vi.fn(() => false),
}));

vi.mock('@core/parts/adapters/header-footer-sync.js', () => ({
  exportSubEditorToPart: vi.fn(),
}));

import { createHeaderFooterEditor } from './pagination-helpers.js';

function createParentEditor() {
  return {
    constructor: MockEditor,
    options: {
      role: 'editor',
      fonts: {},
      isHeadless: true,
    },
    storage: {
      image: {
        media: {},
      },
    },
    converter: {
      getDocumentDefaultStyles() {
        return {
          fontSizePt: 12,
          typeface: 'Arial',
          fontFamilyCss: 'Arial',
        };
      },
    },
  };
}

describe('createHeaderFooterEditor', () => {
  beforeEach(() => {
    MockEditor.mockClear();
    getStarterExtensions.mockClear();
    applyStyleIsolationClass.mockClear();
  });

  it('passes headerFooterType through to child editors so capture defaults use the right surface', () => {
    const editorHost = document.createElement('div');
    const editorContainer = document.createElement('div');

    createHeaderFooterEditor({
      editor: createParentEditor(),
      data: { type: 'doc', content: [{ type: 'paragraph' }] },
      editorContainer,
      editorHost,
      headerFooterRefId: 'rId-footer-default',
      type: 'footer',
    });

    expect(MockEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        isHeaderOrFooter: true,
        headerFooterType: 'footer',
      }),
    );
  });
});
