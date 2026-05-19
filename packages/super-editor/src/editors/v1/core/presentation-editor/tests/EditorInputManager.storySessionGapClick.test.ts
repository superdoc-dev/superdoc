import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { resolvePointerPositionHit } from '../input/PositionHitResolver.js';
import { TextSelection } from 'prosemirror-state';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

vi.mock('../input/PositionHitResolver.js', () => ({
  resolvePointerPositionHit: vi.fn(() => ({
    pos: 24,
    layoutEpoch: 1,
    pageIndex: 0,
    blockId: 'note-1',
    column: 0,
    lineIndex: -1,
  })),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  clickToPosition: vi.fn(() => ({ pos: 24, layoutEpoch: 1, pageIndex: 0, blockId: 'note-1' })),
  getFragmentAtPosition: vi.fn(() => null),
}));

vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  return {
    ...original,
    TextSelection: {
      ...original.TextSelection,
      create: vi.fn(() => ({
        empty: true,
        $from: { parent: { inlineContent: true } },
      })),
    },
  };
});

// SD-2749 regression lock: when a footnote/endnote story session is active and
// the user clicks in the inter-page gap (no .superdoc-page under the cursor,
// pageIndex undefined), the click must NOT dispatch a selection on the story
// editor. The new pointerOffAnyPage bail is gated behind !useActiveSurfaceHitTest,
// which would otherwise leave the gap-click path unprotected for story
// sessions. In practice the active note session is exited earlier in the
// pointer-down handler whenever the click target isn't a note element (see
// EditorInputManager.ts handlePointerDown, ~line 1442), which flips
// activeStorySession to null before useActiveSurfaceHitTest is computed and
// lets the new bail apply. This test pins that invariant: future refactors
// that delay or skip the session-exit step would re-open the gap-jump bug
// inside story sessions, and this test would fail.

describe('EditorInputManager - inter-page gap click while story session active', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let bodyEditor: ReturnType<typeof buildEditor>;
  let storyEditor: ReturnType<typeof buildEditor>;
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
    storyEditor = buildEditor(80);

    mockDeps = {
      // Active story session means getActiveEditor() returns the story editor.
      getActiveEditor: vi.fn(() => storyEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      getEditor: vi.fn(() => bodyEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      // The piece under test: a footnote/endnote session is active.
      getActiveStorySession: vi.fn(
        () =>
          ({
            kind: 'note',
            locator: { storyType: 'footnote', noteId: '1' },
          }) as unknown as ReturnType<NonNullable<EditorInputDependencies['getActiveStorySession']>>,
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
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 24, toEpoch: 1 })),
      })) as unknown as EditorInputDependencies['getEpochMapper'],
      getViewportHost: vi.fn(() => viewportHost),
      getVisibleHost: vi.fn(() => visibleHost),
      getLayoutMode: vi.fn(() => 'vertical'),
      getHeaderFooterSession: vi.fn(() => null),
      getPageGeometryHelper: vi.fn(() => null),
      getZoom: vi.fn(() => 1),
      isViewLocked: vi.fn(() => false),
      getDocumentMode: vi.fn(() => 'editing'),
      getPageElement: vi.fn(() => null),
      isSelectionAwareVirtualizationEnabled: vi.fn(() => false),
    };

    mockCallbacks = {
      // Default: behave like the production normalizer with a real page under
      // the cursor. Tests that exercise the gap override this with a
      // pageIndex-undefined return.
      normalizeClientPoint: vi.fn((clientX: number, clientY: number) => ({
        x: clientX,
        y: clientY,
        pageIndex: 0,
        pageLocalY: clientY,
      })),
      scheduleSelectionUpdate: vi.fn(),
      updateSelectionDebugHud: vi.fn(),
      hitTestHeaderFooterRegion: vi.fn(() => null),
      // Simulates PresentationEditor.hitTest -> clickToPositionGeometry on the
      // active note context. Returns *some* fragment for any coordinate, the
      // same way snapToNearestFragment does in production.
      hitTest: vi.fn(() => ({
        pos: 24,
        layoutEpoch: 1,
        pageIndex: 0,
        blockId: 'note-1-0',
        column: 0,
        lineIndex: -1,
      })),
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

  function dispatchPointerDown(
    target: HTMLElement,
    { clientX = 200, clientY = 410 }: { clientX?: number; clientY?: number } = {},
  ): void {
    const PointerEventImpl = getPointerEventImpl();
    target.dispatchEvent(
      new PointerEventImpl('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
      } as PointerEventInit),
    );
  }

  it('does not dispatch a selection on the story editor for clicks in the gap between pages', () => {
    // normalizeClientPoint mirrors PointerNormalization when no .superdoc-page
    // is under the cursor: pageIndex/pageLocalY are undefined.
    (mockCallbacks.normalizeClientPoint as Mock).mockReturnValueOnce({ x: 200, y: 410 });

    const target = document.createElement('span');
    viewportHost.appendChild(target);

    dispatchPointerDown(target, { clientX: 200, clientY: 410 });

    // No selection on either editor + no PM TextSelection means no
    // scrollIntoView, so the footnote pane stays put.
    expect(TextSelection.create as unknown as Mock).not.toHaveBeenCalled();
    expect(storyEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(storyEditor.view.dispatch).not.toHaveBeenCalled();
    expect(bodyEditor.state.tr.setSelection).not.toHaveBeenCalled();
    expect(bodyEditor.view.dispatch).not.toHaveBeenCalled();
  });
});
