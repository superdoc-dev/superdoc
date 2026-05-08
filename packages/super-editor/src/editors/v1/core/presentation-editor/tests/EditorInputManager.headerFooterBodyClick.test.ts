import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 50,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: 'paragraph-1',
    column: 0,
    lineIndex: -1,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 50, layoutEpoch: 1, pageIndex: 0, blockId: 'paragraph-1' })),
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  // Spy on create to return a stub, but keep the real class so `instanceof
  // TextSelection` checks in the production code don't throw.
  vi.spyOn(original.TextSelection, 'create').mockImplementation(
    () =>
      ({
        empty: true,
        $from: { parent: { inlineContent: true } },
      }) as unknown as InstanceType<typeof original.TextSelection>,
  );
  return original;
});

// SD-2749: clicking on body content while a header/footer editing session is
// active was dispatching the resulting selection on the header editor. When
// the header was scrolled out of view, ProseMirror's scrollIntoView pulled
// the viewport back to the header, jumping the user away from where they
// clicked. The fix re-derives the local sessionMode/editor flags after
// #handleClickInHeaderFooterMode exits the session for a body-content click.

describe('EditorInputManager - body click during header/footer session', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let bodyEditor: ReturnType<typeof buildEditor>;
  let headerEditor: ReturnType<typeof buildEditor>;
  let sessionMode: 'body' | 'header';
  let mockDeps: EditorInputDependencies;
  let mockCallbacks: EditorInputCallbacks;

  function buildEditor(docSize: number) {
    return {
      isEditable: true,
      state: {
        doc: {
          content: { size: docSize },
          nodesBetween: vi.fn((_from, _to, cb) => {
            cb({ isTextblock: true }, 0);
          }),
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          setStoredMarks: vi.fn().mockReturnThis(),
        },
        selection: { $anchor: null },
        storedMarks: null,
      },
      view: {
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        focus: vi.fn(),
        hasFocus: vi.fn(() => false),
      },
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
  }

  beforeEach(() => {
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor__visible';
    visibleHost.appendChild(viewportHost);

    const container = document.createElement('div');
    container.className = 'presentation-editor';
    container.appendChild(visibleHost);
    document.body.appendChild(container);

    bodyEditor = buildEditor(10_000);
    headerEditor = buildEditor(20);
    sessionMode = 'header';

    mockDeps = {
      getEditor: vi.fn(() => bodyEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      getActiveEditor: vi.fn(() =>
        sessionMode === 'header'
          ? (headerEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>)
          : (bodyEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      ),
      getLayoutState: vi.fn(() => ({
        layout: {
          pageSize: { w: 600, h: 800 },
          pages: [
            {
              number: 1,
              size: { w: 600, h: 800 },
              margins: { top: 72, right: 72, bottom: 72, left: 72 },
              fragments: [],
            },
          ],
        } as any,
        blocks: [],
        measures: [],
      })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 50, toEpoch: 1 })),
      })) as unknown as EditorInputDependencies['getEpochMapper'],
      getViewportHost: vi.fn(() => viewportHost),
      getVisibleHost: vi.fn(() => visibleHost),
      getLayoutMode: vi.fn(() => 'vertical'),
      getHeaderFooterSession: vi.fn(() =>
        sessionMode === 'header'
          ? ({ session: { mode: 'header' } } as ReturnType<EditorInputDependencies['getHeaderFooterSession']>)
          : null,
      ),
      // Production H/F sessions are story-backed; mirror that here so the test
      // would catch a fix that recomputes useActiveSurfaceHitTest from the
      // pre-exit story session instead of re-reading after the exit.
      getActiveStorySession: vi.fn(() =>
        sessionMode === 'header'
          ? ({ kind: 'headerFooter' } as unknown as ReturnType<
              NonNullable<EditorInputDependencies['getActiveStorySession']>
            >)
          : null,
      ),
      getPageGeometryHelper: vi.fn(() => null),
      getZoom: vi.fn(() => 1),
      isViewLocked: vi.fn(() => false),
      getDocumentMode: vi.fn(() => 'editing'),
      getPageElement: vi.fn(() => null),
      isSelectionAwareVirtualizationEnabled: vi.fn(() => false),
    };

    mockCallbacks = {
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      hitTestHeaderFooterRegion: vi.fn(() => null),
      // Simulate the runtime: clicking on body content exits the header session synchronously.
      exitHeaderFooterMode: vi.fn(() => {
        sessionMode = 'body';
      }),
    };

    manager = new EditorInputManager();
    manager.setDependencies(mockDeps);
    manager.setCallbacks(mockCallbacks);
    manager.bind();
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  function getPointerEventImpl(): typeof PointerEvent | typeof MouseEvent {
    return (
      (globalThis as unknown as { PointerEvent?: typeof PointerEvent; MouseEvent: typeof MouseEvent }).PointerEvent ??
      globalThis.MouseEvent
    );
  }

  it('dispatches the click selection on the body editor, not the header editor', () => {
    // Body content under the cursor — outside the header region.
    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 200,
        clientY: 400,
      } as PointerEventInit),
    );

    expect(mockCallbacks.exitHeaderFooterMode as Mock).toHaveBeenCalled();
    expect(headerEditor.view.dispatch).not.toHaveBeenCalled();
    expect(bodyEditor.view.dispatch).toHaveBeenCalled();
  });

  // Re-reading getActiveStorySession after the H/F session exits is what keeps
  // useActiveSurfaceHitTest correctly false. Without it, the inter-page gap
  // guard (clicks where pageIndex is undefined) is skipped and the click
  // resolves a position, moving the selection.
  it('preserves selection on inter-page gap click after exiting an H/F session', () => {
    (mockCallbacks.normalizeClientPoint as Mock).mockReturnValueOnce({ x: 200, y: 400 });

    const target = document.createElement('span');
    viewportHost.appendChild(target);

    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 200,
        clientY: 400,
      } as PointerEventInit),
    );

    expect(mockCallbacks.exitHeaderFooterMode as Mock).toHaveBeenCalled();
    expect(headerEditor.view.dispatch).not.toHaveBeenCalled();
    expect(bodyEditor.view.dispatch).not.toHaveBeenCalled();
    expect(bodyEditor.state.tr.setSelection).not.toHaveBeenCalled();
  });
});
