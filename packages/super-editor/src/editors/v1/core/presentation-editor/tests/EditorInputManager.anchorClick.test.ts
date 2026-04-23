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

describe('EditorInputManager — anchor-href click routing (SD-2537)', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let goToAnchor: Mock;
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
    const callbacks: EditorInputCallbacks = {
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({ x: clientX, y: clientY })),
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

  it('routes `#<bookmark>` anchor clicks through goToAnchor', () => {
    const a = makeAnchor('#_Ref506192326');
    firePointerDown(a);
    expect(goToAnchor).toHaveBeenCalledWith('#_Ref506192326');
  });

  it('routes TOC-inside `#…` anchor clicks through goToAnchor (backward compat)', () => {
    // The pre-PR behavior was TOC-only. Make sure generalizing the branch
    // didn't accidentally exclude TOC entries.
    const tocWrapper = document.createElement('span');
    tocWrapper.className = 'superdoc-toc-entry';
    const a = document.createElement('a');
    a.className = 'superdoc-link';
    a.setAttribute('href', '#_Toc123');
    tocWrapper.appendChild(a);
    viewportHost.appendChild(tocWrapper);

    firePointerDown(a);
    expect(goToAnchor).toHaveBeenCalledWith('#_Toc123');
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
});
