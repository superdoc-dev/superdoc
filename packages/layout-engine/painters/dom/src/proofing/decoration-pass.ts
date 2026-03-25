/**
 * Decoration Pass
 *
 * Post-paint pass that walks rendered spans by data-pm-start / data-pm-end
 * and applies proofing CSS classes. This pass is:
 *
 * - Idempotent: clears previous markers before applying current set
 * - Layout-invariant: never triggers layout recomputation
 * - Post-paint only: operates on already-rendered DOM
 *
 * After the pass, DomPositionIndex must be rebuilt to reflect any
 * sibling splits.
 */

import { type ProofingAnnotation, PROOFING_CSS, cssClassForKind } from './types.js';
import { computeSplitSegments, replaceSpanWithSiblings, restoreSplitSpans } from './span-split.js';

/**
 * Apply proofing decorations to the rendered DOM.
 *
 * @param container - The painter host element containing rendered pages
 * @param annotations - Non-overlapping proofing annotations keyed by PM range
 * @returns true if any DOM mutations were made (triggers index rebuild)
 */
export function applyProofingDecorations(container: HTMLElement, annotations: ProofingAnnotation[]): boolean {
  // Step 1: Clear previous proofing decorations
  const hadPrevious = clearProofingDecorations(container);

  if (annotations.length === 0) return hadPrevious;

  // Step 2: Build a sorted annotation lookup for efficient span matching
  const sorted = [...annotations].sort((a, b) => a.pmFrom - b.pmFrom);

  // Step 3: Walk all PM-mapped spans and apply decorations
  const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'));
  let mutated = false;

  for (const span of spans) {
    const pmStart = parseInt(span.getAttribute('data-pm-start')!, 10);
    const pmEnd = parseInt(span.getAttribute('data-pm-end')!, 10);

    if (isNaN(pmStart) || isNaN(pmEnd) || pmEnd <= pmStart) continue;

    // Skip non-leaf elements (only decorate leaf text spans)
    if (!isLeafTextSpan(span)) continue;

    // Find annotations that overlap this span
    const overlapping = findOverlapping(sorted, pmStart, pmEnd);
    if (overlapping.length === 0) continue;

    const text = span.textContent ?? '';
    if (text.length === 0) continue;

    // Check if the span is fully covered by a single annotation
    if (isCoveredBySingleAnnotation(pmStart, pmEnd, overlapping)) {
      // Simple case: add proofing class directly
      span.classList.add(cssClassForKind(overlapping[0].kind));
      span.setAttribute(PROOFING_CSS.DATA_ATTR, '');
      span.setAttribute('aria-invalid', 'spelling');
      mutated = true;
    } else {
      // Partial overlap: sibling split
      const segments = computeSplitSegments(pmStart, pmEnd, text, overlapping);
      if (segments.length > 1) {
        replaceSpanWithSiblings(span, segments, text);
        mutated = true;
      } else if (segments.length === 1 && segments[0].proofingClass) {
        // Single segment that covers the whole span
        span.classList.add(segments[0].proofingClass);
        span.setAttribute(PROOFING_CSS.DATA_ATTR, '');
        span.setAttribute('aria-invalid', 'spelling');
        mutated = true;
      }
    }
  }

  return mutated || hadPrevious;
}

/**
 * Remove all proofing decorations from the container.
 * Restores sibling splits and removes proofing classes.
 */
export function clearProofingDecorations(container: HTMLElement): boolean {
  let cleared = false;

  // Restore sibling splits first — track whether DOM was mutated
  const splitRestored = restoreSplitSpans(container);

  // Remove proofing classes and attributes from all decorated spans
  const decorated = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.DATA_ATTR}]`));
  for (const el of decorated) {
    el.classList.remove(PROOFING_CSS.SPELLING, PROOFING_CSS.GRAMMAR, PROOFING_CSS.STYLE);
    el.removeAttribute(PROOFING_CSS.DATA_ATTR);
    el.removeAttribute('aria-invalid');
    cleared = true;
  }

  return cleared || splitRestored;
}

// =============================================================================
// Internal
// =============================================================================

/** Check if a span is a leaf text element (has a direct text-node child). */
function isLeafTextSpan(el: HTMLElement): boolean {
  // A leaf text span has only text-node children (no nested elements).
  const children = el.childNodes;
  if (children.length === 0) return false;
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === Node.ELEMENT_NODE) return false;
  }
  return true;
}

/**
 * Find annotations that overlap the given PM range.
 * Annotations are sorted by pmFrom.
 */
function findOverlapping(sorted: ProofingAnnotation[], pmStart: number, pmEnd: number): ProofingAnnotation[] {
  const result: ProofingAnnotation[] = [];

  for (const ann of sorted) {
    // Annotations are sorted; if this one starts after our end, we're done
    if (ann.pmFrom >= pmEnd) break;

    // Check overlap: ann.pmFrom < pmEnd && ann.pmTo > pmStart
    if (ann.pmTo > pmStart) {
      result.push(ann);
    }
  }

  return result;
}

/** Check if a single annotation fully covers the span (no split needed). */
function isCoveredBySingleAnnotation(pmStart: number, pmEnd: number, annotations: ProofingAnnotation[]): boolean {
  // Simple case: single annotation covers the entire span
  return annotations.some((ann) => ann.pmFrom <= pmStart && ann.pmTo >= pmEnd);
}
