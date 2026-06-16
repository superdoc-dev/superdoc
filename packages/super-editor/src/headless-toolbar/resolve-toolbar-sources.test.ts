import { describe, expect, it, vi } from 'vitest';

import { resolveToolbarSources } from './resolve-toolbar-sources.js';

describe('resolveToolbarSources', () => {
  it('uses the routed PresentationEditor active editor for headless context', () => {
    const bodyEditor = {
      options: {
        documentId: 'doc-1',
      },
    };
    const headerEditor = {
      commands: { toggleBold: () => true },
      doc: { kind: 'header-doc' },
      isEditable: true,
      state: {
        selection: {
          empty: false,
        },
      },
      options: {
        documentId: 'doc-1',
        isHeaderOrFooter: true,
        headerFooterType: 'header',
      },
    };
    const presentationEditor = {
      commands: { toggleBold: () => true },
      isEditable: true,
      state: {
        selection: {
          empty: false,
        },
      },
      getActiveEditor: () => headerEditor,
    };

    const result = resolveToolbarSources({
      activeEditor: bodyEditor as any,
      superdocStore: {
        documents: [
          {
            getEditor: () => bodyEditor as any,
            getPresentationEditor: () => presentationEditor as any,
          },
        ],
      },
    });

    expect(result.activeEditor).toBe(headerEditor);
    expect(result.context?.editor).toBe(headerEditor);
    expect(result.context?.presentationEditor).toBe(presentationEditor);
    expect(result.context?.surface).toBe('header');
    expect(result.context?.target.doc).toBe(headerEditor.doc);
  });

  it('classifies note sessions from canonical story keys and resolves PresentationEditor directly from the editor', () => {
    const noteEditor = {
      commands: { toggleBold: () => true },
      doc: { kind: 'footnote-doc' },
      isEditable: true,
      state: {
        selection: {
          empty: true,
        },
      },
      options: {
        documentId: 'fn:12',
      },
    };
    const presentationEditor = {
      commands: { toggleBold: () => true },
      isEditable: true,
      state: {
        selection: {
          empty: true,
        },
      },
      getActiveEditor: () => noteEditor,
    };
    (noteEditor as typeof noteEditor & { presentationEditor?: unknown }).presentationEditor = presentationEditor;

    const result = resolveToolbarSources({
      activeEditor: noteEditor as any,
      superdocStore: {
        documents: [],
      },
    });

    expect(result.presentationEditor).toBe(presentationEditor);
    expect(result.activeEditor).toBe(noteEditor);
    expect(result.context?.surface).toBe('note');
    expect(result.context?.target.doc).toBe(noteEditor.doc);
  });

  // SD-3213f: the resolver prefers the narrow
  // `getPresentationEditorForDocument` host method when present, falling
  // back to the legacy `superdocStore.documents[]` reach for custom host
  // stubs that pre-date the narrow method. These two tests pin the
  // dispatch logic so a future refactor cannot silently drop either
  // branch.
  it('uses the narrow getPresentationEditorForDocument host method when present', () => {
    const bodyEditor = {
      commands: { toggleBold: () => true },
      doc: { kind: 'body-doc' },
      isEditable: true,
      state: {
        selection: {
          empty: false,
        },
      },
      options: {
        documentId: 'doc-narrow',
      },
    };
    const presentationEditor = {
      commands: { toggleBold: () => true },
      isEditable: true,
      state: {
        selection: {
          empty: false,
        },
      },
      getActiveEditor: () => bodyEditor,
    };
    const getPresentationEditorForDocument = vi.fn(() => presentationEditor as any);

    const result = resolveToolbarSources({
      activeEditor: bodyEditor as any,
      getPresentationEditorForDocument,
    });

    expect(getPresentationEditorForDocument).toHaveBeenCalledWith('doc-narrow');
    expect(result.presentationEditor).toBe(presentationEditor);
    expect(result.activeEditor).toBe(bodyEditor);
  });

  it('prefers the narrow host method over the legacy superdocStore fallback when both are present', () => {
    const bodyEditor = {
      commands: { toggleBold: () => true },
      doc: { kind: 'body-doc' },
      isEditable: true,
      state: {
        selection: {
          empty: false,
        },
      },
      options: {
        documentId: 'doc-precedence',
      },
    };
    const narrowPresentationEditor = {
      commands: { toggleBold: () => true },
      isEditable: true,
      state: { selection: { empty: false } },
      getActiveEditor: () => bodyEditor,
    };
    const legacyPresentationEditor = {
      commands: { toggleBold: () => true },
      isEditable: true,
      state: { selection: { empty: false } },
      getActiveEditor: () => bodyEditor,
    };
    const getPresentationEditorForDocument = vi.fn(() => narrowPresentationEditor as any);
    const legacyGetPresentationEditor = vi.fn(() => legacyPresentationEditor as any);

    const result = resolveToolbarSources({
      activeEditor: bodyEditor as any,
      getPresentationEditorForDocument,
      superdocStore: {
        documents: [
          {
            getEditor: () => bodyEditor as any,
            getPresentationEditor: legacyGetPresentationEditor,
          },
        ],
      },
    });

    expect(getPresentationEditorForDocument).toHaveBeenCalledWith('doc-precedence');
    expect(legacyGetPresentationEditor).not.toHaveBeenCalled();
    expect(result.presentationEditor).toBe(narrowPresentationEditor);
  });

  it('accepts an explicit v2 active-editor facade without creating a v1 toolbar context', () => {
    const result = resolveToolbarSources({
      activeEditor: {
        editorVersion: 2,
        options: {
          documentId: 'doc-v2',
          documentMode: 'editing',
        },
        commands: null,
        state: null,
        view: null,
      },
    });

    expect(result).toEqual({
      activeEditor: null,
      presentationEditor: null,
      context: null,
    });
  });
});
