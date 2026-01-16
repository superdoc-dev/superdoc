import { describe, expect, it } from 'vitest';

import { DomPositionIndex } from '../DomPositionIndex.js';

describe('DomPositionIndex', () => {
  it('indexes leaf PM-range elements and finds element at position', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page" data-pm-start="1" data-pm-end="10">
        <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
          <span data-pm-start="1" data-pm-end="5">hello</span>
          <span data-pm-start="6" data-pm-end="10">world</span>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.size).toBe(2);
    expect(index.findElementAtPosition(1)?.textContent).toBe('hello');
    expect(index.findElementAtPosition(7)?.textContent).toBe('world');
    expect(index.findElementAtPosition(11)).toBe(null);
  });

  it('excludes inline SDT wrapper elements and indexes their leaf descendants', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-line" data-pm-start="1" data-pm-end="8">
        <span class="superdoc-structured-content-inline" data-pm-start="1" data-pm-end="8">
          <span data-pm-start="1" data-pm-end="3">foo</span>
          <span data-pm-start="4" data-pm-end="8">bar</span>
        </span>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.size).toBe(2);
    expect(index.findElementAtPosition(2)?.textContent).toBe('foo');
    expect(index.findElementAtPosition(6)?.textContent).toBe('bar');
  });

  it('skips header/footer descendants when building the index', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page">
        <div class="superdoc-page-header">
          <span data-pm-start="1" data-pm-end="2">header</span>
        </div>
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="2">body</span>
        </div>
        <div class="superdoc-page-footer">
          <span data-pm-start="1" data-pm-end="2">footer</span>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.size).toBe(1);
    expect(index.findElementAtPosition(1)?.textContent).toBe('body');
  });

  it('skips footer-only content when building the index', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page">
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">body content</span>
        </div>
        <div class="superdoc-page-footer">
          <div class="superdoc-line">
            <span data-pm-start="10" data-pm-end="20">footer text</span>
          </div>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    expect(index.size).toBe(1);
    expect(index.findElementAtPosition(1)?.textContent).toBe('body content');
    expect(index.findElementAtPosition(10)).toBe(null);
  });

  it('correctly distributes elements across header, body, and footer sections', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page">
        <div class="superdoc-page-header">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="5">header 1</span>
            <span data-pm-start="6" data-pm-end="10">header 2</span>
          </div>
        </div>
        <div class="superdoc-line">
          <span data-pm-start="11" data-pm-end="15">body 1</span>
          <span data-pm-start="16" data-pm-end="20">body 2</span>
          <span data-pm-start="21" data-pm-end="25">body 3</span>
        </div>
        <div class="superdoc-page-footer">
          <div class="superdoc-line">
            <span data-pm-start="26" data-pm-end="30">footer 1</span>
          </div>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    // Should only index body elements (3 elements)
    expect(index.size).toBe(3);
    expect(index.findElementAtPosition(13)?.textContent).toBe('body 1');
    expect(index.findElementAtPosition(18)?.textContent).toBe('body 2');
    expect(index.findElementAtPosition(23)?.textContent).toBe('body 3');

    // Header and footer elements should not be in index
    expect(index.findElementAtPosition(3)).toBe(null);
    expect(index.findElementAtPosition(8)).toBe(null);
    expect(index.findElementAtPosition(28)).toBe(null);
  });

  it('handles multiple pages with headers and footers', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page" data-page-index="0">
        <div class="superdoc-page-header">
          <span data-pm-start="1" data-pm-end="5">page 1 header</span>
        </div>
        <div class="superdoc-line">
          <span data-pm-start="6" data-pm-end="10">page 1 body</span>
        </div>
        <div class="superdoc-page-footer">
          <span data-pm-start="11" data-pm-end="15">page 1 footer</span>
        </div>
      </div>
      <div class="superdoc-page" data-page-index="1">
        <div class="superdoc-page-header">
          <span data-pm-start="16" data-pm-end="20">page 2 header</span>
        </div>
        <div class="superdoc-line">
          <span data-pm-start="21" data-pm-end="25">page 2 body</span>
        </div>
        <div class="superdoc-page-footer">
          <span data-pm-start="26" data-pm-end="30">page 2 footer</span>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    // Should only index body elements from both pages
    expect(index.size).toBe(2);
    expect(index.findElementAtPosition(8)?.textContent).toBe('page 1 body');
    expect(index.findElementAtPosition(23)?.textContent).toBe('page 2 body');

    // Headers and footers should not be indexed
    expect(index.findElementAtPosition(3)).toBe(null);
    expect(index.findElementAtPosition(13)).toBe(null);
    expect(index.findElementAtPosition(18)).toBe(null);
    expect(index.findElementAtPosition(28)).toBe(null);
  });

  it('handles nested elements within header/footer (deeply nested filtering)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page">
        <div class="superdoc-page-header">
          <div class="superdoc-line">
            <div class="wrapper">
              <span data-pm-start="1" data-pm-end="5">nested header</span>
            </div>
          </div>
        </div>
        <div class="superdoc-line">
          <span data-pm-start="6" data-pm-end="10">body</span>
        </div>
        <div class="superdoc-page-footer">
          <div class="superdoc-line">
            <div class="wrapper">
              <span data-pm-start="11" data-pm-end="15">nested footer</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    // Should skip deeply nested header/footer elements
    expect(index.size).toBe(1);
    expect(index.findElementAtPosition(8)?.textContent).toBe('body');
    expect(index.findElementAtPosition(3)).toBe(null);
    expect(index.findElementAtPosition(13)).toBe(null);
  });

  it('handles page with only header and footer (no body content)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-page">
        <div class="superdoc-page-header">
          <span data-pm-start="1" data-pm-end="5">header only</span>
        </div>
        <div class="superdoc-page-footer">
          <span data-pm-start="6" data-pm-end="10">footer only</span>
        </div>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    // Should have no indexed elements
    expect(index.size).toBe(0);
    expect(index.findElementAtPosition(3)).toBe(null);
    expect(index.findElementAtPosition(8)).toBe(null);
  });

  it('finds all leaf elements intersecting a range', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-line" data-pm-start="1" data-pm-end="12">
        <span data-pm-start="1" data-pm-end="4">a</span>
        <span data-pm-start="5" data-pm-end="8">b</span>
        <span data-pm-start="9" data-pm-end="12">c</span>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container);

    const hits = index.findElementsInRange(3, 10).map((el) => el.textContent);
    expect(hits).toEqual(['a', 'b', 'c']);
  });

  it('can include container elements when leafOnly is disabled', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
        <span data-pm-start="1" data-pm-end="5">hello</span>
      </div>
    `;

    const index = new DomPositionIndex();
    index.rebuild(container, { leafOnly: false });

    expect(index.size).toBe(2);
  });

  describe('edge cases - invalid attributes', () => {
    it('skips elements with non-numeric pm-start attribute', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="abc" data-pm-end="5">invalid</span>
          <span data-pm-start="1" data-pm-end="5">valid</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(3)?.textContent).toBe('valid');
    });

    it('skips elements with non-numeric pm-end attribute', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="xyz">invalid</span>
          <span data-pm-start="6" data-pm-end="10">valid</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(8)?.textContent).toBe('valid');
    });

    it('allows negative pm-start values (they are finite)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="-5" data-pm-end="5">negative</span>
          <span data-pm-start="1" data-pm-end="5">positive</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      // Both elements should be indexed (negative values are finite)
      expect(index.size).toBe(2);
      expect(index.findElementAtPosition(-3)?.textContent).toBe('negative');
      expect(index.findElementAtPosition(3)?.textContent).toBe('positive');
    });

    it('skips elements where pmEnd < pmStart (invalid range)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="5">backwards</span>
          <span data-pm-start="1" data-pm-end="5">forward</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(3)?.textContent).toBe('forward');
    });

    it('skips elements with missing pm-start attribute', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-end="5">missing start</span>
          <span data-pm-start="1" data-pm-end="5">complete</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(3)?.textContent).toBe('complete');
    });

    it('skips elements with missing pm-end attribute', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1">missing end</span>
          <span data-pm-start="6" data-pm-end="10">complete</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(8)?.textContent).toBe('complete');
    });

    it('handles very large position values', () => {
      const container = document.createElement('div');
      const largePos = Number.MAX_SAFE_INTEGER - 1000;
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="${largePos}" data-pm-end="${largePos + 100}">large</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(largePos + 50)?.textContent).toBe('large');
      expect(index.findElementAtPosition(largePos - 1)).toBe(null);
      expect(index.findElementAtPosition(largePos + 101)).toBe(null);
    });

    it('handles Infinity and -Infinity gracefully', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="Infinity" data-pm-end="10">inf-start</span>
          <span data-pm-start="1" data-pm-end="Infinity">inf-end</span>
          <span data-pm-start="20" data-pm-end="25">valid</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      // Only the valid element should be indexed
      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(22)?.textContent).toBe('valid');
    });
  });

  describe('edge cases - empty and disconnected elements', () => {
    it('handles empty container with no PM-range elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span>no attributes</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(0);
      expect(index.findElementAtPosition(1)).toBe(null);
      expect(index.findElementsInRange(1, 10)).toEqual([]);
    });

    it('handles completely empty container', () => {
      const container = document.createElement('div');

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(0);
      expect(index.findElementAtPosition(1)).toBe(null);
      expect(index.findElementsInRange(1, 10)).toEqual([]);
    });

    it('handles container with only text nodes (no elements)', () => {
      const container = document.createElement('div');
      container.textContent = 'plain text content';

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(0);
    });

    it('maintains valid index after concurrent rebuild calls (idempotency)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">a</span>
          <span data-pm-start="6" data-pm-end="10">b</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);
      const firstSize = index.size;
      const firstResult = index.findElementAtPosition(3)?.textContent;

      // Rebuild again with same container
      index.rebuild(container);
      const secondSize = index.size;
      const secondResult = index.findElementAtPosition(3)?.textContent;

      expect(firstSize).toBe(secondSize);
      expect(firstResult).toBe(secondResult);
      expect(secondResult).toBe('a');
    });

    it('correctly updates index when container content changes between rebuilds', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">original</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(3)?.textContent).toBe('original');

      // Modify container and rebuild
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">updated</span>
          <span data-pm-start="6" data-pm-end="10">new</span>
        </div>
      `;

      index.rebuild(container);

      expect(index.size).toBe(2);
      expect(index.findElementAtPosition(3)?.textContent).toBe('updated');
      expect(index.findElementAtPosition(8)?.textContent).toBe('new');
    });
  });

  describe('edge cases - findElementAtPosition boundary conditions', () => {
    it('returns null for NaN position', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(NaN)).toBe(null);
    });

    it('returns null for Infinity position', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(Infinity)).toBe(null);
    });

    it('returns null for negative Infinity position', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(-Infinity)).toBe(null);
    });

    it('finds element at exact pmStart boundary', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">boundary</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(10)?.textContent).toBe('boundary');
    });

    it('finds element at exact pmEnd boundary', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">boundary</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(20)?.textContent).toBe('boundary');
    });

    it('returns null for position just before pmStart', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(9)).toBe(null);
    });

    it('returns null for position just after pmEnd', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(21)).toBe(null);
    });

    it('handles adjacent ranges without gaps', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">first</span>
          <span data-pm-start="5" data-pm-end="10">second</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementAtPosition(4)?.textContent).toBe('first');
      expect(index.findElementAtPosition(5)?.textContent).toBe('second');
      expect(index.findElementAtPosition(9)?.textContent).toBe('second');
    });
  });

  describe('edge cases - findElementsInRange', () => {
    it('returns empty array for NaN from parameter', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(NaN, 10)).toEqual([]);
    });

    it('returns empty array for NaN to parameter', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(1, NaN)).toEqual([]);
    });

    it('returns empty array for Infinity parameters', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(Infinity, 10)).toEqual([]);
      expect(index.findElementsInRange(1, Infinity)).toEqual([]);
    });

    it('returns empty array when from equals to (collapsed range)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(3, 3)).toEqual([]);
    });

    it('handles reversed range (from > to) by swapping', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">a</span>
          <span data-pm-start="6" data-pm-end="10">b</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(8, 3).map((el) => el.textContent);
      expect(result).toEqual(['a', 'b']);
    });

    it('finds single element partially overlapping range start', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="5" data-pm-end="10">overlap</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(3, 7);
      expect(result).toHaveLength(1);
      expect(result[0]?.textContent).toBe('overlap');
    });

    it('finds single element partially overlapping range end', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="5" data-pm-end="10">overlap</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(8, 15);
      expect(result).toHaveLength(1);
      expect(result[0]?.textContent).toBe('overlap');
    });

    it('returns empty array for range before all elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(1, 5)).toEqual([]);
    });

    it('returns empty array for range after all elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="10" data-pm-end="20">test</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      expect(index.findElementsInRange(25, 30)).toEqual([]);
    });

    it('finds elements in range that exactly matches element boundaries', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">exact</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(1, 5);
      expect(result).toHaveLength(1);
      expect(result[0]?.textContent).toBe('exact');
    });

    it('handles range that spans gap between elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">first</span>
          <span data-pm-start="10" data-pm-end="15">second</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(6, 9);
      expect(result).toEqual([]);
    });

    it('finds overlapping elements when range includes gap', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="5">first</span>
          <span data-pm-start="10" data-pm-end="15">second</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container);

      const result = index.findElementsInRange(3, 12).map((el) => el.textContent);
      expect(result).toEqual(['first', 'second']);
    });
  });

  describe('edge cases - leafOnly option', () => {
    it('correctly identifies leaf elements with deeply nested structure', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-page" data-pm-start="1" data-pm-end="20">
          <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="5">leaf1</span>
            <span data-pm-start="6" data-pm-end="10">leaf2</span>
          </div>
          <div class="superdoc-line" data-pm-start="11" data-pm-end="20">
            <span data-pm-start="11" data-pm-end="20">leaf3</span>
          </div>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container, { leafOnly: true });

      // Should only index the innermost spans, not pages or lines
      expect(index.size).toBe(3);
      expect(index.findElementAtPosition(3)?.textContent).toBe('leaf1');
      expect(index.findElementAtPosition(8)?.textContent).toBe('leaf2');
      expect(index.findElementAtPosition(15)?.textContent).toBe('leaf3');
    });

    it('includes all elements when leafOnly is explicitly false', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-page" data-pm-start="1" data-pm-end="20">
          <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="5">leaf</span>
          </div>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container, { leafOnly: false });

      // Should index page, line, and span
      expect(index.size).toBe(3);
    });

    it('handles single element (already a leaf) with leafOnly true', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <span data-pm-start="1" data-pm-end="5">single</span>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container, { leafOnly: true });

      expect(index.size).toBe(1);
      expect(index.findElementAtPosition(3)?.textContent).toBe('single');
    });

    it('handles elements where some branches have different depths', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="superdoc-line">
          <div data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="5">deep</span>
          </div>
          <span data-pm-start="11" data-pm-end="15">shallow</span>
        </div>
      `;

      const index = new DomPositionIndex();
      index.rebuild(container, { leafOnly: true });

      // Should only index the deepest elements in each branch
      expect(index.size).toBe(2);
      expect(index.findElementAtPosition(3)?.textContent).toBe('deep');
      expect(index.findElementAtPosition(13)?.textContent).toBe('shallow');
    });
  });
});
