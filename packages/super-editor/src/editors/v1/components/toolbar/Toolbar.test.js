import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref, nextTick, KeepAlive } from 'vue';
import { EventEmitter } from 'eventemitter3';
import Toolbar from './Toolbar.vue';

const ToolbarKeepAliveHost = defineComponent({
  components: { KeepAlive, Toolbar },
  setup() {
    const visible = ref(true);
    return { visible };
  },
  template: '<KeepAlive><Toolbar v-if="visible" /></KeepAlive>',
});

// The real SuperToolbar is an EventEmitter; model that so Toolbar.vue can subscribe to
// `toolbar-items-changed` (and tests can dispatch it).
function createMockToolbar() {
  return Object.assign(new EventEmitter(), {
    config: {
      toolbarGroups: ['left', 'center', 'right'],
      toolbarButtonsExclude: [],
      responsiveToContainer: false,
    },
    getToolbarItemByGroup: () => [],
    getToolbarItemByName: () => null,
    getAvailableWidth: () => 1200,
    onToolbarResize: vi.fn(),
    emitCommand: vi.fn(),
    overflowItems: [],
    activeEditor: null,
  });
}

describe('Toolbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('does not restore selection when active editor is header/footer', async () => {
    const restoreSelection = vi.fn();
    const mockToolbar = createMockToolbar();
    mockToolbar.activeEditor = {
      options: { isHeaderOrFooter: true },
      commands: { restoreSelection },
    };

    const ButtonGroupStub = defineComponent({
      emits: ['item-clicked'],
      template: '<button data-test="emit-item-clicked" @click="$emit(\'item-clicked\')">emit</button>',
    });

    const wrapper = mount(Toolbar, {
      global: {
        stubs: { ButtonGroup: ButtonGroupStub },
        plugins: [
          (app) => {
            app.config.globalProperties.$toolbar = mockToolbar;
          },
        ],
      },
    });

    await wrapper.find('[data-test="emit-item-clicked"]').trigger('click');
    expect(restoreSelection).not.toHaveBeenCalled();
  });

  it('does not attach ResizeObserver when responsiveToContainer is disabled', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const ResizeObserverMock = vi.fn(() => ({ observe, disconnect }));
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    const mockToolbar = {
      ...createMockToolbar(),
      toolbarContainer: document.createElement('div'),
    };

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

    expect(ResizeObserverMock).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('attaches ResizeObserver to the container when responsiveToContainer is enabled', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const ResizeObserverMock = vi.fn(() => ({ observe, disconnect }));
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    const container = document.createElement('div');
    const mockToolbar = {
      ...createMockToolbar(),
      config: { ...createMockToolbar().config, responsiveToContainer: true },
      toolbarContainer: container,
    };

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

    expect(ResizeObserverMock).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(container);
    expect(disconnect).not.toHaveBeenCalled();

    wrapper.unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('re-renders the toolbar DOM when SuperToolbar reports rebuilt items (toolbar-items-changed)', async () => {
    // toolbarItems is a plain field SuperToolbar swaps on rebuild; only a re-render re-reads it. The mock
    // returns whatever `center.items` currently holds, so a "rebuild" is just reassigning that array.
    const center = { items: [{ name: { value: 'fontFamily' } }] };
    const mockToolbar = createMockToolbar();
    mockToolbar.config.toolbarGroups = ['center']; // render only the center group: one unambiguous ButtonGroup
    mockToolbar.getToolbarItemByGroup = (position) => (position === 'center' ? center.items : []);

    const ButtonGroupStub = defineComponent({
      props: ['toolbarItems', 'overflowItems', 'compactSideGroups', 'uiFontFamily', 'position'],
      template:
        '<div><span class="bg-item" v-for="i in toolbarItems" :key="i.name.value">{{ i.name.value }}</span></div>',
    });

    const wrapper = mount(Toolbar, {
      global: {
        stubs: { ButtonGroup: ButtonGroupStub },
        plugins: [
          (app) => {
            app.config.globalProperties.$toolbar = mockToolbar;
          },
        ],
      },
    });

    const renderedItems = () => wrapper.findAll('.bg-item').map((w) => w.text());
    expect(renderedItems()).toEqual(['fontFamily']);

    // A rebuild swaps in a new array (e.g. a document font resolved).
    center.items = [{ name: { value: 'fontFamily' } }, { name: { value: 'Aptos' } }];

    // The notify event forces a re-render that re-reads the rebuilt array.
    mockToolbar.emit('toolbar-items-changed');
    await nextTick();
    expect(renderedItems()).toEqual(['fontFamily', 'Aptos']);

    wrapper.unmount();
  });
});
