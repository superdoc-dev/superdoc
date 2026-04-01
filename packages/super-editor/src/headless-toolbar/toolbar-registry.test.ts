import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyKey } from 'prosemirror-history';
import { PluginKey } from 'prosemirror-state';

const getActiveFormattingMock = vi.hoisted(() => vi.fn(() => []));
const getYUndoPluginStateMock = vi.hoisted(() => vi.fn(() => undefined));
const getTrackChangesPluginStateMock = vi.hoisted(() => vi.fn(() => undefined));
const collectTrackedChangesMock = vi.hoisted(() => vi.fn(() => []));
const isTrackedChangeActionAllowedMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../editors/v1/core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: getActiveFormattingMock,
}));

vi.mock('y-prosemirror', () => ({
  yUndoPluginKey: {
    getState: getYUndoPluginStateMock,
  },
}));

vi.mock('../editors/v1/extensions/track-changes/plugins/index.js', () => ({
  TrackChangesBasePluginKey: {
    getState: getTrackChangesPluginStateMock,
  },
}));

vi.mock('../editors/v1/extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: collectTrackedChangesMock,
  isTrackedChangeActionAllowed: isTrackedChangeActionAllowedMock,
}));

vi.mock('../editors/v1/extensions/linked-styles/index.js', () => ({
  getQuickFormatList: vi.fn(() => []),
}));

import { createToolbarRegistry } from './toolbar-registry.js';
import type { ToolbarContext } from './types.js';
import { getQuickFormatList } from '../editors/v1/extensions/linked-styles/index.js';

const createContext = (): ToolbarContext => ({
  target: {
    commands: {},
  },
  surface: 'body',
  isEditable: true,
  selectionEmpty: false,
  editor: {} as any,
});

describe('createToolbarRegistry', () => {
  afterEach(() => {
    vi.clearAllMocks();
    getYUndoPluginStateMock.mockReturnValue(undefined);
    getTrackChangesPluginStateMock.mockReturnValue(undefined);
    collectTrackedChangesMock.mockReturnValue([]);
    isTrackedChangeActionAllowedMock.mockReturnValue(true);
  });

  it('derives active bold state from formatting', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'bold', attrs: {} }]);

    const registry = createToolbarRegistry();
    const state = registry.bold?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('derives active bold state from linked style when no direct bold mark is active', () => {
    getActiveFormattingMock.mockReturnValueOnce([]);

    const registry = createToolbarRegistry();
    const state = registry.bold?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            styleId: 'Heading1',
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: {
            linkedStyles: [
              {
                id: 'Heading1',
                definition: {
                  styles: {
                    bold: true,
                  },
                },
              },
            ],
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('derives active strikethrough state from formatting', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'strike', attrs: {} }]);

    const registry = createToolbarRegistry();
    const state = registry.strikethrough?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('preserves font-size value with unit', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'fontSize', attrs: { fontSize: '12pt' } }]);

    const registry = createToolbarRegistry();
    const state = registry['font-size']?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: '12pt',
    });
  });

  it('derives font-size value from linked style when no direct fontSize mark is active', () => {
    getActiveFormattingMock.mockReturnValueOnce([]);

    const registry = createToolbarRegistry();
    const state = registry['font-size']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            styleId: 'Heading1',
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: {
            linkedStyles: [
              {
                id: 'Heading1',
                definition: {
                  styles: {
                    'font-size': '14pt',
                  },
                },
              },
            ],
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: '14pt',
    });
  });

  it('preserves full font-family value including fallbacks', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'fontFamily', attrs: { fontFamily: 'Arial, sans-serif' } }]);

    const registry = createToolbarRegistry();
    const state = registry['font-family']?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 'Arial, sans-serif',
    });
  });

  it('derives font-family value from linked style when no direct fontFamily mark is active', () => {
    getActiveFormattingMock.mockReturnValueOnce([]);

    const registry = createToolbarRegistry();
    const state = registry['font-family']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            styleId: 'Heading1',
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: {
            linkedStyles: [
              {
                id: 'Heading1',
                definition: {
                  styles: {
                    'font-family': 'Arial, sans-serif',
                  },
                },
              },
            ],
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 'Arial, sans-serif',
    });
  });

  it('derives link href from active link formatting', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'link', attrs: { href: 'https://example.com' } }]);

    const registry = createToolbarRegistry();
    const state = registry.link?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 'https://example.com',
    });
  });

  it('derives text-color value from active formatting', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'color', attrs: { color: '#ff0000' } }]);

    const registry = createToolbarRegistry();
    const state = registry['text-color']?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: '#ff0000',
    });
  });

  it('derives highlight-color value from active formatting', () => {
    getActiveFormattingMock.mockReturnValueOnce([{ name: 'highlight', attrs: { color: '#ffff00' } }]);

    const registry = createToolbarRegistry();
    const state = registry['highlight-color']?.state({
      context: createContext(),
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: '#ffff00',
    });
  });

  it('derives text-align value from paragraph justification', () => {
    const registry = createToolbarRegistry();
    const state = registry['text-align']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            justification: 'both',
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: null,
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 'justify',
    });
  });

  it('derives line-height value from paragraph spacing', () => {
    const registry = createToolbarRegistry();
    const state = registry['line-height']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            spacing: {
                              line: 480,
                            },
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: null,
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 2,
    });
  });

  it('disables linked-style when there are no quick formats', () => {
    vi.mocked(getQuickFormatList).mockReturnValueOnce([]);

    const registry = createToolbarRegistry();
    const state = registry['linked-style']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn(() => null),
                before: vi.fn(() => 0),
                start: vi.fn(() => 0),
              },
            },
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
      value: null,
    });
  });

  it('derives linked-style value from paragraph styleId when quick formats exist', () => {
    vi.mocked(getQuickFormatList).mockReturnValueOnce([{ id: 'Heading1' }] as any);

    const registry = createToolbarRegistry();
    const state = registry['linked-style']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          paragraphProperties: {
                            styleId: 'Heading1',
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
          converter: null,
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
      value: 'Heading1',
    });
  });

  it('activates bullet-list when current paragraph uses bullet numbering', () => {
    const registry = createToolbarRegistry();
    const state = registry['bullet-list']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          listRendering: {
                            numberingType: 'bullet',
                          },
                          paragraphProperties: {
                            numberingProperties: {
                              numId: 1,
                            },
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('activates numbered-list when current paragraph uses non-bullet numbering', () => {
    const registry = createToolbarRegistry();
    const state = registry['numbered-list']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {
              resolve: vi.fn(() => '$resolved-pos'),
            },
            selection: {
              $from: {
                depth: 1,
                node: vi.fn((depth) =>
                  depth === 1
                    ? {
                        type: { name: 'paragraph' },
                        attrs: {
                          listRendering: {
                            numberingType: 'decimal',
                          },
                          paragraphProperties: {
                            numberingProperties: {
                              numId: 1,
                            },
                          },
                        },
                      }
                    : null,
                ),
                before: vi.fn(() => 5),
                start: vi.fn(() => 6),
              },
            },
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('disables undo when history depth is empty', () => {
    const registry = createToolbarRegistry();
    const state = registry.undo?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            plugins: [historyKey],
            field: vi.fn(() => ({ done: { eventCount: 0 }, undone: { eventCount: 0 } })),
          },
          options: {},
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('enables redo when redo history depth is available', () => {
    getYUndoPluginStateMock.mockReturnValue({
      undoManager: {
        redoStack: [1, 2],
      },
    });

    const registry = createToolbarRegistry();
    const state = registry.redo?.state({
      context: {
        ...createContext(),
        editor: {
          state: {} as any,
          options: { ydoc: {} },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: false,
    });
  });

  it('activates ruler state when rulers are enabled in superdoc config', () => {
    const registry = createToolbarRegistry();
    const state = registry.ruler?.state({
      context: createContext(),
      superdoc: {
        config: {
          rulers: true,
        },
      },
    });

    expect(state).toEqual({
      active: true,
      disabled: false,
    });
  });

  it('derives zoom value from superdoc', () => {
    const registry = createToolbarRegistry();
    const state = registry.zoom?.state({
      context: createContext(),
      superdoc: {
        getZoom: vi.fn(() => 150),
      },
    });

    expect(state).toEqual({
      active: false,
      disabled: false,
      value: 150,
    });
  });

  it('enables track-changes accept-selection when selection contains tracked changes and action is allowed', () => {
    collectTrackedChangesMock.mockReturnValueOnce([{ id: 'tc-1' }]);
    isTrackedChangeActionAllowedMock.mockReturnValueOnce(true);

    const registry = createToolbarRegistry();
    const state = registry['track-changes-accept-selection']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {},
            selection: {
              from: 1,
              to: 3,
            },
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: false,
    });
  });

  it('disables track-changes reject-selection when selection contains no tracked changes', () => {
    collectTrackedChangesMock.mockReturnValueOnce([]);

    const registry = createToolbarRegistry();
    const state = registry['track-changes-reject-selection']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {},
            selection: {
              from: 1,
              to: 1,
            },
          },
        } as any,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('enriches tracked changes with comment data before permission check', () => {
    collectTrackedChangesMock.mockReturnValueOnce([{ id: 'tc-1', attrs: {} }]);
    isTrackedChangeActionAllowedMock.mockReturnValueOnce(true);

    const registry = createToolbarRegistry();
    registry['track-changes-accept-selection']?.state({
      context: {
        ...createContext(),
        editor: {
          state: {
            doc: {},
            selection: {
              from: 1,
              to: 3,
            },
          },
        } as any,
      },
      superdoc: {
        commentsStore: {
          getComment: vi.fn(() => ({
            getValues: () => ({ id: 'tc-1', body: 'comment-body' }),
          })),
        },
      },
    });

    expect(isTrackedChangeActionAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackedChanges: [
          expect.objectContaining({
            id: 'tc-1',
            comment: { id: 'tc-1', body: 'comment-body' },
          }),
        ],
      }),
    );
  });

  it('derives document-mode value from superdoc config', () => {
    const registry = createToolbarRegistry();
    const state = registry['document-mode']?.state({
      context: createContext(),
      superdoc: {
        config: {
          documentMode: 'viewing',
        },
      },
    });

    expect(state).toEqual({
      active: false,
      disabled: false,
      value: 'viewing',
    });
  });

  it('keeps image disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry.image?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('keeps table-insert disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-insert']?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('keeps table-add-row-before disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-add-row-before']?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('keeps table-add-column-before disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-add-column-before']?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('keeps table-delete disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-delete']?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('keeps table-remove-borders disabled state tied to editability', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-remove-borders']?.state({
      context: {
        ...createContext(),
        isEditable: false,
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });
});
