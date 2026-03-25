/**
 * Span Split
 *
 * Implements sibling replacement for partial-span proofing boundaries.
 * When a proofing range partially overlaps a rendered span, the span is
 * replaced with multiple sibling spans — each with correct data-pm-start /
 * data-pm-end and a direct text-node child.
 *
 * Invariants:
 * - No nested wrappers (breaks CaretGeometry / DomPositionIndex)
 * - Every output span has a direct text-node child
 * - Original span is hidden (not removed) so it can be perfectly restored
 * - Split spans carry data-sd-proofing-split pointing to the original
 * - ALL attributes from the original span are copied to siblings
 */

import { PROOFING_CSS, cssClassForKind, type ProofingAnnotation } from './types.js';

/** Maps split sibling spans back to the hidden original for restoration. */
const splitOriginMap = new WeakMap<HTMLElement, HTMLElement>();

/**
 * A split instruction for a single span.
 * Describes how to divide the span into sibling segments.
 */
export type SplitSegment = {
  textStart: number;
  textEnd: number;
  pmStart: number;
  pmEnd: number;
  proofingClass: string | null;
};

/**
 * Compute the split segments for a span that partially overlaps a proofing range.
 *
 * @param spanPmStart - The span's data-pm-start
 * @param spanPmEnd - The span's data-pm-end
 * @param spanText - The span's text content
 * @param annotations - Proofing annotations that overlap this span
 * @returns Array of segments to create as sibling spans
 */
export function computeSplitSegments(
  spanPmStart: number,
  spanPmEnd: number,
  spanText: string,
  annotations: ProofingAnnotation[],
): SplitSegment[] {
  // Collect all boundary points within the span's PM range
  const boundaries = new Set<number>();
  boundaries.add(spanPmStart);
  boundaries.add(spanPmEnd);

  for (const ann of annotations) {
    const clampedFrom = Math.max(ann.pmFrom, spanPmStart);
    const clampedTo = Math.min(ann.pmTo, spanPmEnd);
    if (clampedFrom > spanPmStart) boundaries.add(clampedFrom);
    if (clampedTo < spanPmEnd) boundaries.add(clampedTo);
  }

  // Sort boundary points
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  // Build segments between consecutive boundary points
  const segments: SplitSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segPmStart = sorted[i];
    const segPmEnd = sorted[i + 1];

    // Map PM positions to text offsets within the span
    const textStart = segPmStart - spanPmStart;
    const textEnd = segPmEnd - spanPmStart;
    if (textEnd <= textStart || textStart >= spanText.length) continue;

    // Clamp to actual text length
    const clampedTextEnd = Math.min(textEnd, spanText.length);

    // Determine proofing class for this segment
    let proofingClass: string | null = null;
    for (const ann of annotations) {
      if (ann.pmFrom <= segPmStart && ann.pmTo >= segPmEnd) {
        proofingClass = cssClassForKind(ann.kind);
        break;
      }
    }

    segments.push({
      textStart,
      textEnd: clampedTextEnd,
      pmStart: segPmStart,
      pmEnd: segPmEnd,
      proofingClass,
    });
  }

  return segments;
}

/**
 * Replace a DOM span with multiple sibling spans according to split segments.
 * Returns the created sibling elements.
 *
 * The original span is hidden (not removed) and stored as a back-reference
 * on each sibling so it can be perfectly restored later. This preserves ALL
 * renderer metadata (data-comment-ids, data-layout-epoch, tracked-change
 * data, SDT data, run data attrs, etc.).
 *
 * Each sibling:
 * - Copies ALL attributes from the original span
 * - Overrides data-pm-start / data-pm-end for its slice
 * - Has a direct text-node child (no nested wrappers)
 * - Carries data-sd-proofing-split and data-sd-proofing for cleanup
 * - Carries aria-invalid="spelling" when proofing-decorated
 */
export function replaceSpanWithSiblings(
  originalSpan: HTMLElement,
  segments: SplitSegment[],
  spanText: string,
): HTMLElement[] {
  const parent = originalSpan.parentNode;
  if (!parent) return [];

  const doc = originalSpan.ownerDocument;
  const siblings: HTMLElement[] = [];

  for (const seg of segments) {
    const text = spanText.slice(seg.textStart, seg.textEnd);
    if (text.length === 0) continue;

    const span = doc.createElement('span');

    // Copy ALL attributes from the original span (preserves renderer metadata)
    for (let i = 0; i < originalSpan.attributes.length; i++) {
      const attr = originalSpan.attributes[i];
      span.setAttribute(attr.name, attr.value);
    }

    // Override PM position attributes for this slice
    span.setAttribute('data-pm-start', String(seg.pmStart));
    span.setAttribute('data-pm-end', String(seg.pmEnd));

    // Apply proofing class if present
    if (seg.proofingClass) {
      span.classList.add(seg.proofingClass);
      span.setAttribute('aria-invalid', 'spelling');
    }

    // Mark as proofing split for cleanup
    span.setAttribute(PROOFING_CSS.SPLIT_ATTR, '');
    span.setAttribute(PROOFING_CSS.DATA_ATTR, '');

    // Direct text-node child (invariant) — clear any copied content first
    span.textContent = '';
    span.appendChild(doc.createTextNode(text));

    // Store back-reference to original span for perfect restoration
    splitOriginMap.set(span, originalSpan);

    siblings.push(span);
  }

  // Hide the original span and strip its PM position attributes so
  // DomPositionIndex does not index an invisible element. The original
  // PM range is saved in data attributes for restoration.
  originalSpan.style.display = 'none';
  originalSpan.setAttribute(PROOFING_CSS.DATA_ATTR, 'original');
  const origPmStart = originalSpan.getAttribute('data-pm-start');
  const origPmEnd = originalSpan.getAttribute('data-pm-end');
  if (origPmStart) originalSpan.setAttribute('data-sd-orig-pm-start', origPmStart);
  if (origPmEnd) originalSpan.setAttribute('data-sd-orig-pm-end', origPmEnd);
  originalSpan.removeAttribute('data-pm-start');
  originalSpan.removeAttribute('data-pm-end');

  // Insert siblings before the hidden original
  for (const sib of siblings) {
    parent.insertBefore(sib, originalSpan);
  }

  return siblings;
}

/**
 * Restore original spans by undoing sibling splits.
 * Finds all split-marked spans, retrieves their saved original span,
 * and restores it — perfectly preserving all renderer metadata.
 */
export function restoreSplitSpans(container: HTMLElement): boolean {
  const splitSpans = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.SPLIT_ATTR}]`));
  if (splitSpans.length === 0) return false;

  // Group split siblings by their original span reference
  const groupsByOriginal = new Map<HTMLElement, HTMLElement[]>();

  for (const span of splitSpans) {
    const original = splitOriginMap.get(span);
    if (!original) continue;

    const group = groupsByOriginal.get(original);
    if (group) {
      group.push(span);
    } else {
      groupsByOriginal.set(original, [span]);
    }
  }

  // Restore each original span and remove its siblings
  for (const [original, siblings] of groupsByOriginal) {
    const parent = original.parentNode;
    if (!parent) continue;

    unhideOriginalSpan(original);

    for (const sib of siblings) {
      parent.removeChild(sib);
    }
  }

  // Clean up any orphaned split spans that lost their WeakMap reference
  const remaining = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.SPLIT_ATTR}]`));
  for (const span of remaining) {
    span.parentNode?.removeChild(span);
  }

  // Clean up hidden originals that weren't restored via the normal path
  const hiddenOriginals = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.DATA_ATTR}="original"]`));
  for (const el of hiddenOriginals) {
    unhideOriginalSpan(el);
  }

  return true;
}

/** Unhide a hidden original span and reinstate its saved PM position attributes. */
function unhideOriginalSpan(el: HTMLElement): void {
  el.style.display = '';
  if (!el.style.cssText) {
    el.removeAttribute('style');
  }
  el.removeAttribute(PROOFING_CSS.DATA_ATTR);

  const savedStart = el.getAttribute('data-sd-orig-pm-start');
  const savedEnd = el.getAttribute('data-sd-orig-pm-end');
  if (savedStart) {
    el.setAttribute('data-pm-start', savedStart);
    el.removeAttribute('data-sd-orig-pm-start');
  }
  if (savedEnd) {
    el.setAttribute('data-pm-end', savedEnd);
    el.removeAttribute('data-sd-orig-pm-end');
  }
}
