import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  EditorInputManager,
  type EditorInputDependencies,
  type EditorInputCallbacks,
} from '../pointer-events/EditorInputManager.js';

// Mock prosemirror-state to control NodeSelection.create behavior
vi.mock('prosemirror-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-state')>();
  return {
    ...original,
    NodeSelection: {
      ...original.NodeSelection,
      create: vi.fn(() => ({ from: 5, to: 6 })),
    },
  };
});

/**
 * Tests for annotation double-click handling in EditorInputManager.
 *
 * When a user double-clicks on a field annotation (an element matching
 * `.annotation[data-pm-start]`), the editor should:
 * 1. Prevent the default browser behavior
 * 2. Stop event propagation
 * 3. Attempt to select the annotation node
 * 4. Emit a 'fieldAnnotationDoubleClicked' event with the annotation details
 */

describe('EditorInputManager - Annotation Double Click', () => {
  let manager: EditorInputManager;
  let viewportHost: HTMLElement;
  let visibleHost: HTMLElement;
  let mockEditor: {
    isEditable: boolean;
    state: {
      doc: { content: { size: number } };
      tr: { setSelection: Mock };
    };
    view: { dispatch: Mock; dom: HTMLElement; focus: Mock };
    emit: Mock;
  };
  let mockDeps: EditorInputDependencies;
  let mockCallbacks: EditorInputCallbacks;

  beforeEach(() => {
    // Create DOM elements
    viewportHost = document.createElement('div');
    viewportHost.className = 'presentation-editor__viewport';
    visibleHost = document.createElement('div');
    visibleHost.className = 'presentation-editor__visible';
    visibleHost.appendChild(viewportHost);

    const container = document.createElement('div');
    container.className = 'presentation-editor';
    container.appendChild(visibleHost);
    document.body.appendChild(container);

    // Create mock editor
    mockEditor = {
      isEditable: true,
      state: {
        doc: { content: { size: 100 } },
        tr: { setSelection: vi.fn().mockReturnThis() },
      },
      view: {
        dispatch: vi.fn(),
        dom: document.createElement('div'),
        focus: vi.fn(),
      },
      emit: vi.fn(),
    };

    // Create mock dependencies
    mockDeps = {
      getActiveEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getActiveEditor']>),
      getEditor: vi.fn(() => mockEditor as unknown as ReturnType<EditorInputDependencies['getEditor']>),
      getLayoutState: vi.fn(() => ({ layout: null, blocks: [], measures: [] })),
      getEpochMapper: vi.fn(() => ({
        mapPosFromLayoutToCurrentDetailed: vi.fn(() => ({ ok: true, pos: 5, toEpoch: 1 })),
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

    // Create mock callbacks
    mockCallbacks = {
      resolveFieldAnnotationSelectionFromElement: vi.fn(),
    };

    // Initialize manager
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

  /**
   * Helper to create an annotation element that matches the selector
   * `.annotation[data-pm-start]`
   */
  function createAnnotationElement(pmStart = '5'): HTMLElement {
    const annotation = document.createElement('div');
    annotation.className = 'annotation';
    annotation.setAttribute('data-pm-start', pmStart);
    return annotation;
  }

  /**
   * Helper to dispatch a double-click event on an element
   */
  function dispatchDoubleClick(element: HTMLElement): MouseEvent {
    const event = new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    element.dispatchEvent(event);
    return event;
  }

  describe('event detection', () => {
    it('should detect double-click on annotation element', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      dispatchDoubleClick(annotation);

      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).toHaveBeenCalledWith(annotation);
    });

    it('should detect double-click on nested element within annotation', () => {
      const annotation = createAnnotationElement();
      const nestedSpan = document.createElement('span');
      nestedSpan.textContent = 'Field Value';
      annotation.appendChild(nestedSpan);
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      dispatchDoubleClick(nestedSpan);

      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).toHaveBeenCalledWith(annotation);
    });

    it('should NOT trigger annotation handling for elements without data-pm-start', () => {
      const element = document.createElement('div');
      element.className = 'annotation'; // Has class but no data-pm-start
      viewportHost.appendChild(element);

      dispatchDoubleClick(element);

      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).not.toHaveBeenCalled();
    });

    it('should NOT trigger annotation handling for non-annotation elements', () => {
      const element = document.createElement('div');
      element.className = 'regular-content';
      viewportHost.appendChild(element);

      dispatchDoubleClick(element);

      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).not.toHaveBeenCalled();
    });

    it('should ignore non-left-button double-clicks', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      const event = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right button
      });
      annotation.dispatchEvent(event);

      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should prevent default and stop propagation for annotation double-click', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      const event = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      annotation.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe('editor state checks', () => {
    it('should NOT emit event when editor is not editable', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      mockEditor.isEditable = false;

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      dispatchDoubleClick(annotation);

      // Should not even try to resolve since editor is not editable
      expect(mockEditor.emit).not.toHaveBeenCalled();
    });

    it('should NOT emit event when dependencies are not set', () => {
      // Create new manager without dependencies
      const bareManager = new EditorInputManager();
      bareManager.setCallbacks(mockCallbacks);
      bareManager.bind();

      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      dispatchDoubleClick(annotation);

      expect(mockEditor.emit).not.toHaveBeenCalled();

      bareManager.destroy();
    });
  });

  describe('annotation resolution', () => {
    it('should NOT emit event when annotation cannot be resolved', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue(null);

      dispatchDoubleClick(annotation);

      expect(mockEditor.emit).not.toHaveBeenCalled();
    });

    it('should emit event with correct payload when annotation is resolved', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      const mockNode = { type: { name: 'fieldAnnotation' }, attrs: { id: 'field-1' } };
      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: mockNode,
        pos: 5,
      });

      const event = dispatchDoubleClick(annotation);

      expect(mockEditor.emit).toHaveBeenCalledWith('fieldAnnotationDoubleClicked', {
        editor: mockEditor,
        node: mockNode,
        nodePos: 5,
        event,
        currentTarget: annotation,
      });
    });
  });

  describe('selection behavior', () => {
    it('should attempt to create NodeSelection at resolved position', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      dispatchDoubleClick(annotation);

      expect(mockEditor.state.tr.setSelection).toHaveBeenCalled();
      expect(mockEditor.view.dispatch).toHaveBeenCalled();
    });

    it('should still emit event even if selection creation fails', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      const mockNode = { type: { name: 'fieldAnnotation' } };
      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: mockNode,
        pos: 5,
      });

      // Make setSelection throw an error
      mockEditor.state.tr.setSelection.mockImplementation(() => {
        throw new Error('Invalid position');
      });

      const event = dispatchDoubleClick(annotation);

      // Event should still be emitted even though selection failed
      expect(mockEditor.emit).toHaveBeenCalledWith('fieldAnnotationDoubleClicked', {
        editor: mockEditor,
        node: mockNode,
        nodePos: 5,
        event,
        currentTarget: annotation,
      });
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on unbind', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      manager.unbind();

      dispatchDoubleClick(annotation);

      // Should not be called after unbind
      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).not.toHaveBeenCalled();
    });

    it('should remove event listeners on destroy', () => {
      const annotation = createAnnotationElement();
      viewportHost.appendChild(annotation);

      (mockCallbacks.resolveFieldAnnotationSelectionFromElement as Mock).mockReturnValue({
        node: { type: { name: 'fieldAnnotation' } },
        pos: 5,
      });

      manager.destroy();

      dispatchDoubleClick(annotation);

      // Should not be called after destroy
      expect(mockCallbacks.resolveFieldAnnotationSelectionFromElement).not.toHaveBeenCalled();
    });
  });
});
