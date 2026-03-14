/**
 * Test-only normalization helpers for comparing rendered line output
 * across different rendering contexts (body, table-cell, list-item).
 *
 * DO NOT import this file from production code. Only *.test.ts and
 * other test-utils/ files may import from here.
 */

export interface NormalizedRun {
  text: string;
  fontFamily: string | undefined;
  fontSize: string | undefined;
  fontWeight: string | undefined;
  fontStyle: string | undefined;
  color: string | undefined;
  textDecoration: string | undefined;
  backgroundColor: string | undefined;
  href: string | undefined;
  target: string | undefined;
  rel: string | undefined;
}

export interface NormalizedLine {
  textAlign: string;
  wordSpacing: string;
  runs: NormalizedRun[];
  marker?: {
    text: string;
    justification: string | undefined;
  };
}

const MARKER_CLASS = 'superdoc-paragraph-marker';
const TAB_CLASS = 'superdoc-tab';
const EMPTY_RUN_CLASS = 'superdoc-empty-run';

function isSkippableElement(el: Element): boolean {
  return (
    el.classList.contains(TAB_CLASS) ||
    el.classList.contains(EMPTY_RUN_CLASS) ||
    el.classList.contains(MARKER_CLASS) ||
    el.classList.contains('superdoc-leader') ||
    el.classList.contains('superdoc-tab-bar')
  );
}

function normalizeRun(span: HTMLElement): NormalizedRun {
  const style = span.style;

  // Check for link wrapper — immediate parent or grandparent <a>
  const linkEl =
    span.parentElement?.tagName === 'A'
      ? (span.parentElement as HTMLAnchorElement)
      : span.parentElement?.parentElement?.tagName === 'A'
        ? (span.parentElement.parentElement as HTMLAnchorElement)
        : null;

  return {
    text: span.textContent ?? '',
    fontFamily: style.fontFamily || undefined,
    fontSize: style.fontSize || undefined,
    fontWeight: style.fontWeight || undefined,
    fontStyle: style.fontStyle || undefined,
    color: style.color || undefined,
    textDecoration: style.textDecoration || undefined,
    backgroundColor: style.backgroundColor || undefined,
    href: linkEl?.getAttribute('href') ?? undefined,
    target: linkEl?.getAttribute('target') ?? undefined,
    rel: linkEl?.getAttribute('rel') ?? undefined,
  };
}

/** Normalize a direct <a>text</a> anchor element (no inner span). */
function normalizeRunFromAnchor(anchor: HTMLAnchorElement): NormalizedRun {
  const style = anchor.style;
  return {
    text: anchor.textContent ?? '',
    fontFamily: style.fontFamily || undefined,
    fontSize: style.fontSize || undefined,
    fontWeight: style.fontWeight || undefined,
    fontStyle: style.fontStyle || undefined,
    color: style.color || undefined,
    textDecoration: style.textDecoration || undefined,
    backgroundColor: style.backgroundColor || undefined,
    href: anchor.getAttribute('href') ?? undefined,
    target: anchor.getAttribute('target') ?? undefined,
    rel: anchor.getAttribute('rel') ?? undefined,
  };
}

/**
 * Normalize a single .superdoc-line element into a semantic representation.
 * Extracts line-level styles (textAlign, wordSpacing) and per-run styles
 * from child span elements.
 */
export function normalizeLine(lineEl: HTMLElement): NormalizedLine {
  const runs: NormalizedRun[] = [];
  let marker: NormalizedLine['marker'] = undefined;

  // Extract marker if present (paragraph wordLayout path)
  const markerEl = lineEl.querySelector(`.${MARKER_CLASS}`) as HTMLElement | null;
  if (markerEl) {
    marker = {
      text: markerEl.textContent ?? '',
      justification: markerEl.style.textAlign || undefined,
    };
  }

  // Collect text-bearing span elements, skipping markers, tabs, and utility elements
  const children = lineEl.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement;

    if (isSkippableElement(child)) continue;

    // Handle link elements: <a><span>text</span></a> OR <a>text</a> (no inner span)
    if (child.tagName === 'A') {
      const innerSpans = child.querySelectorAll('span');
      if (innerSpans.length > 0) {
        for (let j = 0; j < innerSpans.length; j++) {
          const innerSpan = innerSpans[j] as HTMLElement;
          if (!isSkippableElement(innerSpan)) {
            runs.push(normalizeRun(innerSpan));
          }
        }
      } else {
        // Direct <a>text</a> — the anchor IS the text-bearing run element
        runs.push(normalizeRunFromAnchor(child as HTMLAnchorElement));
      }
      continue;
    }

    // Regular span
    if (child.tagName === 'SPAN') {
      runs.push(normalizeRun(child));
    }
  }

  return {
    textAlign: lineEl.style.textAlign || 'left',
    wordSpacing: lineEl.style.wordSpacing || '',
    runs,
    ...(marker ? { marker } : {}),
  };
}

/**
 * Find all .superdoc-line elements within a container and normalize them.
 */
export function normalizeLines(container: HTMLElement): NormalizedLine[] {
  const lineEls = container.querySelectorAll('.superdoc-line');
  const result: NormalizedLine[] = [];
  for (let i = 0; i < lineEls.length; i++) {
    result.push(normalizeLine(lineEls[i] as HTMLElement));
  }
  return result;
}
