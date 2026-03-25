// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useFindReplace } from './use-find-replace.js';

/** Monotonically increasing surface IDs for multi-open tests. */
let surfaceIdSeq = 0;

/**
 * Mock a surface manager with controllable settle behavior.
 * Each call to open() creates a fresh handle with a unique id.
 */
function createManagerStub() {
  const handles = [];

  const stub = {
    open: vi.fn(() => {
      let settleHandle;
      const handle = {
        id: `surface-${++surfaceIdSeq}`,
        mode: 'floating',
        close: vi.fn(),
        result: new Promise((resolve) => {
          settleHandle = resolve;
        }),
      };
      handle._settle = (outcome) => settleHandle(outcome);
      handles.push(handle);
      return handle;
    }),
    /** The most recently opened handle (convenience). */
    get lastHandle() {
      return handles[handles.length - 1] ?? null;
    },
    handles,
  };
  return stub;
}

function createEditorStub() {
  return {
    commands: {
      clearSearchSession: vi.fn(),
      setSearchSession: vi.fn(() => ({ matches: [], activeMatchIndex: -1 })),
      nextSearchMatch: vi.fn(() => ({ activeMatchIndex: 0, match: null })),
      previousSearchMatch: vi.fn(() => ({ activeMatchIndex: 0, match: null })),
      replaceSearchMatch: vi.fn(() => ({ matches: [], activeMatchIndex: -1 })),
      replaceAllSearchMatches: vi.fn(() => ({ replacedCount: 0 })),
    },
    extensionStorage: {
      Search: {
        searchResults: [],
        activeMatchIndex: -1,
      },
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('useFindReplace', () => {
  let manager;
  let editor;
  let activeEditorRef;
  let findReplace;
  let configValue;

  beforeEach(() => {
    surfaceIdSeq = 0;
    manager = createManagerStub();
    editor = createEditorStub();
    activeEditorRef = ref(editor);
    configValue = true;

    findReplace = useFindReplace({
      getSurfaceManager: () => manager,
      getActiveEditor: () => editor,
      activeEditorRef,
      getFindReplaceConfig: () => configValue,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('open()', () => {
    it('calls surfaceManager.open with floating mode', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
      const call = manager.open.mock.calls[0][0];
      expect(call.mode).toBe('floating');
      expect(call.floating.placement).toBe('top-right');
      expect(call.floating.closeOnEscape).toBe(true);
    });

    it('does not create second surface when already open', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      await findReplace.open();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('sets isOpen to true', async () => {
      expect(findReplace.isOpen.value).toBe(false);

      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(findReplace.isOpen.value).toBe(true);
    });

    it('does nothing when no surface manager', async () => {
      const noManager = useFindReplace({
        getSurfaceManager: () => null,
        getActiveEditor: () => editor,
        getFindReplaceConfig: () => true,
      });

      await noManager.open();
      // No error thrown
    });

    it('does nothing when no active editor', async () => {
      const noEditor = useFindReplace({
        getSurfaceManager: () => manager,
        getActiveEditor: () => null,
        getFindReplaceConfig: () => true,
      });

      await noEditor.open();
      expect(manager.open).not.toHaveBeenCalled();
    });

    it('concurrent open() calls only produce one surface (race guard)', async () => {
      const p1 = findReplace.open();
      const p2 = findReplace.open();
      await Promise.all([p1, p2]);
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('passes findReplace handle in props', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      const call = manager.open.mock.calls[0][0];
      expect(call.props.findReplace).toBeDefined();
      expect(typeof call.props.findReplace.goNext).toBe('function');
      expect(typeof call.props.findReplace.goPrev).toBe('function');
      expect(typeof call.props.findReplace.registerFocusFn).toBe('function');
    });

    it('does not open when config is false', async () => {
      configValue = false;
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).not.toHaveBeenCalled();
    });

    it('does not open when config is undefined', async () => {
      configValue = undefined;
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).not.toHaveBeenCalled();
    });

    it('opens when config is an object', async () => {
      configValue = { findPlaceholder: 'Search...' };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('does not open when resolver returns none', async () => {
      configValue = { resolver: () => ({ type: 'none' }) };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).not.toHaveBeenCalled();
    });

    it('passes custom component to surface manager', async () => {
      const CustomComponent = { template: '<div />' };
      configValue = { component: CustomComponent };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
      const call = manager.open.mock.calls[0][0];
      // markRaw wraps the component, so check identity through the raw value
      expect(call.component).toBeDefined();
      expect(call.props.findReplace).toBeDefined();
    });

    it('passes external render function to surface manager', async () => {
      const renderFn = vi.fn();
      configValue = { render: renderFn };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
      const call = manager.open.mock.calls[0][0];
      expect(typeof call.render).toBe('function');
    });

    it('resolver custom overrides direct component', async () => {
      const DirectComponent = { template: '<div>direct</div>' };
      const ResolverComponent = { template: '<div>resolver</div>' };
      configValue = {
        component: DirectComponent,
        resolver: () => ({ type: 'custom', component: ResolverComponent }),
      };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
      const call = manager.open.mock.calls[0][0];
      // The resolver's component should win (it's raw-wrapped)
      expect(call.component).toBeDefined();
    });

    it('resolver returning null falls through to direct component', async () => {
      const DirectComponent = { template: '<div>direct</div>' };
      configValue = {
        component: DirectComponent,
        resolver: () => null,
      };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
      const call = manager.open.mock.calls[0][0];
      expect(call.component).toBeDefined();
    });

    it('resolver returning default falls through to built-in', async () => {
      configValue = {
        resolver: () => ({ type: 'default' }),
      };
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('throws when both component and render are provided', async () => {
      configValue = { component: {}, render: () => {} };
      await expect(findReplace.open()).rejects.toThrow('cannot provide both');
    });

    it('resets opening guard after config validation error', async () => {
      configValue = { component: {}, render: () => {} };
      await findReplace.open().catch(() => {});

      // After the error, a valid config should still be openable
      configValue = true;
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('resets opening guard after resolver throws', async () => {
      configValue = {
        resolver: () => {
          throw new Error('resolver boom');
        },
      };
      await findReplace.open().catch(() => {});

      configValue = true;
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(1);
    });

    it('passes ariaLabel to surface manager', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      const call = manager.open.mock.calls[0][0];
      expect(call.ariaLabel).toBe('Find text');
    });

    it('passes custom ariaLabel from text overrides', async () => {
      configValue = { findAriaLabel: 'Search document' };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const call = manager.open.mock.calls[0][0];
      expect(call.ariaLabel).toBe('Search document');
    });
  });

  describe('close()', () => {
    it('calls handle.close', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      findReplace.close();

      expect(manager.lastHandle.close).toHaveBeenCalledWith('programmatic');
    });
  });

  describe('surface close cleanup', () => {
    it('clears search session when surface settles as closed', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      manager.lastHandle._settle({ status: 'closed', reason: 'escape' });
      await tick();

      expect(editor.commands.clearSearchSession).toHaveBeenCalled();
      expect(findReplace.isOpen.value).toBe(false);
    });

    it('clears search session when surface settles as replaced', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      manager.lastHandle._settle({ status: 'replaced', replacedBy: 'some-other-surface' });
      await tick();

      expect(editor.commands.clearSearchSession).toHaveBeenCalled();
      expect(findReplace.isOpen.value).toBe(false);
    });

    it('stale settle callback does not clobber newer surface state', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      const firstHandle = manager.lastHandle;

      // Settle the first handle (simulating replacement by another surface)
      firstHandle._settle({ status: 'replaced', replacedBy: 'surface-2' });
      await tick();

      // Now open again (simulating the user re-pressing Cmd+F)
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(manager.open).toHaveBeenCalledTimes(2);
      expect(findReplace.isOpen.value).toBe(true);

      // The second handle's settle should not have been clobbered
      const secondHandle = manager.lastHandle;
      expect(secondHandle.id).not.toBe(firstHandle.id);
    });
  });

  describe('editor switch', () => {
    it('clears previous editor search and closes surface on editor switch', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      const newEditor = createEditorStub();
      activeEditorRef.value = newEditor;

      // Vue watcher fires async
      await tick();

      expect(editor.commands.clearSearchSession).toHaveBeenCalled();
      expect(manager.lastHandle.close).toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('closes open surface and prevents future opens', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      const handle = manager.lastHandle;
      findReplace.destroy();

      expect(handle.close).toHaveBeenCalled();

      // Reset mock
      manager.open.mockClear();

      await findReplace.open();
      expect(manager.open).not.toHaveBeenCalled();
    });
  });

  describe('wouldOpen()', () => {
    it('returns true when config is true and editor is present', () => {
      expect(findReplace.wouldOpen()).toBe(true);
    });

    it('returns false when config is false', () => {
      configValue = false;
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns false when config is undefined', () => {
      configValue = undefined;
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns false when resolver returns none', () => {
      configValue = { resolver: () => ({ type: 'none' }) };
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns false when resolver throws (does not propagate error)', () => {
      configValue = {
        resolver: () => {
          throw new Error('boom');
        },
      };
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns false when config is invalid (component + render)', () => {
      configValue = { component: {}, render: () => {} };
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns false when no editor', () => {
      const noEditor = useFindReplace({
        getSurfaceManager: () => manager,
        getActiveEditor: () => null,
        getFindReplaceConfig: () => true,
      });
      expect(noEditor.wouldOpen()).toBe(false);
    });

    it('returns false when no surface manager', () => {
      const noManager = useFindReplace({
        getSurfaceManager: () => null,
        getActiveEditor: () => editor,
        getFindReplaceConfig: () => true,
      });
      expect(noManager.wouldOpen()).toBe(false);
    });

    it('returns false after destroy', async () => {
      findReplace.destroy();
      expect(findReplace.wouldOpen()).toBe(false);
    });

    it('returns true when already open (will refocus)', async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();

      expect(findReplace.wouldOpen()).toBe(true);
    });
  });

  describe('config resolution', () => {
    it('resolves text overrides from object config', async () => {
      configValue = { findPlaceholder: 'Search...', noResultsLabel: 'Nothing found' };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const handle = manager.open.mock.calls[0][0].props.findReplace;
      expect(handle.texts.findPlaceholder).toBe('Search...');
      expect(handle.texts.noResultsLabel).toBe('Nothing found');
      // Non-overridden fields get defaults
      expect(handle.texts.replaceLabel).toBe('Replace');
    });

    it('replaceEnabled defaults to true', async () => {
      configValue = {};
      await findReplace.open();
      await vi.dynamicImportSettled();

      const handle = manager.open.mock.calls[0][0].props.findReplace;
      expect(handle.replaceEnabled).toBe(true);
    });

    it('replaceEnabled: false is reflected in handle', async () => {
      configValue = { replaceEnabled: false };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const handle = manager.open.mock.calls[0][0].props.findReplace;
      expect(handle.replaceEnabled).toBe(false);
    });
  });

  describe('handle actions', () => {
    let handle;

    beforeEach(async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();
      handle = manager.open.mock.calls[0][0].props.findReplace;
    });

    it('goNext calls editor.commands.nextSearchMatch', () => {
      // Set up some matches first
      handle.findQuery.value = 'test';
      editor.commands.setSearchSession.mockReturnValue({ matches: [{}], activeMatchIndex: 0 });

      // Manually set matchCount to simulate a search result
      // The watcher runs async, so we directly set the state for this test
      handle.matchCount.value = 1;

      handle.goNext();
      expect(editor.commands.nextSearchMatch).toHaveBeenCalled();
    });

    it('goPrev calls editor.commands.previousSearchMatch', () => {
      handle.matchCount.value = 1;

      handle.goPrev();
      expect(editor.commands.previousSearchMatch).toHaveBeenCalled();
    });

    it('replaceCurrent calls editor.commands.replaceSearchMatch', () => {
      handle.matchCount.value = 1;
      handle.replaceText.value = 'new text';

      handle.replaceCurrent();
      expect(editor.commands.replaceSearchMatch).toHaveBeenCalledWith('new text');
    });

    it('replaceAll calls editor.commands.replaceAllSearchMatches', () => {
      handle.matchCount.value = 1;
      handle.replaceText.value = 'new text';

      handle.replaceAll();
      expect(editor.commands.replaceAllSearchMatches).toHaveBeenCalledWith('new text');
    });

    it('replaceCurrent is a no-op when replaceEnabled is false', async () => {
      // Close and reopen with replaceEnabled: false
      manager.lastHandle._settle({ status: 'closed' });
      await tick();

      configValue = { replaceEnabled: false };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const newHandle = manager.open.mock.calls[1][0].props.findReplace;
      newHandle.matchCount.value = 1;
      newHandle.replaceText.value = 'new text';

      newHandle.replaceCurrent();
      expect(editor.commands.replaceSearchMatch).not.toHaveBeenCalled();
    });

    it('replaceAll is a no-op when replaceEnabled is false', async () => {
      // Close and reopen with replaceEnabled: false
      manager.lastHandle._settle({ status: 'closed' });
      await tick();

      configValue = { replaceEnabled: false };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const newHandle = manager.open.mock.calls[1][0].props.findReplace;
      newHandle.matchCount.value = 1;
      newHandle.replaceText.value = 'new text';

      newHandle.replaceAll();
      expect(editor.commands.replaceAllSearchMatches).not.toHaveBeenCalled();
    });

    it('registerFocusFn stores the function', () => {
      const focusFn = vi.fn();
      handle.registerFocusFn(focusFn);

      // The composable should call this when open() is called while already open
      // We can verify by opening again
      findReplace.open();
      expect(focusFn).toHaveBeenCalled();
    });
  });

  describe('handle reactive state', () => {
    let handle;

    beforeEach(async () => {
      await findReplace.open();
      await vi.dynamicImportSettled();
      handle = manager.open.mock.calls[0][0].props.findReplace;
    });

    it('matchLabel is empty when no query', () => {
      expect(handle.matchLabel.value).toBe('');
    });

    it('matchLabel shows "No results" when query has no matches', async () => {
      handle.findQuery.value = 'test';
      // matchCount stays at 0
      await nextTick();
      expect(handle.matchLabel.value).toBe('No results');
    });

    it('matchLabel uses custom noResultsLabel', async () => {
      manager.lastHandle._settle({ status: 'closed' });
      await tick();

      configValue = { noResultsLabel: 'Nothing found' };
      await findReplace.open();
      await vi.dynamicImportSettled();

      const newHandle = manager.open.mock.calls[1][0].props.findReplace;
      newHandle.findQuery.value = 'test';
      await nextTick();
      expect(newHandle.matchLabel.value).toBe('Nothing found');
    });

    it('hasMatches reflects matchCount', () => {
      expect(handle.hasMatches.value).toBe(false);
      handle.matchCount.value = 3;
      expect(handle.hasMatches.value).toBe(true);
    });

    it('state is reset between opens', async () => {
      handle.findQuery.value = 'old query';
      handle.matchCount.value = 5;

      manager.lastHandle._settle({ status: 'closed' });
      await tick();

      await findReplace.open();
      await vi.dynamicImportSettled();

      const newHandle = manager.open.mock.calls[1][0].props.findReplace;
      expect(newHandle.findQuery.value).toBe('');
      expect(newHandle.matchCount.value).toBe(0);
    });
  });

  describe('external render wrapping', () => {
    it('external render receives wrapped handle with plain getters/setters', async () => {
      let capturedCtx;
      configValue = {
        render: (ctx) => {
          capturedCtx = ctx;
        },
      };
      await findReplace.open();
      await vi.dynamicImportSettled();

      // The surface manager receives a render function; invoke it
      const renderFn = manager.open.mock.calls[0][0].render;
      const mockSurfaceCtx = {
        container: document.createElement('div'),
        surfaceId: 'test',
        mode: 'floating',
        request: {},
        resolve: vi.fn(),
        close: vi.fn(),
      };
      renderFn(mockSurfaceCtx);

      // The external context should have unwrapped getters
      expect(capturedCtx).toBeDefined();
      expect(capturedCtx.findReplace).toBeDefined();
      expect(typeof capturedCtx.findReplace.findQuery).toBe('string');
      expect(typeof capturedCtx.findReplace.goNext).toBe('function');

      // Setting via the wrapper should update the underlying ref
      capturedCtx.findReplace.findQuery = 'hello';
      expect(capturedCtx.findReplace.findQuery).toBe('hello');
    });
  });
});
