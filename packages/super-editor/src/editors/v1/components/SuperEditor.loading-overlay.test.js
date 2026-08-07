/**
 * Built-in loading overlay (EditorSkeleton) visibility.
 *
 * The `showLoadingOverlay` option is visual-only. It must hide the skeleton
 * WITHOUT advancing `editorReady`, because `editorReady` also gates the
 * interactive chrome (context menu, table/image/textbox resize overlays).
 * The legacy internal `suppressSkeletonLoader` does advance `editorReady`;
 * these tests pin down that the two options stay distinct.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

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
    this.setDocumentMode = vi.fn();
    this.destroy = vi.fn();
  });
  MockEditor.loadXmlData = vi.fn();
  return MockEditor;
});

vi.mock('./cursor-helpers.js', () => ({
  onMarginClickCursorChange: vi.fn(),
  checkNodeSpecificClicks: vi.fn(),
}));
vi.mock('./context-menu/ContextMenu.vue', () => ({ default: { name: 'ContextMenu', render: () => null } }));
vi.mock('./rulers/Ruler.vue', () => ({ default: { name: 'Ruler', render: () => null } }));
vi.mock('./popovers/GenericPopover.vue', () => ({ default: { name: 'GenericPopover', render: () => null } }));
vi.mock('./toolbar/LinkInput.vue', () => ({ default: { name: 'LinkInput', render: () => null } }));
vi.mock('./TableResizeOverlay.vue', () => ({ default: { name: 'TableResizeOverlay', render: () => null } }));
vi.mock('@superdoc/common', () => ({ getFileObject: getFileObjectMock }));
vi.mock('@superdoc/common/data/blank.docx?url', () => ({ default: 'blank-docx-url' }), { virtual: true });
vi.mock('@extensions/index.js', () => ({ getStarterExtensions: getStarterExtensionsMock }));
vi.mock('@superdoc/super-editor', () => ({ Editor: EditorConstructor }));

import SuperEditor from './SuperEditor.vue';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OVERLAY = '.placeholder-editor';

/** Fake y-doc + provider, mirroring the shape SuperEditor.vue probes on mount. */
const makeCollabOptions = () => {
  const metaMap = { has: vi.fn((key) => key === 'docx'), get: vi.fn(() => undefined) };
  return {
    ydoc: {
      getMap: vi.fn((name) => (name === 'parts' ? { size: 0 } : metaMap)),
      getXmlFragment: vi.fn(() => ({ length: 0 })),
    },
    collaborationProvider: { on: vi.fn(), off: vi.fn() },
  };
};

const mountEditor = async (options) => {
  EditorConstructor.loadXmlData.mockResolvedValue(['<docx />', {}, {}, {}]);
  const wrapper = mount(SuperEditor, {
    props: {
      documentId: 'doc-loading-overlay',
      fileSource: new Blob([], { type: DOCX_MIME }),
      options: { externalExtensions: [], ...options },
    },
  });
  await flushPromises();
  return wrapper;
};

describe('SuperEditor built-in loading overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the overlay by default while collaboration is pending', async () => {
    const wrapper = await mountEditor(makeCollabOptions());

    expect(wrapper.find(OVERLAY).exists()).toBe(true);

    wrapper.unmount();
  });

  it('renders the overlay when showLoadingOverlay is explicitly true', async () => {
    const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: true });

    expect(wrapper.find(OVERLAY).exists()).toBe(true);

    wrapper.unmount();
  });

  it('hides the overlay when showLoadingOverlay is false', async () => {
    const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: false });

    expect(wrapper.find(OVERLAY).exists()).toBe(false);

    wrapper.unmount();
  });

  it('is visual-only: showLoadingOverlay false does not advance editorReady or arm interactive chrome', async () => {
    const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: false });

    // Readiness is untouched, so collaboration timing is unchanged...
    expect(wrapper.vm.editorReady).toBe(false);
    // ...and the chrome gated on it stays unmounted.
    expect(wrapper.findComponent({ name: 'TableResizeOverlay' }).exists()).toBe(false);

    wrapper.unmount();
  });

  it('keeps the legacy suppressSkeletonLoader behaviour of advancing editorReady', async () => {
    const wrapper = await mountEditor({ ...makeCollabOptions(), suppressSkeletonLoader: true });

    expect(wrapper.vm.editorReady).toBe(true);
    expect(wrapper.find(OVERLAY).exists()).toBe(false);

    wrapper.unmount();
  });

  it('still hides the overlay once the editor becomes ready', async () => {
    vi.useFakeTimers();
    const wrapper = await mountEditor(makeCollabOptions());

    expect(wrapper.find(OVERLAY).exists()).toBe(true);

    EditorConstructor.mock.results.at(-1).value.listeners.collaborationReady();
    vi.advanceTimersByTime(150);
    await flushPromises();

    expect(wrapper.vm.editorReady).toBe(true);
    expect(wrapper.find(OVERLAY).exists()).toBe(false);

    wrapper.unmount();
  });

  it('does not render the overlay without a collaboration provider', async () => {
    const wrapper = await mountEditor({});

    expect(wrapper.find(OVERLAY).exists()).toBe(false);

    wrapper.unmount();
  });
});
