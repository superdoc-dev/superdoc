import { describe, it, expect } from 'vitest';
import { applyProofingDecorations, clearProofingDecorations } from './decoration-pass.js';
import { PROOFING_CSS } from './types.js';
import type { ProofingAnnotation } from './types.js';

/**
 * Create a minimal rendered span with PM position attributes and a text node.
 */
function createSpan(doc: Document, container: HTMLElement, text: string, pmStart: number, pmEnd: number): HTMLElement {
  const span = doc.createElement('span');
  span.setAttribute('data-pm-start', String(pmStart));
  span.setAttribute('data-pm-end', String(pmEnd));
  span.appendChild(doc.createTextNode(text));
  container.appendChild(span);
  return span;
}

describe('clearProofingDecorations', () => {
  it('returns true when only split spans are restored (no remaining proofing attrs)', () => {
    const container = document.createElement('div');

    // Create a span "hello world" at PM positions 1-12
    const span = createSpan(document, container, 'hello world', 1, 12);

    // Apply a partial annotation that triggers a sibling split
    // "world" is at text offset 6-11, PM positions 7-12
    const annotations: ProofingAnnotation[] = [{ pmFrom: 7, pmTo: 12, kind: 'spelling' }];
    const mutated = applyProofingDecorations(container, annotations);
    expect(mutated).toBe(true);

    // Verify split happened: original is hidden, siblings exist
    expect(span.style.display).toBe('none');
    const splits = container.querySelectorAll(`[${PROOFING_CSS.SPLIT_ATTR}]`);
    expect(splits.length).toBeGreaterThan(0);

    // Now clear — this should return true because restoreSplitSpans mutated the DOM
    const cleared = clearProofingDecorations(container);
    expect(cleared).toBe(true);

    // Original span should be restored
    expect(span.style.display).not.toBe('none');
  });

  it('returns true when both splits and direct decorations are present', () => {
    const container = document.createElement('div');

    // Span 1: will be fully covered (no split needed)
    createSpan(document, container, 'bad', 1, 4);

    // Span 2: will be partially covered (split needed)
    createSpan(document, container, 'hello world', 5, 16);

    const annotations: ProofingAnnotation[] = [
      { pmFrom: 1, pmTo: 4, kind: 'spelling' },
      { pmFrom: 11, pmTo: 16, kind: 'spelling' },
    ];
    applyProofingDecorations(container, annotations);

    const cleared = clearProofingDecorations(container);
    expect(cleared).toBe(true);
  });

  it('returns false when container has no proofing decorations', () => {
    const container = document.createElement('div');
    createSpan(document, container, 'clean text', 1, 11);

    const cleared = clearProofingDecorations(container);
    expect(cleared).toBe(false);
  });
});
