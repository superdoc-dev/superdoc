import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImageResizeOverlay from './ImageResizeOverlay.vue';

vi.mock('@superdoc/layout-bridge', () => ({
  measureCache: {
    invalidate: vi.fn(),
  },
}));

function createMockEditor(overrides = {}) {
  return {
    options: { documentMode: 'editing' },
    isEditable: true,
    view: {
      dom: document.createElement('div'),
      state: { doc: { nodeAt: vi.fn() }, tr: { setNodeMarkup: vi.fn().mockReturnThis() } },
      dispatch: vi.fn(),
    },
    ...overrides,
  };
}

function createResizableImageElement({ lockMode, ancestorLockMode } = {}) {
  const imageEl = document.createElement('div');
  imageEl.setAttribute('data-pm-start', '0');
  imageEl.setAttribute('data-sd-block-id', 'image-block');
  imageEl.setAttribute(
    'data-image-metadata',
    JSON.stringify({
      originalWidth: 100,
      originalHeight: 50,
      maxWidth: 500,
      maxHeight: 500,
      aspectRatio: 2,
      minWidth: 20,
      minHeight: 20,
    }),
  );
  if (lockMode) {
    imageEl.setAttribute('data-lock-mode', lockMode);
  }
  imageEl.getBoundingClientRect = vi.fn(() => ({
    left: 10,
    top: 20,
    width: 100,
    height: 50,
    right: 110,
    bottom: 70,
    x: 10,
    y: 20,
    toJSON: () => {},
  }));

  if (!ancestorLockMode) {
    document.body.appendChild(imageEl);
    return { imageEl, remove: () => imageEl.remove() };
  }

  const sdtEl = document.createElement('div');
  sdtEl.className = 'superdoc-structured-content-block';
  sdtEl.setAttribute('data-lock-mode', ancestorLockMode);
  sdtEl.appendChild(imageEl);
  document.body.appendChild(sdtEl);
  return { imageEl, remove: () => sdtEl.remove() };
}

describe('ImageResizeOverlay', () => {
  describe('isResizeDisabled guard', () => {
    it('should report resize disabled when documentMode is viewing', () => {
      const editor = createMockEditor({ options: { documentMode: 'viewing' }, isEditable: false });
      const imageEl = document.createElement('div');

      const wrapper = mount(ImageResizeOverlay, {
        props: { editor, visible: true, imageElement: imageEl },
      });

      expect(wrapper.vm.isResizeDisabled).toBe(true);
    });

    it('should report resize disabled when editor is not editable', () => {
      const editor = createMockEditor({ isEditable: false });
      const imageEl = document.createElement('div');

      const wrapper = mount(ImageResizeOverlay, {
        props: { editor, visible: true, imageElement: imageEl },
      });

      expect(wrapper.vm.isResizeDisabled).toBe(true);
    });

    it('should not report resize disabled in editing mode', () => {
      const editor = createMockEditor();
      const imageEl = document.createElement('div');

      const wrapper = mount(ImageResizeOverlay, {
        props: { editor, visible: true, imageElement: imageEl },
      });

      expect(wrapper.vm.isResizeDisabled).toBe(false);
    });

    it('should report resize disabled for images inside content-locked SDTs', () => {
      const editor = createMockEditor();
      const { imageEl, remove } = createResizableImageElement({ ancestorLockMode: 'contentLocked' });

      const wrapper = mount(ImageResizeOverlay, {
        props: { editor, visible: true, imageElement: imageEl },
      });

      expect(wrapper.vm.isResizeDisabled).toBe(true);

      wrapper.unmount();
      remove();
    });

    it('should report resize disabled when an outer SDT is content-locked even if the image has an unlocked lock mode', () => {
      const editor = createMockEditor();
      const { imageEl, remove } = createResizableImageElement({
        lockMode: 'unlocked',
        ancestorLockMode: 'contentLocked',
      });

      const wrapper = mount(ImageResizeOverlay, {
        props: { editor, visible: true, imageElement: imageEl },
      });

      expect(wrapper.vm.isResizeDisabled).toBe(true);

      wrapper.unmount();
      remove();
    });
  });

  it.each(['contentLocked', 'sdtContentLocked'])(
    'should not start image resize drag inside %s SDTs',
    async (lockMode) => {
      const editor = createMockEditor();
      const { imageEl, remove } = createResizableImageElement({ ancestorLockMode: lockMode });

      const wrapper = mount(ImageResizeOverlay, {
        attachTo: document.body,
        props: { editor, visible: true, imageElement: imageEl },
      });
      await wrapper.vm.$nextTick();

      const handle = wrapper.find('[data-handle-position="se"]');
      await handle.trigger('mousedown', { clientX: 110, clientY: 70 });
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 90 }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 90 }));
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.dragState).toBe(null);
      expect(wrapper.find('.resize-guideline').exists()).toBe(false);
      expect(editor.view.dispatch).not.toHaveBeenCalled();
      expect(editor.view.state.tr.setNodeMarkup).not.toHaveBeenCalled();

      wrapper.unmount();
      remove();
    },
  );

  it('should not start image resize drag when the image element has contentLocked mode directly', async () => {
    const editor = createMockEditor();
    const { imageEl, remove } = createResizableImageElement({ lockMode: 'contentLocked' });

    const wrapper = mount(ImageResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, imageElement: imageEl },
    });
    await wrapper.vm.$nextTick();

    const handle = wrapper.find('[data-handle-position="se"]');
    await handle.trigger('mousedown', { clientX: 110, clientY: 70 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 90 }));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dragState).toBe(null);
    expect(wrapper.find('.resize-guideline').exists()).toBe(false);
    expect(editor.view.dispatch).not.toHaveBeenCalled();

    wrapper.unmount();
    remove();
  });

  it('should still allow image resize inside sdtLocked SDTs', async () => {
    const editor = createMockEditor();
    const imageNode = {
      type: { name: 'image' },
      attrs: { size: { width: 100, height: 50 } },
    };
    editor.view.state.doc.nodeAt.mockReturnValue(imageNode);
    const { imageEl, remove } = createResizableImageElement({ ancestorLockMode: 'sdtLocked' });

    const wrapper = mount(ImageResizeOverlay, {
      attachTo: document.body,
      props: { editor, visible: true, imageElement: imageEl },
    });
    await wrapper.vm.$nextTick();

    const handle = wrapper.find('[data-handle-position="se"]');
    await handle.trigger('mousedown', { clientX: 110, clientY: 70 });
    expect(wrapper.vm.dragState).not.toBe(null);
    expect(wrapper.find('.resize-guideline').exists()).toBe(true);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 90 }));

    expect(editor.view.state.tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      null,
      expect.objectContaining({ size: { width: 140, height: 70 } }),
    );
    expect(editor.view.dispatch).toHaveBeenCalledWith(editor.view.state.tr);

    wrapper.unmount();
    remove();
  });

  it('should dispatch resize transactions through the presentation editor active editor', async () => {
    const bodyEditor = createMockEditor();
    const headerFooterEditor = createMockEditor();
    const imageNode = {
      type: { name: 'image' },
      attrs: { size: { width: 100, height: 50 } },
    };
    headerFooterEditor.view.state.doc.nodeAt.mockReturnValue(imageNode);
    bodyEditor.view.state.doc.nodeAt.mockReturnValue(null);

    const imageEl = document.createElement('div');
    imageEl.setAttribute('data-pm-start', '0');
    imageEl.setAttribute('data-sd-block-id', 'header-image');
    imageEl.setAttribute(
      'data-image-metadata',
      JSON.stringify({
        originalWidth: 100,
        originalHeight: 50,
        maxWidth: 500,
        maxHeight: 500,
        aspectRatio: 2,
        minWidth: 20,
        minHeight: 20,
      }),
    );
    imageEl.getBoundingClientRect = vi.fn(() => ({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      right: 110,
      bottom: 70,
      x: 10,
      y: 20,
      toJSON: () => {},
    }));
    document.body.appendChild(imageEl);

    const presentationEditor = {
      view: bodyEditor.view,
      getActiveEditor: vi.fn(() => headerFooterEditor),
    };

    const wrapper = mount(ImageResizeOverlay, {
      attachTo: document.body,
      props: { editor: presentationEditor, visible: true, imageElement: imageEl },
    });
    await wrapper.vm.$nextTick();

    const handle = wrapper.find('[data-handle-position="se"]');
    await handle.trigger('mousedown', { clientX: 110, clientY: 70 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 90 }));

    expect(headerFooterEditor.view.state.doc.nodeAt).toHaveBeenCalledWith(0);
    expect(bodyEditor.view.state.doc.nodeAt).not.toHaveBeenCalled();
    expect(headerFooterEditor.view.state.tr.setNodeMarkup).toHaveBeenCalledWith(
      0,
      null,
      expect.objectContaining({ size: { width: 140, height: 70 } }),
    );
    expect(headerFooterEditor.view.dispatch).toHaveBeenCalledWith(headerFooterEditor.view.state.tr);
    expect(bodyEditor.view.dispatch).not.toHaveBeenCalled();

    wrapper.unmount();
    imageEl.remove();
  });
});
