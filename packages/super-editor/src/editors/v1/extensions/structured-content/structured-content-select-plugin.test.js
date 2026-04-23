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

  it('exits inline SDT with one ArrowRight from near-end position', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentTo = sdt.pos + sdt.node.nodeSize - 1;
    const afterSdt = sdt.pos + sdt.node.nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentTo - 1)));

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(afterSdt);
    expect(editor.state.selection.to).toBe(afterSdt);
  });

  it('creates editable slot when exiting inline SDT without trailing text', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentTo = sdt.pos + sdt.node.nodeSize - 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentTo)));

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));

    expect(editor.state.selection.empty).toBe(true);
    // Cursor should not remain inside structuredContent after exiting.
    let insideStructuredContent = false;
    for (let depth = editor.state.selection.$from.depth; depth > 0; depth -= 1) {
      if (editor.state.selection.$from.node(depth).type.name === 'structuredContent') {
        insideStructuredContent = true;
      }
    }
    expect(insideStructuredContent).toBe(false);

    // Editable slot insertion should add exactly one zero-width character.
    const text = editor.state.doc.textContent;
    expect((text.match(/\u200B/g) ?? []).length).toBe(1);
  });

  it('ArrowLeft exit does not insert zero-width text before inline SDT', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    const beforeDocText = editor.state.doc.textContent;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom + 1)));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom)));

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.doc.textContent).toBe(beforeDocText);
    expect((editor.state.doc.textContent.match(/\u200B/g) ?? []).length).toBe(0);
  });

  it('ArrowLeft exit creates editable slot before first inline SDT', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [inlineSdt, schema.text(' tail')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom + 1)));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom)));

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));

    expect(editor.state.selection.empty).toBe(true);
    expect((editor.state.doc.textContent.match(/\u200B/g) ?? []).length).toBe(1);
    expect(editor.state.doc.textContent).toContain('tail');
    expect(editor.state.selection.from).toBeGreaterThanOrEqual(sdt.pos + 1);
  });

  it('does not intercept Shift+ArrowRight near inline SDT boundary', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentTo = sdt.pos + sdt.node.nodeSize - 1;
    const beforeSelection = TextSelection.create(editor.state.doc, contentTo - 1, contentTo);
    editor.view.dispatch(editor.state.tr.setSelection(beforeSelection));
    const beforeFrom = editor.state.selection.from;
    const beforeTo = editor.state.selection.to;
    const beforeText = editor.state.doc.textContent;

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true });
    let handled = false;
    editor.view.someProp('handleKeyDown', (handler) => {
      handled = handler(editor.view, event);
      return handled;
    });

    expect(handled).toBe(false);
    expect(editor.state.selection.from).toBe(beforeFrom);
    expect(editor.state.selection.to).toBe(beforeTo);
    expect(editor.state.doc.textContent).toBe(beforeText);
  });

  it('does not intercept Ctrl/Cmd+ArrowRight near inline SDT boundary', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentTo = sdt.pos + sdt.node.nodeSize - 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentTo - 1)));
    const beforePos = editor.state.selection.from;
    const beforeText = editor.state.doc.textContent;

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, metaKey: true, bubbles: true });
    let handled = false;
    editor.view.someProp('handleKeyDown', (handler) => {
      handled = handler(editor.view, event);
      return handled;
    });

    expect(handled).toBe(false);
    expect(editor.state.selection.from).toBe(beforePos);
    expect(editor.state.doc.textContent).toBe(beforeText);
  });
});
