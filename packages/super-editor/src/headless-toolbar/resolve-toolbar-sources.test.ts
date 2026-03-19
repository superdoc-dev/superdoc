import { describe, expect, it } from 'vitest';

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
      getEffectiveSelectionContext: () => ({ surface: 'header' }),
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
});
