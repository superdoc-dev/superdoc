import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Y.Map / Y.Doc helpers
// ---------------------------------------------------------------------------

const createYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  let observer;
  return {
    set: vi.fn((k, v) => store.set(k, v)),
    get: vi.fn((k) => store.get(k)),
    has: vi.fn((k) => store.has(k)),
    observe: vi.fn((fn) => {
      observer = fn;
    }),
    unobserve: vi.fn(),
    forEach: (fn) => store.forEach(fn),
    _trigger(event) {
      observer?.(event);
    },
    store,
  };
};

let mockMaps;
const createMockYdoc = () => {
  mockMaps = {
    media: createYMap(),
    headerFooterModel: createYMap(),
    stylesModel: createYMap(),
    ooxmlPartModels: createYMap(),
    ooxmlPartMeta: createYMap(),
    bootstrapDocxParts: createYMap(),
  };
  return {
    isDestroyed: false,
    getXmlFragment: vi.fn(() => ({ fragment: true })),
    getMap: vi.fn((name) => mockMaps[name] ?? createYMap()),
    on: vi.fn(),
    off: vi.fn(),
    transact: vi.fn((fn) => fn()),
  };
};

let mockYdoc = createMockYdoc();

// ---------------------------------------------------------------------------
// Module mocks (must precede all imports from the module under test)
// ---------------------------------------------------------------------------

vi.mock('@core/index.js', () => ({
  Extension: {
    create: (config) => config,
  },
}));

vi.mock('prosemirror-state', () => ({
  PluginKey: class PluginKey {
    constructor(name) {
      this.name = name;
    }
  },
}));

vi.mock('y-prosemirror', () => ({
  ySyncPlugin: vi.fn(() => 'y-sync-plugin'),
  ySyncPluginKey: { getState: vi.fn(() => null) },
  yUndoPluginKey: { getState: vi.fn(() => null) },
  prosemirrorToYDoc: vi.fn(() => mockYdoc),
}));

vi.mock('yjs', () => ({
  encodeStateAsUpdate: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

vi.mock('./part-sync/part-sync-engine.js', () => ({
  publishPartSections: vi.fn(),
  hydrateOrSeedPart: vi.fn(),
  createSpecObserver: vi.fn(() => vi.fn()),
  applyRemotePartSections: vi.fn(),
  deleteRemotePartSections: vi.fn(),
}));

vi.mock('./part-sync/part-spec-registry.js', () => ({
  STYLES_SPEC: { id: 'styles', channel: 'stylesModel' },
  HEADER_FOOTER_CONTENT_SPEC: { id: 'headerFooterContent', channel: 'headerFooterModel' },
  getAllSpecs: vi.fn(() => [
    { id: 'styles', channel: 'stylesModel' },
    { id: 'headerFooterContent', channel: 'headerFooterModel' },
    { id: 'numbering', channel: 'ooxmlPartModels' },
  ]),
  resolveOoxmlPartKey: vi.fn(),
}));

vi.mock('./part-sync/bootstrap-content.js', () => ({
  writeBootstrapContent: vi.fn(),
}));

vi.mock('./part-sync/legacy-bootstrap-migration.js', () => ({
  maybeRunLegacyBootstrapMigration: vi.fn(),
}));

vi.mock('./part-sync/part-reconcile-scheduler.js', () => ({
  scheduleReconcile: vi.fn(),
  destroyReconcileState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ySyncPlugin, prosemirrorToYDoc } from 'y-prosemirror';
import { encodeStateAsUpdate } from 'yjs';
import { writeBootstrapContent } from './part-sync/bootstrap-content.js';
import { maybeRunLegacyBootstrapMigration } from './part-sync/legacy-bootstrap-migration.js';
import { hydrateOrSeedPart } from './part-sync/part-sync-engine.js';
import {
  Collaboration,
  createSyncPlugin,
  initializeCollaborationRoom,
  generateCollaborationData,
} from './collaboration.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const createMockEditor = (overrides = {}) => ({
  options: {
    content: { type: 'doc', content: [] },
    fonts: [{ name: 'Arial' }],
    user: { id: 'user-1', name: 'Alice' },
    mediaFiles: {},
    isNewFile: false,
    ...overrides,
  },
  state: { doc: { type: 'doc' } },
  storage: { image: { media: {} } },
  exportDocx: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockYdoc = createMockYdoc();
});

// ===== createSyncPlugin =====

describe('createSyncPlugin', () => {
  it('returns an array of [plugin, fragment]', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor();

    const result = createSyncPlugin(ydoc, editor);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('returns the ySyncPlugin result as the first element', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor();

    const [plugin] = createSyncPlugin(ydoc, editor);

    expect(plugin).toBe('y-sync-plugin');
  });

  it('retrieves the fragment from ydoc.getXmlFragment("supereditor")', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor();

    const [, fragment] = createSyncPlugin(ydoc, editor);

    expect(ydoc.getXmlFragment).toHaveBeenCalledWith('supereditor');
    expect(fragment).toEqual({ fragment: true });
  });

  it('passes the fragment and an onFirstRender callback to ySyncPlugin', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor();

    createSyncPlugin(ydoc, editor);

    expect(ySyncPlugin).toHaveBeenCalledTimes(1);
    const [passedFragment, opts] = ySyncPlugin.mock.calls[0];
    expect(passedFragment).toEqual({ fragment: true });
    expect(typeof opts.onFirstRender).toBe('function');
  });

  it('onFirstRender calls initializeCollaborationRoom when editor.options.isNewFile is true', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor({ isNewFile: true, mediaFiles: { 'img.png': 'data' } });

    createSyncPlugin(ydoc, editor);

    // Extract the onFirstRender callback and invoke it
    const onFirstRender = ySyncPlugin.mock.calls[0][1].onFirstRender;
    onFirstRender();

    // initializeCollaborationRoom writes bootstrap content and seeds media
    expect(writeBootstrapContent).toHaveBeenCalledWith(ydoc, editor.options.content, {
      fonts: editor.options.fonts,
      user: editor.options.user,
    });
  });

  it('onFirstRender does nothing when editor.options.isNewFile is false', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor({ isNewFile: false });

    createSyncPlugin(ydoc, editor);

    const onFirstRender = ySyncPlugin.mock.calls[0][1].onFirstRender;
    onFirstRender();

    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });
});

// ===== initializeCollaborationRoom =====

describe('initializeCollaborationRoom', () => {
  it('calls writeBootstrapContent with ydoc, content, and options', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      fonts: [{ name: 'Calibri' }],
      user: { id: 'u2', name: 'Bob' },
      mediaFiles: {},
    });

    initializeCollaborationRoom(ydoc, editor);

    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);
    expect(writeBootstrapContent).toHaveBeenCalledWith(
      ydoc,
      { type: 'doc', content: [{ type: 'paragraph' }] },
      { fonts: [{ name: 'Calibri' }], user: { id: 'u2', name: 'Bob' } },
    );
  });

  it('seeds the media map with all mediaFiles entries', () => {
    const ydoc = createMockYdoc();
    const mediaFiles = {
      'image1.png': 'base64data1',
      'image2.jpg': 'base64data2',
      'media/diagram.svg': 'svgdata',
    };
    const editor = createMockEditor({ mediaFiles });

    initializeCollaborationRoom(ydoc, editor);

    const mediaMap = ydoc.getMap('media');
    expect(ydoc.getMap).toHaveBeenCalledWith('media');
    expect(mediaMap.set).toHaveBeenCalledTimes(3);
    expect(mediaMap.set).toHaveBeenCalledWith('image1.png', 'base64data1');
    expect(mediaMap.set).toHaveBeenCalledWith('image2.jpg', 'base64data2');
    expect(mediaMap.set).toHaveBeenCalledWith('media/diagram.svg', 'svgdata');
  });

  it('does not set anything on media map when mediaFiles is empty', () => {
    const ydoc = createMockYdoc();
    const editor = createMockEditor({ mediaFiles: {} });

    initializeCollaborationRoom(ydoc, editor);

    const mediaMap = ydoc.getMap('media');
    expect(mediaMap.set).not.toHaveBeenCalled();
  });
});

// ===== generateCollaborationData =====

describe('generateCollaborationData', () => {
  it('creates a ydoc from the editor state via prosemirrorToYDoc', async () => {
    const editor = createMockEditor({ mediaFiles: {} });

    await generateCollaborationData(editor);

    expect(prosemirrorToYDoc).toHaveBeenCalledTimes(1);
    expect(prosemirrorToYDoc).toHaveBeenCalledWith(editor.state.doc, 'supereditor');
  });

  it('calls exportDocx to capture current state before seeding', async () => {
    const editor = createMockEditor({ mediaFiles: {} });

    await generateCollaborationData(editor);

    expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });
  });

  it('merges export output into bootstrap content', async () => {
    const originalContent = [
      { name: 'word/document.xml', content: '<old-doc/>' },
      { name: 'word/styles.xml', content: '<old-styles/>' },
    ];
    const editor = createMockEditor({
      content: originalContent,
      fonts: [{ name: 'TimesNewRoman' }],
      user: { id: 'u3', name: 'Carol' },
      mediaFiles: { 'photo.png': 'photodata' },
    });
    editor.exportDocx.mockResolvedValue({
      'word/styles.xml': '<new-styles/>',
      'word/numbering.xml': '<new-numbering/>',
    });

    await generateCollaborationData(editor);

    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);
    const [, contentArg, contextArg] = writeBootstrapContent.mock.calls[0];
    // Original document.xml preserved, styles.xml updated, numbering.xml added
    expect(contentArg).toEqual([
      { name: 'word/document.xml', content: '<old-doc/>' },
      { name: 'word/styles.xml', content: '<new-styles/>' },
      { name: 'word/numbering.xml', content: '<new-numbering/>' },
    ]);
    expect(contextArg).toEqual({ fonts: editor.options.fonts, user: editor.options.user });

    // media map is seeded
    const mediaMap = mockYdoc.getMap('media');
    expect(mediaMap.set).toHaveBeenCalledWith('photo.png', 'photodata');
  });

  it('removes files with null export value from bootstrap content', async () => {
    const originalContent = [
      { name: 'word/document.xml', content: '<doc/>' },
      { name: 'word/comments.xml', content: '<comments/>' },
    ];
    const editor = createMockEditor({ content: originalContent, mediaFiles: {} });
    editor.exportDocx.mockResolvedValue({
      'word/comments.xml': null,
    });

    await generateCollaborationData(editor);

    const [, contentArg] = writeBootstrapContent.mock.calls[0];
    expect(contentArg).toEqual([{ name: 'word/document.xml', content: '<doc/>' }]);
  });

  it('falls back to original content when exportDocx returns undefined', async () => {
    const editor = createMockEditor({
      content: [{ name: 'word/document.xml', content: '<doc/>' }],
      fonts: [{ name: 'Arial' }],
      user: { id: 'u1', name: 'Alice' },
      mediaFiles: {},
    });
    editor.exportDocx.mockResolvedValue(undefined);

    await generateCollaborationData(editor);

    const [, contentArg] = writeBootstrapContent.mock.calls[0];
    expect(contentArg).toEqual([{ name: 'word/document.xml', content: '<doc/>' }]);
  });

  it('returns the encoded state update as a Uint8Array', async () => {
    const editor = createMockEditor({ mediaFiles: {} });

    const result = await generateCollaborationData(editor);

    expect(encodeStateAsUpdate).toHaveBeenCalledTimes(1);
    expect(encodeStateAsUpdate).toHaveBeenCalledWith(mockYdoc);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('is an async function that returns a promise', () => {
    const editor = createMockEditor({ mediaFiles: {} });

    const result = generateCollaborationData(editor);

    expect(result).toBeInstanceOf(Promise);
  });
});

// ===== handleCollaborationReady — migration before hydrate =====

describe('handleCollaborationReady', () => {
  it('calls maybeRunLegacyBootstrapMigration before hydrateOrSeedPart', () => {
    const callOrder = [];
    maybeRunLegacyBootstrapMigration.mockImplementation(() => callOrder.push('migration'));
    hydrateOrSeedPart.mockImplementation(() => callOrder.push('hydrate'));

    const ydoc = createMockYdoc();
    const provider = { synced: false, on: vi.fn(), off: vi.fn() };
    const editor = {
      ...createMockEditor({ ydoc, collaborationProvider: provider, isHeadless: false }),
      converter: {},
      isDestroyed: false,
    };

    // Run addPmPlugins to register the collaborationReady handler
    const extension = Collaboration;
    const context = {
      editor,
      options: { ydoc, field: 'supereditor', fragment: null, isReady: false },
    };
    extension.addPmPlugins.call(context);

    // Find and invoke the collaborationReady handler
    const onCall = editor.on.mock.calls.find(([event]) => event === 'collaborationReady');
    expect(onCall).toBeTruthy();
    const handler = onCall[1];
    handler();

    expect(callOrder[0]).toBe('migration');
    expect(callOrder.filter((c) => c === 'hydrate').length).toBeGreaterThan(0);
    // migration must come before any hydrate
    const migrationIdx = callOrder.indexOf('migration');
    const firstHydrateIdx = callOrder.indexOf('hydrate');
    expect(migrationIdx).toBeLessThan(firstHydrateIdx);
  });
});
