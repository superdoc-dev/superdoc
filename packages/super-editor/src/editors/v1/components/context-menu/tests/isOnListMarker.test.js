/**
 * Tests for isOnListMarker detection in getEditorContext.
 *
 * When a right-click event lands on a `.superdoc-list-marker` element,
 * the context returned by getEditorContext must include `isOnListMarker: true`
 * so that the context menu can show list-marker-specific actions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEditor, createBeforeEachSetup } from './testHelpers.js';

vi.mock('../../../core/utilities/clipboardUtils.js');
vi.mock('../../cursor-helpers.js', async () => {
  const actual = await vi.importActual('../../cursor-helpers.js');
  return { ...actual, selectionHasNodeOrMark: vi.fn(() => false) };
});
vi.mock('../constants.js', () => ({
  tableActionsOptions: [],
}));
vi.mock('prosemirror-history', () => ({
  undoDepth: vi.fn(() => 1),
  redoDepth: vi.fn(() => 1),
}));
vi.mock('y-prosemirror', () => ({
  yUndoPluginKey: {
    getState: vi.fn(() => ({ undoManager: { undoStack: [1], redoStack: [1] } })),
  },
}));
vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  collectTrackedChangesForContext: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));
vi.mock('@core/commands/list-helpers', () => ({
  isList: vi.fn(() => false),
}));
vi.mock('@extensions/table/tableHelpers/isCellSelection.js', () => ({
  isCellSelection: vi.fn(() => false),
}));
vi.mock('prosemirror-tables', () => ({
  selectedRect: vi.fn(() => ({ top: 0, bottom: 1, left: 0, right: 1, map: { height: 1, width: 1 } })),
}));

import { getEditorContext } from '../utils.js';

describe('getEditorContext — isOnListMarker', () => {
  let mockEditor;

  beforeEach(
    createBeforeEachSetup(() => {
      mockEditor = createMockEditor({ documentMode: 'editing', isEditable: true });
      // Provide content.size so posAtCoords path doesn't throw
      mockEditor.view.state.doc.content = { size: 100 };
      mockEditor.view.state.doc.nodesBetween = vi.fn();
      mockEditor.view.state.doc.resolve = vi.fn(() => ({
        depth: 0,
        marks: vi.fn(() => []),
        nodeBefore: null,
        nodeAfter: null,
      }));
    }),
  );

  /**
   * Creates a minimal DOM element tree representing a list marker hit:
   *   <div data-item-id="item-1">
   *     <span class="superdoc-list-marker">1.</span>  ← event.target
   *   </div>
   */
  function makeMarkerEvent(clientX = 100, clientY = 200) {
    const markerSpan = document.createElement('span');
    markerSpan.classList.add('superdoc-list-marker');
    markerSpan.textContent = '1.';

    const fragmentDiv = document.createElement('div');
    fragmentDiv.dataset.itemId = 'item-1';
    fragmentDiv.appendChild(markerSpan);

    return {
      clientX,
      clientY,
      target: markerSpan,
    };
  }

  /**
   * Creates a mouse event whose target is regular paragraph text (no marker).
   */
  function makeTextEvent(clientX = 100, clientY = 200) {
    const textSpan = document.createElement('span');
    textSpan.textContent = 'Hello world';

    return {
      clientX,
      clientY,
      target: textSpan,
    };
  }

  it('sets isOnListMarker to true when click target is .superdoc-list-marker', async () => {
    const event = makeMarkerEvent(150, 250);
    const context = await getEditorContext(mockEditor, event);

    expect(context.isOnListMarker).toBe(true);
  });

  it('sets isOnListMarker to false when click target is regular text', async () => {
    const event = makeTextEvent(150, 250);
    const context = await getEditorContext(mockEditor, event);

    expect(context.isOnListMarker).toBe(false);
  });

  it('sets isOnListMarker to false when no event is provided', async () => {
    const context = await getEditorContext(mockEditor);

    expect(context.isOnListMarker).toBe(false);
  });

  it('sets isOnListMarker to false when event has no target', async () => {
    const event = { clientX: 100, clientY: 200, target: null };
    const context = await getEditorContext(mockEditor, event);

    expect(context.isOnListMarker).toBe(false);
  });

  it('sets isOnListMarker to true when a descendant of the marker is the target', async () => {
    // Edge case: if the marker span contains a child element and the child is clicked
    const markerSpan = document.createElement('span');
    markerSpan.classList.add('superdoc-list-marker');

    const innerSpan = document.createElement('span');
    innerSpan.textContent = '1.';
    markerSpan.appendChild(innerSpan);

    const fragmentDiv = document.createElement('div');
    fragmentDiv.dataset.itemId = 'item-1';
    fragmentDiv.appendChild(markerSpan);

    const event = { clientX: 100, clientY: 200, target: innerSpan };
    const context = await getEditorContext(mockEditor, event);

    expect(context.isOnListMarker).toBe(true);
  });

  it('sets isOnListMarker to true when click target is .list-marker (flow editor mode)', async () => {
    // ParagraphNodeView uses class="list-marker" (no "superdoc-" prefix)
    const markerSpan = document.createElement('span');
    markerSpan.classList.add('list-marker');
    markerSpan.setAttribute('contenteditable', 'false');
    markerSpan.textContent = '1.';

    const event = { clientX: 100, clientY: 200, target: markerSpan };
    const context = await getEditorContext(mockEditor, event);

    expect(context.isOnListMarker).toBe(true);
  });
});
