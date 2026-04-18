import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { findPreviousTextDeleteRange } from './findPreviousTextDeleteRange.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      bookmarkEnd: { inline: true, group: 'inline', atom: true },
      text: { group: 'inline' },
    },
    marks: {},
  });

describe('findPreviousTextDeleteRange', () => {
  it('finds the character immediately before the cursor in plain text', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('ABC'))]),
    ]);

    // Cursor after "C" — should target "C"
    const cursorPos = 5; // doc(0) > para(1) > run(2) > A(3) B(4) C(5)
    const paraStart = 2; // start of run content inside paragraph

    const range = findPreviousTextDeleteRange(doc, cursorPos, paraStart);

    expect(range).toEqual({ from: 4, to: 5 });
  });

  it('finds text across an empty sibling run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run'), // empty run
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    // Cursor at start of third run's content — scan should skip empty run and find "A"
    let thirdRunContentStart = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'run' && node.textContent === 'B') {
        thirdRunContentStart = pos + 1; // content start inside the run
        return false;
      }
      return true;
    });

    const paraStart = 2;
    const range = findPreviousTextDeleteRange(doc, thirdRunContentStart, paraStart);

    expect(range).not.toBeNull();
    expect(doc.textBetween(range.from, range.to)).toBe('A');
  });

  it('skips non-text inline nodes', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, [schema.text('A'), schema.node('bookmarkEnd')])]),
    ]);

    // Cursor after the bookmarkEnd — should skip it and find "A"
    let runEnd = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'run') {
        runEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const paraStart = 2;
    const range = findPreviousTextDeleteRange(doc, runEnd, paraStart);

    expect(range).not.toBeNull();
    expect(doc.textBetween(range.from, range.to)).toBe('A');
  });

  it('returns null when no text exists in the scan range', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run'), schema.node('run', null, schema.text('B'))]),
    ]);

    // Scan only within the empty run
    let emptyRunEnd = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'run' && node.content.size === 0) {
        emptyRunEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const emptyRunStart = 2;
    const range = findPreviousTextDeleteRange(doc, emptyRunEnd, emptyRunStart);

    expect(range).toBeNull();
  });

  it('respects minPos and does not scan past it', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    // Set minPos to the start of the second run so "A" is out of range
    let secondRunStart = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'run' && node.textContent === 'B') {
        secondRunStart = pos + 1;
        return false;
      }
      return true;
    });

    // Cursor at start of second run's content — scanning only within that run
    const range = findPreviousTextDeleteRange(doc, secondRunStart, secondRunStart);

    expect(range).toBeNull();
  });
});
