import { describe, expect, it } from 'vitest';

import type { ProofingAnnotation } from '../types.js';
import { computeSplitSegments } from './span-split.js';

describe('computeSplitSegments', () => {
  it('returns single segment for fully covered span', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 10, pmTo: 15, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 15, 'hello', annotations);

    expect(segments).toHaveLength(1);
    expect(segments[0].proofingClass).toBe('sd-proofing-spelling');
    expect(segments[0].textStart).toBe(0);
    expect(segments[0].textEnd).toBe(5);
  });

  it('splits span with leading non-proofed text', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 13, pmTo: 15, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 15, 'hello', annotations);

    expect(segments).toHaveLength(2);
    expect(segments[0].proofingClass).toBeNull();
    expect(segments[0].textStart).toBe(0);
    expect(segments[0].textEnd).toBe(3);
    expect(segments[1].proofingClass).toBe('sd-proofing-spelling');
    expect(segments[1].textStart).toBe(3);
    expect(segments[1].textEnd).toBe(5);
  });

  it('splits span with trailing non-proofed text', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 10, pmTo: 13, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 15, 'hello', annotations);

    expect(segments).toHaveLength(2);
    expect(segments[0].proofingClass).toBe('sd-proofing-spelling');
    expect(segments[0].textEnd).toBe(3);
    expect(segments[1].proofingClass).toBeNull();
    expect(segments[1].textStart).toBe(3);
  });

  it('splits span with proofed text in the middle', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 12, pmTo: 14, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 16, 'abcdef', annotations);

    expect(segments).toHaveLength(3);
    expect(segments[0].proofingClass).toBeNull();
    expect(segments[1].proofingClass).toBe('sd-proofing-spelling');
    expect(segments[2].proofingClass).toBeNull();
  });

  it('preserves correct PM positions', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 12, pmTo: 14, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 16, 'abcdef', annotations);

    expect(segments[0].pmStart).toBe(10);
    expect(segments[0].pmEnd).toBe(12);
    expect(segments[1].pmStart).toBe(12);
    expect(segments[1].pmEnd).toBe(14);
    expect(segments[2].pmStart).toBe(14);
    expect(segments[2].pmEnd).toBe(16);
  });

  it('handles annotation extending beyond span', () => {
    const annotations: ProofingAnnotation[] = [{ pmFrom: 5, pmTo: 20, kind: 'spelling' }];
    const segments = computeSplitSegments(10, 15, 'hello', annotations);

    expect(segments).toHaveLength(1);
    expect(segments[0].proofingClass).toBe('sd-proofing-spelling');
  });

  it('handles multiple annotations on one span', () => {
    const annotations: ProofingAnnotation[] = [
      { pmFrom: 10, pmTo: 12, kind: 'spelling' },
      { pmFrom: 14, pmTo: 16, kind: 'spelling' },
    ];
    const segments = computeSplitSegments(10, 16, 'abcdef', annotations);

    expect(segments).toHaveLength(3);
    expect(segments[0].proofingClass).toBe('sd-proofing-spelling');
    expect(segments[1].proofingClass).toBeNull();
    expect(segments[2].proofingClass).toBe('sd-proofing-spelling');
  });
});
