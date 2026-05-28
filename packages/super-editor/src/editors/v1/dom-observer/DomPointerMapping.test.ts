/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clickToPositionDom, findPageElement, readLayoutEpochFromDom } from './DomPointerMapping.ts';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

type MutableElementsFromPointDocument = Document & {
  elementsFromPoint?: (x: number, y: number) => Element[];
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/**
 * Temporarily replaces `document.elementsFromPoint` with a mock that returns
 * the given elements, then restores the original after the callback runs.
 */
function withMockedElementsFromPoint(elements: Element[], run: () => void): void {
  const doc = document as MutableElementsFromPointDocument;
  const original = doc.elementsFromPoint;
  doc.elementsFromPoint = () => elements;
  try {
    run();
  } finally {
    if (original) {
      doc.elementsFromPoint = original;
    } else {
      delete doc.elementsFromPoint;
    }
  }
}

/** Builds a standard page > fragment > line > span DOM structure. */
function buildPageDom(
  lines: Array<{
    pmStart: string;
    pmEnd: string;
    spans: Array<{ pmStart: string; pmEnd: string; text: string; className?: string }>;
  }>,
): HTMLElement {
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  page.setAttribute('data-page-index', '0');

  const fragment = document.createElement('div');
  fragment.className = 'superdoc-fragment';
  fragment.setAttribute('data-block-id', 'block1');

  for (const lineDef of lines) {
    const line = document.createElement('div');
    line.className = 'superdoc-line';
    line.setAttribute('data-pm-start', lineDef.pmStart);
    line.setAttribute('data-pm-end', lineDef.pmEnd);

    for (const spanDef of lineDef.spans) {
      const span = document.createElement('span');
      span.setAttribute('data-pm-start', spanDef.pmStart);
      span.setAttribute('data-pm-end', spanDef.pmEnd);
      span.textContent = spanDef.text;
      if (spanDef.className) span.className = spanDef.className;
      line.appendChild(span);
    }

    fragment.appendChild(line);
  }

  page.appendChild(fragment);
  return page;
}

function mockRect(element: Element, rect: { left: number; top: number; width: number; height: number }): void {
  const value = {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON() {
      return this;
    },
  };

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => value,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DomPointerMapping', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0px';
    container.style.top = '0px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // -----------------------------------------------------------------------
  // clickToPositionDom
  // -----------------------------------------------------------------------

  describe('clickToPositionDom', () => {
    it('returns null for an empty container', () => {
      expect(clickToPositionDom(container, 100, 100)).toBeNull();
    });

    it('returns null when the page has no fragments', () => {
      container.innerHTML = '<div class="superdoc-page" data-page-index="0"></div>';
      expect(clickToPositionDom(container, 100, 100)).toBeNull();
    });

    it('maps a click to a PM position in a valid DOM structure', () => {
      const page = buildPageDom([
        { pmStart: '2', pmEnd: '12', spans: [{ pmStart: '2', pmEnd: '12', text: 'Hello World' }] },
      ]);
      container.appendChild(page);

      const spanRect = container.querySelector('span')!.getBoundingClientRect();
      const result = clickToPositionDom(container, spanRect.left + 1, spanRect.top + 1);

      expect(result).toBeGreaterThanOrEqual(2);
      expect(result).toBeLessThanOrEqual(12);
    });

    it('returns line start when clicking before the first span', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="10" data-pm-end="20">
              <span data-pm-start="10" data-pm-end="20" style="margin-left: 50px;">Text</span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const spanRect = container.querySelector('span')!.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.left - 10, lineRect.top + 5)).toBe(10);
    });

    it('returns line end when clicking after the last span', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="10" data-pm-end="20">
              <span data-pm-start="10" data-pm-end="20">Text</span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const spanRect = container.querySelector('span')!.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.right + 10, lineRect.top + 5)).toBe(20);
    });

    it('returns line start for a line with no spans', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="42" data-pm-end="42"></div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      expect(clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5)).toBe(42);
    });

    it('returns null when line has invalid PM positions', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="invalid" data-pm-end="invalid">
              <span data-pm-start="invalid" data-pm-end="invalid">Text</span>
            </div>
          </div>
        </div>
      `;

      const spanRect = container.querySelector('span')!.getBoundingClientRect();
      expect(clickToPositionDom(container, spanRect.left + 5, spanRect.top + 5)).toBeNull();
    });

    it('selects the last line when clicking below all lines', () => {
      const page = buildPageDom([
        { pmStart: '0', pmEnd: '10', spans: [{ pmStart: '0', pmEnd: '10', text: 'Only line' }] },
      ]);
      container.appendChild(page);

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const result = clickToPositionDom(container, lineRect.left + 5, lineRect.bottom + 100);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    });

    it('maps the right half of a tracked-change span to the next rendered span start when PM has hidden gaps', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="2" data-pm-end="33">
              <span data-pm-start="2" data-pm-end="16"> This is a sim</span>
              <span data-pm-start="18" data-pm-end="19" class="track-insert-dec">Z</span>
              <span data-pm-start="21" data-pm-end="33">ple footnote</span>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const fragment = container.querySelector('.superdoc-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const spans = Array.from(container.querySelectorAll('span')) as HTMLElement[];
      const insertedSpan = spans[1];
      const insertedTextNode = insertedSpan.firstChild as Text;

      mockRect(page, { left: 100, top: 10, width: 240, height: 30 });
      mockRect(fragment, { left: 100, top: 10, width: 240, height: 30 });
      mockRect(line, { left: 110, top: 10, width: 160, height: 20 });
      mockRect(spans[0], { left: 110, top: 10, width: 77, height: 20 });
      mockRect(spans[1], { left: 187, top: 10, width: 8, height: 20 });
      mockRect(spans[2], { left: 195, top: 10, width: 70, height: 20 });

      const doc = document as MutableElementsFromPointDocument;
      const originalElementsFromPoint = doc.elementsFromPoint;
      const originalCaretRangeFromPoint = doc.caretRangeFromPoint;

      doc.elementsFromPoint = () => [
        insertedSpan,
        line,
        fragment,
        page,
        container,
        document.body,
        document.documentElement,
      ];
      doc.caretRangeFromPoint = (x: number) => {
        if (x < 191) {
          return {
            startContainer: insertedTextNode,
            startOffset: 0,
          } as Range;
        }

        return {
          startContainer: insertedTextNode,
          startOffset: 1,
        } as Range;
      };

      try {
        expect(clickToPositionDom(container, 194, 18)).toBe(21);
      } finally {
        if (originalElementsFromPoint) {
          doc.elementsFromPoint = originalElementsFromPoint;
        } else {
          delete doc.elementsFromPoint;
        }

        if (originalCaretRangeFromPoint) {
          doc.caretRangeFromPoint = originalCaretRangeFromPoint;
        } else {
          delete doc.caretRangeFromPoint;
        }
      }
    });

    it('maps clicks on empty SDT placeholder chrome to the SDT content position', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="10" data-pm-end="12">
              <span
                class="superdoc-empty-sdt-placeholder superdoc-empty-inline-sdt-placeholder"
                data-pm-start="11"
                data-pm-end="11"
                data-placeholder-text="Click or tap here to enter text"
              ></span>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const fragment = container.querySelector('.superdoc-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const placeholder = container.querySelector('.superdoc-empty-sdt-placeholder') as HTMLElement;

      mockRect(page, { left: 100, top: 10, width: 300, height: 30 });
      mockRect(fragment, { left: 100, top: 10, width: 300, height: 30 });
      mockRect(line, { left: 110, top: 10, width: 250, height: 20 });
      mockRect(placeholder, { left: 110, top: 10, width: 220, height: 20 });

      withMockedElementsFromPoint(
        [placeholder, line, fragment, page, container, document.body, document.documentElement],
        () => {
          expect(clickToPositionDom(container, 310, 18)).toBe(11);
        },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Table fragment handling
  // -----------------------------------------------------------------------

  describe('table fragment handling', () => {
    it('returns null for table fragments without a line in the hit chain', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table1">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
                <span data-pm-start="5" data-pm-end="15">Cell text</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;

      withMockedElementsFromPoint([tableFragment, page, container, document.body, document.documentElement], () => {
        const rect = tableFragment.getBoundingClientRect();
        expect(clickToPositionDom(container, rect.left + 1, rect.top + 1)).toBeNull();
      });
    });

    it('resolves through a nested table wrapper when the click lands between lines', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table1">
            <div class="superdoc-table-cell" style="position: absolute;">
              <div class="cell-content">
                <div class="paragraph-a" style="margin-bottom: 12px;">
                  <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
                    <span data-pm-start="5" data-pm-end="15">Upper line</span>
                  </div>
                </div>
                <div class="paragraph-b">
                  <div class="superdoc-line" data-pm-start="20" data-pm-end="30">
                    <span data-pm-start="20" data-pm-end="30">Lower line</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const cell = container.querySelector('.superdoc-table-cell') as HTMLElement;
      const content = container.querySelector('.cell-content') as HTMLElement;
      const lines = container.querySelectorAll('.superdoc-line') as NodeListOf<HTMLElement>;
      const upperRect = lines[0].getBoundingClientRect();
      const lowerRect = lines[1].getBoundingClientRect();
      const gapY = upperRect.bottom + Math.max(1, (lowerRect.top - upperRect.bottom) / 3);

      withMockedElementsFromPoint(
        [content, cell, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const result = clickToPositionDom(container, upperRect.left + 5, gapY);
          expect(result).toBeGreaterThanOrEqual(5);
          expect(result).toBeLessThanOrEqual(15);
        },
      );
    });

    it('limits nested table wrapper lookup to the current page fragment', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-page-0">
            <div class="cell-content">
              <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
                <span data-pm-start="5" data-pm-end="15">Page 0 line</span>
              </div>
              <div class="superdoc-page" data-page-index="1">
                <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-page-1">
                  <div class="superdoc-line" data-pm-start="100" data-pm-end="110">
                    <span data-pm-start="100" data-pm-end="110">Page 1 line</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page[data-page-index="0"]') as HTMLElement;
      const tableFragment = container.querySelector('[data-block-id="table-page-0"]') as HTMLElement;
      const content = container.querySelector('.cell-content') as HTMLElement;
      const line = container.querySelector('.superdoc-line[data-pm-start="5"]') as HTMLElement;
      const lineRect = line.getBoundingClientRect();

      withMockedElementsFromPoint(
        [content, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);
          expect(result).toBeGreaterThanOrEqual(5);
          expect(result).toBeLessThanOrEqual(15);
        },
      );
    });

    it('does not jump to a sibling-page table fragment when clicking inside the current page slice', () => {
      // SD-2356: when the same logical table is split across pages, each
      // page gets its own .superdoc-table-fragment with the SAME
      // data-block-id. Without per-page scoping, findLineAtY would pick
      // the geometrically-closest line across ALL pages of the table and
      // resolve the click into the wrong page's PM range.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="shared-table">
            <div class="cell-content">
              <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
                <span data-pm-start="5" data-pm-end="15">Page 0 line</span>
              </div>
            </div>
          </div>
        </div>
        <div class="superdoc-page" data-page-index="1">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="shared-table">
            <div class="cell-content">
              <div class="superdoc-line" data-pm-start="100" data-pm-end="110">
                <span data-pm-start="100" data-pm-end="110">Page 1 line</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page0 = container.querySelector('.superdoc-page[data-page-index="0"]') as HTMLElement;
      const page0Fragment = page0.querySelector('.superdoc-table-fragment') as HTMLElement;
      const page0Content = page0.querySelector('.cell-content') as HTMLElement;
      const page0Line = page0.querySelector('.superdoc-line') as HTMLElement;
      const page0Span = page0.querySelector('span') as HTMLElement;
      const page1Line = container.querySelector('.superdoc-page[data-page-index="1"] .superdoc-line') as HTMLElement;
      const page1Span = container.querySelector('.superdoc-page[data-page-index="1"] span') as HTMLElement;

      // Page 0's line sits at Y=50, page 1's line at Y=200. Click at Y=180
      // is closer to page 1's line — without per-page scoping, findLineAtY
      // would return page 1's line and the click would land in PM range
      // [100, 110] instead of page 0's [5, 15].
      // X=10 is left of visualLeft=50 so the resolver snaps to lineStart,
      // sidestepping the char-level path that JSDOM cannot run.
      mockRect(page0Line, { left: 50, top: 50, width: 80, height: 16 });
      mockRect(page0Span, { left: 50, top: 50, width: 80, height: 16 });
      mockRect(page1Line, { left: 50, top: 200, width: 80, height: 16 });
      mockRect(page1Span, { left: 50, top: 200, width: 80, height: 16 });

      withMockedElementsFromPoint(
        [page0Content, page0Fragment, page0, container, document.body, document.documentElement],
        () => {
          const result = clickToPositionDom(container, 10, 180);
          // Must land in page 0's PM range, never page 1's (>= 100).
          expect(result).toBeGreaterThanOrEqual(5);
          expect(result).toBeLessThanOrEqual(15);
        },
      );
    });

    it('returns a position when a line IS in the hit chain', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table1">
            <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
              <span data-pm-start="5" data-pm-end="15">Cell text</span>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const span = container.querySelector('span') as HTMLElement;

      withMockedElementsFromPoint(
        [span, line, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);
          expect(result).toBeGreaterThanOrEqual(5);
          expect(result).toBeLessThanOrEqual(15);
        },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Inline SDT wrapper exclusion
  // -----------------------------------------------------------------------

  describe('inline SDT wrapper exclusion', () => {
    it('uses child spans instead of the wrapper for position mapping', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="0" data-pm-end="20">
              <span class="superdoc-structured-content-inline" data-pm-start="0" data-pm-end="20">
                <span class="superdoc-structured-content-inline__label">Field</span>
                <span data-pm-start="0" data-pm-end="10">First text</span>
                <span data-pm-start="10" data-pm-end="20">Second text</span>
              </span>
            </div>
          </div>
        </div>
      `;

      const childSpans = container.querySelectorAll('span[data-pm-start]:not(.superdoc-structured-content-inline)');
      expect(childSpans.length).toBeGreaterThan(0);

      const firstChildRect = (childSpans[0] as HTMLElement).getBoundingClientRect();
      const result = clickToPositionDom(container, firstChildRect.left + 5, firstChildRect.top + 5);

      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(21);
    });

    it('ignores active inline SDT labels when mapping clicks to body text', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="145" data-pm-end="253">
              <span class="superdoc-structured-content-inline ProseMirror-selectednode" data-pm-start="145" data-pm-end="199">
                <span class="superdoc-structured-content-inline__label" data-pm-start="145" data-pm-end="199">Inner Nested SDT</span>
                <span data-pm-start="164" data-pm-end="188"> labore et dolore magna </span>
              </span>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const fragment = container.querySelector('.superdoc-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const wrapper = container.querySelector('.superdoc-structured-content-inline') as HTMLElement;
      const label = container.querySelector('.superdoc-structured-content-inline__label') as HTMLElement;
      const textSpan = container.querySelector(
        '.superdoc-structured-content-inline span[data-pm-start]:not(.superdoc-structured-content-inline__label)',
      ) as HTMLElement;
      const textNode = textSpan.firstChild as Text;

      mockRect(page, { left: 0, top: 0, width: 800, height: 800 });
      mockRect(fragment, { left: 90, top: 280, width: 700, height: 40 });
      mockRect(line, { left: 99, top: 280, width: 595, height: 26 });
      mockRect(wrapper, { left: 99, top: 280, width: 310, height: 26 });
      mockRect(label, { left: 205, top: 260, width: 98, height: 18 });
      mockRect(textSpan, { left: 186, top: 280, width: 174, height: 26 });

      const doc = document as MutableElementsFromPointDocument;
      const originalCaretRangeFromPoint = doc.caretRangeFromPoint;
      doc.caretRangeFromPoint = () => {
        const range = document.createRange();
        range.setStart(textNode, 14);
        range.setEnd(textNode, 14);
        return range;
      };

      try {
        withMockedElementsFromPoint([textSpan, wrapper, line, fragment, page, container], () => {
          const result = clickToPositionDom(container, 279, 293);
          expect(result).toBe(178);
        });
      } finally {
        if (originalCaretRangeFromPoint) {
          doc.caretRangeFromPoint = originalCaretRangeFromPoint;
        } else {
          delete doc.caretRangeFromPoint;
        }
      }
    });

    it('returns the position after a terminal inline SDT when clicking to its visual right', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="2" data-pm-end="25">
              <span data-pm-start="2" data-pm-end="8">Date: </span>
              <span class="superdoc-structured-content-inline" data-pm-start="11" data-pm-end="25">
                <span class="superdoc-structured-content-inline__label">Agreement Date</span>
                <span data-pm-start="11" data-pm-end="25">Agreement Date</span>
              </span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const textSpan = container.querySelector(
        '.superdoc-structured-content-inline span[data-pm-start]',
      ) as HTMLElement;
      const spanRect = textSpan.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.right + 10, lineRect.top + 5)).toBe(26);
    });

    it('returns the position before a leading inline SDT when clicking to its visual left', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="11" data-pm-end="25">
              <span class="superdoc-structured-content-inline" data-pm-start="11" data-pm-end="25">
                <span class="superdoc-structured-content-inline__label">Agreement Date</span>
                <span data-pm-start="11" data-pm-end="25">Agreement Date</span>
              </span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const textSpan = container.querySelector(
        '.superdoc-structured-content-inline span[data-pm-start]',
      ) as HTMLElement;
      const spanRect = textSpan.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.left - 10, lineRect.top + 5)).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // RTL handling
  // -----------------------------------------------------------------------

  describe('RTL line handling', () => {
    it('returns line end when clicking to the visual left of RTL spans', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" dir="rtl" data-pm-start="10" data-pm-end="20">
              <span data-pm-start="10" data-pm-end="20">نص عربي</span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const spanRect = container.querySelector('span')!.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.left - 10, lineRect.top + 5)).toBe(20);
    });

    it('returns line start when clicking to the visual right of RTL spans', () => {
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" dir="rtl" data-pm-start="10" data-pm-end="20">
              <span data-pm-start="10" data-pm-end="20">نص عربي</span>
            </div>
          </div>
        </div>
      `;

      const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
      const spanRect = container.querySelector('span')!.getBoundingClientRect();

      expect(clickToPositionDom(container, spanRect.right + 10, lineRect.top + 5)).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // findPageElement
  // -----------------------------------------------------------------------

  describe('findPageElement', () => {
    it('returns the container itself if it is a page element', () => {
      const page = document.createElement('div');
      page.className = 'superdoc-page';

      expect(findPageElement(page, 0, 0)).toBe(page);
    });

    it('returns null when no page exists', () => {
      expect(findPageElement(container, 100, 100)).toBeNull();
    });

    it('returns the first page as a last resort', () => {
      container.innerHTML = '<div class="superdoc-page" data-page-index="0"></div>';
      const page = container.querySelector('.superdoc-page') as HTMLElement;

      // Click far outside — should still return the only page
      expect(findPageElement(container, 9999, 9999)).toBe(page);
    });
  });

  // -----------------------------------------------------------------------
  // readLayoutEpochFromDom
  // -----------------------------------------------------------------------

  describe('readLayoutEpochFromDom', () => {
    it('returns the newest epoch in the hit chain', () => {
      const page = document.createElement('div');
      const line = document.createElement('div');
      page.dataset.layoutEpoch = '8';
      line.dataset.layoutEpoch = '0';
      container.appendChild(page);
      page.appendChild(line);

      const original = (document as MutableElementsFromPointDocument).elementsFromPoint;
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: () => [line, page],
      });

      try {
        expect(readLayoutEpochFromDom(container, 0, 0)).toBe(8);
      } finally {
        if (original) {
          Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: original });
        } else {
          delete (document as MutableElementsFromPointDocument).elementsFromPoint;
        }
      }
    });

    it('returns null when no elements have epoch data', () => {
      container.innerHTML = '<div></div>';

      const original = (document as MutableElementsFromPointDocument).elementsFromPoint;
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: () => [container.firstElementChild!],
      });

      try {
        expect(readLayoutEpochFromDom(container, 0, 0)).toBeNull();
      } finally {
        if (original) {
          Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: original });
        } else {
          delete (document as MutableElementsFromPointDocument).elementsFromPoint;
        }
      }
    });
  });
});
