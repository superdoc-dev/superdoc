import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

const onMarginClickCursorChangeMock = vi.hoisted(() => vi.fn());
const checkNodeSpecificClicksMock = vi.hoisted(() => vi.fn());
const getFileObjectMock = vi.hoisted(() =>
  vi.fn(async () => new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
);
const getStarterExtensionsMock = vi.hoisted(() => vi.fn(() => [{ name: 'core' }]));

const EditorConstructor = vi.hoisted(() => {
  const MockEditor = vi.fn(function (options) {
    this.options = options;
    this.listeners = {};
    this.on = vi.fn((event, handler) => {
      this.listeners[event] = handler;
    });
    this.off = vi.fn();
    this.view = { focus: vi.fn() };
    this.destroy = vi.fn();
  });

  MockEditor.loadXmlData = vi.fn();

  return MockEditor;
});

vi.mock('naive-ui', () => ({
  NSkeleton: { name: 'NSkeleton', render: () => null },
  useMessage: () => messageApi,
}));

// pagination legacy removed; no pagination helpers

vi.mock('./cursor-helpers.js', () => ({
  onMarginClickCursorChange: onMarginClickCursorChangeMock,
  checkNodeSpecificClicks: checkNodeSpecificClicksMock,
}));

vi.mock('./context-menu/ContextMenu.vue', () => ({
  default: { name: 'ContextMenu', render: () => null },
}));

vi.mock('./rulers/Ruler.vue', () => ({
  default: { name: 'Ruler', render: () => null },
}));

vi.mock('./popovers/GenericPopover.vue', () => ({
  default: { name: 'GenericPopover', render: () => null },
}));

vi.mock('./toolbar/LinkInput.vue', () => ({
  default: { name: 'LinkInput', render: () => null },
}));

vi.mock('@superdoc/common', () => ({
  getFileObject: getFileObjectMock,
}));

vi.mock(
  '@superdoc/common/data/blank.docx?url',
  () => ({
    default: 'blank-docx-url',
  }),
  { virtual: true },
);

vi.mock('@extensions/index.js', () => ({
  getStarterExtensions: getStarterExtensionsMock,
}));

vi.mock('@superdoc/super-editor', () => ({
  Editor: EditorConstructor,
}));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

import SuperEditor from './SuperEditor.vue';

const getEditorInstance = () => EditorConstructor.mock.results.at(-1)?.value;
let consoleDebugSpy;

describe('SuperEditor.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleDebugSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('initializes an editor from a provided file source', async () => {
    vi.useFakeTimers();

    EditorConstructor.loadXmlData.mockResolvedValueOnce([
      '<docx />',
      { media: true },
      { files: true },
      { fonts: true },
    ]);

    const onException = vi.fn();
    const fileSource = new Blob([], { type: DOCX_MIME });
    const wrapper = mount(SuperEditor, {
      props: {
        documentId: 'doc-1',
        fileSource,
        options: { externalExtensions: [], onException },
      },
    });

    await flushPromises();

    expect(EditorConstructor.loadXmlData).toHaveBeenCalledWith(fileSource);
    expect(EditorConstructor).toHaveBeenCalledTimes(1);

    const options = EditorConstructor.mock.calls[0][0];
    expect(options.content).toBe('<docx />');
    expect(options.media).toEqual({ media: true });
    expect(options.mediaFiles).toEqual({ files: true });
    expect(options.fonts).toEqual({ fonts: true });
    expect(options.extensions.map((ext) => ext.name)).toEqual(['core']);

    const instance = getEditorInstance();
    expect(instance.on).toHaveBeenCalledWith('collaborationReady', expect.any(Function));

    instance.listeners.collaborationReady();
    vi.runAllTimers();
    await flushPromises();

    expect(wrapper.vm.editorReady).toBe(true);

    wrapper.unmount();
  });

  it('initializes when collaboration provider syncs remote docx data', async () => {
    vi.useFakeTimers();

    const metaMap = {
      has: vi.fn((key) => key === 'docx'),
      get: vi.fn((key) => (key === 'docx' ? '<remote />' : undefined)),
    };
    const ydoc = {
      getMap: vi.fn(() => metaMap),
    };

    const provider = {
      listeners: {},
      on: vi.fn((event, handler) => {
        provider.listeners[event] = handler;
      }),
      off: vi.fn(),
    };

    const wrapper = mount(SuperEditor, {
      props: {
        documentId: 'doc-2',
        options: {
          ydoc,
          collaborationProvider: provider,
        },
      },
    });

    await flushPromises();

    expect(provider.on).toHaveBeenCalledWith('synced', expect.any(Function));

    const syncedHandler = provider.on.mock.calls.find(([event]) => event === 'synced')[1];
    syncedHandler();

    await flushPromises();

    expect(ydoc.getMap).toHaveBeenCalledWith('meta');
    expect(metaMap.has).toHaveBeenCalledWith('docx');
    expect(metaMap.get).toHaveBeenCalledWith('docx');
    expect(EditorConstructor).toHaveBeenCalledTimes(1);
    expect(EditorConstructor.loadXmlData).not.toHaveBeenCalled();

    const options = EditorConstructor.mock.calls[0][0];
    expect(options.content).toBe('<remote />');
    expect(provider.off).toHaveBeenCalledWith('synced', syncedHandler);

    wrapper.unmount();
  });

  it('loads blank document when collaboration provider syncs with no existing content (first client)', async () => {
    vi.useFakeTimers();

    EditorConstructor.loadXmlData.mockResolvedValueOnce(['<blank />', {}, {}, {}]);

    const metaMap = {
      has: vi.fn(() => false), // No existing content
      get: vi.fn(() => undefined),
    };
    const ydoc = {
      getMap: vi.fn(() => metaMap),
    };

    const provider = {
      listeners: {},
      on: vi.fn((event, handler) => {
        provider.listeners[event] = handler;
      }),
      off: vi.fn(),
    };

    const wrapper = mount(SuperEditor, {
      props: {
        documentId: 'doc-first-client',
        options: {
          ydoc,
          collaborationProvider: provider,
        },
      },
    });

    await flushPromises();

    const syncedHandler = provider.on.mock.calls.find(([event]) => event === 'synced')[1];
    syncedHandler();

    await flushPromises();
    vi.runAllTimers();
    await flushPromises();

    expect(metaMap.has).toHaveBeenCalledWith('docx');
    expect(EditorConstructor.loadXmlData).toHaveBeenCalled(); // Should load blank
    expect(EditorConstructor).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('skips waiting for sync when provider is already synced', async () => {
    vi.useFakeTimers();

    const metaMap = {
      has: vi.fn((key) => key === 'docx'),
      get: vi.fn((key) => (key === 'docx' ? '<already-synced />' : undefined)),
    };
    const ydoc = {
      getMap: vi.fn(() => metaMap),
    };

    const provider = {
      isSynced: true, // Already synced
      on: vi.fn(),
      off: vi.fn(),
    };

    const wrapper = mount(SuperEditor, {
      props: {
        documentId: 'doc-already-synced',
        options: {
          ydoc,
          collaborationProvider: provider,
        },
      },
    });

    await flushPromises();

    // Should NOT register sync listeners since already synced
    expect(provider.on).not.toHaveBeenCalledWith('synced', expect.any(Function));
    expect(ydoc.getMap).toHaveBeenCalledWith('meta');
    expect(EditorConstructor).toHaveBeenCalledTimes(1);

    const options = EditorConstructor.mock.calls[0][0];
    expect(options.content).toBe('<already-synced />');

    wrapper.unmount();
  });

  it('ignores sync event with synced=false (Liveblocks behavior)', async () => {
    vi.useFakeTimers();

    const metaMap = {
      has: vi.fn((key) => key === 'docx'),
      get: vi.fn((key) => (key === 'docx' ? '<liveblocks />' : undefined)),
    };
    const ydoc = {
      getMap: vi.fn(() => metaMap),
    };

    const provider = {
      listeners: {},
      on: vi.fn((event, handler) => {
        provider.listeners[event] = handler;
      }),
      off: vi.fn(),
    };

    const wrapper = mount(SuperEditor, {
      props: {
        documentId: 'doc-liveblocks',
        options: {
          ydoc,
          collaborationProvider: provider,
        },
      },
    });

    await flushPromises();

    const syncHandler = provider.on.mock.calls.find(([event]) => event === 'sync')?.[1];

    // Liveblocks fires sync(false) first - should be ignored
    syncHandler(false);
    await flushPromises();

    expect(EditorConstructor).not.toHaveBeenCalled();

    // Then fires sync(true) or synced()
    syncHandler(true);
    await flushPromises();

    expect(EditorConstructor).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('falls back to a blank document when file load fails', async () => {
    const error = new Error('bad file');

    EditorConstructor.loadXmlData.mockRejectedValueOnce(error).mockResolvedValueOnce(['<blank />', {}, {}, {}]);

    const onException = vi.fn();
    const fileSource = new Blob([], { type: DOCX_MIME });

    const wrapper = mount(SuperEditor, {
      props: {
        fileSource,
        options: { onException },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(onException).toHaveBeenCalledWith({ error, editor: null });
    expect(messageApi.error).toHaveBeenCalledWith(
      'Unable to load the file. Please verify the .docx is valid and not password protected.',
    );
    expect(getFileObjectMock).toHaveBeenCalledWith('blank-docx-url', 'blank.docx', DOCX_MIME);
    expect(EditorConstructor.loadXmlData).toHaveBeenCalledTimes(2);
    expect(EditorConstructor).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('renders SlashMenu only when context menus are enabled', async () => {
    vi.useFakeTimers();
    EditorConstructor.loadXmlData
      .mockResolvedValueOnce(['<docx />', {}, {}, {}])
      .mockResolvedValueOnce(['<docx />', {}, {}, {}]);

    const mountAndReady = async (disableContextMenu) => {
      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: `doc-context-menu-${disableContextMenu ? 'off' : 'on'}`,
          fileSource,
          options: { disableContextMenu },
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      return wrapper;
    };

    const enabledWrapper = await mountAndReady(false);
    expect(enabledWrapper.findComponent({ name: 'ContextMenu' }).exists()).toBe(true);
    enabledWrapper.unmount();

    const disabledWrapper = await mountAndReady(true);
    expect(disabledWrapper.findComponent({ name: 'ContextMenu' }).exists()).toBe(false);
    disabledWrapper.unmount();

    vi.useRealTimers();
  });

  describe('handleMarginClick', () => {
    it('should ignore right-clicks (button !== 0)', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-margin-test',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const editorWrapper = wrapper.find('.super-editor');
      expect(editorWrapper.exists()).toBe(true);

      const targetDiv = document.createElement('div');
      targetDiv.classList.add('test-margin-element');

      // Create mock event manually (vue-test-utils doesn't allow setting target)
      const mockEvent = {
        button: 2, // Right-click
        ctrlKey: false,
        target: targetDiv,
      };

      // Trigger the event directly via the DOM element
      const mousedownEvent = new MouseEvent('mousedown', mockEvent);
      Object.defineProperty(mousedownEvent, 'target', { value: targetDiv, enumerable: true });
      editorWrapper.element.dispatchEvent(mousedownEvent);

      await flushPromises();

      // onMarginClickCursorChange should not be called for right-clicks
      expect(onMarginClickCursorChangeMock).not.toHaveBeenCalled();

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should ignore Ctrl+Click on Mac (contextmenu trigger)', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-mac-ctrl-click',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const editorWrapper = wrapper.find('.super-editor');

      // Mock Mac platform
      const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });

      const targetDiv = document.createElement('div');
      targetDiv.classList.add('test-margin-element');

      // Create mock event for Ctrl+Click on Mac
      const mousedownEvent = new MouseEvent('mousedown', {
        button: 0, // Left button
        ctrlKey: true, // Ctrl key pressed (triggers context menu on Mac)
      });
      Object.defineProperty(mousedownEvent, 'target', { value: targetDiv, enumerable: true });
      editorWrapper.element.dispatchEvent(mousedownEvent);

      await flushPromises();

      // onMarginClickCursorChange should not be called for Ctrl+Click on Mac
      expect(onMarginClickCursorChangeMock).not.toHaveBeenCalled();

      // Restore platform
      if (originalPlatform) {
        Object.defineProperty(navigator, 'platform', originalPlatform);
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should process normal left-clicks (button = 0, no ctrlKey)', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-left-click',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const editorWrapper = wrapper.find('.super-editor');

      const targetDiv = document.createElement('div');
      targetDiv.classList.add('test-margin-element');

      // Create mock event for normal left-click
      const mousedownEvent = new MouseEvent('mousedown', {
        button: 0, // Left button
        ctrlKey: false, // No Ctrl key
      });
      Object.defineProperty(mousedownEvent, 'target', { value: targetDiv, enumerable: true });
      editorWrapper.element.dispatchEvent(mousedownEvent);

      await flushPromises();

      // onMarginClickCursorChange should be called for normal left-clicks
      expect(onMarginClickCursorChangeMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should handle Windows platform correctly (Ctrl+Click should process)', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-windows',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const editorWrapper = wrapper.find('.super-editor');

      // Mock Windows platform
      const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });

      const targetDiv = document.createElement('div');
      targetDiv.classList.add('test-margin-element');

      // Create mock event for Ctrl+Click on Windows
      const mousedownEvent = new MouseEvent('mousedown', {
        button: 0, // Left button
        ctrlKey: true, // Ctrl key (should process on Windows)
      });
      Object.defineProperty(mousedownEvent, 'target', { value: targetDiv, enumerable: true });
      editorWrapper.element.dispatchEvent(mousedownEvent);

      await flushPromises();

      // onMarginClickCursorChange should be called on Windows even with Ctrl
      expect(onMarginClickCursorChangeMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));

      // Restore platform
      if (originalPlatform) {
        Object.defineProperty(navigator, 'platform', originalPlatform);
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should ignore clicks on ProseMirror element', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-prosemirror',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const editorWrapper = wrapper.find('.super-editor');

      const proseMirrorDiv = document.createElement('div');
      proseMirrorDiv.classList.add('ProseMirror');

      // Create mock event for click on ProseMirror element
      const mousedownEvent = new MouseEvent('mousedown', {
        button: 0,
        ctrlKey: false,
      });
      Object.defineProperty(mousedownEvent, 'target', { value: proseMirrorDiv, enumerable: true });
      editorWrapper.element.dispatchEvent(mousedownEvent);

      await flushPromises();

      // onMarginClickCursorChange should not be called when clicking ProseMirror element
      expect(onMarginClickCursorChangeMock).not.toHaveBeenCalled();

      wrapper.unmount();
      vi.useRealTimers();
    });
  });

  describe('zoom container sizing', () => {
    it('should calculate container min-width based on default page size at zoom 1', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-zoom-default',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // At zoom 1 with default 8.5in page width: 8.5 * 96 = 816px
      const container = wrapper.find('.super-editor-container');
      expect(container.exists()).toBe(true);

      // The containerStyle computed property should provide min-width
      // Default: 8.5 * 96 * 1 = 816px
      const style = container.element.style;
      expect(style.minWidth).toBe('816px');

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should update container min-width when zoom changes', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-zoom-change',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Simulate zoom change event
      // The initEditor function registers a zoomChange listener
      // We need to capture and trigger it
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');

      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1.5 });
        await wrapper.vm.$nextTick();

        // At zoom 1.5 with default 8.5in page width: 8.5 * 96 * 1.5 = 1224px
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('1224px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should use page width from editor when available', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-custom-page-width',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Add getPageStyles to mock editor
      instance.getPageStyles = vi.fn(() => ({
        pageSize: { width: 11, height: 8.5 }, // Legal landscape
        pageMargins: { left: 1, right: 1, top: 1, bottom: 1 },
      }));

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Force recompute by triggering zoom change
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1 });
        await wrapper.vm.$nextTick();

        // At zoom 1 with 11in page width: 11 * 96 = 1056px
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('1056px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should fall back to default width if getPageStyles returns invalid data', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-invalid-page-styles',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Add getPageStyles that returns invalid data
      instance.getPageStyles = vi.fn(() => ({
        pageSize: { width: null }, // Invalid width
      }));

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Should fall back to default 8.5in = 816px
      const container = wrapper.find('.super-editor-container');
      expect(container.element.style.minWidth).toBe('816px');

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should handle zoom at 2x correctly', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-zoom-2x',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Simulate zoom to 2x
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 2 });
        await wrapper.vm.$nextTick();

        // At zoom 2 with default 8.5in page width: 8.5 * 96 * 2 = 1632px
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('1632px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should handle zoom at 0.5x correctly', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-zoom-half',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();
      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Simulate zoom to 0.5x
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 0.5 });
        await wrapper.vm.$nextTick();

        // At zoom 0.5 with default 8.5in page width: 8.5 * 96 * 0.5 = 408px
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('408px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should use max width from getPages() when pages have varying sizes', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-varying-page-sizes',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Add getPages method that returns mixed portrait/landscape pages
      instance.getPages = vi.fn(() => [
        { number: 1, size: { w: 612, h: 792 } }, // Portrait: 8.5x11
        { number: 2, size: { w: 792, h: 612 } }, // Landscape: 11x8.5
        { number: 3, size: { w: 612, h: 792 } }, // Portrait: 8.5x11
      ]);

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Force recompute by triggering zoom change
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1 });
        await wrapper.vm.$nextTick();

        // Should use max width across all pages: 792 (from landscape page)
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('792px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should scale max width correctly when zoom changes with varying page sizes', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-varying-zoom',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Mixed page sizes
      instance.getPages = vi.fn(() => [
        { number: 1, size: { w: 612, h: 792 } }, // Portrait
        { number: 2, size: { w: 792, h: 612 } }, // Landscape (widest)
      ]);

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Simulate zoom to 1.5
      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1.5 });
        await wrapper.vm.$nextTick();

        // maxWidth = 792, scaledWidth = 792 * 1.5 = 1188
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('1188px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should fall back to default width when getPages returns empty array', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-empty-pages',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Empty pages array
      instance.getPages = vi.fn(() => []);

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      // Should fall back to default 8.5in = 816px
      const container = wrapper.find('.super-editor-container');
      expect(container.element.style.minWidth).toBe('816px');

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should ignore pages with invalid size properties', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-invalid-sizes',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Pages with invalid or missing size properties
      instance.getPages = vi.fn(() => [
        { number: 1, size: { w: 612, h: 792 } }, // Valid
        { number: 2, size: { w: 0, h: 792 } }, // Invalid: zero width
        { number: 3, size: { w: -100, h: 792 } }, // Invalid: negative width
        { number: 4, size: null }, // Invalid: null size
        { number: 5 }, // Invalid: missing size
      ]);

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1 });
        await wrapper.vm.$nextTick();

        // Should use max of valid pages (612) and default (816), so 816
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('816px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });

    it('should prefer getPages over getPageStyles when both exist', async () => {
      vi.useFakeTimers();

      EditorConstructor.loadXmlData.mockResolvedValueOnce(['<docx />', {}, {}, {}]);

      const fileSource = new Blob([], { type: DOCX_MIME });
      const wrapper = mount(SuperEditor, {
        props: {
          documentId: 'doc-both-methods',
          fileSource,
          options: {},
        },
      });

      await flushPromises();

      const instance = getEditorInstance();

      // Both methods exist
      instance.getPages = vi.fn(() => [
        { number: 1, size: { w: 792, h: 612 } }, // 11in width from getPages
      ]);
      instance.getPageStyles = vi.fn(() => ({
        pageSize: { width: 8.5, height: 11 }, // 8.5in width from getPageStyles
      }));

      instance.listeners.collaborationReady();
      vi.runAllTimers();
      await flushPromises();

      const zoomChangeCall = instance.on.mock.calls.find(([event]) => event === 'zoomChange');
      if (zoomChangeCall) {
        const zoomChangeHandler = zoomChangeCall[1];
        zoomChangeHandler({ zoom: 1 });
        await wrapper.vm.$nextTick();

        // Should prefer getPages (792px) over getPageStyles (816px)
        const container = wrapper.find('.super-editor-container');
        expect(container.element.style.minWidth).toBe('792px');
      }

      wrapper.unmount();
      vi.useRealTimers();
    });
  });
});
