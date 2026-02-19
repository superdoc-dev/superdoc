import { describe, it, expect } from 'vitest';
import { computeLinePmRange } from '../src/index.ts';
import type { FlowBlock, Line } from '@superdoc/contracts';

describe('computeLinePmRange', () => {
  describe('empty run handling (SD-1108: cursor in empty table cells)', () => {
    it('preserves PM range for single empty run', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'empty-cell',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 10,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 10,
        descent: 4,
        lineHeight: 18,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(10);
      expect(result.pmEnd).toBe(10);
    });

    it('preserves PM range when empty run is followed by non-empty run', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'mixed-runs',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 5,
            pmEnd: 5,
          },
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 5,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 5,
        width: 50,
        ascent: 10,
        descent: 4,
        lineHeight: 18,
      };

      const result = computeLinePmRange(block, line);

      // Empty run sets initial pmStart, non-empty run extends pmEnd
      expect(result.pmStart).toBe(5);
      expect(result.pmEnd).toBe(10);
    });

    it('handles empty run between non-empty runs', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'sandwich',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 1,
            pmEnd: 6,
          },
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 6,
            pmEnd: 6,
          },
          {
            text: 'World',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 6,
            pmEnd: 11,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 2,
        toChar: 5,
        width: 100,
        ascent: 10,
        descent: 4,
        lineHeight: 18,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(11);
    });

    it('handles multiple consecutive empty runs', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'multi-empty',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 10,
            pmEnd: 10,
          },
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 10,
            pmEnd: 10,
          },
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 10,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 2,
        toChar: 0,
        width: 0,
        ascent: 10,
        descent: 4,
        lineHeight: 18,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(10);
      expect(result.pmEnd).toBe(10);
    });

    it('skips empty runs with missing PM data', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'invalid-empty',
        runs: [
          {
            text: '',
            fontFamily: 'Arial',
            fontSize: 14,
            // Missing pmStart and pmEnd
          },
          {
            text: 'Valid',
            fontFamily: 'Arial',
            fontSize: 14,
            pmStart: 15,
            pmEnd: 20,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 5,
        width: 50,
        ascent: 10,
        descent: 4,
        lineHeight: 18,
      };

      const result = computeLinePmRange(block, line);

      // Should skip invalid empty run and use valid run
      expect(result.pmStart).toBe(15);
      expect(result.pmEnd).toBe(20);
    });
  });

  describe('regression tests for normal runs with text', () => {
    it('computes PM range for single run with text', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'normal-single',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 12,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 11,
        width: 120,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(12);
    });

    it('computes PM range for partial run (first run of line)', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'partial-first',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 12,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 5, // Only "Hello"
        width: 60,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(6); // 1 + 5
    });

    it('computes PM range for partial run (last run of line)', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'partial-last',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 12,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 6, // Start from "world"
        toRun: 0,
        toChar: 11,
        width: 60,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(7); // 1 + 6
      expect(result.pmEnd).toBe(12); // Min of 1 + 11 and 12
    });

    it('computes PM range spanning multiple runs', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'multi-run',
        runs: [
          {
            text: 'Hello ',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 7,
          },
          {
            text: 'world',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 7,
            pmEnd: 12,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 5,
        width: 120,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(12);
    });

    it('handles runs with missing pmEnd (inferred from text length)', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'inferred-end',
        runs: [
          {
            text: 'Hello',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 10,
            // pmEnd will be inferred as pmStart + text.length = 15
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 5,
        width: 60,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(10);
      expect(result.pmEnd).toBe(15);
    });

    it('skips runs with missing PM data', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'missing-pm',
        runs: [
          {
            text: 'Invalid',
            fontFamily: 'Arial',
            fontSize: 16,
            // Missing pmStart and pmEnd
          },
          {
            text: 'Valid',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 20,
            pmEnd: 25,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 5,
        width: 100,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(20);
      expect(result.pmEnd).toBe(25);
    });

    it('skips atomic runs (images)', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'with-image',
        runs: [
          {
            text: 'Before',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 7,
          },
          {
            src: 'image.png',
            width: 50,
            height: 50,
            pmStart: 7,
            pmEnd: 8,
          },
          {
            text: 'After',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 8,
            pmEnd: 13,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 2,
        toChar: 5,
        width: 150,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(13);
    });

    it('includes line break runs in PM range', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'with-break',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 5,
          },
          {
            kind: 'lineBreak',
            pmStart: 5,
            pmEnd: 6,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 0,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // Line break is atomic but occupies PM position 5-6
      // Empty runs preserve their PM positions for cursor support
      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(6);
    });

    it('includes field annotation runs in PM range', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'with-annotation',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 5,
          },
          {
            kind: 'fieldAnnotation',
            fieldType: 'page',
            pmStart: 5,
            pmEnd: 6,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 1,
        toChar: 0,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // Field annotation is atomic but occupies PM position 5-6
      // Empty runs preserve their PM positions for cursor support
      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(6);
    });
  });

  describe('edge cases and error handling', () => {
    it('returns empty object for non-paragraph block', () => {
      const block: FlowBlock = {
        kind: 'drawing',
        id: 'drawing-1',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 0,
        descent: 0,
        lineHeight: 0,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBeUndefined();
      expect(result.pmEnd).toBeUndefined();
    });

    it('returns empty object when no runs have PM data', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'no-pm',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 4,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBeUndefined();
      expect(result.pmEnd).toBeUndefined();
    });

    it('handles empty runs array', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'no-runs',
        runs: [],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 0,
        descent: 0,
        lineHeight: 0,
      };

      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBeUndefined();
      expect(result.pmEnd).toBeUndefined();
    });

    it('handles line range beyond run array', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'beyond-range',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 5,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 5, // Beyond array bounds
        toChar: 4,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // Should still process run 0 successfully
      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(5);
    });

    it('handles runs with null text property', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'null-text',
        runs: [
          {
            text: null as unknown as string,
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 1,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 0,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // null text coalesces to empty string, length 0, treated as empty run
      expect(result.pmStart).toBe(1);
      expect(result.pmEnd).toBe(1);
    });
  });

  describe('validation warnings for invalid PM positions', () => {
    it('handles negative PM positions', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'negative-pm',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: -5,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 4,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // Should still process but this indicates data corruption
      expect(result.pmStart).toBe(-5);
      expect(typeof result.pmEnd).toBe('number');
    });

    it('handles Infinity PM positions', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'infinity-pm',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: Infinity,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 4,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // Should still process but this indicates data corruption
      expect(result.pmStart).toBe(Infinity);
      expect(typeof result.pmEnd).toBe('number');
    });

    it('handles NaN PM positions', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'nan-pm',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: NaN,
            pmEnd: 10,
          },
        ],
      };

      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 4,
        width: 50,
        ascent: 12,
        descent: 4,
        lineHeight: 20,
      };

      const result = computeLinePmRange(block, line);

      // NaN != null check passes, but NaN-based calculations fail
      // The function continues processing other runs
      expect(result.pmStart).toBeNaN();
    });
  });
});
