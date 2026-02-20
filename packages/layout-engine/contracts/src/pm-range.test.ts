import { describe, expect, it } from 'vitest';
import { computeFragmentPmRange, computeLinePmRange } from './index.js';
import type { Line, ParagraphBlock } from './index.js';

const makeLine = (params: Pick<Line, 'fromRun' | 'toRun' | 'fromChar' | 'toChar'>): Line => ({
  ...params,
  width: 0,
  ascent: 0,
  descent: 0,
  lineHeight: 0,
});

describe('pm-range', () => {
  it('ignores stale pmEnd for text runs', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'stale-pm-end',
      runs: [
        {
          text: 'Hello',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 10,
          pmEnd: 12, // stale/incorrect; should be pmStart + text.length
        },
      ],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({ pmStart: 10, pmEnd: 15 });
  });

  it('treats field annotations as atomic units (pmEnd fallback = pmStart + 1)', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'field-annotation',
      runs: [
        {
          text: 'Text',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 1,
          pmEnd: 5,
        },
        {
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Field',
          pmStart: 5,
          // pmEnd intentionally omitted
        },
      ],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 1, toChar: 0 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({ pmStart: 1, pmEnd: 6 });
  });

  it('treats image-like runs as atomic units even if kind is missing', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'image-like',
      runs: [
        {
          text: 'A',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 1,
          pmEnd: 2,
        },
        {
          src: 'image.png',
          width: 10,
          height: 10,
          pmStart: 2,
          // pmEnd intentionally omitted
        } as unknown as ParagraphBlock['runs'][number],
      ],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 1, toChar: 0 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({ pmStart: 1, pmEnd: 3 });
  });

  it('computes fragment ranges across multiple lines', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'fragment',
      runs: [
        {
          text: 'Hello',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 1,
          pmEnd: 6,
        },
        {
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Field',
          pmStart: 6,
          // pmEnd intentionally omitted
        },
      ],
    };

    const lines: Line[] = [
      makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5 }),
      makeLine({ fromRun: 1, fromChar: 0, toRun: 1, toChar: 0 }),
    ];

    expect(computeFragmentPmRange(block, lines, 0, 2)).toEqual({ pmStart: 1, pmEnd: 7 });
  });

  // Edge case tests
  it('returns empty range for empty lines', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'empty',
      runs: [],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({});
  });

  it('handles invalid run indices gracefully', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'invalid-run',
      runs: [
        {
          text: 'Hello',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 1,
          pmEnd: 6,
        },
      ],
    };

    // Line references non-existent run
    const line = makeLine({ fromRun: 5, fromChar: 0, toRun: 10, toChar: 0 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({});
  });

  it('handles runs missing pmStart', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'missing-pmstart',
      runs: [
        {
          text: 'Hello',
          fontFamily: 'Arial',
          fontSize: 14,
          // pmStart intentionally omitted
        } as ParagraphBlock['runs'][number],
      ],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({});
  });

  it('returns empty range for non-paragraph blocks', () => {
    const block = {
      kind: 'table',
      id: 'not-paragraph',
      rows: [],
    } as unknown as ParagraphBlock;

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0 });
    const result = computeLinePmRange(block, line);

    expect(result).toEqual({});
  });

  it('handles multiple atomic runs on same line', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'multiple-atomic',
      runs: [
        {
          kind: 'image',
          src: 'a.png',
          width: 10,
          height: 10,
          pmStart: 1,
        } as ParagraphBlock['runs'][number],
        {
          kind: 'lineBreak',
          pmStart: 2,
        } as ParagraphBlock['runs'][number],
        {
          kind: 'tab',
          pmStart: 3,
        } as ParagraphBlock['runs'][number],
      ],
    };

    const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 2, toChar: 0 });
    const result = computeLinePmRange(block, line);

    // Should span from first atomic run to last
    expect(result.pmStart).toBe(1);
    expect(result.pmEnd).toBe(4);
  });

  it('handles fragment range with empty first line', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'empty-first-line',
      runs: [
        {
          text: 'Second line',
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart: 1,
          pmEnd: 12,
        },
      ],
    };

    const lines: Line[] = [
      makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0 }), // empty line
      makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 11 }),
    ];

    const result = computeFragmentPmRange(block, lines, 0, 2);
    expect(result.pmStart).toBe(1);
    expect(result.pmEnd).toBe(12);
  });

  it('handles all atomic run kinds correctly', () => {
    const atomicKinds = ['image', 'lineBreak', 'break', 'tab', 'fieldAnnotation'] as const;

    atomicKinds.forEach((kind) => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: `atomic-${kind}`,
        runs: [
          {
            kind,
            pmStart: 5,
            displayLabel: kind === 'fieldAnnotation' ? 'Test' : undefined,
            variant: kind === 'fieldAnnotation' ? 'text' : undefined,
          } as ParagraphBlock['runs'][number],
        ],
      };

      const line = makeLine({ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0 });
      const result = computeLinePmRange(block, line);

      expect(result.pmStart).toBe(5);
      expect(result.pmEnd).toBe(6); // atomic runs have size 1
    });
  });
});
