import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pushConverterMetadata,
  applyRemoteConverterMetadata,
  isApplyingRemoteConverterMetadata,
  pushAllConverterMetadata,
  pushAllHeaderFooterToYjs,
  CONVERTER_META_KEYS,
} from './collaboration-helpers.js';

// Helper to create a mock Yjs Map
const createYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  let observer;
  return {
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => store.get(key)),
    has: vi.fn((key) => store.has(key)),
    observe: vi.fn((fn) => {
      observer = fn;
    }),
    unobserve: vi.fn(),
    forEach: vi.fn((fn) => store.forEach((v, k) => fn(v, k))),
    _trigger(event) {
      observer?.(event);
    },
    store,
  };
};

const createYDocStub = () => {
  const maps = {
    converterMeta: createYMap(),
    headerFooterJson: createYMap(),
  };
  return {
    getMap: vi.fn((name) => maps[name] || createYMap()),
    transact: vi.fn((fn) => fn()),
    isDestroyed: false,
    _maps: maps,
  };
};

const createMockEditor = (ydoc, overrides = {}) => ({
  options: { ydoc, user: { id: 'user-1' } },
  isDestroyed: false,
  converter: {
    numbering: { abstracts: {}, definitions: {} },
    translatedNumbering: { abstracts: {}, definitions: {} },
    translatedLinkedStyles: { docDefaults: {}, styles: {} },
    headers: {},
    footers: {},
  },
  emit: vi.fn(),
  ...overrides,
});

beforeEach(async () => {
  vi.clearAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 15));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('unified converter metadata sync (SD-2062/SD-2040)', () => {
  describe('pushConverterMetadata', () => {
    it('pushes numbering data to converterMeta map', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      editor.converter.numbering = { abstracts: { 0: {} }, definitions: { 1: {} } };
      editor.converter.translatedNumbering = { abstracts: { 0: {} }, definitions: { 1: {} } };

      pushConverterMetadata(editor, 'numbering');

      expect(ydoc._maps.converterMeta.set).toHaveBeenCalledWith('numbering', {
        numbering: editor.converter.numbering,
        translatedNumbering: editor.converter.translatedNumbering,
      });
    });

    it('pushes styles data to converterMeta map', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      editor.converter.translatedLinkedStyles = { docDefaults: { runProperties: { fontSize: 24 } } };

      pushConverterMetadata(editor, 'styles');

      expect(ydoc._maps.converterMeta.set).toHaveBeenCalledWith('styles', {
        translatedLinkedStyles: editor.converter.translatedLinkedStyles,
      });
    });

    it('pushes headerFooterIds data to converterMeta map', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      editor.converter.headerIds = { default: 'rId-header-default', first: null, even: null, odd: null };
      editor.converter.footerIds = { default: 'rId-footer-default', first: null, even: null, odd: null };

      pushConverterMetadata(editor, 'headerFooterIds');

      expect(ydoc._maps.converterMeta.set).toHaveBeenCalledWith('headerFooterIds', {
        headerIds: editor.converter.headerIds,
        footerIds: editor.converter.footerIds,
      });
    });

    it('skips push when data is unchanged (dedup)', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      const ids = { headerIds: { default: 'rId1' }, footerIds: { default: null } };
      ydoc._maps.converterMeta.get.mockReturnValue(ids);
      editor.converter.headerIds = { default: 'rId1' };
      editor.converter.footerIds = { default: null };

      pushConverterMetadata(editor, 'headerFooterIds');

      expect(ydoc.transact).not.toHaveBeenCalled();
    });

    it('uses the same Y.js map for all metadata types', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      pushConverterMetadata(editor, 'numbering');
      pushConverterMetadata(editor, 'styles');
      pushConverterMetadata(editor, 'headerFooterIds');

      expect(ydoc.getMap).toHaveBeenCalledWith('converterMeta');
      expect(ydoc._maps.converterMeta.set).toHaveBeenCalledTimes(3);
    });

    it('ignores unknown keys', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      pushConverterMetadata(editor, 'unknownType');

      expect(ydoc.transact).not.toHaveBeenCalled();
    });

    it('returns early when ydoc is not available', () => {
      const editor = createMockEditor(null);
      pushConverterMetadata(editor, 'numbering');
      // Should not throw
    });

    it('returns early when ydoc is destroyed', () => {
      const ydoc = createYDocStub();
      ydoc.isDestroyed = true;
      const editor = createMockEditor(ydoc);

      pushConverterMetadata(editor, 'numbering');
      expect(ydoc.transact).not.toHaveBeenCalled();
    });

    it('returns early when converter is missing', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc, { converter: null });

      pushConverterMetadata(editor, 'numbering');
      expect(ydoc.transact).not.toHaveBeenCalled();
    });

    it('skips push during remote apply (anti-ping-pong)', async () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      applyRemoteConverterMetadata(editor, 'numbering', {
        numbering: { abstracts: {}, definitions: {} },
        translatedNumbering: { abstracts: {}, definitions: {} },
      });

      expect(isApplyingRemoteConverterMetadata()).toBe(true);
      pushConverterMetadata(editor, 'numbering');
      expect(ydoc.transact).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(isApplyingRemoteConverterMetadata()).toBe(false);
    });
  });

  describe('applyRemoteConverterMetadata', () => {
    it('applies numbering data to converter', () => {
      const editor = createMockEditor(createYDocStub());
      const numbering = { abstracts: { 0: { levels: [] } }, definitions: { 1: {} } };
      const translatedNumbering = { abstracts: { 0: {} }, definitions: { 1: {} } };

      applyRemoteConverterMetadata(editor, 'numbering', { numbering, translatedNumbering });

      expect(editor.converter.numbering).toEqual(numbering);
      expect(editor.converter.translatedNumbering).toEqual(translatedNumbering);
    });

    it('applies styles data to converter', () => {
      const editor = createMockEditor(createYDocStub());
      const translatedLinkedStyles = { docDefaults: { runProperties: { fontSize: 28 } } };

      applyRemoteConverterMetadata(editor, 'styles', { translatedLinkedStyles });

      expect(editor.converter.translatedLinkedStyles).toEqual(translatedLinkedStyles);
    });

    it('applies headerFooterIds to converter', () => {
      const editor = createMockEditor(createYDocStub());
      const headerIds = { default: 'rId-header-default', first: null, even: null, odd: null };
      const footerIds = { default: 'rId-footer-default', first: null, even: null, odd: null };

      applyRemoteConverterMetadata(editor, 'headerFooterIds', { headerIds, footerIds });

      expect(editor.converter.headerIds).toEqual(headerIds);
      expect(editor.converter.footerIds).toEqual(footerIds);
    });

    it('emits a single remoteConverterMetaChanged event with key', () => {
      const editor = createMockEditor(createYDocStub());

      applyRemoteConverterMetadata(editor, 'numbering', {
        numbering: {},
        translatedNumbering: {},
      });

      expect(editor.emit).toHaveBeenCalledWith('remoteConverterMetaChanged', {
        key: 'numbering',
        data: { numbering: {}, translatedNumbering: {} },
      });
    });

    it('returns early when editor is destroyed', () => {
      const editor = createMockEditor(null, { isDestroyed: true });
      applyRemoteConverterMetadata(editor, 'numbering', { numbering: {} });
      expect(editor.emit).not.toHaveBeenCalled();
    });

    it('returns early when data is null', () => {
      const editor = createMockEditor(createYDocStub());
      applyRemoteConverterMetadata(editor, 'numbering', null);
      expect(editor.emit).not.toHaveBeenCalled();
    });
  });

  describe('isApplyingRemoteConverterMetadata', () => {
    it('returns false by default', () => {
      expect(isApplyingRemoteConverterMetadata()).toBe(false);
    });

    it('returns true while applying, false after tick', () => {
      const editor = createMockEditor(createYDocStub());

      let timeoutCallback;
      vi.spyOn(global, 'setTimeout').mockImplementation((cb) => {
        timeoutCallback = cb;
        return 1;
      });

      applyRemoteConverterMetadata(editor, 'styles', {
        translatedLinkedStyles: {},
      });

      expect(isApplyingRemoteConverterMetadata()).toBe(true);
      timeoutCallback();
      expect(isApplyingRemoteConverterMetadata()).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('pushAllConverterMetadata', () => {
    it('pushes all registered keys', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      pushAllConverterMetadata(editor);

      // Should push once per key
      expect(ydoc._maps.converterMeta.set).toHaveBeenCalledTimes(CONVERTER_META_KEYS.length);
    });
  });

  describe('pushAllHeaderFooterToYjs', () => {
    it('pushes all headers and footers from converter', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      editor.converter.headers = {
        rId1: { type: 'doc', content: [{ type: 'paragraph' }] },
      };
      editor.converter.footers = {
        rId2: { type: 'doc', content: [{ type: 'paragraph' }] },
      };

      pushAllHeaderFooterToYjs(editor);

      expect(ydoc._maps.headerFooterJson.set).toHaveBeenCalledTimes(2);
    });

    it('skips empty entries', () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);
      editor.converter.headers = { rId1: null };

      pushAllHeaderFooterToYjs(editor);

      expect(ydoc._maps.headerFooterJson.set).not.toHaveBeenCalled();
    });
  });

  describe('end-to-end: two collaborators', () => {
    it('syncs numbering changes from User A to User B', () => {
      const sharedYdoc = createYDocStub();
      const editorA = createMockEditor(sharedYdoc);
      editorA.converter.translatedNumbering = {
        abstracts: { 0: { levels: [{ indent: { left: 48, hanging: 24 } }] } },
        definitions: { 1: { abstractNumId: '0' } },
      };

      const editorB = createMockEditor(sharedYdoc);

      // A pushes
      pushConverterMetadata(editorA, 'numbering');

      // Simulate Y.js propagating to B
      const pushed = sharedYdoc._maps.converterMeta.store.get('numbering');
      applyRemoteConverterMetadata(editorB, 'numbering', pushed);

      expect(editorB.converter.translatedNumbering).toEqual(editorA.converter.translatedNumbering);
    });

    it('syncs style changes from User A to User B', () => {
      const sharedYdoc = createYDocStub();
      const editorA = createMockEditor(sharedYdoc);
      editorA.converter.translatedLinkedStyles = {
        docDefaults: { runProperties: { fontSize: 28 } },
        styles: { Normal: {} },
      };

      const editorB = createMockEditor(sharedYdoc);

      pushConverterMetadata(editorA, 'styles');
      const pushed = sharedYdoc._maps.converterMeta.store.get('styles');
      applyRemoteConverterMetadata(editorB, 'styles', pushed);

      expect(editorB.converter.translatedLinkedStyles).toEqual(editorA.converter.translatedLinkedStyles);
    });

    it('prevents ping-pong loop', async () => {
      const ydoc = createYDocStub();
      const editor = createMockEditor(ydoc);

      applyRemoteConverterMetadata(editor, 'numbering', {
        numbering: {},
        translatedNumbering: {},
      });

      // Push blocked during apply
      pushConverterMetadata(editor, 'numbering');
      expect(ydoc.transact).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Push works after flag clears
      pushConverterMetadata(editor, 'numbering');
      expect(ydoc.transact).toHaveBeenCalled();
    });
  });
});
