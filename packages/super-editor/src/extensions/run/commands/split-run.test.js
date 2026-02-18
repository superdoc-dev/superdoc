import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { TextSelection, EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import * as converterStyles from '@core/super-converter/styles.js';

let splitRunToParagraph;
let splitRunAtCursor;

beforeAll(async () => {
  ({ splitRunToParagraph, splitRunAtCursor } = await import('@extensions/run/commands/split-run.js'));
});

const RUN_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'run',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    },
  ],
};

const PLAIN_PARAGRAPH_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Plain' }],
    },
  ],
};

const getParagraphTexts = (doc) => {
  const texts = [];
  doc.descendants((node) => {
    if (node.type.name === 'paragraph') {
      texts.push(node.textContent);
    }
  });
  return texts;
};

const getRunTexts = (doc) => {
  const texts = [];
  doc.descendants((node) => {
    if (node.type.name === 'run') {
      texts.push(node.textContent);
    }
  });
  return texts;
};

describe('splitRunToParagraph command', () => {
  let editor;
  let originalMatchMedia;

  const loadDoc = (json) => {
    const docNode = editor.schema.nodeFromJSON(json);
    const state = EditorState.create({ schema: editor.schema, doc: docNode });
    editor.setState(state);
  };

  const updateSelection = (from, to = from) => {
    const { view } = editor;
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    view.dispatch(tr);
  };

  const findTextPos = (text) => {
    let pos = null;
    editor.view.state.doc.descendants((node, position) => {
      if (node.type.name === 'text' && node.text === text) {
        pos = position;
        return false;
      }
      return true;
    });
    return pos;
  };

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    if (!originalMatchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    }
    ({ editor } = initTestEditor());
  });

  afterEach(() => {
    editor.destroy();
    if (originalMatchMedia === undefined) {
      delete window.matchMedia;
    } else {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('returns false when selection is not empty', () => {
    loadDoc(RUN_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 1, (start ?? 0) + 3);

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(false);
  });

  it('returns false when cursor is not inside a run node', () => {
    loadDoc(PLAIN_PARAGRAPH_DOC);

    updateSelection(1);

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(false);
  });

  it('delegates to splitBlock when cursor is inside a run', () => {
    loadDoc(RUN_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    expect(editor.view.state.selection.$from.parent.type.name).toBe('run');

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['He', 'llo']);
  });

  it('splits a run at the cursor into two runs', () => {
    loadDoc(RUN_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 3); // after "Hel"

    expect(editor.view.state.selection.$from.parent.type.name).toBe('run');

    const handled = editor.commands.splitRunAtCursor();

    expect(handled).toBe(true);
    const runTexts = getRunTexts(editor.view.state.doc);
    expect(runTexts).toEqual(['Hel', 'lo']);
  });

  it('returns false when selection is not empty for splitRunAtCursor', () => {
    loadDoc(RUN_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 1, (start ?? 0) + 2);

    const handled = editor.commands.splitRunAtCursor();

    expect(handled).toBe(false);
  });
});

describe('splitRunToParagraph with style marks', () => {
  let editor;
  let originalMatchMedia;

  const STYLED_PARAGRAPH_DOC = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: {
          paragraphProperties: { styleId: 'Heading1' },
        },
        content: [
          {
            type: 'run',
            content: [{ type: 'text', text: 'Heading Text' }],
          },
        ],
      },
    ],
  };

  const STYLED_TABLE_DOC = {
    type: 'doc',
    content: [
      {
        type: 'table',
        attrs: {
          tableProperties: {
            tableStyleId: 'TableBold',
          },
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    attrs: {
                      paragraphProperties: { styleId: 'BodyText' },
                    },
                    content: [
                      {
                        type: 'run',
                        content: [{ type: 'text', text: 'Hello' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const loadDoc = (json) => {
    const docNode = editor.schema.nodeFromJSON(json);
    const state = EditorState.create({ schema: editor.schema, doc: docNode });
    editor.setState(state);
  };

  const updateSelection = (from, to = from) => {
    const { view } = editor;
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    view.dispatch(tr);
  };

  const findTextPos = (text) => {
    let pos = null;
    editor.view.state.doc.descendants((node, position) => {
      if (node.type.name === 'text' && node.text === text) {
        pos = position;
        return false;
      }
      return true;
    });
    return pos;
  };

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    if (!originalMatchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    }
    ({ editor } = initTestEditor());
  });

  afterEach(() => {
    editor.destroy();
    if (originalMatchMedia === undefined) {
      delete window.matchMedia;
    } else {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('applies style marks when splitting paragraph with styleId', () => {
    const mockConverter = {
      convertedXml: {
        'w:styles': {
          'w:style': [
            {
              '@w:styleId': 'Heading1',
              '@w:type': 'paragraph',
              'w:rPr': {
                'w:b': {},
                'w:sz': { '@w:val': '28' },
              },
            },
          ],
        },
      },
      numbering: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Heading', ' Text']);
  });

  it('handles missing converter gracefully during split', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;

    const docWithoutConverter = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {},
          },
          content: [
            {
              type: 'run',
              content: [{ type: 'text', text: 'Heading Text' }],
            },
          ],
        },
      ],
    };

    loadDoc(docWithoutConverter);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Heading', ' Text']);
  });

  it('handles missing styleId during split', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;

    const docWithoutStyle = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {},
          },
          content: [
            {
              type: 'run',
              content: [{ type: 'text', text: 'Plain Text' }],
            },
          ],
        },
      ],
    };

    loadDoc(docWithoutStyle);

    const start = findTextPos('Plain Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 5);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Plain', ' Text']);
  });

  it('preserves selection marks over style marks when splitting', () => {
    const mockConverter = {
      convertedXml: {
        'w:styles': {
          'w:style': [
            {
              '@w:styleId': 'Heading1',
              '@w:type': 'paragraph',
              'w:rPr': {
                'w:b': {},
              },
            },
          ],
        },
      },
      numbering: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    editor.commands.toggleBold();

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Heading', ' Text']);
  });

  it('handles malformed converter data during split', () => {
    const mockConverter = {
      convertedXml: null,
      numbering: undefined,
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Heading', ' Text']);
  });

  it('handles errors during style resolution without crashing', () => {
    const mockConverter = {
      convertedXml: {
        'w:styles': {
          'w:style': [],
        },
      },
      numbering: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['Heading', ' Text']);
  });

  it('passes translated style context to resolveRunProperties when splitting', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: { definitions: { 1: { abstractNumId: 1 } }, abstracts: {} },
      translatedLinkedStyles: {
        docDefaults: { runProperties: {} },
        styles: { Heading1: { runProperties: { bold: true } } },
      },
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };
    const resolveRunPropertiesSpy = vi
      .spyOn(converterStyles, 'resolveRunProperties')
      .mockImplementation(() => ({ bold: true }));

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    expect(resolveRunPropertiesSpy).toHaveBeenCalled();
    const [paramsArg, inlineRprArg, resolvedPprArg, tableInfoArg, isListNumberArg, numberingDefinedInlineArg] =
      resolveRunPropertiesSpy.mock.calls[0];
    expect(paramsArg).toMatchObject({
      translatedNumbering: mockConverter.translatedNumbering,
      translatedLinkedStyles: mockConverter.translatedLinkedStyles,
    });
    expect(inlineRprArg).toEqual({});
    expect(resolvedPprArg).toEqual({ styleId: 'Heading1' });
    expect(tableInfoArg).toBeNull();
    expect(isListNumberArg).toBe(false);
    expect(numberingDefinedInlineArg).toBe(false);

    resolveRunPropertiesSpy.mockRestore();
  });

  it('applies resolved style marks to inserted text after split without mocking resolveRunProperties', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: { runProperties: {} },
        styles: {
          Heading1: {
            runProperties: {
              bold: true,
              fontSize: 28,
            },
          },
        },
      },
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    editor.commands.insertContent('X');

    let insertedTextNode = null;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'text' && node.text === 'X') {
        insertedTextNode = node;
        return false;
      }
      return true;
    });

    expect(insertedTextNode).toBeTruthy();
    const markTypes = (insertedTextNode?.marks || []).map((mark) => mark.type?.name);
    expect(markTypes).toContain('bold');
    expect(markTypes).toContain('textStyle');
  });

  it('applies resolved style marks to inserted text after split inside a table cell without mocking', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: { runProperties: {} },
        styles: {
          BodyText: {
            runProperties: {
              bold: true,
              fontSize: 26,
            },
          },
          TableBold: {
            type: 'table',
            runProperties: { italic: true },
          },
        },
      },
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_TABLE_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    editor.commands.insertContent('X');

    let insertedTextNode = null;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'text' && node.text === 'X') {
        insertedTextNode = node;
        return false;
      }
      return true;
    });

    expect(insertedTextNode).toBeTruthy();
    const markTypes = (insertedTextNode?.marks || []).map((mark) => mark.type?.name);
    expect(markTypes).toContain('bold');
    expect(markTypes).toContain('italic');
    expect(markTypes).toContain('textStyle');
  });

  it('passes table split context through resolveRunProperties call shape', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: { runProperties: {} },
        styles: {
          BodyText: { runProperties: {} },
          TableBold: { type: 'table', runProperties: { bold: true } },
        },
      },
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };
    const resolveRunPropertiesSpy = vi.spyOn(converterStyles, 'resolveRunProperties').mockImplementation(() => ({}));

    editor.converter = mockConverter;
    loadDoc(STYLED_TABLE_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    expect(resolveRunPropertiesSpy).toHaveBeenCalled();
    const callArgs = resolveRunPropertiesSpy.mock.calls[0];
    expect(callArgs).toHaveLength(6);
    expect(callArgs[0]).toMatchObject({
      translatedNumbering: mockConverter.translatedNumbering,
      translatedLinkedStyles: mockConverter.translatedLinkedStyles,
    });
    expect(callArgs[2]).toEqual({ styleId: 'BodyText' });
    expect(callArgs[3]).toEqual({
      tableProperties: { tableStyleId: 'TableBold' },
      rowIndex: 0,
      cellIndex: 0,
      numCells: 1,
      numRows: 1,
    });
    expect(callArgs[4]).toBe(false);
    expect(callArgs[5]).toBe(false);

    resolveRunPropertiesSpy.mockRestore();
  });
});
