import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pushHeaderFooterToYjs,
  applyRemoteHeaderFooterChanges,
  isApplyingRemoteHeaderFooterChanges,
} from './collaboration-helpers.js';

// Helper to create a mock Yjs Map
const createYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  let observer;
  return {
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => store.get(key)),
    observe: vi.fn((fn) => {
      observer = fn;
    }),
    _trigger(event) {
      observer?.(event);
    },
    store,
  };
};

// Helper to create a mock Ydoc
const createYDocStub = () => {
  const headerFooterJson = createYMap();
  return {
    getMap: vi.fn((name) => (name === 'headerFooterJson' ? headerFooterJson : createYMap())),
    transact: vi.fn((fn) => fn()),
    _maps: { headerFooterJson },
  };
};

// Helper to create a mock editor
const createMockEditor = (ydoc, overrides = {}) => ({
  options: { ydoc, user: { id: 'user-1' } },
  isDestroyed: false,
  converter: {
    headers: {},
    footers: {},
    headerEditors: [],
    footerEditors: [],
  },
  emit: vi.fn(),
  ...overrides,
});

beforeEach(async () => {
  vi.clearAllMocks();
  // Wait for any pending flag resets from previous tests
  await new Promise((resolve) => setTimeout(resolve, 15));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('header/footer collaboration sync (SD-1358)', () => {
  describe('pushHeaderFooterToYjs', () => {
    it('pushes header content to Yjs headerFooterJson map', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const content = { type: 'doc', content: [{ type: 'paragraph' }] };

      pushHeaderFooterToYjs(editor, 'header', 'rId1', content);

      expect(ydoc._maps.headerFooterJson.set).toHaveBeenCalledWith('header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content,
      });
      expect(ydoc.transact).toHaveBeenCalled();
    });

    it('pushes footer content to Yjs headerFooterJson map', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const content = { type: 'doc', content: [{ type: 'paragraph' }] };

      pushHeaderFooterToYjs(editor, 'footer', 'rId2', content);

      expect(ydoc._maps.headerFooterJson.set).toHaveBeenCalledWith('footer:rId2', {
        type: 'footer',
        sectionId: 'rId2',
        content,
      });
    });

    it('skips push when content is unchanged', () => {
      const content = { type: 'doc', content: [{ type: 'paragraph' }] };
      const ydoc = createYDocStub();
      ydoc._maps.headerFooterJson.get.mockReturnValue({ content });
      const editor = createMockEditor(ydoc);

      pushHeaderFooterToYjs(editor, 'header', 'rId1', content);

      expect(ydoc.transact).not.toHaveBeenCalled();
    });

    it('pushes when content has changed', () => {
      const oldContent = { type: 'doc', content: [{ type: 'paragraph' }] };
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }] };
      const ydoc = createYDocStub();
      ydoc._maps.headerFooterJson.get.mockReturnValue({ content: oldContent });
      const editor = createMockEditor(ydoc);

      pushHeaderFooterToYjs(editor, 'header', 'rId1', newContent);

      expect(ydoc.transact).toHaveBeenCalled();
    });

    it('returns early when ydoc is not available', () => {
      const editor = createMockEditor(null);

      // Should not throw
      pushHeaderFooterToYjs(editor, 'header', 'rId1', {});

      // No assertions needed - just verify no error
    });

    it('skips push when isApplyingRemoteChanges is true (ping-pong prevention)', async () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      // Simulate being in the middle of applying remote changes
      const mockHeaderEditor = { replaceContent: vi.fn() };
      editor.converter.headerEditors = [{ id: 'rId1', editor: mockHeaderEditor }];

      // Apply remote change (sets flag)
      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: { type: 'doc' },
      });

      // Flag should be true during apply
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(true);

      // Push should be skipped while flag is true
      pushHeaderFooterToYjs(editor, 'header', 'rId1', { type: 'doc', content: [] });
      expect(ydoc.transact).not.toHaveBeenCalled();

      // Wait for flag to clear
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(false);
    });
  });

  describe('applyRemoteHeaderFooterChanges', () => {
    it('updates converter header storage', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const content = { type: 'doc', content: [] };

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content,
      });

      expect(editor.converter.headers['rId1']).toEqual(content);
    });

    it('updates converter footer storage', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const content = { type: 'doc', content: [] };

      applyRemoteHeaderFooterChanges(editor, 'footer:rId2', {
        type: 'footer',
        sectionId: 'rId2',
        content,
      });

      expect(editor.converter.footers['rId2']).toEqual(content);
    });

    it('calls replaceContent on matching header editors', () => {
      const ydoc = createYDocStub();
      const mockHeaderEditor = { replaceContent: vi.fn() };
      const editor = createMockEditor(ydoc);
      editor.converter.headerEditors = [
        { id: 'rId1', editor: mockHeaderEditor },
        { id: 'rId2', editor: { replaceContent: vi.fn() } },
      ];
      const content = { type: 'doc', content: [] };

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content,
      });

      expect(mockHeaderEditor.replaceContent).toHaveBeenCalledWith(content);
      expect(editor.converter.headerEditors[1].editor.replaceContent).not.toHaveBeenCalled();
    });

    it('emits remoteHeaderFooterChanged event', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const content = { type: 'doc', content: [] };

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content,
      });

      expect(editor.emit).toHaveBeenCalledWith('remoteHeaderFooterChanged', {
        type: 'header',
        sectionId: 'rId1',
        content,
      });
    });

    it('returns early when editor is destroyed', () => {
      const editor = createMockEditor(null, { isDestroyed: true });

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: {},
      });

      expect(editor.emit).not.toHaveBeenCalled();
    });

    it('returns early when converter is missing', () => {
      const editor = createMockEditor(null, { converter: null });

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: {},
      });

      expect(editor.emit).not.toHaveBeenCalled();
    });

    it('returns early when data is incomplete', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        // Missing sectionId and content
      });

      expect(editor.emit).not.toHaveBeenCalled();
    });
  });

  describe('isApplyingRemoteHeaderFooterChanges', () => {
    it('returns false by default', () => {
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(false);
    });

    it('returns true while applying remote changes', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      // Mock setTimeout to capture the callback
      let timeoutCallback;
      vi.spyOn(global, 'setTimeout').mockImplementation((cb) => {
        timeoutCallback = cb;
        return 1;
      });

      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: { type: 'doc' },
      });

      expect(isApplyingRemoteHeaderFooterChanges()).toBe(true);

      // Execute the timeout callback
      timeoutCallback();
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('real-time sync between collaborators', () => {
    it('syncs header changes from User A to User B', () => {
      const sharedYdoc = createYDocStub();

      // User A's editor
      const editorA = createMockEditor(sharedYdoc);
      const contentA = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header A' }] }] };

      // User B's editor with a header editor instance
      const mockHeaderEditorB = { replaceContent: vi.fn() };
      const editorB = createMockEditor(sharedYdoc, {
        converter: {
          headers: {},
          footers: {},
          headerEditors: [{ id: 'rId1', editor: mockHeaderEditorB }],
          footerEditors: [],
        },
      });

      // User A pushes header change
      pushHeaderFooterToYjs(editorA, 'header', 'rId1', contentA);

      // Verify the content was stored in Yjs
      expect(sharedYdoc._maps.headerFooterJson.set).toHaveBeenCalledWith('header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: contentA,
      });

      // Simulate Yjs propagating the change to User B
      applyRemoteHeaderFooterChanges(editorB, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: contentA,
      });

      // User B's editor should have received the content
      expect(editorB.converter.headers['rId1']).toEqual(contentA);
      expect(mockHeaderEditorB.replaceContent).toHaveBeenCalledWith(contentA);
      expect(editorB.emit).toHaveBeenCalledWith(
        'remoteHeaderFooterChanged',
        expect.objectContaining({
          type: 'header',
          sectionId: 'rId1',
        }),
      );
    });

    it('prevents ping-pong loop when receiving remote changes', async () => {
      const ydoc = createYDocStub();
      const mockHeaderEditor = { replaceContent: vi.fn() };
      const editor = createMockEditor(ydoc, {
        converter: {
          headers: {},
          footers: {},
          headerEditors: [{ id: 'rId1', editor: mockHeaderEditor }],
          footerEditors: [],
        },
      });

      const remoteContent = { type: 'doc', content: [] };

      // Receive remote change
      applyRemoteHeaderFooterChanges(editor, 'header:rId1', {
        type: 'header',
        sectionId: 'rId1',
        content: remoteContent,
      });

      // replaceContent was called
      expect(mockHeaderEditor.replaceContent).toHaveBeenCalled();

      // Flag should be true - any push attempt should be blocked
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(true);

      // Simulate onBlur callback trying to push (this would happen in real scenario)
      pushHeaderFooterToYjs(editor, 'header', 'rId1', remoteContent);

      // Push should be blocked (transact not called again)
      expect(ydoc.transact).not.toHaveBeenCalled();

      // Wait for flag to clear
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(isApplyingRemoteHeaderFooterChanges()).toBe(false);
    });
  });
});
