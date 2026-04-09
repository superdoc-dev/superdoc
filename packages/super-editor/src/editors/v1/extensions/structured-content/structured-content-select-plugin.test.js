import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';

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

describe('StructuredContentSelectPlugin', () => {
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

  function applyDoc(doc) {
    editor.setState(
      EditorState.create({
        schema,
        doc,
        plugins: editor.state.plugins,
      }),
    );
  }

  it('selects inline SDT content on first click in editing mode', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    const contentTo = sdt.pos + sdt.node.nodeSize - 1;

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom + 1)));

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.from).toBe(contentFrom);
    expect(editor.state.selection.to).toBe(contentTo);
  });

  it('does not auto-select inline SDT content in viewing mode', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    editor.setDocumentMode('viewing');

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom + 1)));

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(contentFrom + 1);
    expect(editor.state.selection.to).toBe(contentFrom + 1);
  });

  it('clears an existing SDT node selection when switching to viewing mode if an outside selection exists', () => {
    const innerParagraph = schema.nodes.paragraph.create(null, schema.text('Block field'));
    const blockSdt = schema.nodes.structuredContentBlock.create({ id: 'block-1' }, [innerParagraph]);
    const beforeParagraph = schema.nodes.paragraph.create(null, schema.text('Before'));
    applyDoc(schema.nodes.doc.create(null, [beforeParagraph, blockSdt]));

    const sdt = findNode(editor.state.doc, 'structuredContentBlock');
    expect(sdt).not.toBeNull();

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, sdt.pos)));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);

    editor.setDocumentMode('viewing');

    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.options.documentMode).toBe('viewing');
  });

  it('keeps an SDT node selection when switching to viewing mode if the block SDT is the whole document', () => {
    const innerParagraph = schema.nodes.paragraph.create(null, schema.text('Block field'));
    const blockSdt = schema.nodes.structuredContentBlock.create({ id: 'block-1' }, [innerParagraph]);
    applyDoc(schema.nodes.doc.create(null, [blockSdt]));

    const sdt = findNode(editor.state.doc, 'structuredContentBlock');
    expect(sdt).not.toBeNull();

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, sdt.pos)));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);

    editor.setDocumentMode('viewing');

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.options.documentMode).toBe('viewing');
  });
});
