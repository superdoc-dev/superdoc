import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeCaretRectFromVisibleTextOffset,
  computeCaretRectFromPmPosition,
  computeSelectionRectsFromPmRange,
  computeSelectionRectsFromVisibleTextOffsets,
  measureVisibleTextOffset,
  type VisibleTextOffsetGeometryOptions,
} from '../selection/VisibleTextOffsetGeometry.js';

function createRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height }),
  } as DOMRect;
}

function createGeometryOptions(containers: HTMLElement[]): VisibleTextOffsetGeometryOptions {
  return {
    containers,
    zoom: 1,
    pageHeight: 792,
    pageGap: 16,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('measureVisibleTextOffset', () => {
  it('measures an element boundary after a tracked-insert wrapper as visible text', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span data-run="1"><span>ref<span class="track-insert"><span class="track-insert-dec">XYZ</span></span>erences</span></span></p>';
    document.body.appendChild(root);

    const inlineRoot = root.querySelector('[data-run="1"] > span') as HTMLElement;
    const offset = measureVisibleTextOffset(root, inlineRoot, 2);

    expect(offset).toBe(6);
  });
});

describe('computeCaretRectFromVisibleTextOffset', () => {
  it('skips PM-less marker text and places the caret after inserted visible text', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-1-0">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="15">
          <span data-sd-footnote-number="true">1</span>
          <span data-pm-start="2" data-pm-end="5">ref</span>
          <span data-pm-start="5" data-pm-end="8">XYZ</span>
          <span data-pm-start="8" data-pm-end="15">erences</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragment = page.querySelector('[data-block-id="footnote-1-0"]') as HTMLElement;
    const line = page.querySelector('.superdoc-line') as HTMLElement;
    const suffixTextNode = Array.from(page.querySelectorAll('span')).find(
      (element) => element.textContent === 'erences',
    )?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
    line.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.startContainer === suffixTextNode && this.startOffset === 0) {
        return createRect(70, 20, 0, 16);
      }
      return createRect(0, 0, 0, 0);
    });

    const rect = computeCaretRectFromVisibleTextOffset(createGeometryOptions([fragment]), 6);

    expect(rect).toMatchObject({
      pageIndex: 0,
      x: 70,
      y: 20,
      width: 1,
      height: 16,
    });
  });
});

describe('computeCaretRectFromPmPosition (SD-3400 multi-paragraph note caret)', () => {
  /**
   * Mirrors the painted shape of a 3-paragraph note ("here is the footnote i
   * am adding" / "thank you for this" / "ddd"): one fragment per paragraph,
   * lines carrying SESSION-coordinate pm ranges with +4 token gaps at the
   * paragraph boundaries (34->38, 56->60). The visible-text bridge mapped the
   * caret for pm 60 into paragraph 2 ("thank you for thi|s"); pm resolution
   * must place it on paragraph 3.
   */
  function buildThreeParagraphNote() {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-7-a">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="34">
          <span data-sd-footnote-number="true">6&nbsp;</span>
          <span data-pm-start="2" data-pm-end="34">here is the footnote i am adding</span>
        </div>
      </div>
      <div data-block-id="footnote-7-b">
        <div class="superdoc-line" data-pm-start="38" data-pm-end="56">
          <span data-pm-start="38" data-pm-end="56">thank you for this</span>
        </div>
      </div>
      <div data-block-id="footnote-7-c">
        <div class="superdoc-line" data-pm-start="60" data-pm-end="63">
          <span data-pm-start="60" data-pm-end="63">ddd</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragments = Array.from(page.querySelectorAll<HTMLElement>('[data-block-id]'));
    const textNodeOf = (text: string) =>
      Array.from(page.querySelectorAll('span')).find((el) => el.textContent === text)?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
    const lines = Array.from(page.querySelectorAll<HTMLElement>('.superdoc-line'));
    lines[0]!.getBoundingClientRect = vi.fn(() => createRect(10, 500, 300, 15));
    lines[1]!.getBoundingClientRect = vi.fn(() => createRect(10, 515, 120, 15));
    lines[2]!.getBoundingClientRect = vi.fn(() => createRect(10, 530, 30, 15));

    return { page, fragments, textNodeOf };
  }

  it('places the caret on the THIRD paragraph for a position after two paragraph breaks', () => {
    const { fragments, textNodeOf } = buildThreeParagraphNote();
    const dddTextNode = textNodeOf('ddd');

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.startContainer === dddTextNode && this.startOffset === 0) {
        return createRect(10, 530, 0, 15);
      }
      return createRect(0, 0, 0, 0);
    });

    const rect = computeCaretRectFromPmPosition(createGeometryOptions(fragments), 60);

    expect(rect).toMatchObject({ pageIndex: 0, x: 10, y: 530, height: 15 });
  });

  it('places a mid-paragraph caret at the pm offset within the leaf text', () => {
    const { fragments, textNodeOf } = buildThreeParagraphNote();
    const thankTextNode = textNodeOf('thank you for this');

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.startContainer === thankTextNode && this.startOffset === 6) {
        return createRect(50, 515, 0, 15);
      }
      return createRect(0, 0, 0, 0);
    });

    // pm 44 = 6 chars into "thank you for this" (leaf pmStart 38).
    const rect = computeCaretRectFromPmPosition(createGeometryOptions(fragments), 44);

    expect(rect).toMatchObject({ pageIndex: 0, x: 50, y: 515, height: 15 });
  });

  it('snaps a position inside an interior structural gap forward to the next line (SD-3400)', () => {
    // Positions on paragraph-boundary tokens (e.g. 36 in the 34->38 gap) are
    // valid caret positions in the session doc. Returning null here forced the
    // drift-prone visible-text bridge; snap forward to the next painted line.
    const { fragments, textNodeOf } = buildThreeParagraphNote();
    const thankTextNode = textNodeOf('thank you for this');

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.startContainer === thankTextNode && this.startOffset === 0) {
        return createRect(10, 515, 0, 15);
      }
      return createRect(0, 0, 0, 0);
    });

    const rect = computeCaretRectFromPmPosition(createGeometryOptions(fragments), 36);

    expect(rect).toMatchObject({ pageIndex: 0, x: 10, y: 515, height: 15 });
  });

  it('returns null for a position beyond the painted lines so callers can retry after paint', () => {
    // A brand-new paragraph that has not painted yet has positions past every
    // painted line: that must stay null (the caller reschedules post-paint).
    const { fragments } = buildThreeParagraphNote();

    expect(computeCaretRectFromPmPosition(createGeometryOptions(fragments), 70)).toBeNull();
  });

  it('ignores the pm-less synthetic marker text', () => {
    const { fragments, textNodeOf } = buildThreeParagraphNote();
    const firstTextNode = textNodeOf('here is the footnote i am adding');

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.startContainer === firstTextNode && this.startOffset === 0) {
        return createRect(22, 500, 0, 15);
      }
      return createRect(0, 0, 0, 0);
    });

    const rect = computeCaretRectFromPmPosition(createGeometryOptions(fragments), 2);

    expect(rect).toMatchObject({ pageIndex: 0, x: 22, y: 500, height: 15 });
  });
});

describe('computeSelectionRectsFromPmRange (SD-3400)', () => {
  it('builds selection rects across paragraph boundaries from pm positions', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-7-a">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="7">
          <span data-pm-start="2" data-pm-end="7">first</span>
        </div>
      </div>
      <div data-block-id="footnote-7-b">
        <div class="superdoc-line" data-pm-start="11" data-pm-end="17">
          <span data-pm-start="11" data-pm-end="17">second</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragments = Array.from(page.querySelectorAll<HTMLElement>('[data-block-id]'));
    const firstTextNode = Array.from(page.querySelectorAll('span')).find((el) => el.textContent === 'first')
      ?.firstChild as Text;
    const secondTextNode = Array.from(page.querySelectorAll('span')).find((el) => el.textContent === 'second')
      ?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function () {
      if (this.startContainer === firstTextNode && this.startOffset === 2 && this.endContainer === secondTextNode) {
        return [createRect(20, 500, 60, 15), createRect(10, 515, 30, 15)] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    });

    // pm 4 (inside "first") to pm 15 (inside "second").
    const rects = computeSelectionRectsFromPmRange(createGeometryOptions(fragments), 4, 15);

    expect(rects).toEqual([
      { pageIndex: 0, x: 20, y: 500, width: 60, height: 15 },
      { pageIndex: 0, x: 10, y: 515, width: 30, height: 15 },
    ]);
  });
});

describe('computeSelectionRectsFromVisibleTextOffsets', () => {
  it('maps later-word selection offsets after an inserted run to the correct painted range', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-1-0">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="23">
          <span data-sd-footnote-number="true">1</span>
          <span data-pm-start="2" data-pm-end="5">ref</span>
          <span data-pm-start="5" data-pm-end="8">XYZ</span>
          <span data-pm-start="8" data-pm-end="16">erences </span>
          <span data-pm-start="16" data-pm-end="23">Closing</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragment = page.querySelector('[data-block-id="footnote-1-0"]') as HTMLElement;
    const closingTextNode = Array.from(page.querySelectorAll('span')).find(
      (element) => element.textContent === 'Closing',
    )?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function () {
      if (this.startContainer === closingTextNode && this.startOffset === 0 && this.endContainer === closingTextNode) {
        return [createRect(120, 40, 52, 16)] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    });

    const rects = computeSelectionRectsFromVisibleTextOffsets(createGeometryOptions([fragment]), 14, 21);

    expect(rects).toEqual([
      {
        pageIndex: 0,
        x: 120,
        y: 40,
        width: 52,
        height: 16,
      },
    ]);
  });

  it('collapses same-line PM gaps that come from tracked-change wrapper structure', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-1-0">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="11">
          <span data-pm-start="2" data-pm-end="5">abc</span>
          <span data-pm-start="7" data-pm-end="11">word</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragment = page.querySelector('[data-block-id="footnote-1-0"]') as HTMLElement;
    const wordTextNode = Array.from(page.querySelectorAll('span')).find((element) => element.textContent === 'word')
      ?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function () {
      if (this.startContainer === wordTextNode && this.startOffset === 0 && this.endContainer === wordTextNode) {
        return [createRect(140, 48, 36, 16)] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    });

    const rects = computeSelectionRectsFromVisibleTextOffsets(createGeometryOptions([fragment]), 3, 7);

    expect(rects).toEqual([
      {
        pageIndex: 0,
        x: 140,
        y: 48,
        width: 36,
        height: 16,
      },
    ]);
  });

  it('preserves logical spaces that are trimmed from painted line text at line breaks', () => {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    page.innerHTML = `
      <div data-block-id="footnote-1-0">
        <div class="superdoc-line" data-pm-start="2" data-pm-end="5">
          <span data-pm-start="2" data-pm-end="5">abc</span>
        </div>
        <div class="superdoc-line" data-pm-start="6" data-pm-end="10">
          <span data-pm-start="6" data-pm-end="10">word</span>
        </div>
      </div>
    `;
    document.body.appendChild(page);

    const fragment = page.querySelector('[data-block-id="footnote-1-0"]') as HTMLElement;
    const wordTextNode = Array.from(page.querySelectorAll('span')).find((element) => element.textContent === 'word')
      ?.firstChild as Text;

    page.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function () {
      if (this.startContainer === wordTextNode && this.startOffset === 0 && this.endContainer === wordTextNode) {
        return [createRect(180, 60, 40, 16)] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    });

    const rects = computeSelectionRectsFromVisibleTextOffsets(createGeometryOptions([fragment]), 4, 8);

    expect(rects).toEqual([
      {
        pageIndex: 0,
        x: 180,
        y: 60,
        width: 40,
        height: 16,
      },
    ]);
  });
});
