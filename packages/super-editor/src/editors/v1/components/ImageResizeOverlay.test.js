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
  });
});
