import { describe, expect, it } from 'vitest';

import { PROOFING_CSS, type ProofingAnnotation } from '../types.js';
import { applyProofingDecorations, clearProofingDecorations } from './decoration-pass.js';

function createSpan(doc: Document, container: HTMLElement, text: string, pmStart: number, pmEnd: number): HTMLElement {
  const span = doc.createElement('span');
  span.setAttribute('data-pm-start', String(pmStart));
  span.setAttribute('data-pm-end', String(pmEnd));
  span.appendChild(doc.createTextNode(text));
  container.appendChild(span);
  return span;
}

describe('applyProofingDecorations', () => {
  it('returns false when there are no annotations and no previous decorations', () => {
    const container = document.createElement('div');
    createSpan(document, container, 'clean text', 1, 11);

    expect(applyProofingDecorations(container, [])).toBe(false);
  });

  it('applies proofing class to a fully covered span', () => {
    const container = document.createElement('div');
    const span = createSpan(document, container, 'hello', 1, 6);

    const annotations: ProofingAnnotation[] = [{ pmFrom: 1, pmTo: 6, kind: 'spelling' }];
    applyProofingDecorations(container, annotations);

    expect(span.classList.contains('sd-proofing-spelling')).toBe(true);
    expect(span.hasAttribute(PROOFING_CSS.DATA_ATTR)).toBe(true);
    expect(span.getAttribute('aria-invalid')).toBe('spelling');
  });

  it('splits a partially covered span into siblings', () => {
    const container = document.createElement('div');
    const span = createSpan(document, container, 'hello world', 1, 12);

    const annotations: ProofingAnnotation[] = [{ pmFrom: 7, pmTo: 12, kind: 'spelling' }];
    applyProofingDecorations(container, annotations);

    expect(span.style.display).toBe('none');
    const splits = container.querySelectorAll(`[${PROOFING_CSS.SPLIT_ATTR}]`);
    expect(splits.length).toBe(2);
    expect(splits[0].textContent).toBe('hello ');
    expect(splits[1].textContent).toBe('world');
    expect(splits[1].classList.contains('sd-proofing-spelling')).toBe(true);
  });

  it('skips non-leaf spans (those containing child elements)', () => {
    const container = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('data-pm-start', '1');
    span.setAttribute('data-pm-end', '6');
    span.appendChild(document.createElement('strong'));
    container.appendChild(span);

    const annotations: ProofingAnnotation[] = [{ pmFrom: 1, pmTo: 6, kind: 'spelling' }];

    expect(applyProofingDecorations(container, annotations)).toBe(false);
    expect(span.classList.contains('sd-proofing-spelling')).toBe(false);
  });

  it('skips spans with invalid PM positions', () => {
    const container = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('data-pm-start', 'abc');
    span.setAttribute('data-pm-end', 'def');
    span.appendChild(document.createTextNode('text'));
    container.appendChild(span);

    const annotations: ProofingAnnotation[] = [{ pmFrom: 1, pmTo: 6, kind: 'spelling' }];

    expect(applyProofingDecorations(container, annotations)).toBe(false);
  });

  it('returns true when clearing previous decorations even with empty annotations', () => {
    const container = document.createElement('div');
    createSpan(document, container, 'bad', 1, 4);

    applyProofingDecorations(container, [{ pmFrom: 1, pmTo: 4, kind: 'spelling' }]);

    expect(applyProofingDecorations(container, [])).toBe(true);
  });

  it('handles multiple annotations across different spans', () => {
    const container = document.createElement('div');
    const span1 = createSpan(document, container, 'bad', 1, 4);
    const span2 = createSpan(document, container, 'wrng', 5, 9);

    const annotations: ProofingAnnotation[] = [
      { pmFrom: 1, pmTo: 4, kind: 'spelling' },
      { pmFrom: 5, pmTo: 9, kind: 'grammar' },
    ];
    applyProofingDecorations(container, annotations);

    expect(span1.classList.contains('sd-proofing-spelling')).toBe(true);
    expect(span2.classList.contains('sd-proofing-grammar')).toBe(true);
  });
});

describe('clearProofingDecorations', () => {
  it('returns true when only split spans are restored', () => {
    const container = document.createElement('div');
    const span = createSpan(document, container, 'hello world', 1, 12);

    const annotations: ProofingAnnotation[] = [{ pmFrom: 7, pmTo: 12, kind: 'spelling' }];
    const mutated = applyProofingDecorations(container, annotations);

    expect(mutated).toBe(true);
    expect(span.style.display).toBe('none');
    expect(container.querySelectorAll(`[${PROOFING_CSS.SPLIT_ATTR}]`).length).toBeGreaterThan(0);

    const cleared = clearProofingDecorations(container);

    expect(cleared).toBe(true);
    expect(span.style.display).not.toBe('none');
  });

  it('returns true when both splits and direct decorations are present', () => {
    const container = document.createElement('div');
    createSpan(document, container, 'bad', 1, 4);
    createSpan(document, container, 'hello world', 5, 16);

    const annotations: ProofingAnnotation[] = [
      { pmFrom: 1, pmTo: 4, kind: 'spelling' },
      { pmFrom: 11, pmTo: 16, kind: 'spelling' },
    ];

    applyProofingDecorations(container, annotations);

    expect(clearProofingDecorations(container)).toBe(true);
  });

  it('returns false when the container has no proofing decorations', () => {
    const container = document.createElement('div');
    createSpan(document, container, 'clean text', 1, 11);

    expect(clearProofingDecorations(container)).toBe(false);
  });
});
