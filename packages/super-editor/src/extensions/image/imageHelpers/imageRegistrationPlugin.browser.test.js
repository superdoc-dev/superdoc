import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';

// ── Hoisted mock objects (available to vi.mock factories) ─────────────
const { mockDecoSet, mockPluginKeyInstance } = vi.hoisted(() => {
  const mockDecoSet = {
    add: vi.fn(),
    map: vi.fn(),
    find: vi.fn(() => []),
    remove: vi.fn(),
  };
  mockDecoSet.add.mockReturnValue(mockDecoSet);
  mockDecoSet.map.mockReturnValue(mockDecoSet);
  mockDecoSet.remove.mockReturnValue(mockDecoSet);

  const mockPluginKeyInstance = {
    getState: vi.fn(() => ({ set: mockDecoSet })),
  };

  return { mockDecoSet, mockPluginKeyInstance };
});

// ── ProseMirror mocks ─────────────────────────────────────────────────
vi.mock('prosemirror-state', () => ({
  Plugin: vi.fn(),
  PluginKey: vi.fn(() => mockPluginKeyInstance),
}));

vi.mock('prosemirror-view', () => ({
  Decoration: {
    widget: vi.fn(() => ({ type: 'widget' })),
  },
  DecorationSet: { empty: mockDecoSet },
}));

vi.mock('prosemirror-transform', () => ({
  ReplaceStep: class {},
  ReplaceAroundStep: class {},
}));

// ── Image helper mocks ───────────────────────────────────────────────
vi.mock('./handleBase64', () => ({
  base64ToFile: vi.fn(() => null),
  getBase64FileMeta: vi.fn(() => ({ filename: 'image.png' })),
}));

vi.mock('./handleUrl', () => ({
  urlToFile: vi.fn(() => Promise.resolve(null)),
  validateUrlAccessibility: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('./startImageUpload', () => ({
  checkAndProcessImage: vi.fn(),
  uploadAndInsertImage: vi.fn(),
}));

vi.mock('@extensions/image/imageHelpers/startImageUpload.js', () => ({
  addImageRelationship: vi.fn(() => 'rId99'),
}));

vi.mock('./fileNameUtils.js', () => ({
  buildMediaPath: vi.fn((name) => `word/media/${name}`),
  ensureUniqueFileName: vi.fn((name) => name),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────
import { Decoration } from 'prosemirror-view';
import { handleBrowserPath } from './imageRegistrationPlugin.js';
import { urlToFile, validateUrlAccessibility } from './handleUrl';
import { addImageRelationship } from '@extensions/image/imageHelpers/startImageUpload.js';

// ── Helpers ───────────────────────────────────────────────────────────
const createImageNode = (attrs) => ({
  type: { name: 'image' },
  attrs,
  nodeSize: 1,
});

const createTrStub = () => ({
  delete: vi.fn(),
  setMeta: vi.fn(),
  setNodeMarkup: vi.fn(),
  mapping: {},
  doc: {
    nodeAt: vi.fn(() => null),
    descendants: vi.fn(),
  },
});

const createViewStub = () => {
  const tr = createTrStub();
  return {
    state: {
      tr,
      doc: tr.doc,
    },
    dispatch: vi.fn(),
  };
};

const createEditorStub = () => ({
  storage: { image: { media: {}, pendingRelativeRegistrations: new Set() } },
  options: { mode: 'docx' },
});

// ── Tests ─────────────────────────────────────────────────────────────
describe('handleBrowserPath', () => {
  let tr, state, view, editor;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDecoSet.add.mockReturnValue(mockDecoSet);
    mockDecoSet.map.mockReturnValue(mockDecoSet);
    mockDecoSet.remove.mockReturnValue(mockDecoSet);
    mockDecoSet.find.mockReturnValue([]);
    mockPluginKeyInstance.getState.mockReturnValue({ set: mockDecoSet });

    tr = createTrStub();
    state = { tr };
    view = createViewStub();
    editor = createEditorStub();
  });

  it('returns null for empty foundImages', () => {
    expect(handleBrowserPath([], editor, view, state)).toBeNull();
  });

  it('returns null when only relative images are present (no synchronous doc changes)', () => {
    const relativeOnly = [
      { node: createImageNode({ src: './img.png' }), pos: 0, id: {} },
      { node: createImageNode({ src: 'images/photo.png' }), pos: 5, id: {} },
    ];

    const result = handleBrowserPath(relativeOnly, editor, view, state);

    // No synchronous transaction — relative images stay in the doc
    expect(result).toBeNull();
    expect(tr.delete).not.toHaveBeenCalled();
  });

  it('only creates decorations and deletes non-relative images', () => {
    const foundImages = [
      { node: createImageNode({ src: 'https://example.com/img.png' }), pos: 0, id: {} },
      { node: createImageNode({ src: './photos/local.jpg' }), pos: 10, id: {} },
      { node: createImageNode({ src: 'data:image/png;base64,AAA' }), pos: 20, id: {} },
    ];

    const result = handleBrowserPath(foundImages, editor, view, state);

    expect(result).not.toBeNull();
    // Only the HTTP and data URI images get placeholders and deletions
    expect(Decoration.widget).toHaveBeenCalledTimes(2);
    expect(tr.delete).toHaveBeenCalledTimes(2);
  });

  it('deletes non-relative image nodes in descending position order', () => {
    const foundImages = [
      { node: createImageNode({ src: 'https://a.com/1.png' }), pos: 5, id: {} },
      { node: createImageNode({ src: 'https://a.com/2.png' }), pos: 15, id: {} },
    ];

    handleBrowserPath(foundImages, editor, view, state);

    expect(tr.delete).toHaveBeenCalledTimes(2);
    const [firstPos] = tr.delete.mock.calls[0];
    const [secondPos] = tr.delete.mock.calls[1];
    expect(firstPos).toBeGreaterThan(secondPos);
  });
});

describe('registerRelativeImages (via handleBrowserPath)', () => {
  let view, editor;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDecoSet.add.mockReturnValue(mockDecoSet);
    mockDecoSet.map.mockReturnValue(mockDecoSet);
    mockDecoSet.remove.mockReturnValue(mockDecoSet);
    mockDecoSet.find.mockReturnValue([]);
    mockPluginKeyInstance.getState.mockReturnValue({ set: mockDecoSet });

    view = createViewStub();
    editor = createEditorStub();
  });

  it('calls urlToFile for relative URLs without CORS check', async () => {
    const foundImages = [{ node: createImageNode({ src: './photos/local.jpg' }), pos: 0, id: {} }];

    handleBrowserPath(foundImages, editor, view, { tr: createTrStub() });
    await flushPromises();

    expect(urlToFile).toHaveBeenCalledWith('./photos/local.jpg', 'local.jpg');
    expect(validateUrlAccessibility).not.toHaveBeenCalled();
  });

  it('extracts filename from nested relative path', async () => {
    const foundImages = [{ node: createImageNode({ src: 'assets/img/logo.svg' }), pos: 0, id: {} }];

    handleBrowserPath(foundImages, editor, view, { tr: createTrStub() });
    await flushPromises();

    expect(urlToFile).toHaveBeenCalledWith('assets/img/logo.svg', 'logo.svg');
  });

  it('stores binary in media store and updates node with rId on success', async () => {
    // Mock urlToFile to return a File
    const mockFile = new File(['binary'], 'photo.jpg', { type: 'image/jpeg' });
    urlToFile.mockResolvedValueOnce(mockFile);

    // Mock the view so descendants finds the node and nodeAt returns it
    const imageNode = createImageNode({ src: './photo.jpg' });
    view.state.doc.descendants.mockImplementation((cb) => {
      cb(imageNode, 5);
    });
    view.state.doc.nodeAt.mockReturnValue(imageNode);
    view.state.tr.doc.nodeAt = vi.fn(() => imageNode);

    const foundImages = [{ node: imageNode, pos: 5, id: {} }];

    handleBrowserPath(foundImages, editor, view, { tr: createTrStub() });

    // Wait for the full async chain (urlToFile → FileReader → store → dispatch)
    await vi.waitFor(() => {
      expect(Object.keys(editor.storage.image.media)).toHaveLength(1);
    });

    // Binary stored in media store
    expect(Object.keys(editor.storage.image.media)[0]).toBe('word/media/photo.jpg');

    // Relationship created
    expect(addImageRelationship).toHaveBeenCalledWith({ editor, path: 'media/photo.jpg' });

    // Node updated with rId and originalSrc for export (not deleted)
    expect(view.state.tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      ...imageNode.attrs,
      rId: 'rId99',
      originalSrc: 'word/media/photo.jpg',
    });
    expect(view.dispatch).toHaveBeenCalled();
  });

  it('skips duplicate relative URL when the first is still being registered', async () => {
    // Create a deferred promise so the first urlToFile call hangs
    let resolveFirst;
    const firstCall = new Promise((r) => (resolveFirst = r));
    urlToFile.mockReturnValueOnce(firstCall);

    const imageA = { node: createImageNode({ src: 'assets/dup.png' }), pos: 0, id: {} };
    const imageB = { node: createImageNode({ src: 'assets/dup.png' }), pos: 5, id: {} };

    // Both arrive in the same batch
    handleBrowserPath([imageA, imageB], editor, view, { tr: createTrStub() });
    await flushPromises();

    // Only one fetch is initiated — the second is blocked by pendingRelativeRegistrations
    expect(urlToFile).toHaveBeenCalledTimes(1);

    // Complete the first registration
    resolveFirst(null);
    await flushPromises();

    // pendingRelativeRegistrations is cleaned up so a future insert could register again
    expect(editor.storage.image.pendingRelativeRegistrations.size).toBe(0);
  });

  it('does not register or dispatch when urlToFile returns null (fetch failure)', async () => {
    urlToFile.mockResolvedValueOnce(null);

    const foundImages = [{ node: createImageNode({ src: 'assets/missing.png' }), pos: 0, id: {} }];

    handleBrowserPath(foundImages, editor, view, { tr: createTrStub() });
    await flushPromises();

    expect(urlToFile).toHaveBeenCalledWith('assets/missing.png', 'missing.png');

    // No media stored
    expect(Object.keys(editor.storage.image.media)).toHaveLength(0);

    // No relationship created
    expect(addImageRelationship).not.toHaveBeenCalled();

    // No transaction dispatched
    expect(view.dispatch).not.toHaveBeenCalled();

    // Pending set cleaned up so the src can be retried later
    expect(editor.storage.image.pendingRelativeRegistrations.has('assets/missing.png')).toBe(false);
  });
});
