import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyKey } from 'prosemirror-history';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

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

const sdtSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
    structuredContent: {
      group: 'inline',
      inline: true,
      content: 'inline*',
      attrs: {
        id: { default: null },
        lockMode: { default: 'unlocked' },
      },
      toDOM: () => ['span', 0],
      parseDOM: [{ tag: 'span' }],
    },
    structuredContentBlock: {
      group: 'block',
      content: 'block+',
      attrs: {
        id: { default: null },
        lockMode: { default: 'unlocked' },
      },
      toDOM: () => ['div', 0],
      parseDOM: [{ tag: 'div' }],
    },
  },
});

const makeToolbarContextWithSelection = (state: EditorState): ToolbarContext => ({
  ...createContext(),
  editor: {
    state,
    options: {
      documentMode: 'editing',
    },
  } as any,
});

const findNodeById = (doc: any, id: string) => {
  let result: { node: any; pos: number } | null = null;
  doc.descendants((node: any, pos: number) => {
    if (result) return false;
    if (String(node.attrs?.id) === id) {
      result = { node, pos };
      return false;
    }
    return true;
  });
  if (!result) throw new Error(`Missing test node "${id}"`);
  return result;
};

const findTextPos = (doc: any, text: string) => {
  let result: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (result != null) return false;
    if (node.isText && node.text?.includes(text)) {
      result = pos + node.text.indexOf(text);
      return false;
    }
    return true;
  });
  if (result == null) throw new Error(`Missing test text "${text}"`);
  return result;
};

const makeInlineSdtState = (lockMode: string, selectionKind: 'inside' | 'node' | 'span' = 'inside') => {
  const doc = sdtSchema.node('doc', null, [
    sdtSchema.node('paragraph', null, [
      sdtSchema.text('A '),
      sdtSchema.node('structuredContent', { id: 'inline-sdt', lockMode }, [sdtSchema.text('Field')]),
      sdtSchema.text(' Z'),
    ]),
  ]);

  const baseState = EditorState.create({ schema: sdtSchema, doc });
  const inlineSdt = findNodeById(doc, 'inline-sdt');

  if (selectionKind === 'node') {
    return baseState.apply(baseState.tr.setSelection(NodeSelection.create(doc, inlineSdt.pos)));
  }

  if (selectionKind === 'span') {
    return baseState.apply(
      baseState.tr.setSelection(TextSelection.create(doc, findTextPos(doc, 'A'), findTextPos(doc, 'Z') + 1)),
    );
  }

  return baseState.apply(baseState.tr.setSelection(TextSelection.create(doc, findTextPos(doc, 'Field') + 1)));
};

const makeBlockSdtState = (lockMode: string) => {
  const doc = sdtSchema.node('doc', null, [
    sdtSchema.node('paragraph', null, [sdtSchema.text('Before')]),
    sdtSchema.node('structuredContentBlock', { id: 'block-sdt', lockMode }, [
      sdtSchema.node('paragraph', null, [sdtSchema.text('Block field')]),
    ]),
    sdtSchema.node('paragraph', null, [sdtSchema.text('After')]),
  ]);

  const baseState = EditorState.create({ schema: sdtSchema, doc });
  return baseState.apply(baseState.tr.setSelection(TextSelection.create(doc, findTextPos(doc, 'Block field') + 1)));
};

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

  it('derives mirrored text-align for RTL paragraph with explicit right justification', () => {
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
                            rightToLeft: true,
                            justification: 'right',
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
      value: 'left',
    });
  });

  it('derives mirrored text-align for RTL paragraph with explicit left justification', () => {
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
                            rightToLeft: true,
                            justification: 'left',
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
      value: 'right',
    });
  });

  it('defaults text-align to right for RTL paragraph when justification is missing', () => {
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
                            rightToLeft: true,
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
      value: 'right',
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
      value: null,
    });
  });

  it.each([
    ['•', '•'],
    ['◦', '◦'],
    ['▪', '▪'],
  ])('exposes raw markerText %s as bullet-list value when paragraph is active', (markerText, expected) => {
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
                            markerText,
                          },
                          paragraphProperties: {
                            numberingProperties: { numId: 1 },
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
      value: expected,
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
                            markerText: '1.',
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
      value: 'decimal',
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

  it('activates formatting marks state when formatting marks are enabled in superdoc config', () => {
    const registry = createToolbarRegistry();
    const state = registry['formatting-marks']?.state({
      context: null,
      superdoc: {
        config: {
          layoutEngineOptions: {
            showFormattingMarks: true,
          },
        },
        toggleFormattingMarks: vi.fn(),
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

  // SD-3213f: the tracked-change enricher prefers the narrow
  // `superdoc.getComment(id)` method when present, falling back to
  // `commentsStore.getComment(id)` for custom host stubs that pre-date
  // the narrow method. Pin precedence so a future refactor cannot flip
  // it silently. (The legacy branch above already covers the
  // commentsStore path in isolation.)
  it('prefers superdoc.getComment over commentsStore.getComment when both are present', () => {
    collectTrackedChangesMock.mockReturnValueOnce([{ id: 'tc-narrow', attrs: {} }]);
    isTrackedChangeActionAllowedMock.mockReturnValueOnce(true);

    const narrowGetComment = vi.fn(() => ({ id: 'tc-narrow', body: 'narrow-body' }));
    const legacyGetComment = vi.fn(() => ({
      getValues: () => ({ id: 'tc-narrow', body: 'legacy-body' }),
    }));

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
        getComment: narrowGetComment,
        commentsStore: {
          getComment: legacyGetComment,
        },
      },
    });

    expect(narrowGetComment).toHaveBeenCalledWith('tc-narrow');
    expect(legacyGetComment).not.toHaveBeenCalled();
    expect(isTrackedChangeActionAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackedChanges: [
          expect.objectContaining({
            id: 'tc-narrow',
            comment: { id: 'tc-narrow', body: 'narrow-body' },
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

  it('derives copy-format active state from stored format painter style', () => {
    const registry = createToolbarRegistry();
    const state = registry['copy-format']?.state({
      context: {
        ...createContext(),
        editor: {
          storage: {
            formatCommands: {
              storedStyle: [{ type: { name: 'bold' }, attrs: {} }],
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

  it('keeps copy-format inactive when no stored format painter style exists', () => {
    const registry = createToolbarRegistry();
    const state = registry['copy-format']?.state({
      context: {
        ...createContext(),
        editor: {
          storage: {
            formatCommands: {
              storedStyle: null,
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

  it('keeps table-of-contents-insert disabled when create.tableOfContents is unavailable', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-of-contents-insert']?.state({
      context: {
        ...createContext(),
        target: {
          commands: {},
          doc: {
            capabilities: () => ({
              operations: {
                'create.tableOfContents': { available: false },
              },
            }),
          },
        },
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: true,
    });
  });

  it('enables table-of-contents-insert when create.tableOfContents is available', () => {
    const registry = createToolbarRegistry();
    const state = registry['table-of-contents-insert']?.state({
      context: {
        ...createContext(),
        target: {
          commands: {},
          doc: {
            capabilities: () => ({
              operations: {
                'create.tableOfContents': { available: true },
              },
            }),
          },
        },
      },
      superdoc: {},
    });

    expect(state).toEqual({
      active: false,
      disabled: false,
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

  it.each(['contentLocked', 'sdtContentLocked'])(
    'disables representative mutation commands inside a %s inline SDT',
    (lockMode) => {
      const registry = createToolbarRegistry();
      const context = makeToolbarContextWithSelection(makeInlineSdtState(lockMode));

      expect(registry.bold?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry.italic?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry.underline?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry.link?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry.image?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry['table-insert']?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry['clear-formatting']?.state({ context, superdoc: {} })?.disabled).toBe(true);
      expect(registry['copy-format']?.state({ context, superdoc: {} })?.disabled).toBe(true);
    },
  );

  it.each(['unlocked', 'sdtLocked'])('does not disable mutation commands from %s SDTs alone', (lockMode) => {
    const registry = createToolbarRegistry();
    const context = makeToolbarContextWithSelection(makeInlineSdtState(lockMode));

    expect(registry.bold?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry.link?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry['table-insert']?.state({ context, superdoc: {} })?.disabled).toBe(false);
  });

  it('leaves document controls governed by their existing rules inside content-locked SDTs', () => {
    getYUndoPluginStateMock.mockReturnValue({
      undoManager: {
        undoStack: [1],
        redoStack: [1],
      },
    });

    const registry = createToolbarRegistry();
    const baseContext = makeToolbarContextWithSelection(makeInlineSdtState('contentLocked'));
    const context = {
      ...baseContext,
      editor: {
        ...baseContext.editor,
        options: {
          ydoc: {},
          documentMode: 'editing',
        },
      } as any,
    };

    expect(registry.undo?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry.redo?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry.ruler?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry.zoom?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(registry['document-mode']?.state({ context, superdoc: {} })?.disabled).toBe(false);
    expect(
      registry['formatting-marks']?.state({
        context,
        superdoc: {
          toggleFormattingMarks: vi.fn(),
        },
      })?.disabled,
    ).toBe(false);
  });

  it('keeps text-align available when mutation commands are disabled inside a locked block SDT paragraph', () => {
    const registry = createToolbarRegistry();
    const context = makeToolbarContextWithSelection(makeBlockSdtState('contentLocked'));

    expect(registry.bold?.state({ context, superdoc: {} })?.disabled).toBe(true);
    expect(registry['text-align']?.state({ context, superdoc: {} })?.disabled).toBe(false);
  });

  it('disables mutation commands for a NodeSelection on a locked SDT', () => {
    const registry = createToolbarRegistry();
    const context = makeToolbarContextWithSelection(makeInlineSdtState('sdtContentLocked', 'node'));

    expect(registry.bold?.state({ context, superdoc: {} })?.disabled).toBe(true);
  });

  it('disables mutation commands for a range spanning locked SDT content', () => {
    const registry = createToolbarRegistry();
    const context = makeToolbarContextWithSelection(makeInlineSdtState('contentLocked', 'span'));

    expect(registry.bold?.state({ context, superdoc: {} })?.disabled).toBe(true);
    expect(registry['bullet-list']?.state({ context, superdoc: {} })?.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PR-2873 (SD-2527) — full coverage of bullet + ordered style derivation
  //
  // The existing 'activates bullet-list' / 'activates numbered-list' tests
  // above only cover one bullet case (null markerText) and one ordered case
  // (decimal). These new tests exercise every PR-supported combination of
  // numFmt + marker suffix that flows through createListStateDeriver.
  // -------------------------------------------------------------------------
  const makeListContext = (listRendering: { numberingType: string; markerText?: string | null }) => ({
    ...createContext(),
    editor: {
      state: {
        doc: { resolve: vi.fn(() => '$resolved-pos') },
        selection: {
          $from: {
            depth: 1,
            node: vi.fn((depth) =>
              depth === 1
                ? {
                    type: { name: 'paragraph' },
                    attrs: {
                      listRendering,
                      paragraphProperties: { numberingProperties: { numId: 1 } },
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
  });

  describe('bullet-list state value (PR-2873)', () => {
    // The headless deriver currently returns the raw markerText for bullets
    // (vs ordered which returns a normalized style key). External consumers
    // need to know this asymmetry — these tests document it.
    it.each([['•'], ['◦'], ['▪']])('returns markerText "%s" verbatim when bullet is active', (markerText) => {
      const registry = createToolbarRegistry();
      const state = registry['bullet-list']?.state({
        context: makeListContext({ numberingType: 'bullet', markerText }),
        superdoc: {},
      });
      expect(state).toEqual({ active: true, disabled: false, value: markerText });
    });

    it('returns markerText for legacy Symbol-font middle dot (·) — not normalized', () => {
      const registry = createToolbarRegistry();
      const state = registry['bullet-list']?.state({
        context: makeListContext({ numberingType: 'bullet', markerText: '·' }),
        superdoc: {},
      });
      // Legacy Symbol-font bullet is not in BULLET_STYLE_CHARS but the deriver
      // surfaces the raw glyph anyway; the dropdown UI does the recognition.
      expect(state).toEqual({ active: true, disabled: false, value: '·' });
    });

    it('returns null when current paragraph is ordered, not bullet', () => {
      const registry = createToolbarRegistry();
      const state = registry['bullet-list']?.state({
        context: makeListContext({ numberingType: 'decimal', markerText: '1.' }),
        superdoc: {},
      });
      expect(state).toEqual({ active: false, disabled: false, value: null });
    });
  });

  describe('numbered-list state value (PR-2873)', () => {
    it.each([
      ['decimal', '1.', 'decimal'],
      ['decimal', '1)', 'decimal-paren'],
      ['decimal', '23.', 'decimal'],
      ['upperRoman', 'I.', 'upper-roman'],
      ['upperRoman', 'XIV.', 'upper-roman'],
      ['lowerRoman', 'i.', 'lower-roman'],
      ['upperLetter', 'A.', 'upper-alpha'],
      ['upperLetter', 'A)', 'upper-alpha-paren'],
      ['upperLetter', 'Z)', 'upper-alpha-paren'],
      ['lowerLetter', 'a.', 'lower-alpha'],
      ['lowerLetter', 'a)', 'lower-alpha-paren'],
      ['lowerLetter', 'z)', 'lower-alpha-paren'],
    ])('maps (%s, %s) to value=%s', (numberingType, markerText, expected) => {
      const registry = createToolbarRegistry();
      const state = registry['numbered-list']?.state({
        context: makeListContext({ numberingType, markerText }),
        superdoc: {},
      });
      expect(state).toEqual({ active: true, disabled: false, value: expected });
    });

    it.each([
      ['decimalZero', '01.', 'decimalZero numFmt is not in the lookup'],
      ['decimal', 'Step 1:', 'unrecognized suffix ":"'],
    ])('returns value=null for unsupported combo (%s, %s) — %s', (numberingType, markerText) => {
      const registry = createToolbarRegistry();
      const state = registry['numbered-list']?.state({
        context: makeListContext({ numberingType, markerText }),
        superdoc: {},
      });
      // active is true (it IS an ordered list) but value is null because the
      // PR doesn't recognize this combo — the dropdown won't highlight any option.
      expect(state).toEqual({ active: true, disabled: false, value: null });
    });

    it('returns null when current paragraph is bullet, not ordered', () => {
      const registry = createToolbarRegistry();
      const state = registry['numbered-list']?.state({
        context: makeListContext({ numberingType: 'bullet', markerText: '•' }),
        superdoc: {},
      });
      expect(state).toEqual({ active: false, disabled: false, value: null });
    });
  });

  // SD-2810/PR #3226: the headless direction-ltr / direction-rtl ids must encode
  // their direction in the closure (not in a payload). Public payload type is
  // `never` because the runtime ignores any payload arg. These tests pin that
  // contract: no-payload invocation maps to the expected setParagraphDirection
  // call with alignmentPolicy='matchDirection'.
  describe('direction-ltr / direction-rtl execute contract', () => {
    const createExecuteContext = (commandSpy: ReturnType<typeof vi.fn>): ToolbarContext => ({
      target: {
        commands: {
          setParagraphDirection: commandSpy,
        },
      },
      surface: 'body',
      isEditable: true,
      selectionEmpty: false,
      editor: {
        commands: {
          setParagraphDirection: commandSpy,
        },
      } as any,
    });

    it("controller.execute('direction-ltr') calls setParagraphDirection({direction:'ltr', alignmentPolicy:'matchDirection'})", () => {
      const commandSpy = vi.fn(() => true);
      const registry = createToolbarRegistry();
      const result = registry['direction-ltr']?.execute?.({
        context: createExecuteContext(commandSpy),
        superdoc: {},
      });

      expect(result).toBe(true);
      expect(commandSpy).toHaveBeenCalledExactlyOnceWith({
        direction: 'ltr',
        alignmentPolicy: 'matchDirection',
      });
    });

    it("controller.execute('direction-rtl') calls setParagraphDirection({direction:'rtl', alignmentPolicy:'matchDirection'})", () => {
      const commandSpy = vi.fn(() => true);
      const registry = createToolbarRegistry();
      const result = registry['direction-rtl']?.execute?.({
        context: createExecuteContext(commandSpy),
        superdoc: {},
      });

      expect(result).toBe(true);
      expect(commandSpy).toHaveBeenCalledExactlyOnceWith({
        direction: 'rtl',
        alignmentPolicy: 'matchDirection',
      });
    });

    it('execute ignores any payload arg (direction comes from the command id)', () => {
      const commandSpy = vi.fn(() => true);
      const registry = createToolbarRegistry();
      // The headless ToolbarPayloadMap declares both direction ids as `never`,
      // so callers can't pass a payload through the typed surface. This test
      // pins the runtime side of that contract: even if someone bypasses TS
      // and passes a payload, it's ignored.
      const result = registry['direction-ltr']?.execute?.({
        context: createExecuteContext(commandSpy),
        superdoc: {},
        payload: { direction: 'rtl', alignmentPolicy: undefined } as never,
      });

      expect(result).toBe(true);
      // Still called with LTR, not the contradictory payload.
      expect(commandSpy).toHaveBeenCalledExactlyOnceWith({
        direction: 'ltr',
        alignmentPolicy: 'matchDirection',
      });
    });

    it('returns false when editor command is unavailable', () => {
      const registry = createToolbarRegistry();
      const result = registry['direction-ltr']?.execute?.({
        context: {
          ...createContext(),
          editor: { commands: {} } as any,
        },
        superdoc: {},
      });

      expect(result).toBe(false);
    });
  });

  // PR #3226: state-deriver tests for direction-ltr/direction-rtl. The deriver
  // reads paragraphProperties.rightToLeft via getCurrentResolvedParagraphProperties
  // and returns `{ active: current === closureDirection, disabled, value: current }`.
  describe('direction-ltr / direction-rtl state deriver', () => {
    const makeDirectionContext = (rightToLeft: boolean | undefined): ToolbarContext => ({
      ...createContext(),
      editor: {
        // Leaving `converter` undefined makes calculateResolvedParagraphProperties
        // return node.attrs.paragraphProperties directly, no cascade.
        state: {
          doc: { resolve: vi.fn(() => '$resolved-pos') },
          selection: {
            $from: {
              depth: 1,
              node: vi.fn((depth) =>
                depth === 1
                  ? {
                      type: { name: 'paragraph' },
                      attrs: {
                        paragraphProperties: rightToLeft === undefined ? {} : { rightToLeft },
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
    });

    it('direction-rtl is active when paragraph resolves RTL', () => {
      const registry = createToolbarRegistry();
      const state = registry['direction-rtl']?.state({ context: makeDirectionContext(true), superdoc: {} });

      expect(state).toEqual({ active: true, disabled: false, value: 'rtl' });
    });

    it('direction-rtl is inactive when paragraph resolves LTR', () => {
      const registry = createToolbarRegistry();
      const state = registry['direction-rtl']?.state({ context: makeDirectionContext(false), superdoc: {} });

      expect(state).toEqual({ active: false, disabled: false, value: 'ltr' });
    });

    it('direction-rtl is inactive when paragraph has no explicit direction', () => {
      const registry = createToolbarRegistry();
      const state = registry['direction-rtl']?.state({ context: makeDirectionContext(undefined), superdoc: {} });

      // Falsy rightToLeft -> current = 'ltr', so direction-rtl is inactive.
      expect(state).toEqual({ active: false, disabled: false, value: 'ltr' });
    });

    it('direction-ltr is active when paragraph resolves LTR', () => {
      const registry = createToolbarRegistry();
      const state = registry['direction-ltr']?.state({ context: makeDirectionContext(false), superdoc: {} });

      expect(state).toEqual({ active: true, disabled: false, value: 'ltr' });
    });

    it('direction-ltr is inactive when paragraph resolves RTL', () => {
      const registry = createToolbarRegistry();
      const state = registry['direction-ltr']?.state({ context: makeDirectionContext(true), superdoc: {} });

      expect(state).toEqual({ active: false, disabled: false, value: 'rtl' });
    });
  });
});
