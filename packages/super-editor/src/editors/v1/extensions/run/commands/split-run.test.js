import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { TextSelection, EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import * as converterStyles from '@core/super-converter/styles.js';
import { TrackFormatMarkName } from '../../track-changes/constants.js';
import { buildReviewGraph } from '../../track-changes/review-model/review-graph.js';

let splitRunToParagraph;
let splitRunAtCursor;
const ALICE = { name: 'Alice', email: 'alice@example.com' };

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

const getOnlyTrackedChange = (state) => {
  const graph = buildReviewGraph({ state });
  expect(graph.changes.size).toBe(1);
  return [...graph.changes.values()][0];
};

describe('splitRunToParagraph command', () => {
  let editor;
  let originalMatchMedia;

  const loadDoc = (json, { plugins = false } = {}) => {
    const docNode = editor.schema.nodeFromJSON(json);
    const state = EditorState.create({
      schema: editor.schema,
      doc: docNode,
      ...(plugins ? { plugins: editor.state.plugins } : {}),
    });
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
    loadDoc(RUN_DOC, { plugins: true });

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
    loadDoc(RUN_DOC, { plugins: true });

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    expect(editor.view.state.selection.$from.parent.type.name).toBe('run');

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(true);

    const paragraphTexts = getParagraphTexts(editor.view.state.doc);
    expect(paragraphTexts).toEqual(['He', 'llo']);
  });

  it('records Enter as a tracked paragraph split in suggesting mode', () => {
    editor.options.user = ALICE;
    loadDoc(RUN_DOC, { plugins: true });
    editor.commands.enableTrackChanges();

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['He', 'llo']);

    const change = getOnlyTrackedChange(editor.view.state);
    expect(change.type).toBe('formatting');
    expect(change.before).toEqual([{ type: 'paragraphSplit', attrs: { anchor: 'source', offset: 2 } }]);
    expect(change.formattingSegments[0]?.mark.type.name).toBe(TrackFormatMarkName);
  });

  it('rejects a tracked paragraph split from the UI Enter path', () => {
    editor.options.user = ALICE;
    loadDoc(RUN_DOC, { plugins: true });
    editor.commands.enableTrackChanges();

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    expect(editor.commands.splitRunToParagraph()).toBe(true);
    const change = getOnlyTrackedChange(editor.view.state);

    expect(editor.commands.rejectTrackedChangeById(change.id)).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['Hello']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(0);
  });

  it('rejecting multiple paragraph splits in one transaction restores the original paragraph', () => {
    editor.options.user = ALICE;
    loadDoc(RUN_DOC, { plugins: true });
    editor.commands.enableTrackChanges();

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);
    expect(editor.commands.splitRunToParagraph()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['He', 'llo']);

    // Split the tail paragraph again so the document holds two paragraph-split
    // tracked changes that must both be rejected in one decision transaction.
    const tailStart = findTextPos('llo');
    expect(tailStart).not.toBeNull();
    updateSelection((tailStart ?? 0) + 1);
    expect(editor.commands.splitRunToParagraph()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['He', 'l', 'lo']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(2);

    // Reject everything at once. The structural joins must not desync each other.
    expect(editor.commands.rejectAllTrackedChanges()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['Hello']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(0);
  });

  it('rejecting all restores paragraph structure and applies a later tracked insertion removal', () => {
    editor.options.user = ALICE;
    loadDoc(RUN_DOC, { plugins: true });
    editor.commands.enableTrackChanges();

    // Tracked paragraph split first.
    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);
    expect(editor.commands.splitRunToParagraph()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['He', 'llo']);

    // Then a tracked insertion later in the document (end of the tail paragraph).
    const tailStart = findTextPos('llo');
    expect(tailStart).not.toBeNull();
    updateSelection((tailStart ?? 0) + 'llo'.length);
    editor.commands.insertContent('XYZ');
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['He', 'lloXYZ']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(2);

    // Reject all: the later insertion is removed at the correct (mapped) position
    // and the paragraph join still restores the original single paragraph.
    expect(editor.commands.rejectAllTrackedChanges()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['Hello']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(0);
  });

  it('rejects a tracked paragraph split that created an empty tail paragraph', () => {
    editor.options.user = ALICE;
    loadDoc(RUN_DOC, { plugins: true });
    editor.commands.enableTrackChanges();

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Hello'.length);

    expect(editor.commands.splitRunToParagraph()).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['Hello', '']);

    const change = getOnlyTrackedChange(editor.view.state);
    expect(change.before).toEqual([{ type: 'paragraphSplit', attrs: { anchor: 'source', offset: 5 } }]);

    expect(editor.commands.rejectTrackedChangeById(change.id)).toBe(true);
    expect(getParagraphTexts(editor.view.state.doc)).toEqual(['Hello']);
    expect(buildReviewGraph({ state: editor.view.state }).changes.size).toBe(0);
  });

  it('uses paragraph split metadata instead of copying DOCX identities', () => {
    loadDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paraId: 'ABCDEF01',
            textId: 'ABCDEF02',
            sdBlockId: 'block-1',
            sdBlockRev: 3,
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
    });

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 2);

    expect(editor.commands.splitRunToParagraph()).toBe(true);

    const splitParagraph = editor.view.state.doc.child(1);
    expect(splitParagraph.attrs.paraId).toBeNull();
    expect(splitParagraph.attrs.textId).toBeNull();
    expect(splitParagraph.attrs.sdBlockId).toBeNull();
    expect(splitParagraph.attrs.sdBlockRev).toBe(0);
    expect(splitParagraph.attrs.paragraphProperties).toEqual({ styleId: 'BodyText' });
  });

  it('preserves explicit stored marks when splitting into a new paragraph', () => {
    loadDoc(RUN_DOC);

    const start = findTextPos('Hello');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Hello'.length);

    const bold = editor.schema.marks.bold.create();
    editor.view.dispatch(editor.view.state.tr.setStoredMarks([bold]));
    expect((editor.view.state.storedMarks || []).map((mark) => mark.type.name)).toContain('bold');

    const handled = editor.commands.splitRunToParagraph();

    expect(handled).toBe(true);
    expect((editor.view.state.storedMarks || []).map((mark) => mark.type.name)).toContain('bold');
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

  it('returns false for splitRunAtCursor when cursor is not in a run node', () => {
    loadDoc(PLAIN_PARAGRAPH_DOC);
    updateSelection(1);

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

  /** Paragraph without a linked paragraph style — simulates applying only the linked character part to a selection. */
  const NORMAL_BODY_PARAGRAPH_DOC = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'run',
            content: [{ type: 'text', text: 'Hello world' }],
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

  const BASE_CONVERTER = {
    convertedXml: {},
    numbering: {},
    translatedNumbering: {},
    documentGuid: 'test-guid-123',
    promoteToGuid: vi.fn(),
  };

  const createHeadingLinkedStyleConverter = ({ runProperties } = {}) => ({
    ...BASE_CONVERTER,
    translatedLinkedStyles: {
      ...(runProperties ? { docDefaults: { runProperties: {} } } : {}),
      styles: {
        Heading1: {
          styleId: 'Heading1',
          type: 'paragraph',
          link: 'Heading1Char',
          ...(runProperties ? { runProperties } : {}),
        },
      },
    },
  });

  const loadDoc = (json, { plugins = false } = {}) => {
    const docNode = editor.schema.nodeFromJSON(json);
    const state = EditorState.create({
      schema: editor.schema,
      doc: docNode,
      ...(plugins ? { plugins: editor.state.plugins } : {}),
    });
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

  it('clears heading style on the leading empty paragraph when splitting at heading start', () => {
    const mockConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {},
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = mockConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection(start ?? 0);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
    });

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('');
    expect(paragraphs[0].attrs?.paragraphProperties?.styleId).toBeUndefined();
    expect(paragraphs[1].attrs?.paragraphProperties?.styleId).toBe('Heading1');
  });

  it('does not carry heading-derived style marks when the leading paragraph heading style is cleared', () => {
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
    updateSelection(start ?? 0);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
    });

    expect(paragraphs[0].attrs?.paragraphProperties?.styleId).toBeUndefined();
    const storedMarkTypes = (editor.view.state.storedMarks || []).map((mark) => mark.type?.name);
    expect(storedMarkTypes).not.toContain('bold');
  });

  it('does not inherit linked paragraph styles onto the new empty paragraph', () => {
    const linkedStyleConverter = createHeadingLinkedStyleConverter();

    editor.converter = linkedStyleConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Heading Text'.length);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
    });

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].attrs?.paragraphProperties?.styleId).toBe('Heading1');
    expect(paragraphs[1].attrs?.paragraphProperties?.styleId).toBeNull();
  });

  it('preserves linked paragraph styles when splitting text into two non-empty paragraphs', () => {
    const linkedStyleConverter = createHeadingLinkedStyleConverter();

    editor.converter = linkedStyleConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 7);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
    });

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].attrs?.paragraphProperties?.styleId).toBe('Heading1');
    expect(paragraphs[1].attrs?.paragraphProperties?.styleId).toBe('Heading1');
  });

  it('does not carry linked style marks into text typed in the new empty paragraph', () => {
    const linkedStyleConverter = createHeadingLinkedStyleConverter({
      runProperties: {
        bold: true,
        fontSize: 28,
      },
    });

    editor.converter = linkedStyleConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Heading Text'.length);

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
    expect(markTypes).not.toContain('bold');
    expect(markTypes).not.toContain('textStyle');
  });

  it('does not carry linked character style to a new line when only a selection had the linked char style', () => {
    const linkedStyleConverter = createHeadingLinkedStyleConverter();
    editor.converter = linkedStyleConverter;
    loadDoc(NORMAL_BODY_PARAGRAPH_DOC);

    const start = findTextPos('Hello world');
    expect(start).not.toBeNull();
    const textStyle = editor.schema.marks.textStyle;
    const textStart = start ?? 0;
    editor.view.dispatch(
      editor.view.state.tr.addMark(textStart + 6, textStart + 11, textStyle.create({ styleId: 'Heading1Char' })),
    );

    updateSelection(textStart + 'Hello world'.length);
    expect(editor.commands.splitRunToParagraph()).toBe(true);

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
    expect(markTypes).not.toContain('textStyle');
  });

  it('does not carry linked style marks into an empty paragraph created from a previously split linked-style paragraph', () => {
    const linkedStyleConverter = createHeadingLinkedStyleConverter({
      runProperties: {
        bold: true,
        fontSize: 28,
      },
    });

    editor.converter = linkedStyleConverter;
    loadDoc(STYLED_PARAGRAPH_DOC);

    const start = findTextPos('Heading Text');
    expect(start).not.toBeNull();

    updateSelection((start ?? 0) + 7);
    expect(editor.commands.splitRunToParagraph()).toBe(true);

    const splitParagraphTextPos = findTextPos(' Text');
    expect(splitParagraphTextPos).not.toBeNull();
    updateSelection((splitParagraphTextPos ?? 0) + ' Text'.length);
    expect(editor.commands.splitRunToParagraph()).toBe(true);

    editor.commands.insertContent('Y');

    let insertedTextNode = null;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'text' && node.text === 'Y') {
        insertedTextNode = node;
        return false;
      }
      return true;
    });

    expect(insertedTextNode).toBeTruthy();
    const markTypes = (insertedTextNode?.marks || []).map((mark) => mark.type?.name);
    expect(markTypes).not.toContain('bold');
    expect(markTypes).not.toContain('textStyle');
  });

  it('preserves ordinary paragraph styles on the new paragraph when splitting', () => {
    const bodyTextConverter = {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {
        styles: {
          BodyText: { styleId: 'BodyText', type: 'paragraph' },
        },
      },
      documentGuid: 'test-guid-123',
      promoteToGuid: vi.fn(),
    };

    editor.converter = bodyTextConverter;
    loadDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: { styleId: 'BodyText' },
          },
          content: [
            {
              type: 'run',
              content: [{ type: 'text', text: 'Body Text' }],
            },
          ],
        },
      ],
    });

    const start = findTextPos('Body Text');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 4);

    const handled = editor.commands.splitRunToParagraph();
    expect(handled).toBe(true);

    const paragraphs = [];
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
    });

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].attrs?.paragraphProperties?.styleId).toBe('BodyText');
    expect(paragraphs[1].attrs?.paragraphProperties?.styleId).toBe('BodyText');
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

  it('clears copied paragraph runProperties at paragraph end when the current run has none', () => {
    loadDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              runProperties: { bold: true },
            },
          },
          content: [
            {
              type: 'run',
              attrs: {
                runProperties: null,
              },
              content: [{ type: 'text', text: 'Plain' }],
            },
          ],
        },
      ],
    });

    const start = findTextPos('Plain');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Plain'.length);

    expect(editor.commands.splitRunToParagraph()).toBe(true);

    const secondParagraph = editor.view.state.doc.child(1);
    expect(secondParagraph.attrs.paragraphProperties?.runProperties).toBeUndefined();
  });

  it('preserves enclosing runProperties when splitting at paragraph end with null storedMarks', () => {
    const runProperties = {
      styleId: 'CustomCharStyle',
      fonts: { ascii: 'Aptos Display' },
    };

    loadDoc({
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
              attrs: {
                runProperties,
              },
              content: [{ type: 'text', text: 'Styled' }],
            },
          ],
        },
      ],
    });

    const start = findTextPos('Styled');
    expect(start).not.toBeNull();
    updateSelection((start ?? 0) + 'Styled'.length);

    expect(editor.view.state.storedMarks).toBeNull();
    expect(editor.commands.splitRunToParagraph()).toBe(true);

    const secondParagraph = editor.view.state.doc.child(1);
    expect(secondParagraph.attrs.paragraphProperties?.runProperties).toEqual(runProperties);
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
