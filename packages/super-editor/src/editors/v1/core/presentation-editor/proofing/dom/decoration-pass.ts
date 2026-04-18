/**
 * Editor-owned DOM proofing decoration pass.
 *
 * This is a post-paint compatibility layer that walks rendered PM-mapped spans
 * and applies proofing classes without involving the painter package.
 */

import { PROOFING_CSS, cssClassForKind, type ProofingAnnotation } from '../types.js';
import { computeSplitSegments, replaceSpanWithSiblings, restoreSplitSpans } from './span-split.js';

/**
 * Apply proofing decorations to the rendered DOM.
 *
 * Returns `true` when the DOM was mutated and the caller should rebuild any
 * PM-position index derived from the painted surface.
 */
export function applyProofingDecorations(container: HTMLElement, annotations: ProofingAnnotation[]): boolean {
  const hadPrevious = clearProofingDecorations(container);
  if (annotations.length === 0) return hadPrevious;

  const sortedAnnotations = [...annotations].sort((left, right) => left.pmFrom - right.pmFrom);
  const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'));

  let mutated = false;

  for (const span of spans) {
    const pmStart = Number.parseInt(span.getAttribute('data-pm-start') ?? '', 10);
    const pmEnd = Number.parseInt(span.getAttribute('data-pm-end') ?? '', 10);

    if (Number.isNaN(pmStart) || Number.isNaN(pmEnd) || pmEnd <= pmStart) {
      continue;
    }
    if (!isLeafTextSpan(span)) {
      continue;
    }

    const overlappingAnnotations = findOverlappingAnnotations(sortedAnnotations, pmStart, pmEnd);
    if (overlappingAnnotations.length === 0) {
      continue;
    }

    const text = span.textContent ?? '';
    if (text.length === 0) {
      continue;
    }

    if (isCoveredBySingleAnnotation(pmStart, pmEnd, overlappingAnnotations)) {
      span.classList.add(cssClassForKind(overlappingAnnotations[0].kind));
      span.setAttribute(PROOFING_CSS.DATA_ATTR, '');
      span.setAttribute('aria-invalid', 'spelling');
      mutated = true;
      continue;
    }

    const segments = computeSplitSegments(pmStart, pmEnd, text, overlappingAnnotations);
    if (segments.length > 1) {
      replaceSpanWithSiblings(span, segments, text);
      mutated = true;
      continue;
    }

    if (segments.length === 1 && segments[0].proofingClass) {
      span.classList.add(segments[0].proofingClass);
      span.setAttribute(PROOFING_CSS.DATA_ATTR, '');
      span.setAttribute('aria-invalid', 'spelling');
      mutated = true;
    }
  }

  return mutated || hadPrevious;
}

/**
 * Remove all proofing decorations from the container and restore split spans.
 */
export function clearProofingDecorations(container: HTMLElement): boolean {
  let cleared = false;
  const restoredSplits = restoreSplitSpans(container);
  const decoratedElements = Array.from(container.querySelectorAll<HTMLElement>(`[${PROOFING_CSS.DATA_ATTR}]`));

  for (const element of decoratedElements) {
    element.classList.remove(PROOFING_CSS.SPELLING, PROOFING_CSS.GRAMMAR, PROOFING_CSS.STYLE);
    element.removeAttribute(PROOFING_CSS.DATA_ATTR);
    element.removeAttribute('aria-invalid');
    cleared = true;
  }

  return cleared || restoredSplits;
}

function isLeafTextSpan(element: HTMLElement): boolean {
  const children = element.childNodes;
  if (children.length === 0) return false;

  for (let index = 0; index < children.length; index += 1) {
    if (children[index].nodeType === Node.ELEMENT_NODE) {
      return false;
    }
  }

  return true;
}

function findOverlappingAnnotations(
  sortedAnnotations: ProofingAnnotation[],
  pmStart: number,
  pmEnd: number,
): ProofingAnnotation[] {
  const overlapping: ProofingAnnotation[] = [];

  for (const annotation of sortedAnnotations) {
    if (annotation.pmFrom >= pmEnd) {
      break;
    }

    if (annotation.pmTo > pmStart) {
      overlapping.push(annotation);
    }
  }

  return overlapping;
}

function isCoveredBySingleAnnotation(pmStart: number, pmEnd: number, annotations: ProofingAnnotation[]): boolean {
  return annotations.some((annotation) => annotation.pmFrom <= pmStart && annotation.pmTo >= pmEnd);
}
