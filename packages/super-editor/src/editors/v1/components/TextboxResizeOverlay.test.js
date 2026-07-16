import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TextboxResizeOverlay from './TextboxResizeOverlay.vue';

vi.mock('@superdoc/layout-bridge', () => ({
  measureCache: {
    invalidate: vi.fn(),
  },
  invalidateHeaderFooterMeasureCache: vi.fn(),
}));

function createMockEditor(overrides = {}) {
  const shapeNode = {
    type: { name: 'shapeContainer' },
    attrs: { width: 120, height: 60, marginOffset: { horizontal: 50, top: 80 } },
    marks: [],
  };
  const paragraphNode = {
    isBlock: true,
    type: { name: 'paragraph', spec: { attrs: { sdBlockId: {}, sdBlockRev: {} } } },
    attrs: { sdBlockRev: 3 },
  };

  const tr = {
    setNodeAttribute: vi.fn().mockReturnThis(),
  };

  return {
    options: { documentMode: 'editing' },
    isEditable: true,
    state: {
      doc: {
        resolve: vi.fn(() => ({
          depth: 1,
          node: () => paragraphNode,
          before: () => 0,
        })),
      },
      selection: {
        from: 10,
        node: shapeNode,
      },
      tr,
    },
    view: {
      dom: document.createElement('div'),
      dispatch: vi.fn(),
    },
    ...overrides,
  };
}

function createTextboxElement() {
  const editorShell = document.createElement('div');
  editorShell.className = 'super-editor';
  const textboxEl = document.createElement('div');
  textboxEl.setAttribute('data-block-id', 'textbox-block');
  const contentSpan = document.createElement('span');
  contentSpan.setAttribute('data-pm-start', '10');
  textboxEl.appendChild(contentSpan);
  editorShell.appendChild(textboxEl);
  document.body.appendChild(editorShell);

  textboxEl.getBoundingClientRect = vi.fn(() => ({
    left: 10,
    top: 20,
    width: 120,
    height: 60,
    right: 130,
    bottom: 80,
    x: 10,
    y: 20,
    toJSON: () => {},
  }));

  editorShell.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => {},
  }));

  return {
    textboxEl,
    remove: () => editorShell.remove(),
  };
}

describe('TextboxResizeOverlay', () => {
  it('renders four resize handles for a visible textbox selection', () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    expect(wrapper.findAll('.resize-handle')).toHaveLength(4);

    wrapper.unmount();
    remove();
  });

  it('dispatches width and height updates for shapeContainer resize', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    const handle = wrapper.find('.resize-handle--se');
    await handle.trigger('mousedown', { clientX: 130, clientY: 80 });

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 190, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 190, clientY: 120 }));

    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'width', 180);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'height', 100);
    expect(editor.view.dispatch).toHaveBeenCalledWith(editor.state.tr);

    wrapper.unmount();
    remove();
  });

  it('NW resize: shifts marginOffset origin up-left by the same delta as the size growth', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    // textboxEl is 120×60 at clientRect (10,20). NW handle is top-left corner.
    // Drag NW by (-30, -20): cursor moves upper-left → shape grows to 150×80.
    const handle = wrapper.find('.resize-handle--nw');
    await handle.trigger('mousedown', { clientX: 10, clientY: 20 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -20, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: -20, clientY: 0 }));

    // width grows by 30 → horizontal shifts left by 30: 50 - 30 = 20
    // height grows by 20 → top shifts up by 20: 80 - 20 = 60
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'width', 150);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'height', 80);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'marginOffset', { horizontal: 20, top: 60 });

    wrapper.unmount();
    remove();
  });

  it('SW resize: shifts only horizontal origin, top stays fixed', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    // SW handle: drag left by 20, down by 15 → width grows 20, height grows 15.
    const handle = wrapper.find('.resize-handle--sw');
    await handle.trigger('mousedown', { clientX: 10, clientY: 80 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -10, clientY: 95 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: -10, clientY: 95 }));

    // horizontal: 50 - 20 = 30, top stays 80
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'width', 140);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'height', 75);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'marginOffset', { horizontal: 30, top: 80 });

    wrapper.unmount();
    remove();
  });

  it('NE resize: shifts only top origin, horizontal stays fixed', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    // NE handle: drag right by 25, up by 10 → width grows 25, height grows 10.
    const handle = wrapper.find('.resize-handle--ne');
    await handle.trigger('mousedown', { clientX: 130, clientY: 20 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 155, clientY: 10 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 155, clientY: 10 }));

    // horizontal stays 50, top: 80 - 10 = 70
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'width', 145);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'height', 70);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'marginOffset', { horizontal: 50, top: 70 });

    wrapper.unmount();
    remove();
  });

  it('SE resize: does not modify marginOffset', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    const handle = wrapper.find('.resize-handle--se');
    await handle.trigger('mousedown', { clientX: 130, clientY: 80 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 190, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 190, clientY: 120 }));

    expect(editor.state.tr.setNodeAttribute).not.toHaveBeenCalledWith(10, 'marginOffset', expect.anything());

    wrapper.unmount();
    remove();
  });

  it('dispatches marginOffset update when dragging overlay body', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    // Mousedown on overlay body (not a handle)
    await wrapper.trigger('mousedown', { clientX: 50, clientY: 50 });

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, clientY: 60 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 80, clientY: 60 }));

    // marginOffset.horizontal += 30, marginOffset.top += 10
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(10, 'marginOffset', { horizontal: 80, top: 90 });
    expect(editor.view.dispatch).toHaveBeenCalledWith(editor.state.tr);

    wrapper.unmount();
    remove();
  });

  it('skips move dispatch when drag delta is below threshold', async () => {
    const editor = createMockEditor();
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    await wrapper.trigger('mousedown', { clientX: 50, clientY: 50 });
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 51, clientY: 51 }));

    expect(editor.state.tr.setNodeAttribute).not.toHaveBeenCalledWith(10, 'marginOffset', expect.anything());

    wrapper.unmount();
    remove();
  });

  it('falls back to DOM position markers when NodeSelection is unavailable on mouseup', async () => {
    const editor = createMockEditor({
      state: {
        doc: {
          resolve: vi.fn(() => ({
            depth: 2,
            node: (depth) =>
              depth === 2
                ? { type: { name: 'shapeContainer' }, attrs: { width: 120, height: 60 } }
                : {
                    isBlock: true,
                    type: { name: 'paragraph', spec: { attrs: { sdBlockId: {}, sdBlockRev: {} } } },
                    attrs: { sdBlockRev: 7 },
                  },
            before: (depth) => (depth === 2 ? 24 : 5),
          })),
        },
        selection: {
          from: 10,
          node: { type: { name: 'shapeContainer' }, attrs: { width: 120, height: 60 } },
        },
        tr: {
          setNodeAttribute: vi.fn().mockReturnThis(),
        },
      },
    });
    const { textboxEl, remove } = createTextboxElement();

    const wrapper = mount(TextboxResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, textboxElement: textboxEl },
    });

    const handle = wrapper.find('.resize-handle--se');
    await handle.trigger('mousedown', { clientX: 130, clientY: 80 });

    editor.state.selection = { from: 1, node: null };

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 170, clientY: 110 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 170, clientY: 110 }));

    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(24, 'width', 160);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(24, 'height', 90);
    expect(editor.state.tr.setNodeAttribute).toHaveBeenCalledWith(5, 'sdBlockRev', 8);
    expect(editor.view.dispatch).toHaveBeenCalledWith(editor.state.tr);

    wrapper.unmount();
    remove();
  });
});
