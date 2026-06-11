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
      this.setOptions = vi.fn();
      this.commands = {
        enableTrackChanges: vi.fn(),
        disableTrackChanges: vi.fn(),
        enableTrackChangesShowOriginal: vi.fn(),
        disableTrackChangesShowOriginal: vi.fn(),
      };
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

import {
  createHeaderFooterEditor,
  onHeaderFooterDataUpdate,
  toggleHeaderFooterEditMode,
} from './pagination-helpers.js';
import { exportSubEditorToPart } from '@core/parts/adapters/header-footer-sync.js';

function createParentEditor() {
  return {
    constructor: MockEditor,
    options: {
      role: 'editor',
      user: {
        name: 'SuperDoc Test',
        email: 'test@superdoc.com',
      },
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
        user: {
          name: 'SuperDoc Test',
          email: 'test@superdoc.com',
        },
      }),
    );
  });

  it('applies suggesting mode to header/footer editors when edit mode is enabled', () => {
    const headerEditor = new MockEditor({});
    const footerEditor = new MockEditor({});
    const mainPm = document.createElement('div');
    const focusedSectionEditor = {
      view: {
        focus: vi.fn(),
      },
    };

    toggleHeaderFooterEditMode({
      editor: {
        converter: {
          headerEditors: [{ editor: headerEditor }],
          footerEditors: [{ editor: footerEditor }],
        },
        view: {
          dom: mainPm,
        },
      },
      focusedSectionEditor,
      isEditMode: true,
      documentMode: 'suggesting',
    });

    expect(headerEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(headerEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(headerEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(headerEditor.setEditable).toHaveBeenCalledWith(true, false);
    expect(headerEditor.view.dom.getAttribute('documentmode')).toBe('suggesting');

    expect(footerEditor.commands.disableTrackChangesShowOriginal).toHaveBeenCalledTimes(1);
    expect(footerEditor.commands.enableTrackChanges).toHaveBeenCalledTimes(1);
    expect(footerEditor.setOptions).toHaveBeenCalledWith({ documentMode: 'suggesting' });
    expect(footerEditor.setEditable).toHaveBeenCalledWith(true, false);
    expect(footerEditor.view.dom.getAttribute('documentmode')).toBe('suggesting');
    expect(focusedSectionEditor.view.focus).toHaveBeenCalledTimes(1);
  });
});

describe('onHeaderFooterDataUpdate', () => {
  beforeEach(() => {
    exportSubEditorToPart.mockClear();
  });

  it('skips export when the sub-editor document did not change', () => {
    const mainEditor = {
      converter: {
        headers: { rId1: {} },
        headerEditors: [],
      },
      setOptions: vi.fn(),
    };
    const subEditor = {
      docChanged: false,
      getUpdatedJson: vi.fn(),
    };

    onHeaderFooterDataUpdate({ editor: subEditor, transaction: { docChanged: false } }, mainEditor, 'rId1', 'header');

    expect(exportSubEditorToPart).not.toHaveBeenCalled();
    expect(subEditor.getUpdatedJson).not.toHaveBeenCalled();
  });
});
