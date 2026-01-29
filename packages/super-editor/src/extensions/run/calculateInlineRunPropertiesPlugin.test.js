import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

const decodeRPrFromMarksMock = vi.hoisted(() =>
  vi.fn((marks) => ({ bold: marks.some((mark) => mark.type.name === 'bold') })),
);
const resolveRunPropertiesMock = vi.hoisted(() => vi.fn(() => ({ bold: false })));
const calculateResolvedParagraphPropertiesMock = vi.hoisted(() => vi.fn(() => ({ paragraph: 'calculated' })));
const getResolvedParagraphPropertiesMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('@converter/styles.js', () => ({
  decodeRPrFromMarks: decodeRPrFromMarksMock,
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
        },
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

const paragraphDoc = (schema, runAttrs = null, marks = []) =>
  schema.node('doc', null, [
    schema.node('paragraph', null, [schema.node('run', runAttrs, schema.text('Hello', marks))]),
  ]);

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
    expect(decodeRPrFromMarksMock).toHaveBeenCalledTimes(1);
    expect(calculateResolvedParagraphPropertiesMock).toHaveBeenCalledTimes(1);
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
});
