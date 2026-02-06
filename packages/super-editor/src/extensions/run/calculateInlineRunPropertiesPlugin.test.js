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
      run: {
        inline: true,
        group: 'inline',
        content: 'inline*',
        attrs: {
          runProperties: { default: null },
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

  it('keeps paragraph runProperties in sync with the first run', () => {
    const schema = makeSchema();
    const doc = paragraphDoc(schema);
    const state = createState(schema, doc);
    const { from, to } = runTextRange(state.doc, 0, 2);

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toEqual({ runProperties: { bold: true } });
  });

  it('treats the first run inside inline wrappers as the paragraph first run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('bookmarkStart', null, [schema.node('run', null, schema.text('Wrapped'))]),
      ]),
    ]);
    const state = createState(schema, doc);
    const [wrappedRunPos] = runPositions(state.doc);
    const from = wrappedRunPos + 1;
    const to = wrappedRunPos + 3;

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toEqual({ runProperties: { bold: true } });
  });

  it('does not update paragraph runProperties when a non-first run changes', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('First')),
        schema.node('run', null, schema.text('Second')),
      ]),
    ]);
    const state = createState(schema, doc);
    const [firstRunPos, secondRunPos] = runPositions(state.doc);
    const from = secondRunPos + 1;
    const to = secondRunPos + 3;

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toBeNull();
    const firstRun = nextState.doc.nodeAt(firstRunPos);
    expect(firstRun?.attrs.runProperties).toBeNull();
  });

  it('updates paragraph runProperties when first run is nested inside an inline container', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('pageReference', { instruction: 'PAGEREF _Toc123456789 h' }, [
          schema.node('run', null, schema.text('Ref')),
        ]),
        schema.node('run', null, schema.text(' tail')),
      ]),
    ]);
    const state = createState(schema, doc);
    const [nestedRunPos] = runPositions(state.doc);
    const from = nestedRunPos + 1;
    const to = nestedRunPos + 4;

    const tr = state.tr.addMark(from, to, schema.marks.bold.create());
    const { state: nextState } = state.applyTransaction(tr);

    const paragraph = nextState.doc.firstChild;
    expect(paragraph.attrs.paragraphProperties).toEqual({ runProperties: { bold: true } });
  });

  it('does not update paragraph runProperties when nested run is not first in paragraph', () => {
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
});
