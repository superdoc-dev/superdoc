import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Toolbar from './Toolbar.vue';

function createMockToolbar() {
  return {
    config: {
      toolbarGroups: ['left', 'center', 'right'],
      toolbarButtonsExclude: [],
    },
    getToolbarItemByGroup: () => [],
    getToolbarItemByName: () => null,
    onToolbarResize: vi.fn(),
    emitCommand: vi.fn(),
    overflowItems: [],
    activeEditor: null,
  };
}

describe('Toolbar', () => {
  it('removes resize and keydown listeners on unmount (not only on KeepAlive deactivate)', () => {
    const mockToolbar = createMockToolbar();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const wrapper = mount(Toolbar, {
      global: {
        stubs: { ButtonGroup: true },
        plugins: [
          (app) => {
            app.config.globalProperties.$toolbar = mockToolbar;
          },
        ],
      },
    });

    const resizeHandler = addSpy.mock.calls.find((c) => c[0] === 'resize')?.[1];
    const keydownHandler = addSpy.mock.calls.find((c) => c[0] === 'keydown')?.[1];
    expect(resizeHandler).toBeTypeOf('function');
    expect(keydownHandler).toBeTypeOf('function');

    removeSpy.mockClear();
    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', resizeHandler);
    expect(removeSpy).toHaveBeenCalledWith('keydown', keydownHandler);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
