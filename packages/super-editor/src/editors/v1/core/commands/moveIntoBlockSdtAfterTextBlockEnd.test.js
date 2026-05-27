import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { moveIntoBlockSdtAfterTextBlockEnd } from './moveIntoBlockSdtAfterTextBlockEnd.js';

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
      permStartBlock: { group: 'block', atom: true },
      table: { group: 'block', content: 'tableRow+' },
      tableRow: { content: 'tableCell+' },
      tableCell: { content: 'block+' },
      noBreakHyphen: { inline: true, group: 'inline', atom: true, leafText: () => '-' },
      bookmarkEnd: { inline: true, group: 'inline', atom: true },
      tableOfContentsEntry: { inline: true, group: 'inline', atom: true },
      passthroughBlock: { group: 'block', atom: true },
      fieldAnnotation: {
        inline: true,
        group: 'inline',
        atom: true,
        attrs: { hidden: { default: false } },
      },
      image: { inline: true, group: 'inline', atom: true },
      text: { group: 'inline' },
    },
    marks: {},
  });

const run = (schema, text) => schema.nodes.run.create(null, schema.text(text));
const atomRun = (schema, nodeName) => schema.nodes.run.create(null, schema.nodes[nodeName].create());
const marker = (schema, nodeName) => schema.nodes[nodeName].create({ id: 'marker-id' });
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

const findNodePos = (doc, nodeName) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (node.type.name === nodeName && found == null) {
      found = pos;
      return false;
    }
    return true;
  });
  expect(found).not.toBeNull();
  return found;
};

describe('moveIntoBlockSdtAfterTextBlockEnd', () => {
  it('moves from the end of the preceding paragraph to the first text position inside a following block SDT', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const a1Start = findTextPos(doc, 'A1');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('BeforeA1B1A2B2After');
    expect(dispatched.steps).toHaveLength(0);
    expect(dispatched.selection.from).toBe(a1Start);
    expect(dispatched.selection.to).toBe(a1Start);
  });

  it('moves from an empty preceding paragraph to the first text position inside a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      emptyParagraph(schema),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findEmptyParagraphTextPos(doc);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.steps).toHaveLength(0);
    expect(dispatched.selection.from).toBe(innerStart);
    expect(dispatched.selection.to).toBe(innerStart);
  });

  it('moves into a following block SDT that only contains an empty paragraph', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [emptyParagraph(schema)]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const targetPos = findEmptyParagraphTextPos(doc);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
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

  it('moves into the leading empty paragraph of a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [emptyParagraph(schema), paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const targetPos = findEmptyParagraphTextPos(doc);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
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

  it('ignores trailing inline markers when checking the preceding paragraph end', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [run(schema, 'Before'), marker(schema, 'bookmarkEnd')]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('ignores leading inline markers when targeting a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.paragraph.create(null, [marker(schema, 'bookmarkEnd'), run(schema, 'Inner')]),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('targets a marker-only leading paragraph inside a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.paragraph.create(null, [marker(schema, 'bookmarkEnd')]),
        paragraph(schema, 'Inner'),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const targetPos = findNodePos(doc, 'bookmarkEnd');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(targetPos);
  });

  it('skips leading hidden block markers when targeting a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.permStartBlock.create(),
        paragraph(schema, 'Inner'),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('ignores trailing hidden metadata atoms when checking the preceding paragraph end', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [run(schema, 'Before'), schema.nodes.tableOfContentsEntry.create()]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('skips leading hidden metadata atoms when targeting a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.passthroughBlock.create(),
        paragraph(schema, 'Inner'),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('ignores trailing hidden field annotations when checking the preceding paragraph end', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [
        run(schema, 'Before'),
        schema.nodes.fieldAnnotation.create({ hidden: true }),
      ]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('targets text after a hidden leading field annotation inside a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.paragraph.create(null, [
          schema.nodes.fieldAnnotation.create({ hidden: true }),
          run(schema, 'Inner'),
        ]),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const innerStart = findTextPos(doc, 'Inner');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(innerStart);
  });

  it('returns false when visible field annotation content appears after the last text position', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [
        run(schema, 'Before'),
        schema.nodes.fieldAnnotation.create({ hidden: false }),
      ]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'Before', 6)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when visible inline atom content appears after the last text position', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [run(schema, 'Before'), schema.nodes.image.create()]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'Before', 6)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('targets a visible leading inline atom inside a following block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      paragraph(schema, 'Before'),
      schema.nodes.structuredContentBlock.create(null, [
        schema.nodes.paragraph.create(null, [schema.nodes.image.create(), run(schema, 'Inner')]),
      ]),
      paragraph(schema, 'After'),
    ]);
    const beforeEnd = findTextPos(doc, 'Before', 6);
    const imageStart = findNodePos(doc, 'image');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

    let dispatched;
    const ok = moveIntoBlockSdtAfterTextBlockEnd()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection.from).toBe(imageStart);
  });

  it('returns false when inline atom content appears after the last text position', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.nodes.paragraph.create(null, [run(schema, 'Before'), atomRun(schema, 'noBreakHyphen')]),
      schema.nodes.structuredContentBlock.create(null, [paragraph(schema, 'Inner')]),
      paragraph(schema, 'After'),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'Before', 6)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the caret is not at the visible textblock end', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'Before', 5)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the next sibling is not a block SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [paragraph(schema, 'Before'), paragraph(schema, 'After')]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'Before', 6)),
    });
    const dispatch = vi.fn();

    const ok = moveIntoBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
