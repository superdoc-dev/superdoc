/**
 * Built-in loading overlay (EditorSkeleton) visibility.
 *
 * `.placeholder-editor` is both the visible placeholder and the interaction
 * barrier over the editable surface underneath, so the two concerns are tested
 * separately:
 *
 *   - the barrier element is mounted whenever `editorReady` is false;
 *   - `showLoadingOverlay` only decides whether that barrier paints.
 *
 * The legacy internal `suppressSkeletonLoader` is different in kind: it forces
 * `editorReady` true, which removes the barrier and arms the chrome gated on
 * readiness (context menu, table/image/textbox resize overlays).
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
/** Full-surface element: placeholder when painted, interaction barrier either way. */
const BARRIER = '.placeholder-editor';
/** Only present when the placeholder actually paints. */
const PLACEHOLDER_LINE = '.placeholder-line';

const makeYdoc = () => {
  const metaMap = { has: vi.fn(() => true), get: vi.fn(() => undefined) };
  return {
    getMap: vi.fn((name) => (name === 'parts' ? { size: 0 } : metaMap)),
    getXmlFragment: vi.fn(() => ({ length: 0 })),
  };
};

const makeProvider = () => ({ on: vi.fn(), off: vi.fn() });

/** Collaboration options alongside a file source (the file-source init path). */
const makeCollabOptions = () => ({ ydoc: makeYdoc(), collaborationProvider: makeProvider() });

const mountEditor = async (options, { withFileSource = true } = {}) => {
  EditorConstructor.loadXmlData.mockResolvedValue(['<docx />', {}, {}, {}]);
  const wrapper = mount(SuperEditor, {
    props: {
      documentId: 'doc-loading-overlay',
      ...(withFileSource ? { fileSource: new Blob([], { type: DOCX_MIME }) } : {}),
      options: { externalExtensions: [], ...options },
    },
  });
  await flushPromises();
  return wrapper;
};

const latestEditor = () => EditorConstructor.mock.results.at(-1)?.value;

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

  describe('with a file source and a collaboration provider', () => {
    it('paints the placeholder by default while the editor is not ready', async () => {
      const wrapper = await mountEditor(makeCollabOptions());

      expect(wrapper.find(BARRIER).exists()).toBe(true);
      expect(wrapper.find(PLACEHOLDER_LINE).exists()).toBe(true);

      wrapper.unmount();
    });

    it('paints the placeholder when showLoadingOverlay is explicitly true', async () => {
      const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: true });

      expect(wrapper.find(PLACEHOLDER_LINE).exists()).toBe(true);

      wrapper.unmount();
    });

    it('stops painting the placeholder when showLoadingOverlay is false', async () => {
      const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: false });

      expect(wrapper.find(PLACEHOLDER_LINE).exists()).toBe(false);

      wrapper.unmount();
    });

    it('keeps the interaction barrier mounted when showLoadingOverlay is false', async () => {
      const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: false });

      // The barrier still covers the editable surface, it is just transparent.
      const barrier = wrapper.find(BARRIER);
      expect(barrier.exists()).toBe(true);
      expect(barrier.classes()).toContain('placeholder-editor--transparent');

      wrapper.unmount();
    });

    it('is visual-only: showLoadingOverlay false does not advance editorReady or arm interactive chrome', async () => {
      const wrapper = await mountEditor({ ...makeCollabOptions(), showLoadingOverlay: false });

      expect(wrapper.vm.editorReady).toBe(false);
      expect(wrapper.findComponent({ name: 'TableResizeOverlay' }).exists()).toBe(false);

      wrapper.unmount();
    });

    it('removes the barrier entirely once the editor becomes ready', async () => {
      vi.useFakeTimers();
      const wrapper = await mountEditor(makeCollabOptions());

      expect(wrapper.find(BARRIER).exists()).toBe(true);

      latestEditor().listeners.collaborationReady();
      vi.advanceTimersByTime(150);
      await flushPromises();

      expect(wrapper.vm.editorReady).toBe(true);
      expect(wrapper.find(BARRIER).exists()).toBe(false);

      wrapper.unmount();
    });

    it('keeps the legacy suppressSkeletonLoader behaviour of advancing editorReady', async () => {
      const wrapper = await mountEditor({ ...makeCollabOptions(), suppressSkeletonLoader: true });

      // Broader than showLoadingOverlay: readiness advances, so the barrier goes too.
      expect(wrapper.vm.editorReady).toBe(true);
      expect(wrapper.find(BARRIER).exists()).toBe(false);

      wrapper.unmount();
    });
  });

  describe('through the collaboration init path (no file source)', () => {
    /** Drives provider `synced`, which is what creates the editor on this path. */
    const syncProvider = async (provider) => {
      const syncedHandler = provider.on.mock.calls.find(([event]) => event === 'synced')?.[1];
      expect(syncedHandler).toBeTypeOf('function');
      syncedHandler();
      await flushPromises();
    };

    it('holds the barrier across provider sync until collaborationReady', async () => {
      vi.useFakeTimers();
      const provider = makeProvider();
      const wrapper = await mountEditor(
        { ydoc: makeYdoc(), collaborationProvider: provider },
        { withFileSource: false },
      );

      expect(wrapper.find(BARRIER).exists()).toBe(true);
      expect(wrapper.find(PLACEHOLDER_LINE).exists()).toBe(true);

      await syncProvider(provider);

      // Synced is not ready: the document still must not be editable.
      expect(wrapper.vm.editorReady).toBe(false);
      expect(wrapper.find(BARRIER).exists()).toBe(true);

      latestEditor().listeners.collaborationReady();
      vi.advanceTimersByTime(150);
      await flushPromises();

      expect(wrapper.vm.editorReady).toBe(true);
      expect(wrapper.find(BARRIER).exists()).toBe(false);

      wrapper.unmount();
    });

    it('keeps the barrier unpainted but present when showLoadingOverlay is false', async () => {
      const provider = makeProvider();
      const wrapper = await mountEditor(
        { ydoc: makeYdoc(), collaborationProvider: provider, showLoadingOverlay: false },
        { withFileSource: false },
      );

      await syncProvider(provider);

      expect(wrapper.vm.editorReady).toBe(false);
      expect(wrapper.find(BARRIER).exists()).toBe(true);
      expect(wrapper.find(PLACEHOLDER_LINE).exists()).toBe(false);

      wrapper.unmount();
    });
  });

  it('does not render the barrier without a collaboration provider', async () => {
    const wrapper = await mountEditor({});

    expect(wrapper.vm.editorReady).toBe(true);
    expect(wrapper.find(BARRIER).exists()).toBe(false);

    wrapper.unmount();
  });
});
