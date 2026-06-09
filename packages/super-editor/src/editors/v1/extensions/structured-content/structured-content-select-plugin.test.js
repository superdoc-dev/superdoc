import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { SELECT_INLINE_SDT_BEFORE_RUN_START_META } from '@core/commands/selectInlineSdtBeforeRunStart.js';
import { createStructuredContentSelectPlugin } from './structured-content-select-plugin.js';

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

  function pressArrow(key) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    let handled = false;
    editor.view.someProp('handleKeyDown', (handler) => {
      handled = handler(editor.view, event);
      return handled;
    });
    return handled;
  }

  it('keeps inline SDT content clicks collapsed in editing mode', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom + 1)));

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(contentFrom + 1);
    expect(editor.state.selection.to).toBe(contentFrom + 1);
  });

  it('keeps Backspace-created inline SDT node selections when the meta escape is set', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const afterSdt = sdt.pos + sdt.node.nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, afterSdt)));

    editor.view.dispatch(
      editor.state.tr
        .setMeta(SELECT_INLINE_SDT_BEFORE_RUN_START_META, true)
        .setSelection(NodeSelection.create(editor.state.doc, sdt.pos)),
    );

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(sdt.pos);
    expect(editor.state.selection.to).toBe(sdt.pos + sdt.node.nodeSize);
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

  it('exits inline SDT with one ArrowRight when only trailing ZWSP slots remain', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field\u200B\u200B'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    const afterVisibleText = contentFrom + 'Field'.length;
    const afterSdt = sdt.pos + sdt.node.nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, afterVisibleText)));

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));

    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(afterSdt);
    expect(editor.state.selection.to).toBe(afterSdt);
  });

  it('does not exit inline SDT with ArrowRight when a trailing inline leaf remains before ZWSP slots', () => {
    const image = schema.nodes.image.create({ src: 'image.png' });
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, [image, schema.text('\u200B')]);
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentFrom = sdt.pos + 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentFrom)));
    const beforePos = editor.state.selection.from;

    expect(pressArrow('ArrowRight')).toBe(false);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(beforePos);
  });

  it('does not exit inline SDT with ArrowLeft when a leading inline leaf remains after ZWSP slots', () => {
    const image = schema.nodes.image.create({ src: 'image.png' });
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, [schema.text('\u200B'), image]);
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('A '), inlineSdt, schema.text(' Z')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const contentTo = sdt.pos + sdt.node.nodeSize - 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, contentTo)));
    const beforePos = editor.state.selection.from;

    expect(pressArrow('ArrowLeft')).toBe(false);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(beforePos);
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

  it('moves back inside an empty inline SDT with ArrowLeft from its trailing boundary', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' });
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('Lead '), inlineSdt, schema.text(' trail')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const insideSdt = sdt.pos + 1;
    const afterSdt = sdt.pos + sdt.node.nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, afterSdt)));

    const handled = pressArrow('ArrowLeft');

    expect(handled).toBe(true);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(insideSdt);
    expect(editor.state.selection.to).toBe(insideSdt);
  });

  it('does not scan the document for empty inline SDT entry on ArrowRight', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' });
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('Lead '), inlineSdt, schema.text(' trail')]);
    applyDoc(schema.nodes.doc.create(null, [paragraph]));

    const sdt = findNode(editor.state.doc, 'structuredContent');
    expect(sdt).not.toBeNull();

    const afterSdt = sdt.pos + sdt.node.nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, afterSdt)));

    const descendants = editor.state.doc.descendants.bind(editor.state.doc);
    const descendantsSpy = vi.fn(descendants);
    editor.state.doc.descendants = descendantsSpy;

    const plugin = createStructuredContentSelectPlugin(editor);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });

    expect(plugin.props.handleKeyDown(editor.view, event)).toBe(false);
    expect(descendantsSpy).not.toHaveBeenCalled();
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

  it('does not collapse a parent block selection that contains an inline SDT', () => {
    const inlineSdt = schema.nodes.structuredContent.create({ id: 'inline-1' }, schema.text('Field'));
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('Before '), inlineSdt, schema.text(' after')]);
    const blockSdt = schema.nodes.structuredContentBlock.create({ id: 'block-1' }, [paragraph]);
    applyDoc(schema.nodes.doc.create(null, [blockSdt]));

    const inline = findNode(editor.state.doc, 'structuredContent');
    const block = findNode(editor.state.doc, 'structuredContentBlock');
    expect(inline).not.toBeNull();
    expect(block).not.toBeNull();

    let textFrom = null;
    let textTo = null;
    block.node.descendants((node, pos) => {
      if (!node.isText) return true;
      const textPos = block.pos + 1 + pos;
      textFrom ??= textPos;
      textTo = textPos + node.nodeSize;
      return true;
    });

    expect(textFrom).not.toBeNull();
    expect(textTo).not.toBeNull();

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textFrom)));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textFrom, textTo)));

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.from).toBe(textFrom);
    expect(editor.state.selection.to).toBe(textTo);
    expect(editor.state.selection.from).not.toBe(inline.pos);
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
