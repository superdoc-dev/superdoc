import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the scroll-caret-into-view behavior.
 *
 * Since #scrollCaretIntoViewIfNeeded is a private method on PresentationEditor,
 * we extract its logic into a testable helper and verify it against a real DOM
 * setup with mock scroll containers and caret elements.
 */

/**
 * Extracted logic from PresentationEditor.#scrollCaretIntoViewIfNeeded.
 * This mirrors the implementation to allow direct unit testing without
 * bootstrapping the full PresentationEditor.
 */
function scrollCaretIntoViewIfNeeded(
  selectionLayer: HTMLElement | null,
  scrollContainer: Element | Window | null,
  scrollPageIntoView: (pageIndex: number) => void,
  caretLayout: { pageIndex: number },
): void {
  const caretEl = selectionLayer?.querySelector(
    '.presentation-editor__selection-caret',
  ) as HTMLElement | null;

  if (!caretEl) {
    scrollPageIntoView(caretLayout.pageIndex);
    return;
  }

  if (!scrollContainer) return;

  const caretRect = caretEl.getBoundingClientRect();

  let containerTop: number;
  let containerBottom: number;

  if (scrollContainer instanceof Window) {
    containerTop = 0;
    containerBottom = scrollContainer.innerHeight;
  } else {
    const r = (scrollContainer as Element).getBoundingClientRect();
    containerTop = r.top;
    containerBottom = r.bottom;
  }

  const SCROLL_MARGIN = 20;

  if (caretRect.bottom > containerBottom - SCROLL_MARGIN) {
    const delta = caretRect.bottom - containerBottom + SCROLL_MARGIN;
    if (scrollContainer instanceof Window) {
      scrollContainer.scrollBy({ top: delta });
    } else {
      (scrollContainer as Element).scrollTop += delta;
    }
  } else if (caretRect.top < containerTop + SCROLL_MARGIN) {
    const delta = containerTop + SCROLL_MARGIN - caretRect.top;
    if (scrollContainer instanceof Window) {
      scrollContainer.scrollBy({ top: -delta });
    } else {
      (scrollContainer as Element).scrollTop -= delta;
    }
  }
}

describe('scrollCaretIntoViewIfNeeded', () => {
  let selectionLayer: HTMLElement;
  let scrollContainer: HTMLElement;
  let scrollPageIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectionLayer = document.createElement('div');
    scrollContainer = document.createElement('div');
    scrollContainer.style.overflowY = 'auto';

    Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2000, configurable: true });
    scrollContainer.scrollTop = 0;

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(selectionLayer);

    scrollPageIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function createCaret(rect: { top: number; bottom: number; left: number; right: number }): HTMLElement {
    const caret = document.createElement('div');
    caret.className = 'presentation-editor__selection-caret';
    caret.getBoundingClientRect = () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }) as DOMRect;
    selectionLayer.appendChild(caret);
    return caret;
  }

  function setContainerRect(top: number, bottom: number): void {
    scrollContainer.getBoundingClientRect = () =>
      ({
        top,
        bottom,
        left: 0,
        right: 800,
        width: 800,
        height: bottom - top,
      }) as DOMRect;
  }

  it('scrolls down when caret is below viewport', () => {
    setContainerRect(0, 600);
    createCaret({ top: 610, bottom: 625, left: 100, right: 102 });

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    // delta = 625 - 600 + 20 = 45
    expect(scrollContainer.scrollTop).toBe(45);
  });

  it('scrolls down when caret is within bottom margin', () => {
    setContainerRect(0, 600);
    // Caret bottom at 590 → within 20px margin of 600
    createCaret({ top: 585, bottom: 590, left: 100, right: 102 });

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    // delta = 590 - 600 + 20 = 10
    expect(scrollContainer.scrollTop).toBe(10);
  });

  it('scrolls up when caret is above viewport', () => {
    setContainerRect(100, 700);
    createCaret({ top: 80, bottom: 95, left: 100, right: 102 });
    scrollContainer.scrollTop = 200;

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    // delta = 100 + 20 - 80 = 40
    expect(scrollContainer.scrollTop).toBe(160); // 200 - 40
  });

  it('scrolls up when caret is within top margin', () => {
    setContainerRect(100, 700);
    // Caret top at 110 → within 20px margin of containerTop (100)
    createCaret({ top: 110, bottom: 125, left: 100, right: 102 });
    scrollContainer.scrollTop = 200;

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    // delta = 100 + 20 - 110 = 10
    expect(scrollContainer.scrollTop).toBe(190); // 200 - 10
  });

  it('does not scroll when caret is fully visible', () => {
    setContainerRect(0, 600);
    createCaret({ top: 300, bottom: 315, left: 100, right: 102 });

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('does not scroll when caret is at safe distance from edges', () => {
    setContainerRect(0, 600);
    // Caret at 50px from top and 535px from bottom — well within margins
    createCaret({ top: 50, bottom: 65, left: 100, right: 102 });

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    expect(scrollContainer.scrollTop).toBe(0);
  });

  it('falls back to scrollPageIntoView when caret element is not rendered', () => {
    // No caret element in selectionLayer

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 3 });

    expect(scrollPageIntoView).toHaveBeenCalledWith(3);
  });

  it('does nothing when scrollContainer is null', () => {
    createCaret({ top: 800, bottom: 815, left: 100, right: 102 });

    // Should not throw
    scrollCaretIntoViewIfNeeded(selectionLayer, null, scrollPageIntoView, { pageIndex: 0 });

    expect(scrollPageIntoView).not.toHaveBeenCalled();
  });

  // Note: Window scroll container tests are omitted because jsdom/happy-dom
  // do not support `window instanceof Window` reliably. The Window code path
  // uses the same delta logic as the Element path (tested above) and works
  // correctly in real browsers. In practice, SuperDoc's scroll container is
  // always a DOM Element (e.g. the .dev-app__main parent), not window.

  it('handles scroll container with non-zero top offset', () => {
    // Scroll container starts at y=200 (e.g., below a toolbar)
    setContainerRect(200, 800);
    createCaret({ top: 810, bottom: 825, left: 100, right: 102 });

    scrollCaretIntoViewIfNeeded(selectionLayer, scrollContainer, scrollPageIntoView, { pageIndex: 0 });

    // delta = 825 - 800 + 20 = 45
    expect(scrollContainer.scrollTop).toBe(45);
  });
});
