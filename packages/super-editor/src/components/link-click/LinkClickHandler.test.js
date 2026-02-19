import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LinkClickHandler from './LinkClickHandler.vue';
import { getEditorSurfaceElement } from '../../core/helpers/editorSurface.js';
import { moveCursorToMouseEvent, selectionHasNodeOrMark } from '../cursor-helpers.js';
import { TextSelection } from 'prosemirror-state';

// Mock dependencies
vi.mock('../../core/helpers/editorSurface.js', () => ({
  getEditorSurfaceElement: vi.fn(),
}));

vi.mock('../cursor-helpers.js', () => ({
  moveCursorToMouseEvent: vi.fn(),
  selectionHasNodeOrMark: vi.fn(),
}));

vi.mock('prosemirror-state', () => ({
  TextSelection: {
    create: vi.fn(),
  },
}));

describe('LinkClickHandler', () => {
  let mockEditor;
  let mockOpenPopover;
  let mockClosePopover;
  let mockSurfaceElement;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock editor with state
    mockEditor = {
      state: {
        selection: {
          from: 0,
          to: 0,
          $from: {
            nodeAfter: null,
            nodeBefore: null,
          },
        },
        schema: {
          marks: {
            link: {},
          },
        },
        doc: {
          content: {
            size: 100,
          },
        },
        tr: {
          setSelection: vi.fn(function (selection) {
            return this; // Return transaction for chaining
          }),
        },
      },
      view: {
        dom: document.createElement('div'),
      },
      dispatch: vi.fn(),
    };

    // Create mock functions
    mockOpenPopover = vi.fn();
    mockClosePopover = vi.fn();

    // Create mock surface element
    mockSurfaceElement = document.createElement('div');
    mockSurfaceElement.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 100,
      right: 500,
      bottom: 500,
      width: 400,
      height: 400,
    }));

    // Setup getEditorSurfaceElement mock to return the surface element
    getEditorSurfaceElement.mockReturnValue(mockSurfaceElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mount without errors', () => {
    const wrapper = mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should attach event listener to surface element on mount', () => {
    const addEventListenerSpy = vi.spyOn(mockSurfaceElement, 'addEventListener');

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    expect(getEditorSurfaceElement).toHaveBeenCalledWith(mockEditor);
    expect(addEventListenerSpy).toHaveBeenCalledWith('superdoc-link-click', expect.any(Function));
  });

  it('should remove event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(mockSurfaceElement, 'removeEventListener');

    const wrapper = mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    wrapper.unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('superdoc-link-click', expect.any(Function));
  });

  it('should handle link click event and open popover when cursor is on a link', async () => {
    // Mock selectionHasNodeOrMark to return true (cursor is on a link)
    selectionHasNodeOrMark.mockReturnValue(true);

    // Mock TextSelection.create to return a mock selection
    const mockSelection = { from: 10, to: 10 };
    TextSelection.create.mockReturnValue(mockSelection);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create link element with data-pm-start attribute
    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    // Create and dispatch a custom link click event
    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        target: '_blank',
        rel: 'noopener',
        tooltip: 'Example link',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout in the handler
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify TextSelection.create was called with correct position
    expect(TextSelection.create).toHaveBeenCalledWith(mockEditor.state.doc, 10);

    // Verify editor.dispatch was called with transaction
    expect(mockEditor.dispatch).toHaveBeenCalledWith(mockEditor.state.tr);

    // Verify moveCursorToMouseEvent was NOT called (we used data-pm-start)
    expect(moveCursorToMouseEvent).not.toHaveBeenCalled();

    // Verify selectionHasNodeOrMark was called to check if cursor is on a link
    expect(selectionHasNodeOrMark).toHaveBeenCalledWith(mockEditor.state, 'link', { requireEnds: true });

    // Verify openPopover was called with correct parameters
    expect(mockOpenPopover).toHaveBeenCalledWith(
      expect.anything(), // LinkInput component (wrapped in markRaw)
      {
        showInput: true,
        editor: mockEditor,
        closePopover: mockClosePopover,
      },
      {
        left: '150px', // 250 (clientX) - 100 (rect.left)
        top: '165px', // 250 (clientY) - 100 (rect.top) + 15
      },
    );
  });

  it('should not open popover when cursor is not on a link', async () => {
    // Mock selectionHasNodeOrMark to return false (cursor is not on a link)
    selectionHasNodeOrMark.mockReturnValue(false);

    // Mock TextSelection.create to return a mock selection
    const mockSelection = { from: 10, to: 10 };
    TextSelection.create.mockReturnValue(mockSelection);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create link element with data-pm-start attribute
    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    // Create and dispatch a custom link click event
    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout in the handler
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify editor.dispatch was called
    expect(mockEditor.dispatch).toHaveBeenCalled();

    // Verify selectionHasNodeOrMark was called
    expect(selectionHasNodeOrMark).toHaveBeenCalled();

    // Verify openPopover was NOT called
    expect(mockOpenPopover).not.toHaveBeenCalled();
  });

  it('should handle missing editor gracefully', async () => {
    // Suppress Vue prop validation warning for this intentional null test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mount(LinkClickHandler, {
      props: {
        editor: null,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Component should mount successfully even with null editor
    expect(wrapper.exists()).toBe(true);

    // getEditorSurfaceElement may or may not be called depending on early return logic
    // The important thing is it doesn't crash

    warnSpy.mockRestore();
  });

  it('should handle missing surface element gracefully', async () => {
    // Mock getEditorSurfaceElement to return null
    getEditorSurfaceElement.mockReturnValue(null);

    const wrapper = mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    expect(wrapper.exists()).toBe(true);
    expect(getEditorSurfaceElement).toHaveBeenCalledWith(mockEditor);
  });

  it('should calculate correct popover position at different click locations', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    // Mock TextSelection.create to return a mock selection
    const mockSelection = { from: 10, to: 10 };
    TextSelection.create.mockReturnValue(mockSelection);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Test different click positions
    const testCases = [
      { clientX: 100, clientY: 100, expectedLeft: '0px', expectedTop: '15px' },
      { clientX: 200, clientY: 300, expectedLeft: '100px', expectedTop: '215px' },
      { clientX: 500, clientY: 500, expectedLeft: '400px', expectedTop: '415px' },
    ];

    for (const testCase of testCases) {
      mockOpenPopover.mockClear();

      // Create link element with data-pm-start attribute
      const linkElement = document.createElement('a');
      linkElement.dataset.pmStart = '10';

      const linkClickEvent = new CustomEvent('superdoc-link-click', {
        bubbles: true,
        composed: true,
        detail: {
          href: 'https://example.com',
          element: linkElement,
          clientX: testCase.clientX,
          clientY: testCase.clientY,
        },
      });

      mockSurfaceElement.dispatchEvent(linkClickEvent);

      // Wait for the timeout and debounce
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockOpenPopover).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        left: testCase.expectedLeft,
        top: testCase.expectedTop,
      });

      // Wait for debounce to clear before next iteration (300ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  });

  it('should handle link click with minimal event detail (no data-pm-start)', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create event with minimal detail (only required fields, no element or data-pm-start)
    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        clientX: 200,
        clientY: 200,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should fallback to moveCursorToMouseEvent when no data-pm-start is available
    expect(moveCursorToMouseEvent).toHaveBeenCalled();
    expect(selectionHasNodeOrMark).toHaveBeenCalled();
    expect(mockOpenPopover).toHaveBeenCalled();
  });

  it('should not process event if editor state is missing', async () => {
    const editorWithoutState = {
      view: {
        dom: document.createElement('div'),
      },
    };

    mount(LinkClickHandler, {
      props: {
        editor: editorWithoutState,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: document.createElement('a'),
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for potential timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should not proceed to move cursor or open popover
    expect(moveCursorToMouseEvent).not.toHaveBeenCalled();
    expect(mockOpenPopover).not.toHaveBeenCalled();
  });

  it('should close popover when clicking a link with popoverVisible=true', async () => {
    // Mock selectionHasNodeOrMark to return true (cursor is on a link)
    selectionHasNodeOrMark.mockReturnValue(true);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
        popoverVisible: true, // Popover is already visible
      },
    });

    // Create link element with data-pm-start attribute
    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    // Create and dispatch a custom link click event
    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout in the handler
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify closePopover was called
    expect(mockClosePopover).toHaveBeenCalled();

    // Verify openPopover was NOT called (popover should be closed, not reopened)
    expect(mockOpenPopover).not.toHaveBeenCalled();

    // Verify editor.dispatch was NOT called (early return before cursor movement)
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
  });

  it('should use moveCursorToMouseEvent fallback when data-pm-start is missing', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create link element WITHOUT data-pm-start attribute
    const linkElement = document.createElement('a');

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should fallback to moveCursorToMouseEvent
    expect(moveCursorToMouseEvent).toHaveBeenCalledWith(linkClickEvent.detail, mockEditor);
    expect(mockEditor.dispatch).not.toHaveBeenCalled(); // Not called when using fallback
  });

  it('should handle invalid data-pm-start (NaN) by falling back to moveCursorToMouseEvent', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create link element with invalid data-pm-start
    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = 'invalid';

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should fallback to moveCursorToMouseEvent when parseInt returns NaN
    expect(moveCursorToMouseEvent).toHaveBeenCalledWith(linkClickEvent.detail, mockEditor);
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
  });

  it('should handle out-of-bounds data-pm-start by falling back to moveCursorToMouseEvent', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    // Create link element with out-of-bounds data-pm-start
    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '999'; // Greater than doc.content.size (100)

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);

    // Wait for the timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should fallback to moveCursorToMouseEvent when position is out of bounds
    expect(moveCursorToMouseEvent).toHaveBeenCalledWith(linkClickEvent.detail, mockEditor);
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
  });

  it('should handle debounce correctly to prevent double-handling', async () => {
    selectionHasNodeOrMark.mockReturnValue(true);

    // Mock TextSelection.create
    const mockSelection = { from: 10, to: 10 };
    TextSelection.create.mockReturnValue(mockSelection);

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    // First event
    const firstEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(firstEvent);

    // Second event immediately after (should be debounced)
    const secondEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(secondEvent);

    // Wait for the timeout
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should only dispatch once (second event was debounced)
    expect(mockEditor.dispatch).toHaveBeenCalledTimes(1);
  });
});
