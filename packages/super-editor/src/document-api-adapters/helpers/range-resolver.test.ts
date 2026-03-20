import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { ResolveRangeInput } from '@superdoc/document-api';
import type { BlockCandidate, BlockIndex } from './node-address-resolver.js';
import { resolveRange } from './range-resolver.js';
import { PlanError } from '../plan-engine/errors.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getBlockIndex: vi.fn(),
  resolveSelectionPointPosition: vi.fn(),
  encodeV3Ref: vi.fn(() => 'text:mock-encoded'),
  getRevision: vi.fn(() => '0'),
  checkRevision: vi.fn(),
}));

vi.mock('./index-cache.js', () => ({
  getBlockIndex: mocks.getBlockIndex,
}));

vi.mock('./selection-target-resolver.js', () => ({
  resolveSelectionPointPosition: mocks.resolveSelectionPointPosition,
}));

vi.mock('../plan-engine/query-match-adapter.js', () => ({
  encodeV3Ref: mocks.encodeV3Ref,
}));

vi.mock('../plan-engine/revision-tracker.js', () => ({
  getRevision: mocks.getRevision,
  checkRevision: mocks.checkRevision,
}));

// Provide isTextBlockCandidate — the only value import from this module.
vi.mock('./node-address-resolver.js', () => ({
  isTextBlockCandidate: (candidate: { node: { inlineContent?: boolean; isTextblock?: boolean } }) =>
    Boolean(candidate.node?.inlineContent || candidate.node?.isTextblock),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps absolute PM positions to single characters for a lightweight textBetween stub.
 * `textBetween(from, to)` concatenates mapped chars for positions `[from, to)`.
 */
function makeTextBetween(charMap: Map<number, string>) {
  return (from: number, to: number): string => {
    let result = '';
    for (let pos = from; pos < to; pos++) {
      result += charMap.get(pos) ?? '';
    }
    return result;
  };
}

function makeEditor(docContentSize: number, charMap: Map<number, string>): Editor {
  return {
    state: {
      doc: {
        content: { size: docContentSize },
        textBetween: makeTextBetween(charMap),
      },
    },
  } as unknown as Editor;
}

/**
 * Creates a mock block candidate.
 *
 * @param inlineContent - Set to `true` for text blocks (paragraph, heading),
 *   `false` for structural blocks (table, tableRow). Defaults to `true`.
 */
function makeCandidate(
  nodeId: string,
  nodeType: string,
  pos: number,
  end: number,
  options: { inlineContent?: boolean } = {},
): BlockCandidate {
  const inlineContent = options.inlineContent ?? true;
  return {
    node: { inlineContent, isTextblock: inlineContent } as any,
    pos,
    end,
    nodeType,
    nodeId,
  } as BlockCandidate;
}

function makeIndex(candidates: BlockCandidate[]): BlockIndex {
  return {
    candidates,
    byId: new Map(candidates.map((c) => [`${c.nodeType}:${c.nodeId}`, c])),
    ambiguous: new Set(),
  };
}

/** Encodes a test ref matching the V3 text ref format consumed by resolveRefAnchor. */
function encodeTestRef(rev: string, segments: Array<{ blockId: string; start: number; end: number }>): string {
  return `text:${btoa(JSON.stringify({ v: 3, rev, segments }))}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Single paragraph "ABCDE" (5 chars).
 *
 *   paragraph: pos=0, content=[1..5], end=7
 *   doc.content.size = 7
 *   Document start → pos=0 (nodeEdge before), end → pos=7 (nodeEdge after)
 */
function singleParagraph() {
  const chars = new Map<number, string>([
    [1, 'A'],
    [2, 'B'],
    [3, 'C'],
    [4, 'D'],
    [5, 'E'],
  ]);
  return {
    editor: makeEditor(7, chars),
    index: makeIndex([makeCandidate('p1', 'paragraph', 0, 7)]),
  };
}

/**
 * Two paragraphs "ABC" + "DEF" (3 chars each).
 *
 *   p1: pos=0, content=[1..3], end=5
 *   p2: pos=5, content=[6..8], end=10
 *   doc.content.size = 10
 *   Document start → pos=0, end → pos=10
 */
function twoParagraphs() {
  const chars = new Map<number, string>([
    [1, 'A'],
    [2, 'B'],
    [3, 'C'],
    [6, 'D'],
    [7, 'E'],
    [8, 'F'],
  ]);
  return {
    editor: makeEditor(10, chars),
    index: makeIndex([makeCandidate('p1', 'paragraph', 0, 5), makeCandidate('p2', 'paragraph', 5, 10)]),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRevision.mockReturnValue('0');
  mocks.encodeV3Ref.mockReturnValue('text:mock-encoded');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRange', () => {
  // -----------------------------------------------------------------------
  // Document-edge anchors
  // -----------------------------------------------------------------------

  describe('document-edge anchors', () => {
    const WHOLE_DOC_INPUT: ResolveRangeInput = {
      start: { kind: 'document', edge: 'start' },
      end: { kind: 'document', edge: 'end' },
    };

    it('resolves whole-document range to nodeEdge boundaries for a single paragraph', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const result = resolveRange(editor, WHOLE_DOC_INPUT);

      // Document start = first.pos = 0, end = max(candidates.end) = 7
      expect(result.target).toEqual({
        kind: 'selection',
        start: {
          kind: 'nodeEdge',
          node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          edge: 'before',
        },
        end: {
          kind: 'nodeEdge',
          node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          edge: 'after',
        },
      });
      expect(result.preview.text).toBe('ABCDE');
      expect(result.preview.truncated).toBe(false);
      expect(result.preview.blocks).toEqual([{ nodeId: 'p1', nodeType: 'paragraph', textPreview: 'ABCDE' }]);
    });

    it('resolves whole-document range across multiple paragraphs', () => {
      const { editor, index } = twoParagraphs();
      mocks.getBlockIndex.mockReturnValue(index);

      const result = resolveRange(editor, WHOLE_DOC_INPUT);

      // Document start = first.pos = 0, end = max(candidates.end) = 10
      expect(result.target).toEqual({
        kind: 'selection',
        start: {
          kind: 'nodeEdge',
          node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          edge: 'before',
        },
        end: {
          kind: 'nodeEdge',
          node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
          edge: 'after',
        },
      });
      expect(result.preview.text).toBe('ABC\nDEF');
      expect(result.preview.blocks).toEqual([
        { nodeId: 'p1', nodeType: 'paragraph', textPreview: 'ABC' },
        { nodeId: 'p2', nodeType: 'paragraph', textPreview: 'DEF' },
      ]);
    });

    it('resolves document edges to nodeEdge points when boundary block is an image', () => {
      // Image block (leaf, non-text, now in SELECTION_EDGE_NODE_TYPES).
      const chars = new Map<number, string>();
      const editor = makeEditor(3, chars);
      const index = makeIndex([makeCandidate('img1', 'image', 0, 3, { inlineContent: false })]);
      mocks.getBlockIndex.mockReturnValue(index);

      const result = resolveRange(editor, WHOLE_DOC_INPUT);

      expect(result.target.start).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'image', nodeId: 'img1' },
        edge: 'before',
      });
      expect(result.target.end).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'image', nodeId: 'img1' },
        edge: 'after',
      });
    });

    it('resolves document edges to nodeEdge points when boundary block is non-text', () => {
      // Table (structural) containing a paragraph (text block).
      //   table: pos=0, end=20 (inlineContent: false)
      //   paragraph: pos=3, end=12 (inlineContent: true)
      const chars = new Map<number, string>([
        [4, 'A'],
        [5, 'B'],
        [6, 'C'],
      ]);
      const editor = makeEditor(20, chars);
      const index = makeIndex([
        makeCandidate('t1', 'table', 0, 20, { inlineContent: false }),
        makeCandidate('p1', 'paragraph', 3, 12),
      ]);
      mocks.getBlockIndex.mockReturnValue(index);

      const result = resolveRange(editor, WHOLE_DOC_INPUT);

      // Document start = table.pos = 0, end = max(table.end, para.end) = 20
      expect(result.target.start).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'table', nodeId: 't1' },
        edge: 'before',
      });
      expect(result.target.end).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'table', nodeId: 't1' },
        edge: 'after',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Point anchors
  // -----------------------------------------------------------------------

  describe('point anchors', () => {
    it('delegates point resolution to resolveSelectionPointPosition', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);
      mocks.resolveSelectionPointPosition
        .mockReturnValueOnce(2) // start → abs position 2
        .mockReturnValueOnce(4); // end   → abs position 4

      const startPoint = { kind: 'text' as const, blockId: 'p1', offset: 1 };
      const endPoint = { kind: 'text' as const, blockId: 'p1', offset: 3 };
      const input: ResolveRangeInput = {
        start: { kind: 'point', point: startPoint },
        end: { kind: 'point', point: endPoint },
      };

      const result = resolveRange(editor, input);

      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledTimes(2);
      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledWith(editor, startPoint);
      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledWith(editor, endPoint);

      // absFrom=2, absTo=4 → both inside p1 content [1..6]
      expect(result.target.start).toEqual({ kind: 'text', blockId: 'p1', offset: 1 });
      expect(result.target.end).toEqual({ kind: 'text', blockId: 'p1', offset: 3 });
      expect(result.preview.text).toBe('BC');
    });
  });

  // -----------------------------------------------------------------------
  // Ref anchors
  // -----------------------------------------------------------------------

  describe('ref anchors', () => {
    it('resolves valid text ref boundaries', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const ref = encodeTestRef('0', [{ blockId: 'p1', start: 1, end: 4 }]);
      mocks.resolveSelectionPointPosition
        .mockReturnValueOnce(2) // start boundary → pos 2
        .mockReturnValueOnce(5); // end boundary   → pos 5

      const input: ResolveRangeInput = {
        start: { kind: 'ref', ref, boundary: 'start' },
        end: { kind: 'ref', ref, boundary: 'end' },
      };

      const result = resolveRange(editor, input);

      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledTimes(2);
      // Start boundary extracts first segment's start offset
      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledWith(editor, {
        kind: 'text',
        blockId: 'p1',
        offset: 1,
      });
      // End boundary extracts last segment's end offset
      expect(mocks.resolveSelectionPointPosition).toHaveBeenCalledWith(editor, {
        kind: 'text',
        blockId: 'p1',
        offset: 4,
      });
      expect(result.evaluatedRevision).toBe('0');
      expect(result.target.kind).toBe('selection');
    });

    it('rejects non-text ref prefix', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'ref', ref: 'node:abc', boundary: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      expect(() => resolveRange(editor, input)).toThrow('Only text refs');
    });

    it('rejects malformed base64 encoding', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'ref', ref: 'text:!!!not-base64!!!', boundary: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      expect(() => resolveRange(editor, input)).toThrow('Invalid text ref encoding');
    });

    it('rejects ref with no segments', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const ref = encodeTestRef('0', []);
      const input: ResolveRangeInput = {
        start: { kind: 'ref', ref, boundary: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      expect(() => resolveRange(editor, input)).toThrow('no segments');
    });

    it('rejects stale ref with REVISION_MISMATCH error code', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const ref = encodeTestRef('5', [{ blockId: 'p1', start: 0, end: 3 }]);
      const input: ResolveRangeInput = {
        start: { kind: 'ref', ref, boundary: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      expect(() => resolveRange(editor, input)).toThrow(PlanError);
      expect(() => resolveRange(editor, input)).toThrow('REVISION_MISMATCH');
    });
  });

  // -----------------------------------------------------------------------
  // Mixed anchor types
  // -----------------------------------------------------------------------

  describe('mixed anchor types', () => {
    it('combines document start with point end', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);
      mocks.resolveSelectionPointPosition.mockReturnValueOnce(3);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 2 } },
      };

      const result = resolveRange(editor, input);

      // Document start = first.pos = 0 → nodeEdge before, point end = 3 → text offset 2
      expect(result.target.start).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        edge: 'before',
      });
      expect(result.target.end).toEqual({ kind: 'text', blockId: 'p1', offset: 2 });
      expect(result.preview.text).toBe('AB');
    });
  });

  // -----------------------------------------------------------------------
  // Direction normalization
  // -----------------------------------------------------------------------

  describe('direction normalization', () => {
    it('normalizes when start resolves after end', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);
      mocks.resolveSelectionPointPosition
        .mockReturnValueOnce(5) // "start" resolves to higher position
        .mockReturnValueOnce(2); // "end" resolves to lower position

      const input: ResolveRangeInput = {
        start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 4 } },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 1 } },
      };

      const result = resolveRange(editor, input);

      // After normalization: absFrom=2, absTo=5
      expect(result.target.start).toEqual({ kind: 'text', blockId: 'p1', offset: 1 });
      expect(result.target.end).toEqual({ kind: 'text', blockId: 'p1', offset: 4 });
    });
  });

  // -----------------------------------------------------------------------
  // Revision handling
  // -----------------------------------------------------------------------

  describe('revision handling', () => {
    it('includes evaluatedRevision from getRevision', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);
      mocks.getRevision.mockReturnValue('42');

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      const result = resolveRange(editor, input);

      expect(result.evaluatedRevision).toBe('42');
    });

    it('calls checkRevision when expectedRevision is provided', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
        expectedRevision: '0',
      };

      resolveRange(editor, input);

      expect(mocks.checkRevision).toHaveBeenCalledOnce();
      expect(mocks.checkRevision).toHaveBeenCalledWith(editor, '0');
    });

    it('skips checkRevision when expectedRevision is omitted', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      resolveRange(editor, input);

      expect(mocks.checkRevision).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Output structure
  // -----------------------------------------------------------------------

  describe('output structure', () => {
    it('returns handle with ephemeral refStability', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      const result = resolveRange(editor, input);

      expect(result.handle.refStability).toBe('ephemeral');
      expect(result.handle.ref).toBe('text:mock-encoded');
    });

    it('sets coversFullTarget=true when both target endpoints are text points', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);
      mocks.resolveSelectionPointPosition.mockReturnValueOnce(2).mockReturnValueOnce(4);

      const input: ResolveRangeInput = {
        start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 1 } },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 3 } },
      };

      const result = resolveRange(editor, input);

      expect(result.handle.coversFullTarget).toBe(true);
    });

    it('sets coversFullTarget=true when selection is inside a text block nested in a structural ancestor', () => {
      // Table (structural ancestor) wrapping a paragraph (text block).
      // Selection entirely within the paragraph — the table is a benign ancestor.
      const chars = new Map<number, string>([
        [4, 'A'],
        [5, 'B'],
        [6, 'C'],
      ]);
      const editor = makeEditor(20, chars);
      const index = makeIndex([
        makeCandidate('t1', 'table', 0, 20, { inlineContent: false }),
        makeCandidate('p1', 'paragraph', 3, 12),
      ]);
      mocks.getBlockIndex.mockReturnValue(index);

      // Points inside the paragraph content.
      mocks.resolveSelectionPointPosition
        .mockReturnValueOnce(4) // start inside p1
        .mockReturnValueOnce(6); // end inside p1

      const input: ResolveRangeInput = {
        start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 0 } },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 2 } },
      };

      const result = resolveRange(editor, input);

      expect(result.target.start.kind).toBe('text');
      expect(result.target.end.kind).toBe('text');
      expect(result.handle.coversFullTarget).toBe(true);
    });

    it('sets coversFullTarget=false when range crosses structural content between text endpoints', () => {
      // p1 (text) → image (structural) → p2 (text)
      // Both endpoints are text points, but the image in between makes the ref lossy.
      const chars = new Map<number, string>([
        [1, 'A'],
        [2, 'B'],
        [9, 'C'],
        [10, 'D'],
      ]);
      const editor = makeEditor(12, chars);
      const index = makeIndex([
        makeCandidate('p1', 'paragraph', 0, 4),
        makeCandidate('img1', 'image', 4, 7, { inlineContent: false }),
        makeCandidate('p2', 'paragraph', 7, 12),
      ]);
      mocks.getBlockIndex.mockReturnValue(index);

      // Point anchors inside p1 and p2 — both resolve to text content positions.
      mocks.resolveSelectionPointPosition
        .mockReturnValueOnce(1) // start inside p1
        .mockReturnValueOnce(10); // end inside p2

      const input: ResolveRangeInput = {
        start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 0 } },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p2', offset: 1 } },
      };

      const result = resolveRange(editor, input);

      // Both endpoints are text kind...
      expect(result.target.start.kind).toBe('text');
      expect(result.target.end.kind).toBe('text');
      // ...but the image in between means the ref is lossy
      expect(result.handle.coversFullTarget).toBe(false);
    });

    it('sets coversFullTarget=false when target endpoints include nodeEdge points', () => {
      const { editor, index } = singleParagraph();
      mocks.getBlockIndex.mockReturnValue(index);

      // Document edges resolve to outer block boundaries → nodeEdge points
      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      const result = resolveRange(editor, input);

      expect(result.handle.coversFullTarget).toBe(false);
    });

    it('passes correct segments to encodeV3Ref for multi-block range', () => {
      const { editor, index } = twoParagraphs();
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      resolveRange(editor, input);

      expect(mocks.encodeV3Ref).toHaveBeenCalledOnce();
      const payload = mocks.encodeV3Ref.mock.calls[0]![0];
      expect(payload).toMatchObject({
        v: 3,
        rev: '0',
        matchId: 'range:0-10',
        scope: 'match',
        segments: [
          { blockId: 'p1', start: 0, end: 3 },
          { blockId: 'p2', start: 0, end: 3 },
        ],
      });
    });

    it('maps block boundary positions to nodeEdge selection points', () => {
      // Single paragraph: pos=0, content=[1..1], end=3
      const chars = new Map<number, string>([[1, 'X']]);
      const editor = makeEditor(3, chars);
      const index = makeIndex([makeCandidate('p1', 'paragraph', 0, 3)]);
      mocks.getBlockIndex.mockReturnValue(index);

      // Resolve to block boundary positions: pos=0 (before) and end=3 (after)
      mocks.resolveSelectionPointPosition.mockReturnValueOnce(0).mockReturnValueOnce(3);

      const input: ResolveRangeInput = {
        start: {
          kind: 'point',
          point: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, edge: 'before' },
        },
        end: {
          kind: 'point',
          point: { kind: 'nodeEdge', node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, edge: 'after' },
        },
      };

      const result = resolveRange(editor, input);

      expect(result.target.start).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        edge: 'before',
      });
      expect(result.target.end).toEqual({
        kind: 'nodeEdge',
        node: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        edge: 'after',
      });
    });

    it('encodes ref segments only for text-block candidates', () => {
      // Table (structural) wrapping a paragraph (text).
      const chars = new Map<number, string>([
        [4, 'A'],
        [5, 'B'],
        [6, 'C'],
      ]);
      const editor = makeEditor(20, chars);
      const index = makeIndex([
        makeCandidate('t1', 'table', 0, 20, { inlineContent: false }),
        makeCandidate('p1', 'paragraph', 3, 12),
      ]);
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      resolveRange(editor, input);

      const payload = mocks.encodeV3Ref.mock.calls[0]![0];
      // Table candidate is skipped (not a text block).
      // Only the nested paragraph produces a segment.
      expect(payload.segments).toEqual([{ blockId: 'p1', start: 0, end: 3 }]);
    });

    it('returns null ref for textless structural ranges (image-only document)', () => {
      // Image block only — no text blocks in the document at all.
      const chars = new Map<number, string>();
      const editor = makeEditor(3, chars);
      const index = makeIndex([makeCandidate('img1', 'image', 0, 3, { inlineContent: false })]);
      mocks.getBlockIndex.mockReturnValue(index);

      const input: ResolveRangeInput = {
        start: { kind: 'document', edge: 'start' },
        end: { kind: 'document', edge: 'end' },
      };

      const result = resolveRange(editor, input);

      // No text blocks → ref cannot be encoded → null
      expect(result.handle.ref).toBeNull();
      expect(result.handle.coversFullTarget).toBe(false);
      // encodeV3Ref should NOT have been called
      expect(mocks.encodeV3Ref).not.toHaveBeenCalled();
    });

    it('produces a fallback segment when range spans only structural boundaries', () => {
      // Table with a nested paragraph, but range is collapsed at table boundary.
      const chars = new Map<number, string>([[4, 'A']]);
      const editor = makeEditor(20, chars);
      const index = makeIndex([
        makeCandidate('t1', 'table', 0, 20, { inlineContent: false }),
        makeCandidate('p1', 'paragraph', 3, 6),
      ]);
      mocks.getBlockIndex.mockReturnValue(index);

      // Point anchors that resolve to the table's outer boundaries (collapsed at pos 0).
      mocks.resolveSelectionPointPosition.mockReturnValueOnce(0).mockReturnValueOnce(0);

      const input: ResolveRangeInput = {
        start: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 0 } },
        end: { kind: 'point', point: { kind: 'text', blockId: 'p1', offset: 0 } },
      };

      resolveRange(editor, input);

      const payload = mocks.encodeV3Ref.mock.calls[0]![0];
      // No candidates overlap the collapsed range [0, 0], but the fallback
      // finds the nearest text block (p1) and creates a zero-width segment.
      expect(payload.segments).toHaveLength(1);
      expect(payload.segments[0].blockId).toBe('p1');
      expect(payload.segments[0].start).toBe(payload.segments[0].end);
    });
  });
});
