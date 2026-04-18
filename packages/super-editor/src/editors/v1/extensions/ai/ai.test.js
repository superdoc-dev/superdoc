import { describe, it, expect, vi, afterEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';

vi.mock('@superdoc/common/icons/dots-loader.svg', () => ({ default: 'dots-loader.svg' }));

import { AiMarkName, AiAnimationMarkName, AiLoaderNodeName } from './ai-constants.js';
import { AiMark, AiAnimationMark } from './ai-marks.js';
import { AiLoaderNode } from './ai-nodes.js';
import { AiPlugin, AiPluginKey } from './ai-plugin.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const createAiSchema = () => {
  const nodes = {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    [AiLoaderNodeName]: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: {},
      toDOM: () => ['span', { class: 'sd-ai-loader' }],
      parseDOM: [{ tag: 'span.sd-ai-loader' }],
    },
  };

  const marks = {
    [AiMarkName]: {
      attrs: { id: { default: null } },
      inclusive: false,
      toDOM: (mark) => [AiMarkName, mark.attrs],
      parseDOM: [{ tag: AiMarkName }],
    },
    [AiAnimationMarkName]: {
      attrs: { id: { default: null }, class: { default: null }, dataMarkId: { default: null } },
      inclusive: false,
      toDOM: (mark) => [AiAnimationMarkName, mark.attrs],
      parseDOM: [{ tag: AiAnimationMarkName }],
    },
  };

  return new Schema({ nodes, marks });
};

const createStateWithAiMark = (schema) => {
  const mark = schema.marks[AiMarkName].create({ id: 'ai-highlight' });
  const paragraph = schema.nodes.paragraph.create(null, schema.text('Hello', [mark]));
  const doc = schema.nodes.doc.create(null, [paragraph]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 6),
  });
};

describe('ai marks and nodes', () => {
  it('renders loader node with embedded image', () => {
    const span = AiLoaderNode.config.renderDOM.call(AiLoaderNode, { htmlAttributes: { 'data-role': 'loader' } });
    expect(span.tagName).toBe('SPAN');
    expect(span.getAttribute('data-role')).toBe('loader');
    const img = span.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('dots-loader.svg');
  });

  it('merges attributes when rendering marks', () => {
    const markDom = AiMark.config.renderDOM.call(AiMark, { htmlAttributes: { 'data-id': 'mark-1' } });
    expect(markDom[0]).toBe(AiMarkName);
    expect(markDom[1]).toMatchObject({ class: 'sd-ai-highlight', 'data-id': 'mark-1' });

    const animationDom = AiAnimationMark.config.renderDOM.call(AiAnimationMark, {
      htmlAttributes: { class: 'pulse', dataMarkId: '123' },
    });
    expect(animationDom[0]).toBe(AiAnimationMarkName);
    expect(animationDom[1]).toMatchObject({ class: 'pulse', dataMarkId: '123' });
  });
});

describe('ai plugin commands', () => {
  const setup = () => {
    const schema = createAiSchema();
    const state = createStateWithAiMark(schema);
    const editor = { schema };
    const commands = AiPlugin.config.addCommands.call({ editor });
    return { schema, state, editor, commands };
  };

  it('inserts AI mark when selection is non-empty', () => {
    const { state, commands, schema } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    const result = commands.insertAiMark()({ tr, dispatch });
    expect(result).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(tr);
    const applied = state.apply(tr);
    const mark = applied.doc.nodeAt(1).marks.find((m) => m.type === schema.marks[AiMarkName]);
    expect(mark).toBeDefined();
  });

  it('ignores insert command for empty selection', () => {
    const { schema, commands } = setup();
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('Hello')])]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1, 1) });
    const tr = state.tr;
    const dispatch = vi.fn();
    expect(commands.insertAiMark()({ tr, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('collapses selection after AI pulse', () => {
    const { state, commands } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();
    const result = commands.removeSelectionAfterAiPulse()({ tr, dispatch, state });
    expect(result).toBe(true);
    expect(tr.selection.from).toBe(tr.selection.to);
  });

  it('updates and clears highlight styling through meta transactions', () => {
    const { state, commands } = setup();
    const tr = state.tr;
    const dispatch = vi.fn();

    commands.updateAiHighlightStyle('pulse')({ tr, dispatch });
    expect(tr.getMeta(AiPluginKey)).toEqual({ type: 'updateStyle', className: 'pulse' });

    const clearTr = state.tr;
    commands.clearAiHighlightStyle()({ tr: clearTr, dispatch });
    expect(clearTr.getMeta(AiPluginKey)).toEqual({ type: 'updateStyle', className: null });
  });

  it('removes AI marks by name and deletes animation marks', () => {
    const { schema, state, commands } = setup();
    const animationMark = schema.marks[AiAnimationMarkName].create({ id: 'anim-1' });
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Animated', [animationMark])]),
    ]);
    const animState = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1, 9) });
    const animTr = animState.tr;
    const dispatch = vi.fn();

    const removed = commands.removeAiMark(AiAnimationMarkName)({ tr: animTr, dispatch, state: animState });
    expect(removed).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(animTr);
    const appliedAnim = animState.apply(animTr);
    const remainingMarks = appliedAnim.doc.nodeAt(1).marks.filter((m) => m.type === schema.marks[AiAnimationMarkName]);
    expect(remainingMarks).toHaveLength(0);

    const removeTr = state.tr;
    const removeDispatch = vi.fn();
    commands.removeAiMark()({ tr: removeTr, dispatch: removeDispatch, state });
    expect(removeDispatch).toHaveBeenCalledWith(removeTr);
  });

  it('removes AI loader nodes from the document', () => {
    const schema = createAiSchema();
    const loader = schema.nodes[AiLoaderNodeName].create();
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [loader, schema.text('Hello')]),
      schema.nodes.paragraph.create(null, [schema.nodes[AiLoaderNodeName].create()]),
    ]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1, 6) });
    const editor = { schema };
    const commands = AiPlugin.config.addCommands.call({ editor });

    const tr = state.tr;
    const dispatch = vi.fn();
    const removed = commands.removeAiNode()({ tr, dispatch, state });

    expect(removed).toBe(true);
    const applied = state.apply(tr);
    let loaderCount = 0;
    applied.doc.descendants((node) => {
      if (node.type === schema.nodes[AiLoaderNodeName]) loaderCount += 1;
    });
    expect(loaderCount).toBe(0);
  });
});

describe('ai plugin prosemirror plugin', () => {
  it('tracks highlight decorations and custom classes', () => {
    const schema = createAiSchema();
    const state = createStateWithAiMark(schema);
    const editor = { schema };

    const [plugin] = AiPlugin.config.addPmPlugins.call({ editor });
    const initial = plugin.spec.state.init();

    const metaTr = state.tr;
    metaTr.setMeta(AiPluginKey, { type: 'updateStyle', className: 'sd-ai-highlight-pulse' });
    const metaState = state.apply(metaTr);
    const pluginState = plugin.spec.state.apply(metaTr, initial, state, metaState);

    expect(pluginState.customClass).toBe('sd-ai-highlight-pulse');
    expect(pluginState.decorations).toBeInstanceOf(DecorationSet);

    const insertTr = state.tr.insertText('!', 1, 1);
    const clearedState = plugin.spec.state.apply(insertTr, pluginState, state, state.apply(insertTr));
    expect(clearedState.customClass).toBeNull();
  });
});
