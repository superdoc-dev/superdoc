import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';

const decodeRPrFromMarksMock = vi.hoisted(() =>
  vi.fn((marks) => ({ bold: marks.some((mark) => mark.type.name === 'bold') })),
);
const encodeMarksFromRPrMock = vi.hoisted(() => vi.fn(() => []));
const resolveRunPropertiesMock = vi.hoisted(() => vi.fn(() => ({ bold: false })));
const calculateResolvedParagraphPropertiesMock = vi.hoisted(() => vi.fn(() => ({ paragraph: 'calculated' })));
const getResolvedParagraphPropertiesMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('@converter/styles.js', () => ({
  decodeRPrFromMarks: decodeRPrFromMarksMock,
  encodeMarksFromRPr: encodeMarksFromRPrMock,
  resolveRunProperties: resolveRunPropertiesMock,
}));

vi.mock('@extensions/paragraph/resolvedPropertiesCache.js', () => ({
  calculateResolvedParagraphProperties: calculateResolvedParagraphPropertiesMock,
  getResolvedParagraphProperties: getResolvedParagraphPropertiesMock,
}));

import { calculateInlineRunPropertiesPlugin } from './calculateInlineRunPropertiesPlugin.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        group: 'block',
        content: 'inline*',
        attrs: {
          paragraphProperties: { default: null },
        },
      },
      table: {
        tableRole: 'table',
        group: 'block',
        content: 'tableRow+',
        attrs: {
          tableProperties: { default: null },
        },
      },
      tableRow: {
        tableRole: 'row',
        content: 'tableCell+',
      },
      tableCell: {
        tableRole: 'cell',
        content: 'block+',
        attrs: {
          colspan: { default: 1 },
          rowspan: { default: 1 },
        },
      },
      run: {
        inline: true,
        group: 'inline',
        content: 'inline*',
        attrs: {
          runProperties: { default: null },
          runPropertiesInlineKeys: { default: null },
          runPropertiesStyleKeys: { default: null },
          runPropertiesOverrideKeys: { default: null },
          rsidR: { default: null },
          rsidRPr: { default: null },
          rsidDel: { default: null },
        },
      },
      pageReference: {
        inline: true,
        group: 'inline',
        content: 'run+',
        attrs: {
          instruction: { default: null },
        },
      },
      bookmarkStart: {
        inline: true,
        group: 'inline',
        content: 'inline*',
      },
      text: { group: 'inline' },
    },
    marks: {
      bold: {
        toDOM: () => ['strong', 0],
        parseDOM: [{ tag: 'strong' }],
      },
      italic: {
        toDOM: () => ['em', 0],
        parseDOM: [{ tag: 'em' }],
      },
    },
  });

const paragraphDoc = (schema, runAttrs = null, marks = [], text = 'Hello') =>
  schema.node('doc', null, [schema.node('paragraph', null, [schema.node('run', runAttrs, schema.text(text, marks))])]);

const runPos = (doc) => {
  let pos = null;
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'run' && pos == null) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  return pos;
};

const runPositions = (doc) => {
  const positions = [];
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'run') {
      positions.push(nodePos);
    }
    return true;
  });
  return positions;
};

const runTextRange = (doc, startIndex, endIndex) => {
  const base = runPos(doc);
  if (base == null) throw new Error('Run not found');
  return { from: base + 1 + startIndex, to: base + 1 + endIndex };
};

const runTextRangeAtPos = (runNodePos, startIndex, endIndex) => ({
  from: runNodePos + 1 + startIndex,
  to: runNodePos + 1 + endIndex,
});

const positionAtTextOffset = (doc, offset) => {
  let remaining = offset;
  let pos = null;

  doc.descendants((node, nodePos) => {
    if (!node.isText || pos != null) return true;
    if (remaining <= node.text.length) {
      pos = nodePos + remaining;
      return false;
    }
    remaining -= node.text.length;
    return true;
  });

  if (pos == null) {
    throw new Error('Offset exceeds text length');
  }
  return pos;
};

const createState = (schema, doc) =>
  EditorState.create({
    schema,
    doc,
    plugins: [calculateInlineRunPropertiesPlugin({ converter: { convertedXml: {}, numbering: {} } })],
  });

describe('calculateInlineRunPropertiesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decodeRPrFromMarksMock.mockImplementation((marks) => ({ bold: marks.some((mark) => mark.type.name === 'bold') }));
    encodeMarksFromRPrMock.mockImplementation(() => []);
    resolveRunPropertiesMock.mockImplementation(() => ({ bold: false }));
    calculateResolvedParagraphPropertiesMock.mockImplementation(() => ({ paragraph: 'calculated' }));
    getResolvedParagraphPropertiesMock.mockImplementation(() => null);
  });

  it('keeps importer- or API-seeded runPropertiesInlineKeys when marks change (does not infer keys from runProperties)', () => {
    decodeRPrFromMarksMock.mockImplementation((marks) => ({
      bold: marks.some((mark) => mark.type.name === 'bold'),
    }));
    resolveRunPropertiesMock.mockImplementation(() => ({}));

    const schema = makeSchema();
    const doc = paragraphDoc(
      schema,
      {
        runProperties: { lang: { val: 'en-US' }, rtl: true },
        runPropertiesInlineKeys: ['lang', 'rtl'],
        runPropertiesStyleKeys: ['lang', 'rtl'],
        runPropertiesOverrideKeys: ['lang', 'rtl'],
      },
      [],
      'Hello',
    );
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({
      bold: true,
      lang: { val: 'en-US' },
      rtl: true,
    });
    expect(runNode?.attrs.runPropertiesInlineKeys.sort()).toEqual(['bold', 'lang', 'rtl'].sort());
    expect(runNode?.attrs.runPropertiesOverrideKeys?.sort()).toEqual(['lang', 'rtl'].sort());
  });

  it('preserves run language when adding italic on documents without inline-key metadata', () => {
    decodeRPrFromMarksMock.mockImplementation((marks) => ({
      bold: marks.some((mark) => mark.type.name === 'bold'),
      italic: marks.some((mark) => mark.type.name === 'italic'),
    }));
    resolveRunPropertiesMock.mockImplementation(() => ({ bold: false, italic: false }));

    const schema = makeSchema();
    const doc = paragraphDoc(
      schema,
      {
        runProperties: { lang: { val: 'en-US' }, bold: true },
        runPropertiesInlineKeys: null,
        runPropertiesStyleKeys: null,
        runPropertiesOverrideKeys: null,
      },
      [schema.marks.bold.create()],
      'Hello',
    );
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5);

    const tr = state.tr.addMark(from, to, schema.marks.italic.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toMatchObject({
      lang: { val: 'en-US' },
      bold: true,
      italic: true,
    });
    expect(runNode?.attrs.runPropertiesInlineKeys.sort()).toEqual(['bold', 'italic'].sort());
    expect(runNode?.attrs.runPropertiesOverrideKeys).toBeNull();
  });

  it('stores inline run properties when marks differ from paragraph styles', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 2); // cover the first characters so first child has the mark

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState, transactions } = state.applyTransaction(tr);

    expect(transactions.length).toBeGreaterThan(1);
    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ bold: true });
    expect(decodeRPrFromMarksMock).toHaveBeenCalled();
    expect(calculateResolvedParagraphPropertiesMock).toHaveBeenCalled();
  });

  it('removes inline run properties when marks align with paragraph styles', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ bold: false }));
    resolveRunPropertiesMock.mockImplementation(() => ({ bold: false }));

    const schema = makeSchema();
    const boldMark = schema.marks.bold.create();
    const doc = paragraphDoc(schema, { runProperties: { bold: true } }, [boldMark]);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, doc.textContent.length);

    const tr = state.tr.removeMark(from, to, schema.marks.bold);
    const { state: nextState, transactions } = state.applyTransaction(tr);

    expect(transactions.length).toBeGreaterThan(1);
    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toBeNull();
  });

  it('drops complex-script bold companion when the bold mark is removed', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ bold: false }));
    resolveRunPropertiesMock.mockImplementation(() => ({ bold: false }));

    const schema = makeSchema();
    const boldMark = schema.marks.bold.create();
    const doc = paragraphDoc(
      schema,
      {
        runProperties: { bold: true, boldCs: true },
        runPropertiesInlineKeys: ['bold', 'boldCs'],
      },
      [boldMark],
    );
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, doc.textContent.length);

    const tr = state.tr.removeMark(from, to, schema.marks.bold);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toBeNull();
  });

  it('drops complex-script italic companion when the italic mark is removed', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ italic: false }));
    resolveRunPropertiesMock.mockImplementation(() => ({ italic: false }));

    const schema = makeSchema();
    const italicMark = schema.marks.italic.create();
    const doc = paragraphDoc(
      schema,
      {
        runProperties: { italic: true, italicCs: true },
        runPropertiesInlineKeys: ['italic', 'italicCs'],
      },
      [italicMark],
    );
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, doc.textContent.length);

    const tr = state.tr.removeMark(from, to, schema.marks.italic);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toBeNull();
  });

  it('uses cached paragraph properties when available', () => {
    getResolvedParagraphPropertiesMock.mockReturnValue({ cached: true });
    calculateResolvedParagraphPropertiesMock.mockImplementation(() => {
      throw new Error('should not calculate when cached');
    });
    decodeRPrFromMarksMock.mockImplementation((marks) => ({ italic: marks.some((m) => m.type.name === 'italic') }));
    resolveRunPropertiesMock.mockReturnValue({ italic: false });

    const schema = makeSchema();
    const doc = paragraphDoc(schema);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5);

    const tr = state.tr.addMark(from, to, schema.marks.italic.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ italic: true });
    expect(getResolvedParagraphPropertiesMock).toHaveBeenCalled();
    expect(calculateResolvedParagraphPropertiesMock).not.toHaveBeenCalled();
  });

  it('passes null tableInfo to resolveRunProperties for runs outside tables', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema, null, [], 'Hello');
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    state.applyTransaction(tr);

    expect(resolveRunPropertiesMock).toHaveBeenCalled();
    expect(resolveRunPropertiesMock.mock.calls[0][3]).toBeNull();
  });

  it('passes tableInfo to resolveRunProperties for runs inside table cells', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('table', { tableProperties: { tableStyleId: 'TableGrid' } }, [
        schema.node('tableRow', null, [
          schema.node('tableCell', null, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('A1'))]),
          ]),
          schema.node('tableCell', null, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('A2'))]),
          ]),
        ]),
        schema.node('tableRow', null, [
          schema.node('tableCell', null, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('B1'))]),
          ]),
          schema.node('tableCell', null, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('B2'))]),
          ]),
        ]),
      ]),
    ]);
    const state = createState(schema, doc);
    const runs = runPositions(state.doc);
    const targetRunPos = runs[runs.length - 1];
    const { from, to } = runTextRangeAtPos(targetRunPos, 0, 2);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    state.applyTransaction(tr);

    expect(resolveRunPropertiesMock).toHaveBeenCalled();
    expect(resolveRunPropertiesMock.mock.calls[0][3]).toEqual({
      tableProperties: { tableStyleId: 'TableGrid' },
      rowIndex: 1,
      cellIndex: 1,
      numCells: 2,
      numRows: 2,
    });
  });

  it('uses logical table coordinates for rows affected by rowspan', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('table', { tableProperties: { tableStyleId: 'TableGrid' } }, [
        schema.node('tableRow', null, [
          schema.node('tableCell', { rowspan: 2, colspan: 1 }, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('A1'))]),
          ]),
          schema.node('tableCell', { rowspan: 1, colspan: 1 }, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('B1'))]),
          ]),
          schema.node('tableCell', { rowspan: 1, colspan: 1 }, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('C1'))]),
          ]),
        ]),
        schema.node('tableRow', null, [
          schema.node('tableCell', { rowspan: 1, colspan: 1 }, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('B2'))]),
          ]),
          schema.node('tableCell', { rowspan: 1, colspan: 1 }, [
            schema.node('paragraph', null, [schema.node('run', null, schema.text('C2'))]),
          ]),
        ]),
      ]),
    ]);
    const state = createState(schema, doc);
    const runs = runPositions(state.doc);
    const targetRunPos = runs[runs.length - 1];
    const { from, to } = runTextRangeAtPos(targetRunPos, 0, 2);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    state.applyTransaction(tr);

    expect(resolveRunPropertiesMock).toHaveBeenCalled();
    expect(resolveRunPropertiesMock.mock.calls[0][3]).toEqual({
      tableProperties: { tableStyleId: 'TableGrid' },
      rowIndex: 1,
      cellIndex: 2,
      numCells: 3,
      numRows: 2,
    });
  });

  it('does not sync paragraph runProperties with the first run', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 2);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toBeNull();
  });

  it("does not update a paragraph's runProperties using the run's properties", () => {
    const schema = makeSchema();
    const paragraphRunProperties = { italic: true, styleId: 'ParagraphDefault' };
    const doc = schema.node('doc', null, [
      schema.node(
        'paragraph',
        {
          paragraphProperties: {
            alignment: 'center',
            runProperties: paragraphRunProperties,
          },
        },
        [schema.node('run', null, schema.text('Hello')), schema.node('run', null, schema.text('World'))],
      ),
    ]);
    const state = createState(schema, doc);
    const [firstRunPos] = runPositions(state.doc);
    const { from, to } = runTextRangeAtPos(firstRunPos, 0, 2);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toEqual({
      alignment: 'center',
      runProperties: paragraphRunProperties,
    });

    const updatedRuns = runPositions(nextState.doc);
    const updatedRun = nextState.doc.nodeAt(updatedRuns[0]);
    expect(updatedRun?.attrs.runProperties).toEqual({ bold: true });
  });

  it('does not update paragraph runProperties when a nested run changes', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('Lead ')),
        schema.node('pageReference', { instruction: 'PAGEREF _Toc123456789 h' }, [
          schema.node('run', null, schema.text('Ref')),
        ]),
      ]),
    ]);
    const state = createState(schema, doc);
    const [, nestedRunPos] = runPositions(state.doc);
    const from = nestedRunPos + 1;
    const to = nestedRunPos + 4;

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toBeNull();
  });

  it('splits runs when inline properties differ', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema, null, [], 'HelloWorld');
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5); // "Hello"

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const [firstRunPos, secondRunPos] = runPositions(nextState.doc);
    expect(firstRunPos).not.toBeNull();
    expect(secondRunPos).not.toBeNull();

    const firstRun = nextState.doc.nodeAt(firstRunPos);
    const secondRun = nextState.doc.nodeAt(secondRunPos);

    expect(firstRun?.textContent).toBe('Hello');
    expect(secondRun?.textContent).toBe('World');
    expect(firstRun?.attrs.runProperties).toEqual({ bold: true });
    expect(secondRun?.attrs.runProperties).toBeNull();
  });

  it('preserves run attributes when splitting runs', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(
      schema,
      { runProperties: null, rsidR: 'r1', rsidRPr: 'p1', rsidDel: 'd1' },
      [],
      'HelloWorld',
    );
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5); // "Hello"

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const [firstRunPos, secondRunPos] = runPositions(nextState.doc);
    const firstRun = nextState.doc.nodeAt(firstRunPos);
    const secondRun = nextState.doc.nodeAt(secondRunPos);

    expect(firstRun?.attrs.rsidR).toBe('r1');
    expect(firstRun?.attrs.rsidRPr).toBe('p1');
    expect(firstRun?.attrs.rsidDel).toBe('d1');
    expect(secondRun?.attrs.rsidR).toBe('r1');
    expect(secondRun?.attrs.rsidRPr).toBe('p1');
    expect(secondRun?.attrs.rsidDel).toBe('d1');
  });

  it('preserves selection when runs are split', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema, null, [], 'HelloWorld');
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 5); // "Hello"
    const cursorPos = positionAtTextOffset(state.doc, 7); // inside "World"

    const tr = state.tr.setSelection(TextSelection.create(state.doc, cursorPos));
    tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const expectedPos = positionAtTextOffset(nextState.doc, 7);
    expect(nextState.selection.from).toBe(expectedPos);
    expect(nextState.selection.to).toBe(expectedPos);
  });

  it('preserves non-mark-derived runProperties while removing mark-derived ones', () => {
    const schema = makeSchema();
    const boldMark = schema.marks.bold.create();
    const doc = paragraphDoc(schema, { runProperties: { bold: true, styleId: 'Style1' } }, [boldMark]);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, doc.textContent.length);

    const tr = state.tr.removeMark(from, to, schema.marks.bold);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ styleId: 'Style1' });
  });

  it('drops stale Hyperlink styleId after hyperlink marks are removed', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({}));
    resolveRunPropertiesMock.mockImplementation(() => ({}));

    const schema = makeSchema();
    const boldMark = schema.marks.bold.create();
    const doc = paragraphDoc(schema, { runProperties: { bold: true, styleId: 'Hyperlink' } }, [boldMark]);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, doc.textContent.length);

    const tr = state.tr.removeMark(from, to, schema.marks.bold);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toBeNull();
  });

  it('does not carry over mark-derived properties from existing runProperties', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

    const schema = makeSchema();
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: { ascii: 'Times' }, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 1);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ rsidR: 'r1' });
  });

  it('avoids inline fontFamily when mark-derived values match after encoding', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Times' } }));
    encodeMarksFromRPrMock.mockImplementation(() => [{ attrs: { fontFamily: 'Same' } }]);

    const schema = makeSchema();
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: { ascii: 'Times' }, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 1);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ rsidR: 'r1' });
  });

  it('preserves fontFamily from marks when sdPreserveRunPropertiesKeys includes fontFamily', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({
      fontFamily: { ascii: 'Georgia', eastAsia: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia' },
    }));
    resolveRunPropertiesMock.mockImplementation(() => ({
      fontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
    }));
    // Even if encodeMarksFromRPr would normalize both to the same value (the bug scenario),
    // the preserve mechanism should bypass that comparison entirely.
    encodeMarksFromRPrMock.mockImplementation(() => [{ attrs: { fontFamily: 'Arial, sans-serif' } }]);

    const schema = makeSchema();
    const doc = paragraphDoc(schema, { runProperties: { rsidR: 'r1' } });
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 1);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    tr.setMeta('sdPreserveRunPropertiesKeys', ['fontFamily']);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({
      rsidR: 'r1',
      fontFamily: { ascii: 'Georgia', eastAsia: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia' },
    });
  });

  it('preserves existing rFonts metadata when fontFamily is preserved', () => {
    const markFont = { ascii: 'Georgia', eastAsia: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia' };
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: markFont }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

    const schema = makeSchema();
    const existingFont = {
      ascii: 'Georgia',
      hAnsi: 'Georgia',
      eastAsiaTheme: 'minorEastAsia',
      csTheme: 'minorBidi',
      hint: 'eastAsia',
    };
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: existingFont, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 1);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    tr.setMeta('sdPreserveRunPropertiesKeys', ['fontFamily']);
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    // The merge preserves OOXML-only metadata from existing (themes, hint)
    // while overlaying fresh font names from the mark-decoded value.
    expect(runNode?.attrs.runProperties?.fontFamily).toEqual({
      ...existingFont,
      eastAsia: 'Georgia',
      cs: 'Georgia',
    });
  });

  it('preserves untouched eastAsia and hAnsi fonts during a partial rFonts update', () => {
    const markFont = { ascii: 'Georgia', eastAsia: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia' };
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: markFont }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

    const schema = makeSchema();
    const existingFont = {
      ascii: 'Times New Roman',
      hAnsi: 'Cambria',
      eastAsia: 'MS Gothic',
      cs: 'Georgia',
    };
    const updatedFont = {
      ascii: 'Georgia',
      hAnsi: 'Cambria',
      eastAsia: 'MS Gothic',
      cs: 'Georgia',
    };
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: existingFont, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const pos = runPos(state.doc);
    const runNode = state.doc.nodeAt(pos ?? 0);

    const tr = state.tr.setNodeMarkup(
      pos ?? 0,
      schema.nodes.run,
      { ...runNode?.attrs, runProperties: { fontFamily: updatedFont, rsidR: 'r1' } },
      runNode?.marks,
    );
    tr.setMeta('sdPreserveRunPropertiesKeys', [{ key: 'fontFamily', preferExisting: true }]);
    const { state: nextState } = state.applyTransaction(tr);

    const nextRunNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(nextRunNode?.attrs.runProperties?.fontFamily).toEqual(updatedFont);
  });

  it('preserves untouched cs and latin fonts during a partial rFonts update', () => {
    const markFont = { ascii: 'Georgia', eastAsia: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia' };
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: markFont }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

    const schema = makeSchema();
    const existingFont = {
      ascii: 'Times New Roman',
      hAnsi: 'Cambria',
      eastAsia: 'MS Gothic',
      cs: 'Traditional Arabic',
    };
    const updatedFont = {
      ascii: 'Times New Roman',
      hAnsi: 'Cambria',
      eastAsia: 'MS Gothic',
      cs: 'Noto Sans Arabic',
    };
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: existingFont, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const pos = runPos(state.doc);
    const runNode = state.doc.nodeAt(pos ?? 0);

    const tr = state.tr.setNodeMarkup(
      pos ?? 0,
      schema.nodes.run,
      { ...runNode?.attrs, runProperties: { fontFamily: updatedFont, rsidR: 'r1' } },
      runNode?.marks,
    );
    tr.setMeta('sdPreserveRunPropertiesKeys', [{ key: 'fontFamily', preferExisting: true }]);
    const { state: nextState } = state.applyTransaction(tr);

    const nextRunNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(nextRunNode?.attrs.runProperties?.fontFamily).toEqual(updatedFont);
  });

  it('does not preserve fontFamily when sdPreserveRunPropertiesKeys is not set', () => {
    decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));
    resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));
    encodeMarksFromRPrMock.mockImplementation(() => [{ attrs: { fontFamily: 'Arial, sans-serif' } }]);

    const schema = makeSchema();
    const doc = paragraphDoc(schema, { runProperties: { fontFamily: { ascii: 'Arial' }, rsidR: 'r1' } });
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 1);

    // No setMeta — fontFamily should be dropped since marks match styles
    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
    expect(runNode?.attrs.runProperties).toEqual({ rsidR: 'r1' });
  });

  it('maps changed ranges through later transactions', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('AAA'))]),
      schema.node('paragraph', null, [schema.node('run', null, schema.text('Hello'))]),
    ]);
    const state = createState(schema, doc);
    const [firstRunPos, secondRunPos] = runPositions(state.doc);
    const { from, to } = runTextRangeAtPos(secondRunPos, 0, 2); // "He"

    const tr1 = state.tr.addMark(from, to, schema.marks.bold.create());
    const state1 = state.apply(tr1);

    const [firstRunPosAfter] = runPositions(state1.doc);
    const tr2 = state1.tr.insertText('BBB', firstRunPosAfter + 1);
    const state2 = state1.apply(tr2);

    const plugin = calculateInlineRunPropertiesPlugin({ converter: { convertedXml: {}, numbering: {} } });
    const appended = plugin.spec.appendTransaction([tr1, tr2], state, state2);
    const finalState = appended ? state2.apply(appended) : state2;

    const runs = runPositions(finalState.doc);
    const boldRun = finalState.doc.nodeAt(runs[1]);
    expect(boldRun?.attrs.runProperties).toEqual({ bold: true });
  });

  // SD-2517: empty inline keys metadata preservation
  describe('SD-2517: empty inline keys [] vs null semantics', () => {
    it('preserves runPropertiesInlineKeys: [] when no user edits occur (zero-edit round-trip)', () => {
      // Simulate a run imported with no inline w:rPr ([] from importer).
      // The plugin should not pollute the allow-list with mark-derived keys.
      decodeRPrFromMarksMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));
      resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: { fontFamily: { ascii: 'Arial' }, lang: { val: 'pt-BR' } },
          runPropertiesInlineKeys: [],
          runPropertiesStyleKeys: null,
          runPropertiesOverrideKeys: null,
        },
        [],
        'Heading text',
      );
      const state = createState(schema, doc);

      // Trigger a doc change so the plugin fires (simulates another plugin changing the doc)
      const textPos = runPos(state.doc) + 1;
      const tr = state.tr.insertText('X', textPos).delete(textPos, textPos + 1);
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      // The inline keys should remain [] (or at most not contain fontFamily)
      const inlineKeys = runNode?.attrs.runPropertiesInlineKeys;
      expect(inlineKeys === null || (Array.isArray(inlineKeys) && !inlineKeys.includes('fontFamily'))).toBe(true);
    });

    it('adds mark keys when user applies new formatting to a run with empty inline keys', () => {
      // A run imported with [] gets user-applied bold → bold should appear in inline keys.
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: { ascii: 'Arial' },
      }));
      // resolveRunProperties returns style-resolved props WITHOUT bold (style doesn't define bold)
      resolveRunPropertiesMock.mockImplementation(() => ({ fontFamily: { ascii: 'Arial' } }));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: { lang: { val: 'pt-BR' } },
          runPropertiesInlineKeys: [],
          runPropertiesStyleKeys: null,
          runPropertiesOverrideKeys: null,
        },
        [],
        'Hello',
      );
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      // bold should be in inline keys (it's a genuine user edit)
      expect(runNode?.attrs.runPropertiesInlineKeys).toContain('bold');
    });

    it('preserves null inline keys for legacy runs (backward compatibility)', () => {
      // Legacy collab payloads have runPropertiesInlineKeys: null.
      // The plugin should keep null (not convert to []).
      decodeRPrFromMarksMock.mockImplementation(() => ({ bold: false }));
      resolveRunPropertiesMock.mockImplementation(() => ({ bold: false }));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: { lang: { val: 'en-US' } },
          runPropertiesInlineKeys: null,
          runPropertiesStyleKeys: null,
          runPropertiesOverrideKeys: null,
        },
        [],
        'Hello',
      );
      const state = createState(schema, doc);
      const textPos = runPos(state.doc) + 1;
      const tr = state.tr.insertText('X', textPos).delete(textPos, textPos + 1);
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      // With null metadata (legacy), the plugin adds mark-derived keys (backward compat).
      // The key invariant: it must NOT become [] (that would mean "importer said nothing inline").
      const inlineKeys = runNode?.attrs.runPropertiesInlineKeys;
      if (inlineKeys !== null) {
        expect(Array.isArray(inlineKeys) && inlineKeys.length > 0).toBe(true);
      }
    });
  });

  // SD-2894 follow-up: the theme-rFonts preservation must NOT silently swallow user font
  // changes. The two branches below pin both directions of the contract:
  //   (A) marks just re-encode the imported theme → preserve the theme reference;
  //   (B) marks diverge from the imported theme → user has overridden, drop the theme.
  // This is exactly the case Luccas reproduced in the PR review.
  describe('SD-2894: theme rFonts vs explicit user font change', () => {
    const fontFamilyEncoder = (runProperties) => {
      const ff = runProperties?.fontFamily;
      if (!ff || typeof ff !== 'object') return [];
      // Theme reference encodes to the CSS resolution of that theme. The customer fixture
      // had majorBidi → Calibri Light; we use the same here to mirror the bug.
      if (ff.asciiTheme === 'majorBidi') {
        return [{ type: 'textStyle', attrs: { fontFamily: 'Calibri Light' } }];
      }
      if (typeof ff.ascii === 'string') {
        return [{ type: 'textStyle', attrs: { fontFamily: ff.ascii } }];
      }
      return [];
    };

    beforeEach(() => {
      // Style cascade has no fontFamily for this run — the only sources are the run's
      // existing runProperties and the mark-derived value.
      resolveRunPropertiesMock.mockImplementation(() => ({}));
      encodeMarksFromRPrMock.mockImplementation(fontFamilyEncoder);
    });

    it('preserves theme reference when marks re-encode the imported theme value', () => {
      // Marks decode to the concrete CSS name that the theme resolves to — the import path.
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: { ascii: 'Calibri Light', hAnsi: 'Calibri Light', cs: 'Calibri Light' },
      }));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: {
            fontFamily: { asciiTheme: 'majorBidi', hAnsiTheme: 'majorBidi', cstheme: 'majorBidi' },
          },
          runPropertiesInlineKeys: ['fontFamily'],
        },
        [],
        'Latin',
      );
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      // Trigger plugin re-evaluation with any benign mark change.
      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      expect(runNode?.attrs.runProperties?.fontFamily).toEqual({
        asciiTheme: 'majorBidi',
        hAnsiTheme: 'majorBidi',
        cstheme: 'majorBidi',
      });
    });

    // Customer fixture had 3 runs with existing = { asciiTheme, hAnsiTheme, cstheme, eastAsia: 'Arial' }.
    // The marks re-decode to a full concrete shape including a `cs:` slot, so the encoder adds
    // `csFontFamily` to markFromMarks.attrs but not to markFromExisting.attrs. A full-attrs JSON
    // compare flagged these as user overrides and dropped the theme — manifesting as 65 → 62
    // theme attrs on round-trip. The gate must compare only the primary `fontFamily` slot.
    it('preserves theme refs when existing mixes themes with a concrete per-script slot', () => {
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: {
          ascii: 'Calibri Light',
          hAnsi: 'Calibri Light',
          eastAsia: 'Arial',
          cs: 'Calibri Light',
        },
      }));
      // Encoder mirrors the real encoder: theme resolves to primary 'Calibri Light';
      // a concrete `cs` slot adds `csFontFamily` to mark attrs.
      encodeMarksFromRPrMock.mockImplementation((runProperties) => {
        const ff = runProperties?.fontFamily;
        if (!ff || typeof ff !== 'object') return [];
        const attrs = {};
        if (ff.asciiTheme === 'majorBidi' || ff.ascii === 'Calibri Light') {
          attrs.fontFamily = 'Calibri Light';
        } else if (typeof ff.ascii === 'string') {
          attrs.fontFamily = ff.ascii;
        }
        if (ff.eastAsia) attrs.eastAsiaFontFamily = ff.eastAsia;
        if (ff.cs && ff.cs !== ff.asciiTheme) attrs.csFontFamily = ff.cs;
        return [{ type: 'textStyle', attrs }];
      });

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: {
            fontFamily: {
              asciiTheme: 'majorBidi',
              hAnsiTheme: 'majorBidi',
              cstheme: 'majorBidi',
              eastAsia: 'Arial',
            },
          },
          runPropertiesInlineKeys: ['fontFamily'],
        },
        [],
        'Latin',
      );
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      const ff = runNode?.attrs.runProperties?.fontFamily;
      expect(ff?.asciiTheme).toBe('majorBidi');
      expect(ff?.hAnsiTheme).toBe('majorBidi');
      expect(ff?.cstheme).toBe('majorBidi');
      expect(ff?.ascii).toBeUndefined();
      expect(ff?.hAnsi).toBeUndefined();
      expect(ff?.cs).toBeUndefined();
    });

    it('drops theme references when the user explicitly sets a different font', () => {
      // Marks decode to a CSS name the theme would NOT resolve to — the user-override path.
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' },
      }));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: {
            fontFamily: { asciiTheme: 'majorBidi', hAnsiTheme: 'majorBidi', cstheme: 'majorBidi' },
          },
          runPropertiesInlineKeys: ['fontFamily'],
        },
        [],
        'Latin',
      );
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      const ff = runNode?.attrs.runProperties?.fontFamily;
      expect(ff?.ascii).toBe('Arial');
      expect(ff?.asciiTheme).toBeUndefined();
      expect(ff?.hAnsiTheme).toBeUndefined();
      expect(ff?.cstheme).toBeUndefined();
    });
  });

  // Mutation matrix — exhaustively walks the (existing.fontFamily shape, mark-decoded
  // shape) cross-product to catch any regression on round-trip integrity. Each row pins
  // the expected runProperties.fontFamily shape after the plugin's appendTransaction.
  describe('SD-2894 mutation matrix — fontFamily round-trip integrity', () => {
    // Theme → CSS map mirrors what `resolveDocxFontFamily` would produce against a
    // real theme1.xml. Per-script extras (`eastAsiaFontFamily`, `csFontFamily`) are
    // emitted only when the concrete slot value differs from the primary fontFamily —
    // matches the real encoder in super-converter/styles.js.
    const THEME_TO_CSS = {
      majorBidi: 'Calibri Light',
      minorBidi: 'Calibri',
      majorHAnsi: 'Cambria',
      minorHAnsi: 'Calibri',
      majorEastAsia: 'SimSun',
      minorEastAsia: 'SimSun',
    };
    const universalEncoder = (runProperties) => {
      const ff = runProperties?.fontFamily;
      if (!ff || typeof ff !== 'object') return [];
      const attrs = {};
      // Mirror resolveDocxFontFamily: any theme ref wins for the primary slot, then fall
      // back to concrete ascii/hAnsi/eastAsia/cs. The real resolver also defaults to the
      // 'major' theme when nothing else is present, but tests pin explicit shapes.
      const themeRef = ff.asciiTheme ?? ff.hAnsiTheme ?? ff.eastAsiaTheme ?? ff.cstheme;
      if (themeRef && THEME_TO_CSS[themeRef]) {
        attrs.fontFamily = THEME_TO_CSS[themeRef];
      } else if (typeof ff.ascii === 'string') {
        attrs.fontFamily = ff.ascii;
      } else if (typeof ff.hAnsi === 'string') {
        attrs.fontFamily = ff.hAnsi;
      } else if (typeof ff.eastAsia === 'string') {
        attrs.fontFamily = ff.eastAsia;
      } else if (typeof ff.cs === 'string') {
        attrs.fontFamily = ff.cs;
      }
      if (typeof ff.eastAsia === 'string' && ff.eastAsia !== attrs.fontFamily) {
        attrs.eastAsiaFontFamily = ff.eastAsia;
      }
      if (typeof ff.cs === 'string' && ff.cs !== attrs.fontFamily) {
        attrs.csFontFamily = ff.cs;
      }
      return Object.keys(attrs).length ? [{ type: 'textStyle', attrs }] : [];
    };

    const scenarios = [
      // ── Group A: theme preservation (marks re-encode the imported value) ──
      {
        name: 'A1: all-4-slot theme refs preserved when marks match',
        existing: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorHAnsi',
          eastAsiaTheme: 'majorEastAsia',
          cstheme: 'majorBidi',
        },
        marksFontFamily: {
          ascii: 'Calibri Light',
          hAnsi: 'Cambria',
          eastAsia: 'SimSun',
          cs: 'Calibri Light',
        },
        expected: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorHAnsi',
          eastAsiaTheme: 'majorEastAsia',
          cstheme: 'majorBidi',
        },
      },
      {
        name: 'A2: SD-2894 customer shape (3 theme slots, no eastAsia) preserved',
        existing: { asciiTheme: 'majorBidi', hAnsiTheme: 'majorBidi', cstheme: 'majorBidi' },
        marksFontFamily: { ascii: 'Calibri Light', hAnsi: 'Calibri Light', cs: 'Calibri Light' },
        expected: { asciiTheme: 'majorBidi', hAnsiTheme: 'majorBidi', cstheme: 'majorBidi' },
      },
      {
        name: 'A3: themes on 3 slots + concrete eastAsia preserved (regression case)',
        existing: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorBidi',
          cstheme: 'majorBidi',
          eastAsia: 'Arial',
        },
        marksFontFamily: {
          ascii: 'Calibri Light',
          hAnsi: 'Calibri Light',
          eastAsia: 'Arial',
          cs: 'Calibri Light',
        },
        expected: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorBidi',
          cstheme: 'majorBidi',
          eastAsia: 'Arial',
        },
      },
      {
        name: 'A4: ascii-only theme preserved',
        existing: { asciiTheme: 'majorBidi' },
        marksFontFamily: {
          ascii: 'Calibri Light',
          hAnsi: 'Calibri Light',
          eastAsia: 'Calibri Light',
          cs: 'Calibri Light',
        },
        // hAnsi/eastAsia/cs are mark-derived concrete; only asciiTheme had a theme to preserve.
        expected: {
          asciiTheme: 'majorBidi',
          hAnsi: 'Calibri Light',
          eastAsia: 'Calibri Light',
          cs: 'Calibri Light',
        },
      },
      {
        name: 'A5: hAnsi-only theme preserved',
        existing: { hAnsiTheme: 'majorHAnsi' },
        marksFontFamily: { ascii: 'Cambria', hAnsi: 'Cambria', eastAsia: 'Cambria', cs: 'Cambria' },
        expected: {
          ascii: 'Cambria',
          hAnsiTheme: 'majorHAnsi',
          eastAsia: 'Cambria',
          cs: 'Cambria',
        },
      },
      {
        name: 'A6: cs-only theme preserved (lowercase `cstheme` OOXML quirk)',
        existing: { cstheme: 'majorBidi' },
        marksFontFamily: {
          ascii: 'Calibri Light',
          hAnsi: 'Calibri Light',
          eastAsia: 'Calibri Light',
          cs: 'Calibri Light',
        },
        expected: {
          ascii: 'Calibri Light',
          hAnsi: 'Calibri Light',
          eastAsia: 'Calibri Light',
          cstheme: 'majorBidi',
        },
      },
      {
        name: 'A7: eastAsia-only theme preserved',
        existing: { eastAsiaTheme: 'majorEastAsia' },
        marksFontFamily: { ascii: 'SimSun', hAnsi: 'SimSun', eastAsia: 'SimSun', cs: 'SimSun' },
        expected: {
          ascii: 'SimSun',
          hAnsi: 'SimSun',
          eastAsiaTheme: 'majorEastAsia',
          cs: 'SimSun',
        },
      },
      // ── Group B: user override (marks diverge from existing) ──
      {
        name: 'B1: all-4-slot theme + user picks Arial → drop all themes',
        existing: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorHAnsi',
          eastAsiaTheme: 'majorEastAsia',
          cstheme: 'majorBidi',
        },
        marksFontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        expected: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
      },
      {
        name: 'B2: customer shape + user picks Arial → drop themes (Luccas case)',
        existing: { asciiTheme: 'majorBidi', hAnsiTheme: 'majorBidi', cstheme: 'majorBidi' },
        marksFontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        expected: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
      },
      {
        name: 'B3: mixed theme + concrete eastAsia, user picks Arial → drop everything stale',
        existing: {
          asciiTheme: 'majorBidi',
          hAnsiTheme: 'majorBidi',
          cstheme: 'majorBidi',
          eastAsia: 'Arial',
        },
        marksFontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        expected: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
      },
      // ── Group C: no-theme baselines (regression sanity) ──
      {
        name: 'C1: pure concrete unchanged → output stays concrete',
        existing: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        marksFontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        expected: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
      },
      {
        name: 'C2: pure concrete + user picks Helvetica → output is new concrete',
        existing: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
        marksFontFamily: { ascii: 'Helvetica', hAnsi: 'Helvetica', eastAsia: 'Helvetica', cs: 'Helvetica' },
        expected: { ascii: 'Helvetica', hAnsi: 'Helvetica', eastAsia: 'Helvetica', cs: 'Helvetica' },
      },
    ];

    it.each(scenarios)('$name', ({ existing, marksFontFamily, expected }) => {
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: marksFontFamily,
      }));
      encodeMarksFromRPrMock.mockImplementation(universalEncoder);
      resolveRunPropertiesMock.mockImplementation(() => ({}));

      const schema = makeSchema();
      const doc = paragraphDoc(
        schema,
        {
          runProperties: { fontFamily: existing },
          runPropertiesInlineKeys: ['fontFamily'],
        },
        [],
        'Latin',
      );
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      expect(runNode?.attrs.runProperties?.fontFamily).toEqual(expected);
    });

    // Special baseline: empty existing (run has no prior fontFamily metadata). marks
    // become authoritative; nothing to preserve from existing.
    it('C3: empty existing + marks have concrete → marks become the source of truth', () => {
      decodeRPrFromMarksMock.mockImplementation((marks) => ({
        bold: marks.some((mark) => mark.type.name === 'bold'),
        fontFamily: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Arial', cs: 'Arial' },
      }));
      encodeMarksFromRPrMock.mockImplementation(universalEncoder);
      resolveRunPropertiesMock.mockImplementation(() => ({}));

      const schema = makeSchema();
      const doc = paragraphDoc(schema, { runProperties: null, runPropertiesInlineKeys: null }, [], 'Latin');
      const state = createState(schema, doc);
      const { from, to } = runTextRange(state.doc, 0, 5);

      const tr = state.tr.addMark(from, to, schema.marks.bold.create());
      const { state: nextState } = state.applyTransaction(tr);

      const runNode = nextState.doc.nodeAt(runPos(nextState.doc) ?? 0);
      expect(runNode?.attrs.runProperties?.fontFamily).toEqual({
        ascii: 'Arial',
        hAnsi: 'Arial',
        eastAsia: 'Arial',
        cs: 'Arial',
      });
    });
  });
});
