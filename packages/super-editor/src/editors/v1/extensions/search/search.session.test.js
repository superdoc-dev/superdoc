// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the search session commands:
 *   setSearchSession, clearSearchSession, nextSearchMatch,
 *   previousSearchMatch, replaceSearchMatch, replaceAllSearchMatches
 *
 * Uses the same mock-heavy approach as search.scrollBehavior.test.js
 * to avoid bootstrapping a full ProseMirror editor.
 */

// Minimal mock of prosemirror-search-patched to avoid heavy ProseMirror setup
vi.mock('./prosemirror-search-patched.js', () => ({
  search: vi.fn(() => ({
    key: { get: vi.fn(() => null) },
  })),
  SearchQuery: vi.fn(),
  setSearchState: vi.fn(),
  getMatchHighlights: vi.fn(() => ({ find: vi.fn(() => []) })),
}));

vi.mock('uuid', () => ({
  v4: (() => {
    let counter = 0;
    return vi.fn(() => `uuid-${++counter}`);
  })(),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TextSelection: {
      create: vi.fn(() => ({})),
    },
  };
});

vi.mock('@core/PositionTracker.js', () => ({
  PositionTracker: vi.fn(() => ({
    resolve: vi.fn(() => null),
    trackMany: vi.fn((ranges) => ranges.map((_, i) => `tracker-${i}`)),
    untrackByType: vi.fn(),
  })),
}));

const { Search } = await import('./search.js');

function createMockStorage() {
  // Create fresh storage from the extension config
  const storage = Search.config.addStorage.call({});
  return storage;
}

function createMockDoc(paragraphs) {
  const textParts = paragraphs.join('\n');
  return {
    content: { size: textParts.length + paragraphs.length * 2 },
    nodeSize: textParts.length + paragraphs.length * 2 + 2,
    textBetween: vi.fn((from, to) => {
      // Simplified: return the text at the requested range
      return textParts.slice(from - 1, to - 1);
    }),
    resolve: vi.fn(() => ({ nodeAfter: null, nodeBefore: null })),
    forEach: vi.fn(),
  };
}

describe('search session commands', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('setSearchSession', () => {
    it('initializes storage with session state', () => {
      expect(storage.activeMatchIndex).toBe(-1);
      expect(storage.query).toBe('');
      expect(storage.caseSensitive).toBe(false);
      expect(storage.ignoreDiacritics).toBe(false);
    });

    it('has all expected storage fields', () => {
      expect(storage).toHaveProperty('searchResults');
      expect(storage).toHaveProperty('highlightEnabled');
      expect(storage).toHaveProperty('searchIndex');
      expect(storage).toHaveProperty('activeMatchIndex');
      expect(storage).toHaveProperty('query');
      expect(storage).toHaveProperty('caseSensitive');
      expect(storage).toHaveProperty('ignoreDiacritics');
    });
  });

  describe('clearSearchSession', () => {
    it('resets all session state', () => {
      // Simulate having some state
      storage.searchResults = [{ id: '1', from: 0, to: 5 }];
      storage.activeMatchIndex = 0;
      storage.query = 'test';
      storage.caseSensitive = true;
      storage.ignoreDiacritics = true;
      storage.highlightEnabled = false;

      // Extract the clearSearchSession command
      const commands = Search.config.addCommands.call({ storage, editor: null });
      const clear = commands.clearSearchSession;

      const mockEditor = {
        positionTracker: {
          untrackByType: vi.fn(),
        },
        storage: {},
      };

      clear()({ state: {}, editor: mockEditor });

      expect(storage.searchResults).toEqual([]);
      expect(storage.activeMatchIndex).toBe(-1);
      expect(storage.query).toBe('');
      expect(storage.caseSensitive).toBe(false);
      expect(storage.ignoreDiacritics).toBe(false);
      expect(storage.highlightEnabled).toBe(true);
    });
  });

  describe('nextSearchMatch / previousSearchMatch', () => {
    it('nextSearchMatch wraps from last to first', () => {
      storage.searchResults = [
        { id: '1', from: 0, to: 3, ranges: [{ from: 0, to: 3 }], text: 'abc' },
        { id: '2', from: 10, to: 13, ranges: [{ from: 10, to: 13 }], text: 'abc' },
        { id: '3', from: 20, to: 23, ranges: [{ from: 20, to: 23 }], text: 'abc' },
      ];
      storage.activeMatchIndex = 2; // at last

      const commands = Search.config.addCommands.call({ storage, editor: null });
      const next = commands.nextSearchMatch;

      const mockState = {
        doc: {
          content: { size: 100 },
          textBetween: vi.fn(() => ''),
          resolve: vi.fn(() => ({ nodeAfter: null, nodeBefore: null })),
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          scrollIntoView: vi.fn().mockReturnThis(),
        },
      };

      const mockEditor = {
        view: { focus: vi.fn(), domAtPos: vi.fn(() => ({ node: { scrollIntoView: vi.fn() } })) },
        positionTracker: { resolve: vi.fn(() => null) },
        presentationEditor: null,
        storage: {},
        commands: {
          goToSearchResult: vi.fn(),
        },
      };

      const result = next()({ state: mockState, editor: mockEditor, dispatch: vi.fn() });

      expect(result.activeMatchIndex).toBe(0);
      expect(storage.activeMatchIndex).toBe(0);
    });

    it('previousSearchMatch wraps from first to last', () => {
      storage.searchResults = [
        { id: '1', from: 0, to: 3, ranges: [{ from: 0, to: 3 }], text: 'abc' },
        { id: '2', from: 10, to: 13, ranges: [{ from: 10, to: 13 }], text: 'abc' },
        { id: '3', from: 20, to: 23, ranges: [{ from: 20, to: 23 }], text: 'abc' },
      ];
      storage.activeMatchIndex = 0; // at first

      const commands = Search.config.addCommands.call({ storage, editor: null });
      const prev = commands.previousSearchMatch;

      const mockEditor = {
        view: { focus: vi.fn(), domAtPos: vi.fn(() => ({ node: { scrollIntoView: vi.fn() } })) },
        positionTracker: { resolve: vi.fn(() => null) },
        presentationEditor: null,
        storage: {},
        commands: {
          goToSearchResult: vi.fn(),
        },
      };

      const result = prev()({
        state: {
          doc: {
            content: { size: 100 },
            textBetween: vi.fn(() => ''),
            resolve: vi.fn(() => ({ nodeAfter: null, nodeBefore: null })),
          },
          tr: { setSelection: vi.fn().mockReturnThis(), scrollIntoView: vi.fn().mockReturnThis() },
        },
        editor: mockEditor,
        dispatch: vi.fn(),
      });

      expect(result.activeMatchIndex).toBe(2);
      expect(storage.activeMatchIndex).toBe(2);
    });

    it('returns -1 when no matches', () => {
      storage.searchResults = [];
      storage.activeMatchIndex = -1;

      const commands = Search.config.addCommands.call({ storage, editor: null });
      const result = commands.nextSearchMatch()({ state: {}, editor: {} });

      expect(result.activeMatchIndex).toBe(-1);
      expect(result.match).toBeNull();
    });
  });

  describe('active match decoration', () => {
    it('decorations plugin reads activeMatchIndex from storage', () => {
      // The searchHighlightWithIdPlugin reads from storage.activeMatchIndex
      // Verify that the storage field exists and is used
      expect(storage.activeMatchIndex).toBe(-1);

      // After setting matches, the decoration builder should use activeMatchIndex
      storage.searchResults = [
        { id: '1', from: 0, to: 3, ranges: [{ from: 0, to: 3 }] },
        { id: '2', from: 10, to: 13, ranges: [{ from: 10, to: 13 }] },
      ];
      storage.activeMatchIndex = 1;

      // The actual decoration classes are tested via integration tests;
      // here we verify the storage contract
      expect(storage.activeMatchIndex).toBe(1);
      expect(storage.searchResults[storage.activeMatchIndex].id).toBe('2');
    });
  });

  describe('setSearchSession batches tracker updates', () => {
    let storage;
    let trackMany;
    let mockEditor;
    let mockState;

    beforeEach(() => {
      storage = createMockStorage();

      trackMany = vi.fn((ranges) => ranges.map((_, i) => `tracker-${i}`));
      mockEditor = {
        positionTracker: { trackMany, untrackByType: vi.fn() },
      };
      mockState = {
        doc: {
          content: { size: 100 },
          textBetween: vi.fn(() => 'a'),
          resolve: vi.fn(() => ({ nodeAfter: null, nodeBefore: null })),
        },
      };
    });

    function runSearch(indexMatches, offsetRangeToDocRanges, editor = mockEditor) {
      storage.searchIndex = {
        ensureValid: vi.fn(),
        search: vi.fn(() => indexMatches),
        offsetRangeToDocRanges: vi.fn(offsetRangeToDocRanges),
      };
      const commands = Search.config.addCommands.call({ storage });
      return commands.setSearchSession('a')({ state: mockState, editor });
    }

    it('calls trackMany exactly once for multiple matches', () => {
      const indexMatches = [
        { start: 0, end: 1, text: 'a' },
        { start: 5, end: 6, text: 'a' },
        { start: 10, end: 11, text: 'a' },
      ];
      runSearch(indexMatches, (start, end) => [{ from: start + 1, to: end + 1 }]);

      expect(trackMany).toHaveBeenCalledTimes(1);
    });

    it('passes all ranges in one trackMany call', () => {
      const indexMatches = [
        { start: 0, end: 1, text: 'a' },
        { start: 5, end: 6, text: 'a' },
        { start: 10, end: 11, text: 'a' },
      ];
      runSearch(indexMatches, (start, end) => [{ from: start + 1, to: end + 1 }]);

      const [calledRanges] = trackMany.mock.calls[0];
      expect(calledRanges).toHaveLength(3);
      expect(calledRanges[0]).toMatchObject({ from: 1, to: 2 });
      expect(calledRanges[1]).toMatchObject({ from: 6, to: 7 });
      expect(calledRanges[2]).toMatchObject({ from: 11, to: 12 });
    });

    it('distributes tracker ids back onto each match in order', () => {
      const indexMatches = [
        { start: 0, end: 1, text: 'a' },
        { start: 5, end: 6, text: 'a' },
        { start: 10, end: 11, text: 'a' },
      ];
      const { matches } = runSearch(indexMatches, (start, end) => [{ from: start + 1, to: end + 1 }]);

      expect(matches[0].trackerIds).toEqual(['tracker-0']);
      expect(matches[0].id).toBe('tracker-0');
      expect(matches[1].trackerIds).toEqual(['tracker-1']);
      expect(matches[1].id).toBe('tracker-1');
      expect(matches[2].trackerIds).toEqual(['tracker-2']);
      expect(matches[2].id).toBe('tracker-2');
    });

    it('handles cross-paragraph match: distributes multiple ids per multi-range match', () => {
      // match 0 spans a paragraph boundary → 2 ranges; match 1 is single-range
      const indexMatches = [
        { start: 0, end: 10, text: 'cross para' },
        { start: 20, end: 25, text: 'simple' },
      ];
      const rangesMap = {
        '0-10': [
          { from: 1, to: 6 },
          { from: 8, to: 11 },
        ],
        '20-25': [{ from: 21, to: 26 }],
      };
      const { matches } = runSearch(indexMatches, (start, end) => rangesMap[`${start}-${end}`]);

      expect(trackMany).toHaveBeenCalledTimes(1);
      const [calledRanges] = trackMany.mock.calls[0];
      expect(calledRanges).toHaveLength(3); // 2 from match 0 + 1 from match 1

      // rangeIndex metadata must preserve local ordering within each match
      expect(calledRanges[0]).toMatchObject({ spec: { metadata: { rangeIndex: 0 } } });
      expect(calledRanges[1]).toMatchObject({ spec: { metadata: { rangeIndex: 1 } } });
      expect(calledRanges[2]).toMatchObject({ spec: { metadata: { rangeIndex: 0 } } });

      expect(matches[0].trackerIds).toEqual(['tracker-0', 'tracker-1']);
      expect(matches[0].id).toBe('tracker-0');
      expect(matches[1].trackerIds).toEqual(['tracker-2']);
      expect(matches[1].id).toBe('tracker-2');
    });

    it('skipped match (empty ranges) does not corrupt id slicing for remaining matches', () => {
      // match at index 1 has no doc ranges and should be excluded from results
      const indexMatches = [
        { start: 0, end: 1, text: 'a' },
        { start: 5, end: 6, text: 'a' }, // will return []
        { start: 10, end: 11, text: 'a' },
      ];
      const { matches } = runSearch(indexMatches, (start, end) => {
        if (start === 5) return [];
        return [{ from: start + 1, to: end + 1 }];
      });

      expect(matches).toHaveLength(2);
      expect(trackMany).toHaveBeenCalledTimes(1);

      const [calledRanges] = trackMany.mock.calls[0];
      expect(calledRanges).toHaveLength(2);

      expect(matches[0].trackerIds).toEqual(['tracker-0']);
      expect(matches[0].id).toBe('tracker-0');
      expect(matches[1].trackerIds).toEqual(['tracker-1']);
      expect(matches[1].id).toBe('tracker-1');
    });

    it('does not call trackMany when editor has no position tracker', () => {
      const indexMatches = [{ start: 0, end: 1, text: 'a' }];
      const { matches } = runSearch(indexMatches, (start, end) => [{ from: start + 1, to: end + 1 }], null);

      expect(trackMany).not.toHaveBeenCalled();
      expect(matches[0].trackerIds).toEqual([]);
      expect(matches[0].id).toBeDefined(); // uuid fallback
    });

    it('throws if trackMany returns a different id count than ranges (contract guard)', () => {
      const badEditor = {
        positionTracker: {
          // returns one fewer id than ranges -> contract violation
          trackMany: vi.fn((ranges) => ranges.slice(1).map((_, i) => `tracker-${i}`)),
          untrackByType: vi.fn(),
        },
      };
      const indexMatches = [
        { start: 0, end: 1, text: 'a' },
        { start: 5, end: 6, text: 'a' },
      ];

      expect(() => runSearch(indexMatches, (start, end) => [{ from: start + 1, to: end + 1 }], badEditor)).toThrow(
        /expected one id per range/,
      );
    });
  });
});
