import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { moveIntoBlockSdtBeforeTextBlockStart } from './moveIntoBlockSdtBeforeTextBlockStart.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      structuredContentBlock: {
        group: 'block',
        content: 'block*',
        isolating: true,
        attrs: {
          lockMode: { default: 'unlocked' },
        },
      },
      table: { group: 'block', content: 'tableRow+' },
      tableRow: { content: 'tableCell+' },
      tableCell: { content: 'block+' },
      noBreakHyphen: { inline: true, group: 'inline', atom: true },
      text: { group: 'inline' },
    },
    marks: {},
  });

const run = (schema, text) => schema.nodes.run.create(null, schema.text(text));
const atomRun = (schema, nodeName) => schema.nodes.run.create(null, schema.nodes[nodeName].create());
const paragraph = (schema, text) => schema.nodes.paragraph.create(null, run(schema, text));
const emptyParagraph = (schema) => schema.nodes.paragraph.create();

const makeDoc = (schema) =>
  schema.node('doc', null, [
    paragraph(schema, 'Before'),
    schema.nodes.structuredContentBlock.create(null, [
      schema.nodes.table.create(null, [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(null, paragraph(schema, 'A1')),
          schema.nodes.tableCell.create(null, paragraph(schema, 'B1')),
        ]),
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(null, paragraph(schema, 'A2')),
          schema.nodes.tableCell.create(null, paragraph(schema, 'B2')),
        ]),
      ]),
    ]),
    paragraph(schema, 'After'),
  ]);

const findTextPos = (doc, text, offset = 0) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (!node.isText || found != null) return found == null;
    const index = node.text.indexOf(text);
    if (index === -1) return true;
    found = pos + index + offset;
    return false;
  });
  expect(found).not.toBeNull();
  return found;
};

const findEmptyParagraphTextPos = (doc) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.childCount === 0 && found == null) {
      found = pos + 1;
      return false;
    }
    return true;
  });
  expect(found).not.toBeNull();
  return found;
};

describe('moveIntoBlockSdtBeforeTextBlockStart', () => {
  it('moves from the start of the following paragraph to the last text position inside a previous block SDT', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const afterStart = findTextPos(doc, 'After');
    const b2End = findTextPos(doc, 'B2', 2);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

    let dispatched;
    const ok = moveIntoBlockSdtBeforeTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('BeforeA1B1A2B2After');
    expect(dispatched.steps).toHaveLength(0);
    expect(dispatched.selection.from).toBe(b2End);
    expect(dispatched.selection.to).toBe(b2End);
  });

  it('moves from an empty following paragraph to the last text position inside a previous block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      emptyParagraph(schema),
    ]);
    const afterStart = findEmptyParagraphTextPos(doc);
    const innerEnd = findTextPos(doc, 'Inner', 5);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

    let dispatched;
    const ok = moveIntoBlockSdtBeforeTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.steps).toHaveLength(0);
    expect(dispatched.selection.from).toBe(innerEnd);
    expect(dispatched.selection.to).toBe(innerEnd);
  });

  it('moves into a previous block SDT that only contains an empty paragraph', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [emptyParagraph(schema)]),
      paragraph(schema, 'After'),
    ]);
    const afterStart = findTextPos(doc, 'After');
    const targetPos = findEmptyParagraphTextPos(doc);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

    let dispatched;
    const ok = moveIntoBlockSdtBeforeTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.steps).toHaveLength(0);
    expect(dispatched.selection.from).toBe(targetPos);
    expect(dispatched.selection.to).toBe(targetPos);
  });

  it('returns false when inline atom content appears before the first text position', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      schema.nodes.paragraph.create(null, [atomRun(schema, 'noBreakHyphen'), run(schema, 'After')]),
    ]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, findTextPos(doc, 'After')) });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the caret is not at the visible textblock start', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'After', 1)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the previous sibling is not a block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [paragraph(schema, 'Before'), paragraph(schema, 'After')]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, findTextPos(doc, 'After')) });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
