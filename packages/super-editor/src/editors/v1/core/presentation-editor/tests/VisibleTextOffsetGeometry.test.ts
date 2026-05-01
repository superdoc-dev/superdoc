import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeCaretRectFromVisibleTextOffset,
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
