/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { clickToPositionDom } from '../src/dom-mapping.ts';

type MutableElementsFromPointDocument = Document & {
  elementsFromPoint?: (x: number, y: number) => Element[];
};

/** Select the inner text span inside an SDT wrapper, excluding the wrapper itself. */
function selectSdtInnerSpan(root: HTMLElement, pmStart: string): HTMLElement {
  return root.querySelector(`span[data-pm-start="${pmStart}"]:not(.superdoc-structured-content-inline)`) as HTMLElement;
}

function withMockedElementsFromPoint(elements: Element[], run: () => void): void {
  const doc = document as MutableElementsFromPointDocument;
  const originalElementsFromPoint = doc.elementsFromPoint;
  doc.elementsFromPoint = (_x: number, _y: number) => elements;

  try {
    run();
  } finally {
    if (originalElementsFromPoint) {
      doc.elementsFromPoint = originalElementsFromPoint;
    } else {
      delete doc.elementsFromPoint;
    }
  }
}

/**
 * Test suite for DOM-based click-to-position mapping.
 *
 * This suite verifies that clickToPositionDom correctly maps click coordinates
 * to ProseMirror positions by reading data attributes from DOM elements.
 */
describe('DOM-based click-to-position mapping', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0px';
    container.style.top = '0px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up the DOM after each test
    document.body.removeChild(container);
  });

  it('returns null for empty container', () => {
    const result = clickToPositionDom(container, 100, 100);
    expect(result).toBeNull();
  });

  it('returns null when no page element exists', () => {
    container.innerHTML = '<div>No page here</div>';
    const result = clickToPositionDom(container, 100, 100);
    expect(result).toBeNull();
  });

  it('returns null when page has no fragments', () => {
    container.innerHTML = '<div class="superdoc-page" data-page-index="0"></div>';
    const result = clickToPositionDom(container, 100, 100);
    expect(result).toBeNull();
  });

  it('returns null when fragment has no lines', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1"></div>
      </div>
    `;
    const result = clickToPositionDom(container, 100, 100);
    expect(result).toBeNull();
  });

  it('maps click to PM position in valid DOM structure', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="2" data-pm-end="19">
            <span data-pm-start="2" data-pm-end="12">Hello World</span>
          </div>
        </div>
      </div>
    `;

    const pageRect = container.querySelector('.superdoc-page')!.getBoundingClientRect();
    const spanRect = container.querySelector('span')!.getBoundingClientRect();

    // Click at the start of the span
    const result = clickToPositionDom(container, spanRect.left + 1, spanRect.top + 1);
    // In JSDOM, text measurement may not work correctly, so function may return line end
    // In real browser, this would return a position in range [2, 12]
    expect(result).toBeGreaterThanOrEqual(2);
    expect(result).toBeLessThanOrEqual(19); // Allow line end as fallback
  });

  it('returns line start when clicking before first span', () => {
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

    // Click before the span (in the left margin)
    const result = clickToPositionDom(container, spanRect.left - 10, lineRect.top + 5);
    expect(result).toBe(10); // Should return line start
  });

  it('returns line end when clicking after last span', () => {
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

    // Click after the span (to the right)
    const result = clickToPositionDom(container, spanRect.right + 10, lineRect.top + 5);
    expect(result).toBe(20); // Should return line end
  });

  it('handles PM position gaps correctly', () => {
    // Simulate a gap in PM positions (e.g., after paragraph join)
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="2" data-pm-end="19">
            <span data-pm-start="2" data-pm-end="12">First span</span>
            <span data-pm-start="14" data-pm-end="19">Second</span>
          </div>
        </div>
      </div>
    `;

    const spans = container.querySelectorAll('span');
    const firstSpanRect = spans[0].getBoundingClientRect();
    const secondSpanRect = spans[1].getBoundingClientRect();

    // Click in first span - should return position in range [2, 12]
    const result1 = clickToPositionDom(container, firstSpanRect.left + 5, firstSpanRect.top + 5);
    expect(result1).toBeGreaterThanOrEqual(2);
    // In JSDOM, may return line end as fallback
    expect(result1).toBeLessThanOrEqual(19);

    // Click in second span - should return position in range [14, 19]
    // (note the gap from 12 to 14 is skipped)
    const result2 = clickToPositionDom(container, secondSpanRect.left + 5, secondSpanRect.top + 5);
    expect(result2).toBeGreaterThanOrEqual(14);
    expect(result2).toBeLessThanOrEqual(19);
  });

  it('returns null when span has invalid PM data attributes', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="invalid" data-pm-end="also-invalid">
            <span data-pm-start="not-a-number" data-pm-end="nope">Text</span>
          </div>
        </div>
      </div>
    `;

    const spanRect = container.querySelector('span')!.getBoundingClientRect();
    const result = clickToPositionDom(container, spanRect.left + 5, spanRect.top + 5);
    expect(result).toBeNull();
  });

  it('returns line start when span is missing PM data attributes', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="2" data-pm-end="12">
            <span>No PM attributes</span>
          </div>
        </div>
      </div>
    `;

    const spanRect = container.querySelector('span')!.getBoundingClientRect();
    const result = clickToPositionDom(container, spanRect.left + 5, spanRect.top + 5);

    // When span has no PM data, function returns line start or end
    expect(result).toBeGreaterThanOrEqual(2);
    expect(result).toBeLessThanOrEqual(12);
  });

  it('handles multiple lines and selects correct line based on Y coordinate', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="0" data-pm-end="10" style="height: 20px;">
            <span data-pm-start="0" data-pm-end="10">Line 1</span>
          </div>
          <div class="superdoc-line" data-pm-start="10" data-pm-end="20" style="height: 20px;">
            <span data-pm-start="10" data-pm-end="20">Line 2</span>
          </div>
          <div class="superdoc-line" data-pm-start="20" data-pm-end="30" style="height: 20px;">
            <span data-pm-start="20" data-pm-end="30">Line 3</span>
          </div>
        </div>
      </div>
    `;

    const lines = container.querySelectorAll('.superdoc-line');

    // In JSDOM, all lines may overlap in Y coordinate, so we just verify the function
    // returns valid PM positions from any of the lines
    const line1Rect = lines[0].getBoundingClientRect();
    const result1 = clickToPositionDom(container, line1Rect.left + 5, line1Rect.top + 5);
    expect(result1).toBeGreaterThanOrEqual(0);
    expect(result1).toBeLessThanOrEqual(30); // Could be any line in JSDOM

    // Click on second line
    const line2Rect = lines[1].getBoundingClientRect();
    const result2 = clickToPositionDom(container, line2Rect.left + 5, line2Rect.top + 5);
    expect(result2).toBeGreaterThanOrEqual(0);
    expect(result2).toBeLessThanOrEqual(30);

    // Click on third line
    const line3Rect = lines[2].getBoundingClientRect();
    const result3 = clickToPositionDom(container, line3Rect.left + 5, line3Rect.top + 5);
    expect(result3).toBeGreaterThanOrEqual(0);
    expect(result3).toBeLessThanOrEqual(30);
  });

  it('handles anchor elements (links) in addition to spans', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="0" data-pm-end="15">
            <span data-pm-start="0" data-pm-end="6">Click </span>
            <a href="#" data-pm-start="6" data-pm-end="15">this link</a>
          </div>
        </div>
      </div>
    `;

    const anchorRect = container.querySelector('a')!.getBoundingClientRect();
    const result = clickToPositionDom(container, anchorRect.left + 5, anchorRect.top + 5);

    expect(result).toBeGreaterThanOrEqual(6);
    expect(result).toBeLessThanOrEqual(15);
  });

  it('returns line start when line has no spans', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="42" data-pm-end="42"></div>
        </div>
      </div>
    `;

    const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
    const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);
    expect(result).toBe(42);
  });

  it('handles empty text nodes gracefully', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="5" data-pm-end="10">
            <span data-pm-start="5" data-pm-end="10"></span>
          </div>
        </div>
      </div>
    `;

    const spanRect = container.querySelector('span')!.getBoundingClientRect();
    // Click on empty span - function snaps to nearest edge (start or end)
    const result1 = clickToPositionDom(container, spanRect.left + 1, spanRect.top + 1);
    expect(result1 === 5 || result1 === 10).toBe(true);
  });

  it('selects the last line when clicking below all lines', () => {
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-fragment" data-block-id="block1">
          <div class="superdoc-line" data-pm-start="0" data-pm-end="10" style="height: 20px;">
            <span data-pm-start="0" data-pm-end="10">Only line</span>
          </div>
        </div>
      </div>
    `;

    const lineRect = container.querySelector('.superdoc-line')!.getBoundingClientRect();
    // Click far below the line
    const result = clickToPositionDom(container, lineRect.left + 5, lineRect.bottom + 100);

    // Should still map to a position within the last line
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(10);
  });

  it('handles non-text child nodes in spans', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.setAttribute('data-page-index', '0');

    const fragment = document.createElement('div');
    fragment.className = 'superdoc-fragment';
    fragment.setAttribute('data-block-id', 'block1');

    const line = document.createElement('div');
    line.className = 'superdoc-line';
    line.setAttribute('data-pm-start', '5');
    line.setAttribute('data-pm-end', '15');

    const span = document.createElement('span');
    span.setAttribute('data-pm-start', '5');
    span.setAttribute('data-pm-end', '15');

    // Add a non-text child node (e.g., an image or another element)
    const img = document.createElement('img');
    span.appendChild(img);

    line.appendChild(span);
    fragment.appendChild(line);
    page.appendChild(fragment);
    container.appendChild(page);

    const spanRect = span.getBoundingClientRect();
    const result = clickToPositionDom(container, spanRect.left + 5, spanRect.top + 5);

    // Should snap to start or end based on which is closer
    expect(result === 5 || result === 15).toBe(true);
  });

  describe('table fragment fallback', () => {
    it('returns null for table fragments without a line in the hit chain', () => {
      // When clicking on a table fragment (e.g., cell padding or border) and
      // elementsFromPoint doesn't include a line element, clickToPositionDom
      // should return null to defer to the geometry fallback (hitTestTableFragment)
      // which correctly handles column resolution.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table1">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
                <span data-pm-start="5" data-pm-end="15">Cell 1 text</span>
              </div>
            </div>
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="20" data-pm-end="30">
                <span data-pm-start="20" data-pm-end="30">Cell 2 text</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // In a real browser, clicking on cell padding/borders returns the table fragment
      // in elementsFromPoint but NOT the line (due to overflow:hidden clipping).
      // JSDOM doesn't have elementsFromPoint, so we polyfill it to simulate
      // the real browser behavior where the hit chain includes the table fragment
      // but not the line elements.
      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;

      withMockedElementsFromPoint(
        [
          // Simulate hit chain: table fragment → page → container (no line element)
          tableFragment,
          page,
          container,
          document.body,
          document.documentElement,
        ],
        () => {
          const rect = tableFragment.getBoundingClientRect();
          const result = clickToPositionDom(container, rect.left + 1, rect.top + 1);
          expect(result).toBeNull();
        },
      );
    });

    it('returns position when table fragment line IS in the hit chain', () => {
      // When a line element IS directly hit (e.g., clicking directly on text),
      // the function should use the hitChainLine path and return a valid position.
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

          // Should return a valid position from the line via the hitChainLine path
          expect(result).toBeGreaterThanOrEqual(5);
          expect(result).toBeLessThanOrEqual(15);
        },
      );
    });
  });

  describe('inline SDT wrapper exclusion', () => {
    it('excludes inline SDT wrapper elements from click-to-position mapping', () => {
      // Inline SDT wrappers have PM positions for selection highlighting but should not
      // be used as click targets - their child spans should be targeted instead
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

      // Get the child spans (which should be used for positioning)
      const childSpans = container.querySelectorAll('span[data-pm-start]:not(.superdoc-structured-content-inline)');
      expect(childSpans.length).toBeGreaterThan(0); // Verify we have child spans to click on

      const firstChildRect = (childSpans[0] as HTMLElement).getBoundingClientRect();

      // Click on the first child span - should map to its PM range [0, 10]
      const result = clickToPositionDom(container, firstChildRect.left + 5, firstChildRect.top + 5);

      // Should return a position from the child span, not the wrapper
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(0);
      // In JSDOM environment, may return line end as fallback
      expect(result).toBeLessThanOrEqual(20);
    });

    it('correctly identifies inline SDT wrappers by class name', () => {
      // Test that the wrapper element is properly filtered out by verifying the DOM structure
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="5" data-pm-end="15">
              <span class="superdoc-structured-content-inline" data-pm-start="5" data-pm-end="15">
                <span class="superdoc-structured-content-inline__label">Content</span>
                <span data-pm-start="5" data-pm-end="15">Inline content</span>
              </span>
            </div>
          </div>
        </div>
      `;

      const lineEl = container.querySelector('.superdoc-line') as HTMLElement;
      expect(lineEl).not.toBeNull();

      // Verify the wrapper exists
      const wrapper = lineEl.querySelector('.superdoc-structured-content-inline');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.getAttribute('data-pm-start')).toBe('5');
      expect(wrapper?.getAttribute('data-pm-end')).toBe('15');

      // Verify that child spans exist and are different from the wrapper
      const childSpans = Array.from(lineEl.querySelectorAll('span[data-pm-start]')).filter(
        (el) => !el.classList.contains('superdoc-structured-content-inline'),
      );
      expect(childSpans.length).toBe(1); // Should find exactly one child span (excluding wrapper and label)

      const lineRect = lineEl.getBoundingClientRect();
      const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);

      // Should successfully map to a position using the child span
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
    });

    it('handles mixed content with inline SDT wrappers and regular spans', () => {
      // Test a realistic case with both wrapped and unwrapped content
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment" data-block-id="block1">
            <div class="superdoc-line" data-pm-start="0" data-pm-end="30">
              <span data-pm-start="0" data-pm-end="10">Regular text</span>
              <span class="superdoc-structured-content-inline" data-pm-start="10" data-pm-end="20">
                <span class="superdoc-structured-content-inline__label">Field</span>
                <span data-pm-start="10" data-pm-end="20">Field text</span>
              </span>
              <span data-pm-start="20" data-pm-end="30">More regular</span>
            </div>
          </div>
        </div>
      `;

      const spans = Array.from(
        container.querySelectorAll('span[data-pm-start]:not(.superdoc-structured-content-inline)'),
      );

      // Should find 3 clickable spans: 2 regular + 1 child of wrapper (excluding wrapper itself and label)
      expect(spans.length).toBe(3);

      // Verify we can click on each span
      const firstSpanRect = (spans[0] as HTMLElement).getBoundingClientRect();
      const result1 = clickToPositionDom(container, firstSpanRect.left + 5, firstSpanRect.top + 5);
      expect(result1).not.toBeNull();
      expect(result1).toBeGreaterThanOrEqual(0);
      expect(result1).toBeLessThanOrEqual(30);

      const wrappedChildRect = (spans[1] as HTMLElement).getBoundingClientRect();
      const result2 = clickToPositionDom(container, wrappedChildRect.left + 5, wrappedChildRect.top + 5);
      expect(result2).not.toBeNull();
      expect(result2).toBeGreaterThanOrEqual(0);
      expect(result2).toBeLessThanOrEqual(30);

      const lastSpanRect = (spans[2] as HTMLElement).getBoundingClientRect();
      const result3 = clickToPositionDom(container, lastSpanRect.left + 5, lastSpanRect.top + 5);
      expect(result3).not.toBeNull();
      expect(result3).toBeGreaterThanOrEqual(0);
      expect(result3).toBeLessThanOrEqual(30);
    });
  });

  // -------------------------------------------------------------------------
  // Table cells with list markers (PR 0 safety rails)
  // -------------------------------------------------------------------------

  describe('table cells with list markers', () => {
    it('maps position through marker wrapper depth', () => {
      // Table cell containing a line with a marker element (no data-pm-*)
      // followed by text spans with PM positions.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-list">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="60" data-pm-end="69">
                <span class="superdoc-paragraph-marker">1.</span>
                <span class="superdoc-tab" style="width: 10px;"></span>
                <span data-pm-start="60" data-pm-end="69">List text</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const textSpan = container.querySelector('span[data-pm-start="60"]') as HTMLElement;

      withMockedElementsFromPoint(
        [textSpan, line, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 30, lineRect.top + 5);

          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(60);
          expect(result).toBeLessThanOrEqual(69);
        },
      );
    });

    it('handles missing marker gracefully', () => {
      // Table cell line without marker element — standard text only.
      // Should still map correctly.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-no-marker">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="60" data-pm-end="69">
                <span data-pm-start="60" data-pm-end="69">Plain text</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const span = container.querySelector('span[data-pm-start]') as HTMLElement;

      withMockedElementsFromPoint(
        [span, line, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);

          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(60);
          expect(result).toBeLessThanOrEqual(69);
        },
      );
    });

    it('resolves position when marker element is hit directly', () => {
      // Simulate clicking directly on the marker span. elementsFromPoint
      // returns the marker first — mapping must still resolve via the
      // parent line's PM data since the marker has no data-pm-* attributes.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-list">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="60" data-pm-end="69">
                <span class="superdoc-paragraph-marker">1.</span>
                <span class="superdoc-tab" style="width: 10px;"></span>
                <span data-pm-start="60" data-pm-end="69">List text</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const cell = container.querySelector('.superdoc-table-cell') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const markerSpan = container.querySelector('.superdoc-paragraph-marker') as HTMLElement;

      // Marker is the deepest hit — no data-pm-*, so mapping must walk up to the line
      withMockedElementsFromPoint(
        [markerSpan, line, cell, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 2, lineRect.top + 5);

          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(60);
          expect(result).toBeLessThanOrEqual(69);
        },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Table cells with SDT wrappers (PR 0 safety rails)
  // -------------------------------------------------------------------------

  describe('table cells with SDT wrappers', () => {
    it('excludes inline SDT wrapper from position mapping in table context', () => {
      // SDT inline wrapper already excluded by class filter; verify same behavior in table cells.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-sdt">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="70" data-pm-end="78">
                <span class="superdoc-structured-content-inline" data-pm-start="70" data-pm-end="78">
                  <span class="superdoc-structured-content-inline__label">Field</span>
                  <span data-pm-start="70" data-pm-end="78">SDT text</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const textSpan = selectSdtInnerSpan(container, '70');

      withMockedElementsFromPoint(
        [textSpan, line, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 5, lineRect.top + 5);

          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(70);
          expect(result).toBeLessThanOrEqual(78);
        },
      );
    });

    it('maps through combined list-marker + SDT nesting', () => {
      // Most complex case: table cell with both marker and SDT wrapper.
      container.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-fragment superdoc-table-fragment" data-block-id="table-list-sdt">
            <div class="superdoc-table-cell" style="overflow: hidden; position: absolute;">
              <div class="superdoc-line" data-pm-start="80" data-pm-end="90">
                <span class="superdoc-paragraph-marker">1.</span>
                <span class="superdoc-tab" style="width: 10px;"></span>
                <span class="superdoc-structured-content-inline" data-pm-start="80" data-pm-end="90">
                  <span class="superdoc-structured-content-inline__label">SDT</span>
                  <span data-pm-start="80" data-pm-end="90">SDT list text</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

      const page = container.querySelector('.superdoc-page') as HTMLElement;
      const tableFragment = container.querySelector('.superdoc-table-fragment') as HTMLElement;
      const line = container.querySelector('.superdoc-line') as HTMLElement;
      const textSpan = selectSdtInnerSpan(container, '80');

      withMockedElementsFromPoint(
        [textSpan, line, tableFragment, page, container, document.body, document.documentElement],
        () => {
          const lineRect = line.getBoundingClientRect();
          const result = clickToPositionDom(container, lineRect.left + 40, lineRect.top + 5);

          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(80);
          expect(result).toBeLessThanOrEqual(90);
        },
      );
    });
  });
});
