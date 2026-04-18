import { describe, it, expect, vi, afterEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { NodeResizer, NodeResizerKey } from './noderesizer.js';

describe('NodeResizer extension', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips plugin registration when running headless', () => {
    const factory = NodeResizer.config.addPmPlugins;
    const plugins = factory.call({ editor: { options: { isHeadless: true } } });
    expect(plugins).toEqual([]);
  });

  it('produces resize decorations when an image node is selected', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'editing' },
      isEditable: true,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });
    expect(plugin).toBeDefined();

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        image: {
          group: 'block',
          inline: false,
          selectable: true,
          draggable: true,
          attrs: { size: { default: { width: 120, height: 60 } } },
          toDOM: (node) => ['img', { 'data-width': node.attrs.size.width }],
          parseDOM: [{ tag: 'img', getAttrs: () => ({}) }],
        },
      },
    });

    const imageNode = schema.nodes.image.create();
    const doc = schema.node('doc', null, [imageNode]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const selection = NodeSelection.create(doc, 0);
    const nextState = state.apply(state.tr.setSelection(selection));

    const decorations = plugin.getState(nextState);
    expect(decorations.find()).toHaveLength(1);
    const [decoration] = decorations.find();
    expect(decoration.type.attrs.class).toBe('sd-editor-resizable-wrapper');

    const skipState = nextState.apply(nextState.tr.setMeta(NodeResizerKey, { action: 'resize' }));
    expect(plugin.getState(skipState)).toBe(decorations);
  });

  it('installs global handlers and applies resize on mouse interactions', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'editing' },
      isEditable: true,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });

    const addDocumentSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentSpy = vi.spyOn(document, 'removeEventListener');
    const addWindowSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowSpy = vi.spyOn(window, 'removeEventListener');

    const pos = 10;
    const resizableElement = document.createElement('img');
    resizableElement.style.width = '120px';
    resizableElement.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 120,
      height: 60,
    });

    const node = { attrs: { size: { width: 120, height: 60 } }, type: { name: 'image' } };
    const tr = {
      doc: { nodeAt: vi.fn().mockReturnValue(node) },
      setNodeMarkup: vi.fn().mockImplementation(() => tr),
      setMeta: vi.fn().mockImplementation(() => tr),
    };

    const view = {
      state: {
        selection: { from: pos, to: pos + 1, node },
        doc: { content: { size: pos + 2 } },
        tr,
      },
      hasFocus: vi.fn().mockReturnValue(true),
      nodeDOM: vi.fn().mockReturnValue(resizableElement),
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    const lifecycle = plugin.spec.view(view);

    const clickHandler = addDocumentSpy.mock.calls.find(([event]) => event === 'click')[1];
    const mousedownHandler = addDocumentSpy.mock.calls.find(([event]) => event === 'mousedown')[1];
    const scrollHandler = addWindowSpy.mock.calls.find(([event]) => event === 'scroll')[1];

    expect(typeof clickHandler).toBe('function');
    expect(typeof mousedownHandler).toBe('function');
    expect(typeof scrollHandler).toBe('function');

    const handle = document.createElement('div');
    handle.className = 'sd-editor-resize-handle sd-editor-resize-handle-se';
    handle.setAttribute('data-handle', 'se');
    handle.setAttribute('data-pos', String(pos));
    document.body.appendChild(handle);

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 150, clientY: 200 }));
    expect(view.hasFocus).toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('nwse-resize');

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 210, clientY: 200 }));
    expect(resizableElement.style.width).toBe('180px');
    expect(resizableElement.style.height).toBe('auto');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 210, clientY: 200 }));
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(pos, null, {
      ...node.attrs,
      size: { width: 180, height: 90 },
    });
    expect(tr.setMeta).toHaveBeenCalledWith(NodeResizerKey, { action: 'resize' });
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    lifecycle.destroy();
    expect(removeDocumentSpy).toHaveBeenCalledWith('click', clickHandler);
    expect(removeDocumentSpy).toHaveBeenCalledWith('mousedown', mousedownHandler);
    expect(removeWindowSpy).toHaveBeenCalledWith('scroll', scrollHandler, true);

    document.body.removeChild(handle);
  });

  it('should not create resize decorations when document is in view mode', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'viewing' },
      isEditable: false,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        image: {
          group: 'block',
          inline: false,
          selectable: true,
          draggable: true,
          attrs: { size: { default: { width: 120, height: 60 } } },
          toDOM: (node) => ['img', { 'data-width': node.attrs.size.width }],
          parseDOM: [{ tag: 'img', getAttrs: () => ({}) }],
        },
      },
    });

    const imageNode = schema.nodes.image.create();
    const doc = schema.node('doc', null, [imageNode]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const selection = NodeSelection.create(doc, 0);
    const nextState = state.apply(state.tr.setSelection(selection));

    const decorations = plugin.getState(nextState);
    expect(decorations.find()).toHaveLength(0);
  });

  it('should not create resize decorations when editor is not editable', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'editing' },
      isEditable: false,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        image: {
          group: 'block',
          inline: false,
          selectable: true,
          draggable: true,
          attrs: { size: { default: { width: 120, height: 60 } } },
          toDOM: (node) => ['img', { 'data-width': node.attrs.size.width }],
          parseDOM: [{ tag: 'img', getAttrs: () => ({}) }],
        },
      },
    });

    const imageNode = schema.nodes.image.create();
    const doc = schema.node('doc', null, [imageNode]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const selection = NodeSelection.create(doc, 0);
    const nextState = state.apply(state.tr.setSelection(selection));

    const decorations = plugin.getState(nextState);
    expect(decorations.find()).toHaveLength(0);
  });

  it('should not create resize decorations for watermark images (vmlWatermark: true)', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'editing' },
      isEditable: true,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        image: {
          group: 'block',
          inline: false,
          selectable: true,
          draggable: true,
          attrs: {
            size: { default: { width: 120, height: 60 } },
            vmlWatermark: { default: false },
          },
          toDOM: (node) => ['img', { 'data-width': node.attrs.size.width }],
          parseDOM: [{ tag: 'img', getAttrs: () => ({}) }],
        },
      },
    });

    // Create a watermark image node
    const watermarkNode = schema.nodes.image.create({ vmlWatermark: true });
    const doc = schema.node('doc', null, [watermarkNode]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const selection = NodeSelection.create(doc, 0);
    const nextState = state.apply(state.tr.setSelection(selection));

    const decorations = plugin.getState(nextState);
    expect(decorations.find()).toHaveLength(0);
  });

  it('should create resize decorations for regular images (vmlWatermark: false or undefined)', () => {
    const editor = {
      options: { isHeadless: false, documentMode: 'editing' },
      isEditable: true,
    };
    const [plugin] = NodeResizer.config.addPmPlugins.call({ editor });

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        text: { group: 'inline' },
        image: {
          group: 'block',
          inline: false,
          selectable: true,
          draggable: true,
          attrs: {
            size: { default: { width: 120, height: 60 } },
            vmlWatermark: { default: false },
          },
          toDOM: (node) => ['img', { 'data-width': node.attrs.size.width }],
          parseDOM: [{ tag: 'img', getAttrs: () => ({}) }],
        },
      },
    });

    // Create a regular image node (not a watermark)
    const regularNode = schema.nodes.image.create({ vmlWatermark: false });
    const doc = schema.node('doc', null, [regularNode]);
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const selection = NodeSelection.create(doc, 0);
    const nextState = state.apply(state.tr.setSelection(selection));

    const decorations = plugin.getState(nextState);
    expect(decorations.find()).toHaveLength(1);
  });
});
