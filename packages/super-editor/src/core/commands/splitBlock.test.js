import { describe, it, expect, vi, beforeEach } from 'vitest';
import { splitBlock } from './splitBlock.js';

vi.mock('../Attribute.js', () => ({
  Attribute: {
    getSplittedAttributes: vi.fn((extensionAttrs, nodeName, nodeAttrs) => ({ ...nodeAttrs })),
  },
}));

vi.mock('prosemirror-transform', () => ({
  canSplit: vi.fn(() => true),
}));

/**
 * Create a mock resolved position ($from/$to) compatible with ProseMirror
 */
function createMockResolvedPos(options = {}) {
  const { pos = 5, parent = null, parentOffset = 0, depth = 0, marks = [], node = null } = options;

  const resolved = {
    pos,
    parent: parent || { isBlock: true, content: { size: 10 }, type: { name: 'paragraph' }, inlineContent: true },
    parentOffset,
    depth,
    marks: vi.fn(() => marks),
    node: node || vi.fn(() => ({ type: { name: 'paragraph' }, attrs: {} })),
    before: vi.fn(() => 0),
    indexAfter: vi.fn(() => 0),
    // Required for Selection constructor
    min: vi.fn(function (other) {
      return this.pos < other.pos ? this : other;
    }),
    max: vi.fn(function (other) {
      return this.pos > other.pos ? this : other;
    }),
  };

  return resolved;
}

describe('splitBlock', () => {
  let mockEditor, mockState, mockTr, mockDispatch, mockSchema;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock schema with mark types
    mockSchema = {
      marks: {
        bold: {
          create: vi.fn((attrs) => ({ type: { name: 'bold' }, attrs })),
        },
        italic: {
          create: vi.fn((attrs) => ({ type: { name: 'italic' }, attrs })),
        },
        textStyle: {
          create: vi.fn((attrs) => ({ type: { name: 'textStyle' }, attrs })),
        },
        underline: {
          create: vi.fn((attrs) => ({ type: { name: 'underline' }, attrs })),
        },
      },
      nodes: {
        paragraph: {
          name: 'paragraph',
        },
      },
    };

    // Setup mock state
    mockState = {
      schema: mockSchema,
      selection: null,
      storedMarks: null,
      tr: null,
    };

    // Setup mock transaction
    mockTr = {
      selection: null,
      doc: {
        resolve: vi.fn(),
      },
      mapping: {
        map: vi.fn((pos) => pos),
      },
      deleteSelection: vi.fn(),
      split: vi.fn().mockReturnThis(),
      setNodeMarkup: vi.fn().mockReturnThis(),
      ensureMarks: vi.fn().mockReturnThis(),
      scrollIntoView: vi.fn().mockReturnThis(),
    };

    mockState.tr = mockTr;

    // Setup mock editor
    mockEditor = {
      extensionService: {
        attributes: [],
        splittableMarks: ['bold', 'italic', 'textStyle', 'underline'],
      },
      converter: null,
    };

    mockDispatch = vi.fn();
  });

  describe('basic split functionality', () => {
    it('returns false if parent is not a block', () => {
      const $from = createMockResolvedPos({
        parent: { isBlock: false, content: { size: 10 }, type: { name: 'text' }, inlineContent: true },
      });

      const $to = createMockResolvedPos({ pos: 5 });

      mockTr.selection = { $from, $to };
      mockState.selection = mockTr.selection;

      const command = splitBlock();
      const result = command({ tr: mockTr, state: mockState, dispatch: mockDispatch, editor: mockEditor });

      expect(result).toBe(false);
    });

    it('calls split and scrollIntoView when dispatching', () => {
      const $from = createMockResolvedPos();
      const $to = createMockResolvedPos({ pos: 10, parentOffset: 10 });

      mockTr.selection = { $from, $to };
      mockState.selection = mockTr.selection;

      mockTr.doc = {
        resolve: vi.fn(() => $from),
      };

      const command = splitBlock();
      // Pass a non-null dispatch to trigger the actual logic
      const result = command({ tr: mockTr, state: mockState, dispatch: () => {}, editor: mockEditor });

      expect(result).toBe(true);
      expect(mockTr.split).toHaveBeenCalled();
      expect(mockTr.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('mark merging behavior', () => {
    it('filters marks by splittableMarks list', () => {
      // Only bold and italic are splittable
      mockEditor.extensionService.splittableMarks = ['bold', 'italic'];

      const boldMark = { type: { name: 'bold' }, attrs: { value: true } };
      const linkMark = { type: { name: 'link' }, attrs: { href: 'http://example.com' } };

      const $from = createMockResolvedPos({
        marks: [boldMark, linkMark],
        node: vi.fn(() => ({
          type: { name: 'paragraph' },
          attrs: {},
        })),
      });

      const $to = createMockResolvedPos({ pos: 5, parentOffset: 5 });

      mockTr.selection = { $from, $to };
      mockState.selection = mockTr.selection;

      mockTr.doc = {
        resolve: vi.fn(() => $from),
      };

      const command = splitBlock();
      command({ tr: mockTr, state: mockState, dispatch: () => {}, editor: mockEditor });

      // Verify ensureMarks was called with only the bold mark (link filtered out)
      expect(mockTr.ensureMarks).toHaveBeenCalled();
      const appliedMarks = mockTr.ensureMarks.mock.calls[0][0];
      expect(appliedMarks).toContainEqual(boldMark);
      expect(appliedMarks).not.toContainEqual(linkMark);
    });

    it('handles storedMarks from state', () => {
      const storedBoldMark = { type: { name: 'bold' }, attrs: { value: true } };
      mockState.storedMarks = [storedBoldMark];

      const $from = createMockResolvedPos({
        node: vi.fn(() => ({
          type: { name: 'paragraph' },
          attrs: {},
        })),
      });

      const $to = createMockResolvedPos({ pos: 5, parentOffset: 5 });

      mockTr.selection = { $from, $to };
      mockState.selection = mockTr.selection;

      mockTr.doc = {
        resolve: vi.fn(() => $from),
      };

      const command = splitBlock();
      command({ tr: mockTr, state: mockState, dispatch: () => {}, editor: mockEditor });

      // Should use stored marks
      expect(mockTr.ensureMarks).toHaveBeenCalled();
      const appliedMarks = mockTr.ensureMarks.mock.calls[0][0];
      expect(appliedMarks).toContainEqual(storedBoldMark);
    });
  });

  describe('edge cases', () => {
    it('does not call ensureMarks when keepMarks is false', () => {
      const $from = createMockResolvedPos({
        marks: [{ type: { name: 'bold' }, attrs: { value: true } }],
        node: vi.fn(() => ({
          type: { name: 'paragraph' },
          attrs: {},
        })),
      });

      const $to = createMockResolvedPos({ pos: 5, parentOffset: 5 });

      mockTr.selection = { $from, $to };
      mockState.selection = mockTr.selection;

      mockTr.doc = {
        resolve: vi.fn(() => $from),
      };

      const command = splitBlock({ keepMarks: false });
      command({ tr: mockTr, state: mockState, dispatch: () => {}, editor: mockEditor });

      // ensureMarks should NOT be called
      expect(mockTr.ensureMarks).not.toHaveBeenCalled();
    });
  });
});
