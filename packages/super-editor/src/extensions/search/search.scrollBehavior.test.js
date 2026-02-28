// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for goToSearchResult scroll behavior.
 *
 * These tests verify that search result navigation correctly handles
 * presentation-mode scrolling with proper fallback behavior:
 *
 * - When sync scrollToPosition succeeds → uses it, no fallback
 * - When sync fails → fires async for virtualized pages + DOM fallback
 * - When no presentation editor → uses DOM fallback
 */

// Minimal mock of prosemirror-search-patched to avoid heavy ProseMirror setup
vi.mock('./prosemirror-search-patched.js', () => ({
  search: vi.fn(() => ({
    key: { get: vi.fn(() => null) },
  })),
  SearchQuery: vi.fn(),
  setSearchState: vi.fn(),
  // Must return a DecorationSet-like object with .find()
  getMatchHighlights: vi.fn(() => ({ find: vi.fn(() => []) })),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

// Mock prosemirror-state to avoid real ProseMirror doc requirements
const mockSelection = {};
vi.mock('prosemirror-state', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextSelection: {
      create: vi.fn(() => mockSelection),
    },
  };
});

vi.mock('@core/PositionTracker.js', () => ({
  PositionTracker: vi.fn(() => ({
    resolve: vi.fn(() => null),
  })),
}));

// We import the extension so we can extract the command factory
const { Search } = await import('./search.js');

/**
 * Build a minimal editor-like context for calling the goToSearchResult command.
 */
function createEditorContext(overrides = {}) {
  const mockNode = document.createElement('span');
  mockNode.scrollIntoView = vi.fn();

  const doc = {
    content: { size: 200 },
    nodeSize: 200,
    resolve: vi.fn(() => ({
      node: vi.fn(() => null),
      parent: { type: { name: 'paragraph' } },
      depth: 1,
      nodeAfter: { isText: true },
      nodeBefore: { isText: true },
    })),
  };

  return {
    state: {
      doc,
      tr: {
        setSelection: vi.fn().mockReturnValue({
          scrollIntoView: vi.fn().mockReturnThis(),
        }),
      },
    },
    dispatch: vi.fn(),
    editor: {
      view: {
        focus: vi.fn(),
        domAtPos: vi.fn(() => ({ node: mockNode })),
      },
      presentationEditor: overrides.presentationEditor ?? null,
      positionTracker: { resolve: vi.fn(() => null) },
      storage: { positionTracker: { tracker: null } },
    },
    // Expose the mock node for assertions
    _domNode: mockNode,
  };
}

describe('goToSearchResult — scroll behavior', () => {
  /** @type {Function} command factory from the Search extension */
  let goToSearchResultFactory;

  beforeEach(() => {
    // Extract the command factory from the extension definition.
    // Search.create() returns an extension config; addCommands() returns the
    // commands object. goToSearchResult is a curried command:
    //   goToSearchResult(match) => ({ state, dispatch, editor }) => boolean
    const ext = Search.config;
    const commands = ext.addCommands.call({ editor: null, storage: {} });
    goToSearchResultFactory = commands.goToSearchResult;
  });

  it('uses sync scrollToPosition when it succeeds (no DOM fallback)', () => {
    const scrollToPosition = vi.fn(() => true);
    const scrollToPositionAsync = vi.fn();
    const ctx = createEditorContext({
      presentationEditor: { scrollToPosition, scrollToPositionAsync },
    });

    const match = { from: 10, to: 20, text: 'hello', id: '1', ranges: [], trackerIds: [] };
    const result = goToSearchResultFactory(match)(ctx);

    expect(result).toBe(true);
    expect(scrollToPosition).toHaveBeenCalledWith(10, { block: 'center' });
    // Async and DOM fallback should NOT fire when sync succeeds
    expect(scrollToPositionAsync).not.toHaveBeenCalled();
    expect(ctx._domNode.scrollIntoView).not.toHaveBeenCalled();
  });

  it('falls back to DOM scroll when sync scrollToPosition fails', () => {
    const scrollToPosition = vi.fn(() => false);
    const scrollToPositionAsync = vi.fn();
    const ctx = createEditorContext({
      presentationEditor: { scrollToPosition, scrollToPositionAsync },
    });

    const match = { from: 10, to: 20, text: 'hello', id: '1', ranges: [], trackerIds: [] };
    const result = goToSearchResultFactory(match)(ctx);

    expect(result).toBe(true);
    expect(scrollToPosition).toHaveBeenCalled();
    // Async should fire for virtualized pages
    expect(scrollToPositionAsync).toHaveBeenCalledWith(10, { block: 'center' });
    // DOM fallback should also fire
    expect(ctx._domNode.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
    });
  });

  it('falls back to DOM scroll when no presentation editor exists', () => {
    const ctx = createEditorContext({ presentationEditor: null });

    const match = { from: 10, to: 20, text: 'hello', id: '1', ranges: [], trackerIds: [] };
    const result = goToSearchResultFactory(match)(ctx);

    expect(result).toBe(true);
    expect(ctx._domNode.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
    });
  });

  it('does not produce unhandled rejection when async scroll rejects', async () => {
    const scrollToPosition = vi.fn(() => false);
    const scrollToPositionAsync = vi.fn(() => Promise.reject(new Error('page disappeared')));
    const ctx = createEditorContext({
      presentationEditor: { scrollToPosition, scrollToPositionAsync },
    });

    const match = { from: 10, to: 20, text: 'hello', id: '1', ranges: [], trackerIds: [] };
    const result = goToSearchResultFactory(match)(ctx);

    expect(result).toBe(true);
    expect(scrollToPositionAsync).toHaveBeenCalledWith(10, { block: 'center' });
    // Give the microtask queue a tick so the .catch() runs — no unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });

  it('fires async scroll when sync is unavailable but async exists', () => {
    const scrollToPositionAsync = vi.fn();
    const ctx = createEditorContext({
      presentationEditor: { scrollToPositionAsync },
    });

    const match = { from: 10, to: 20, text: 'hello', id: '1', ranges: [], trackerIds: [] };
    const result = goToSearchResultFactory(match)(ctx);

    expect(result).toBe(true);
    // scrollToPosition is undefined, so sync returns false (via ?. → undefined → ?? false)
    expect(scrollToPositionAsync).toHaveBeenCalledWith(10, { block: 'center' });
    // DOM fallback should also fire since sync didn't succeed
    expect(ctx._domNode.scrollIntoView).toHaveBeenCalled();
  });
});
