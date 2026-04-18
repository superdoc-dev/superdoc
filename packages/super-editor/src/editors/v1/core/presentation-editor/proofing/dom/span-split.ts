/**
 * Span split helpers for the editor-owned proofing decoration pass.
 *
 * Partial proofing overlaps cannot be expressed by toggling a class on the
 * original run span, so the pass temporarily replaces that span with sibling
 * slices that preserve PM position metadata.
 */

import { PROOFING_CSS, cssClassForKind, type ProofingAnnotation } from '../types.js';

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
 */
export function computeSplitSegments(
  spanPmStart: number,
  spanPmEnd: number,
  spanText: string,
  annotations: ProofingAnnotation[],
): SplitSegment[] {
  const boundaries = new Set<number>();
  boundaries.add(spanPmStart);
  boundaries.add(spanPmEnd);

  for (const annotation of annotations) {
    const clampedFrom = Math.max(annotation.pmFrom, spanPmStart);
    const clampedTo = Math.min(annotation.pmTo, spanPmEnd);
    if (clampedFrom > spanPmStart) boundaries.add(clampedFrom);
    if (clampedTo < spanPmEnd) boundaries.add(clampedTo);
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
  const segments: SplitSegment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const segmentPmStart = sortedBoundaries[index];
    const segmentPmEnd = sortedBoundaries[index + 1];

    const textStart = segmentPmStart - spanPmStart;
    const textEnd = segmentPmEnd - spanPmStart;
    if (textEnd <= textStart || textStart >= spanText.length) {
      continue;
    }

    const clampedTextEnd = Math.min(textEnd, spanText.length);

    let proofingClass: string | null = null;
    for (const annotation of annotations) {
      if (annotation.pmFrom <= segmentPmStart && annotation.pmTo >= segmentPmEnd) {
        proofingClass = cssClassForKind(annotation.kind);
        break;
      }
    }

    segments.push({
      textStart,
      textEnd: clampedTextEnd,
      pmStart: segmentPmStart,
      pmEnd: segmentPmEnd,
      proofingClass,
    });
  }

  return segments;
}

/**
 * Replace a rendered span with proofing-aware sibling slices.
 *
 * The original span is hidden, not destroyed, so restoration is lossless.
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

  for (const segment of segments) {
    const text = spanText.slice(segment.textStart, segment.textEnd);
    if (text.length === 0) continue;

    const span = doc.createElement('span');

    for (let index = 0; index < originalSpan.attributes.length; index += 1) {
      const attr = originalSpan.attributes[index];
      span.setAttribute(attr.name, attr.value);
    }

    span.setAttribute('data-pm-start', String(segment.pmStart));
    span.setAttribute('data-pm-end', String(segment.pmEnd));

    if (segment.proofingClass) {
      span.classList.add(segment.proofingClass);
      span.setAttribute('aria-invalid', 'spelling');
    }

    span.setAttribute(PROOFING_CSS.SPLIT_ATTR, '');
    span.setAttribute(PROOFING_CSS.DATA_ATTR, '');
    span.textContent = '';
    span.appendChild(doc.createTextNode(text));

    splitOriginMap.set(span, originalSpan);
    siblings.push(span);
  }

  originalSpan.style.display = 'none';
  originalSpan.setAttribute(PROOFING_CSS.DATA_ATTR, 'original');

  const originalPmStart = originalSpan.getAttribute('data-pm-start');
  const originalPmEnd = originalSpan.getAttribute('data-pm-end');
  if (originalPmStart) originalSpan.setAttribute('data-sd-orig-pm-start', originalPmStart);
  if (originalPmEnd) originalSpan.setAttribute('data-sd-orig-pm-end', originalPmEnd);
  originalSpan.removeAttribute('data-pm-start');
  originalSpan.removeAttribute('data-pm-end');

  for (const sibling of siblings) {
    parent.insertBefore(sibling, originalSpan);
  }

  return siblings;
}

/**
 * Restore original spans by undoing sibling splits.
 */
export function restoreSplitSpans(container: HTMLElement): boolean {
  const splitSpans = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.SPLIT_ATTR}]`));
  if (splitSpans.length === 0) return false;

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

  for (const [original, siblings] of groupsByOriginal) {
    const parent = original.parentNode;
    if (!parent) continue;

    unhideOriginalSpan(original);
    for (const sibling of siblings) {
      parent.removeChild(sibling);
    }
  }

  const remainingSplitSpans = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.SPLIT_ATTR}]`));
  for (const span of remainingSplitSpans) {
    span.parentNode?.removeChild(span);
  }

  const hiddenOriginals = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.DATA_ATTR}="original"]`));
  for (const element of hiddenOriginals) {
    unhideOriginalSpan(element);
  }

  return true;
}

function unhideOriginalSpan(element: HTMLElement): void {
  element.style.display = '';
  if (!element.style.cssText) {
    element.removeAttribute('style');
  }

  element.removeAttribute(PROOFING_CSS.DATA_ATTR);

  const savedStart = element.getAttribute('data-sd-orig-pm-start');
  const savedEnd = element.getAttribute('data-sd-orig-pm-end');

  if (savedStart) {
    element.setAttribute('data-pm-start', savedStart);
    element.removeAttribute('data-sd-orig-pm-start');
  }
  if (savedEnd) {
    element.setAttribute('data-pm-end', savedEnd);
    element.removeAttribute('data-sd-orig-pm-end');
  }
}
