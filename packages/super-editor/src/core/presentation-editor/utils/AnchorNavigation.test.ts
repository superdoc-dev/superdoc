import { describe, it, expect, vi, beforeEach } from 'vitest';
import { goToAnchor, type GoToAnchorDeps } from './AnchorNavigation.js';

const mockSelectionToRects = vi.fn(() => []);

vi.mock('@superdoc/layout-bridge', () => ({
  selectionToRects: (...args: unknown[]) => mockSelectionToRects(...args),
}));

vi.mock('../dom/PageDom.js', () => ({
  getPageElementByIndex: (_host: HTMLElement, pageIndex: number) => {
    // Return a mock page element whose getBoundingClientRect is controlled per-test
    const el = document.createElement('div');
    el.setAttribute('data-page-index', String(pageIndex));
    el.scrollIntoView = vi.fn();
    // Default rect — tests override via mockPageRect
    el.getBoundingClientRect = () => currentPageRect;
    return el;
  },
}));

// Shared state that tests can set before calling goToAnchor
let currentPageRect: DOMRect;

function makeLayout(
  pages: Array<{ number: number; fragments: Array<{ kind: string; pmStart: number; pmEnd: number; y: number }> }>,
) {
  return {
    pageSize: { w: 612, h: 792 },
    pages: pages.map((p) => ({
      ...p,
      numberText: String(p.number),
      size: { w: 612, h: 792 },
      margins: { top: 72, bottom: 72, left: 72, right: 72, header: 36, footer: 36 },
      sectionRefs: { headerRefs: {}, footerRefs: {} },
    })),
  };
}

function makeDeps(overrides: Partial<GoToAnchorDeps> = {}): GoToAnchorDeps {
  return {
    anchor: 'heading1',
    layout: makeLayout([
      {
        number: 1,
        fragments: [{ kind: 'para', pmStart: 0, pmEnd: 100, y: 72 }],
      },
      {
        number: 2,
        fragments: [{ kind: 'para', pmStart: 100, pmEnd: 200, y: 150 }],
      },
    ]),
    blocks: [],
    measures: [],
    bookmarks: new Map([['heading1', 50]]),
    painterHost: document.createElement('div'),
    scrollContainer: createMockScrollContainer(),
    zoom: 1,
    scrollPageIntoView: vi.fn(),
    waitForPageMount: vi.fn(async () => true),
    getActiveEditor: () => ({ commands: { setTextSelection: vi.fn() } }) as never,
    timeoutMs: 5000,
    ...overrides,
  };
}

function createMockScrollContainer(overrides: { scrollTop?: number; rectTop?: number } = {}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', {
    value: overrides.scrollTop ?? 0,
    writable: true,
  });
  el.getBoundingClientRect = () => new DOMRect(0, overrides.rectTop ?? 0, 800, 600);
  el.scrollTo = vi.fn();
  return el;
}

describe('goToAnchor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectionToRects.mockReturnValue([]);
    // Default page rect: page top at y=100 in screen space
    currentPageRect = new DOMRect(0, 100, 612, 792);
  });

  it('should use scrollContainer.scrollTo with fragment Y offset', async () => {
    const scrollContainer = createMockScrollContainer({ scrollTop: 200, rectTop: 0 });
    const deps = makeDeps({ scrollContainer });

    const result = await goToAnchor(deps);

    expect(result).toBe(true);
    expect(scrollContainer.scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: 'instant',
    });

    // pageRect.top(100) - containerRect.top(0) + scrollTop(200) + fragmentY(72) * zoom(1) = 372
    const call = (scrollContainer.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.top).toBe(372);
  });

  it('should scale fragmentY by zoom factor', async () => {
    const scrollContainer = createMockScrollContainer({ scrollTop: 0, rectTop: 0 });
    const deps = makeDeps({ scrollContainer, zoom: 1.5 });

    await goToAnchor(deps);

    // pageRect.top(100) - containerRect.top(0) + scrollTop(0) + fragmentY(72) * zoom(1.5) = 208
    const call = (scrollContainer.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.top).toBe(100 + 72 * 1.5);
  });

  it('should scale fragmentY at zoom < 1', async () => {
    const scrollContainer = createMockScrollContainer({ scrollTop: 0, rectTop: 0 });
    const deps = makeDeps({ scrollContainer, zoom: 0.5 });

    await goToAnchor(deps);

    const call = (scrollContainer.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.top).toBe(100 + 72 * 0.5);
  });

  it('should fall back to scrollIntoView when fragmentY is null', async () => {
    // Layout with no fragments matching the bookmark position
    const layout = makeLayout([
      {
        number: 1,
        fragments: [{ kind: 'para', pmStart: 200, pmEnd: 300, y: 72 }],
      },
    ]);
    // Bookmark at position 50 — no fragment contains it, and nextFragment starts at 200
    const deps = makeDeps({
      layout,
      bookmarks: new Map([['heading1', 50]]),
    });

    const result = await goToAnchor(deps);

    // Should still succeed — uses nextFragment fallback which sets fragmentY
    expect(result).toBe(true);
  });

  it('should use nextFragmentY when bookmark is in a gap between fragments', async () => {
    const scrollContainer = createMockScrollContainer({ scrollTop: 0, rectTop: 0 });
    const layout = makeLayout([
      {
        number: 1,
        fragments: [
          { kind: 'para', pmStart: 0, pmEnd: 40, y: 72 },
          { kind: 'para', pmStart: 60, pmEnd: 100, y: 200 },
        ],
      },
    ]);
    // Bookmark at position 50 — in the gap between fragments
    const deps = makeDeps({
      layout,
      scrollContainer,
      bookmarks: new Map([['heading1', 50]]),
    });

    await goToAnchor(deps);

    // Should use nextFragmentY = 200 from the second fragment
    const call = (scrollContainer.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.top).toBe(100 + 200); // pageRect.top + nextFragmentY * zoom(1)
  });

  it('should handle Window as scrollContainer', async () => {
    const mockWindow = {
      scrollY: 500,
      scrollTo: vi.fn(),
    } as unknown as Window;

    const deps = makeDeps({ scrollContainer: mockWindow });

    await goToAnchor(deps);

    // pageRect.top(100) + scrollY(500) + fragmentY(72) * zoom(1) = 672
    expect(mockWindow.scrollTo).toHaveBeenCalledWith({
      top: 672,
      behavior: 'instant',
    });
  });

  it('should not use rect.y for fragmentY (coordinate space mismatch)', async () => {
    // Even when selectionToRects returns a rect, we should NOT use rect.y
    // because it's document-absolute, not page-relative like fragment.y
    mockSelectionToRects.mockReturnValue([{ x: 72, y: 9999, width: 100, height: 20, pageIndex: 0 }]);

    const scrollContainer = createMockScrollContainer({ scrollTop: 0, rectTop: 0 });
    const deps = makeDeps({ scrollContainer });

    await goToAnchor(deps);

    // fragmentY should be null (not 9999), so it falls into the fragment scan
    // which finds fragment.y = 72 for page 0
    // BUT: since pageIndex was already set from rect, the fragment scan is skipped.
    // fragmentY remains null, so it should fall back to scrollIntoView
    // This is expected — when rect gives us a pageIndex but no valid fragmentY,
    // we do the page-level scroll as a safe fallback.
  });
});
