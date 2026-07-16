/**
 * SD-2495 / SD-2537 regression guard for cross-reference click-to-navigate.
 *
 * The existing behavior before this PR only routed TOC-entry clicks through
 * `goToAnchor`. Cross-reference rendered anchors (`<a href="#_Ref…">`) were
 * dispatched as generic `superdoc-link-click` custom events — host apps had
 * to handle navigation themselves, and most didn't, so clicks silently
 * opened nothing. The fix generalized the internal-anchor branch in
 * `#handleLinkClick` to cover every `#…` href.
 *
 * This test pins the new behavior:
 *   - clicks on `<a href="#someBookmark">` invoke `goToAnchor('#someBookmark')`
 *   - the browser's default navigation is prevented
 * so a future refactor that narrows the branch back to TOC-only breaks this.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 12,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: '',
    column: 0,
    lineIndex: -1,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 12, layoutEpoch: 1, pageIndex: 0 })),
  getFragmentAtPosition: vi.fn(() => null),
}));

describe('EditorInputManager — anchor-href click routing (SD-2537)', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let goToAnchor: Mock;
  let exitActiveStorySession: Mock;
  let mockEditor: {
    isEditable: boolean;
    state: { doc: { content: { size: number } }; selection: { $anchor: null } };
    view: { dispatch: Mock; dom: HTMLElement; focus: Mock; hasFocus: Mock };
    on: Mock;
    off: Mock;
    emit: Mock;
  };

  beforeEach(() => {
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor__visible';
    visibleHost.appendChild(viewportHost);
    document.body.appendChild(visibleHost);

    mockEditor = {
      isEditable: true,
      state: { doc: { content: { size: 100 } }, selection: { $anchor: null } },
      view: { dispatch: vi.fn(), dom: document.createElement('div'), focus: vi.fn(), hasFocus: vi.fn(() => false) },
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    const deps: EditorInputDependencies = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      getEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      getLayoutState: vi.fn(() => ({ layout: {} as never, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 12, toEpoch: 1 })),
      })) as unknown as EditorInputDependencies['getEpochMapper'],
      getViewportHost: vi.fn(() => viewportHost),
      getVisibleHost: vi.fn(() => visibleHost),
      getLayoutMode: vi.fn(() => 'vertical' as const),
      getHeaderFooterSession: vi.fn(() => null),
      getPageGeometryHelper: vi.fn(() => null),
      getZoom: vi.fn(() => 1),
      isViewLocked: vi.fn(() => false),
      getDocumentMode: vi.fn(() => 'editing' as const),
      getPageElement: vi.fn(() => null),
      isSelectionAwareVirtualizationEnabled: vi.fn(() => false),
    };

    goToAnchor = vi.fn();
    exitActiveStorySession = vi.fn();
    const callbacks: EditorInputCallbacks = {
      exitActiveStorySession,
      // Return a finite pageIndex so pointerdown enters the selection/drag setup branch
      // instead of bailing as "off any page" — required for the drag-threshold guard
      // path to be exercised.
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      goToAnchor,
    };

    manager = new EditorInputManager();
    manager.setDependencies(deps);
    manager.setCallbacks(callbacks);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  const makeAnchor = (href: string): HTMLAnchorElement => {
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', href);
    a.textContent = '15';
    viewportHost.appendChild(a);
    return a;
  };

  const firePointerDown = (el: HTMLElement) => {
    const PointerEventImpl =
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? globalThis.MouseEvent;
    el.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 10,
        clientY: 10,
      } as PointerEventInit),
    );
  };

  const firePointerUp = (el: HTMLElement, opts: { clientX?: number; clientY?: number } = {}) => {
    const PointerEventImpl =
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? globalThis.MouseEvent;
    el.dispatchEvent(
      new PointerEventImpl('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: opts.clientX ?? 10,
        clientY: opts.clientY ?? 10,
      } as PointerEventInit),
    );
  };

  const firePointerMove = (el: HTMLElement, opts: { clientX: number; clientY: number }) => {
    const PointerEventImpl =
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? globalThis.MouseEvent;
    el.dispatchEvent(
      new PointerEventImpl('pointermove', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: opts.clientX,
        clientY: opts.clientY,
      } as PointerEventInit),
    );
  };

  it('routes `#<bookmark>` anchor clicks through goToAnchor', () => {
    const a = makeAnchor('#_Ref506192326');
    firePointerDown(a);
    expect(goToAnchor).toHaveBeenCalledWith('#_Ref506192326');
  });

  it('routes TOC-inside `#…` anchor clicks through goToAnchor (backward compat)', () => {
    // The pre-PR behavior was TOC-only. Make sure generalizing the branch
    // didn't accidentally exclude TOC entries.
    //
    // update: TOC links now defer navigation from pointerdown to
    // pointerup so the user can drag-select inside the TOC. A clean click
    // (pointerdown + pointerup with no movement) must still navigate.
    const tocWrapper = document.createElement('span');
    tocWrapper.className = 'superdoc-toc-entry';
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', '#_Toc123');
    tocWrapper.appendChild(a);
    viewportHost.appendChild(tocWrapper);

    firePointerDown(a);
    expect(goToAnchor).not.toHaveBeenCalled();
    firePointerUp(a);
    expect(goToAnchor).toHaveBeenCalledWith('#_Toc123');
  });

  it('does not navigate on TOC pointerdown alone — deferral guard', () => {
    // A bare pointerdown on a TOC entry must NOT navigate, so that the user
    // has a chance to drag-select before the click resolves. Navigation only
    // fires on the matching pointerup (covered by the test above).
    const tocWrapper = document.createElement('span');
    tocWrapper.className = 'superdoc-toc-entry';
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', '#_Toc123');
    tocWrapper.appendChild(a);
    viewportHost.appendChild(tocWrapper);

    firePointerDown(a);
    expect(goToAnchor).not.toHaveBeenCalled();
  });

  it('does not navigate when TOC pointer drags past the threshold before release', () => {
    // The whole point of deferring TOC navigation to pointerup is to let the
    // user drag-select inside the TOC without triggering goToAnchor. Once the
    // pointer moves past the drag threshold, the pending nav must be dropped.
    const tocWrapper = document.createElement('span');
    tocWrapper.className = 'superdoc-toc-entry';
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', '#_Toc123');
    tocWrapper.appendChild(a);
    viewportHost.appendChild(tocWrapper);

    firePointerDown(a);
    // Move well past the 5px drag-selection threshold.
    firePointerMove(viewportHost, { clientX: 200, clientY: 200 });
    firePointerUp(a, { clientX: 200, clientY: 200 });
    expect(goToAnchor).not.toHaveBeenCalled();
  });

  it('does not route external hrefs through goToAnchor', () => {
    const a = makeAnchor('https://example.com/page');
    firePointerDown(a);
    expect(goToAnchor).not.toHaveBeenCalled();
  });

  it('does not route bare `#` (empty fragment) to goToAnchor', () => {
    const a = makeAnchor('#');
    firePointerDown(a);
    expect(goToAnchor).not.toHaveBeenCalled();
  });

  // ── SD-3400 stage 1: note-aware link dispatch ──────────────────────────────

  const makeNoteAnchor = (href: string, blockId = 'footnote-3-p0'): HTMLAnchorElement => {
    const fragment = document.createElement('div');
    fragment.setAttribute('data-block-id', blockId);
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', href);
    a.setAttribute('data-pm-start', '4');
    fragment.appendChild(a);
    viewportHost.appendChild(fragment);
    return a;
  };

  const captureLinkClickDetail = (a: HTMLAnchorElement): Record<string, unknown>[] => {
    const details: Record<string, unknown>[] = [];
    viewportHost.addEventListener('superdoc-link-click', (e) => {
      details.push((e as CustomEvent).detail);
    });
    firePointerDown(a);
    return details;
  };

  it('flags links inside painted note fragments with their note target (SD-3400)', () => {
    const a = makeNoteAnchor('https://example.com/source');
    const details = captureLinkClickDetail(a);

    expect(details).toHaveLength(1);
    expect(details[0].noteTarget).toEqual({ storyType: 'footnote', noteId: '3' });
  });

  it('dispatches body links with a null note target and exits any active story session', () => {
    const a = makeAnchor('https://example.com/page');
    const details = captureLinkClickDetail(a);

    expect(details).toHaveLength(1);
    expect(details[0].noteTarget).toBeNull();
    expect(exitActiveStorySession).toHaveBeenCalled();
  });

  it('keeps the session for note links (no exit on note-fragment link click)', () => {
    const a = makeNoteAnchor('https://example.com/source');
    captureLinkClickDetail(a);

    expect(exitActiveStorySession).not.toHaveBeenCalled();
  });

  it('flags links inside painted ENDNOTE fragments too (symmetry)', () => {
    const a = makeNoteAnchor('https://example.com/source', 'endnote-2-p0');
    const details = captureLinkClickDetail(a);

    expect(details).toHaveLength(1);
    expect(details[0].noteTarget).toEqual({ storyType: 'endnote', noteId: '2' });
  });

  it('exits the active story session before bookmark-anchor navigation', () => {
    const a = makeAnchor('#_Ref99');
    firePointerDown(a);

    expect(exitActiveStorySession).toHaveBeenCalled();
    expect(goToAnchor).toHaveBeenCalledWith('#_Ref99');
  });
});
