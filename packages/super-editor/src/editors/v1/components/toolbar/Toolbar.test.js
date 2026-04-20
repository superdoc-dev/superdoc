import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref, KeepAlive } from 'vue';
import Toolbar from './Toolbar.vue';

const ToolbarKeepAliveHost = defineComponent({
  components: { KeepAlive, Toolbar },
  setup() {
    const visible = ref(true);
    return { visible };
  },
  template: '<KeepAlive><Toolbar v-if="visible" /></KeepAlive>',
});

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('removes window listeners on KeepAlive deactivate and restores them on activate', async () => {
    const mockToolbar = createMockToolbar();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const wrapper = mount(ToolbarKeepAliveHost, {
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

    addSpy.mockClear();
    removeSpy.mockClear();

    wrapper.vm.visible = false;
    await wrapper.vm.$nextTick();

    expect(removeSpy).toHaveBeenCalledWith('resize', resizeHandler);
    expect(removeSpy).toHaveBeenCalledWith('keydown', keydownHandler);

    addSpy.mockClear();
    removeSpy.mockClear();

    wrapper.vm.visible = true;
    await wrapper.vm.$nextTick();

    expect(addSpy).toHaveBeenCalledWith('resize', resizeHandler);
    expect(addSpy).toHaveBeenCalledWith('keydown', keydownHandler);

    removeSpy.mockClear();
    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', resizeHandler);
    expect(removeSpy).toHaveBeenCalledWith('keydown', keydownHandler);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
