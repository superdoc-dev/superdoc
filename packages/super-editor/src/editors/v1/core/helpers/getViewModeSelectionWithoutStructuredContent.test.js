import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState, NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getViewModeSelectionWithoutStructuredContent } from './getViewModeSelectionWithoutStructuredContent.js';

function findNode(doc, nodeType) {
  let result = null;

  doc.descendants((node, pos) => {
    if (node.type.name === nodeType) {
      result = { node, pos };
      return false;
    }
  });

  return result;
}

describe('getViewModeSelectionWithoutStructuredContent', () => {
  let editor;
  let schema;

  beforeEach(() => {
    ({ editor } = initTestEditor());
    ({ schema } = editor);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    schema = null;
  });

  function createState(doc, selection) {
    return EditorState.create({
      schema,
      doc,
      selection,
      plugins: editor.state.plugins,
    });
  }

  it('normalizes structured content node selections', () => {
    const blockSdt = schema.nodes.structuredContentBlock.create({ id: 'block-1' }, [
      schema.nodes.paragraph.create(null, schema.text('Block field')),
    ]);
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Before')), blockSdt]);
    const sdt = findNode(doc, 'structuredContentBlock');
    const state = createState(doc, NodeSelection.create(doc, sdt.pos));

    const result = getViewModeSelectionWithoutStructuredContent(state);
    const expected = Selection.near(doc.resolve(sdt.pos), -1);

    expect(result?.eq(expected)).toBe(true);
  });

  it('returns null for block structured content node selections when no outside selection exists', () => {
    const blockSdt = schema.nodes.structuredContentBlock.create({ id: 'block-1' }, [
      schema.nodes.paragraph.create(null, schema.text('Block field')),
    ]);
    const doc = schema.nodes.doc.create(null, [blockSdt]);
    const sdt = findNode(doc, 'structuredContentBlock');
    const state = createState(doc, NodeSelection.create(doc, sdt.pos));

    expect(getViewModeSelectionWithoutStructuredContent(state)).toBeNull();
  });

  it('normalizes non-empty text selections fully inside the same inline structured content', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const sdt = findNode(doc, 'structuredContent');
    const selection = TextSelection.create(doc, sdt.pos + 2, sdt.pos + inlineSdt.nodeSize - 1);
    const state = createState(doc, selection);

    const result = getViewModeSelectionWithoutStructuredContent(state);
    const expected = Selection.near(doc.resolve(sdt.pos), -1);

    expect(result?.eq(expected)).toBe(true);
  });

  it('returns null for collapsed cursor selections inside structured content', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const sdt = findNode(doc, 'structuredContent');
    const state = createState(doc, TextSelection.create(doc, sdt.pos + 2));

    expect(getViewModeSelectionWithoutStructuredContent(state)).toBeNull();
  });

  it('returns null for selections outside structured content', () => {
    const paragraph = schema.nodes.paragraph.create(null, schema.text('Plain text'));
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const state = createState(doc, TextSelection.create(doc, 1, 5));

    expect(getViewModeSelectionWithoutStructuredContent(state)).toBeNull();
  });

  it('returns null when a selection crosses structured content boundaries', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const sdt = findNode(doc, 'structuredContent');
    const state = createState(doc, TextSelection.create(doc, sdt.pos - 1, sdt.pos + 3));

    expect(getViewModeSelectionWithoutStructuredContent(state)).toBeNull();
  });
});
