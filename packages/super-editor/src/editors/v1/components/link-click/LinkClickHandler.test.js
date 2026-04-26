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
  let mockPresentationEditor;
  let mockOpenPopover;
  let mockClosePopover;
  let mockSurfaceElement;
  let windowOpenSpy;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock editor with state
    mockPresentationEditor = {
      goToAnchor: vi.fn(),
    };

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
        focus: vi.fn(),
      },
      dispatch: vi.fn(),
      presentationEditor: mockPresentationEditor,
      options: {
        documentMode: 'editing',
        onException: vi.fn(),
      },
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
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
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
        focus: vi.fn(),
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

  it('should open linked images directly in editing mode instead of showing the popover', async () => {
    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkElement = document.createElement('a');
    linkElement.appendChild(document.createElement('img'));

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com/image-link',
        target: '_blank',
        rel: 'noopener noreferrer',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/image-link', '_blank', 'noopener,noreferrer');
    expect(mockOpenPopover).not.toHaveBeenCalled();
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
    expect(moveCursorToMouseEvent).not.toHaveBeenCalled();
    expect(selectionHasNodeOrMark).not.toHaveBeenCalled();
  });

  it('should navigate linked image anchors directly in editing mode', async () => {
    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkElement = document.createElement('a');
    linkElement.appendChild(document.createElement('img'));

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: '#linked-image-anchor',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockPresentationEditor.goToAnchor).toHaveBeenCalledWith('#linked-image-anchor');
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(mockOpenPopover).not.toHaveBeenCalled();
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
    expect(moveCursorToMouseEvent).not.toHaveBeenCalled();
    expect(selectionHasNodeOrMark).not.toHaveBeenCalled();
  });

  it('should open external hyperlinks in viewing mode instead of showing the popover', async () => {
    mockEditor.options.documentMode = 'viewing';

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: 'https://example.com',
        target: '_blank',
        rel: 'noopener noreferrer',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(mockOpenPopover).not.toHaveBeenCalled();
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
    expect(moveCursorToMouseEvent).not.toHaveBeenCalled();
  });

  it('should navigate internal anchors in viewing mode via editor.goToAnchor', async () => {
    mockEditor.options.documentMode = 'viewing';

    mount(LinkClickHandler, {
      props: {
        editor: mockEditor,
        openPopover: mockOpenPopover,
        closePopover: mockClosePopover,
      },
    });

    const linkElement = document.createElement('a');
    linkElement.dataset.pmStart = '10';

    const linkClickEvent = new CustomEvent('superdoc-link-click', {
      bubbles: true,
      composed: true,
      detail: {
        href: '#section-1',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      },
    });

    mockSurfaceElement.dispatchEvent(linkClickEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockPresentationEditor.goToAnchor).toHaveBeenCalledWith('#section-1');
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(mockOpenPopover).not.toHaveBeenCalled();
    expect(mockEditor.dispatch).not.toHaveBeenCalled();
  });

  // =========================================================================
  // linkPopoverResolver tests
  // =========================================================================

  describe('linkPopoverResolver', () => {
    /**
     * Helper to dispatch a link click event and wait for the async handler.
     */
    const dispatchLinkClick = async (surface, detail = {}) => {
      const linkElement = detail.element || document.createElement('a');
      if (!linkElement.dataset.pmStart) {
        linkElement.dataset.pmStart = '10';
      }

      const event = new CustomEvent('superdoc-link-click', {
        bubbles: true,
        composed: true,
        detail: {
          href: 'https://example.com',
          target: '_blank',
          rel: 'noopener',
          tooltip: 'Example',
          element: linkElement,
          clientX: 250,
          clientY: 250,
          ...detail,
        },
      });

      surface.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 20));
    };

    beforeEach(() => {
      selectionHasNodeOrMark.mockReturnValue(true);
      TextSelection.create.mockReturnValue({ from: 10, to: 10 });
    });

    it('should open default LinkInput when resolver is absent', async () => {
      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(), // LinkInput (markRaw)
        {
          showInput: true,
          editor: mockEditor,
          closePopover: mockClosePopover,
        },
        expect.objectContaining({ left: '150px', top: '165px' }),
      );
    });

    it('should open default LinkInput when resolver returns null', async () => {
      const resolver = vi.fn().mockReturnValue(null);

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );
    });

    it('should open default LinkInput when resolver returns undefined', async () => {
      const resolver = vi.fn().mockReturnValue(undefined);

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );
    });

    it('should open default LinkInput when resolver returns { type: "default" }', async () => {
      const resolver = vi.fn().mockReturnValue({ type: 'default' });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );
    });

    it('should suppress popover when resolver returns { type: "none" }', async () => {
      const resolver = vi.fn().mockReturnValue({ type: 'none' });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      expect(mockOpenPopover).not.toHaveBeenCalled();
    });

    it('should open custom component when resolver returns { type: "custom" }', async () => {
      const MockComponent = { template: '<div>Custom</div>' };
      const resolver = vi.fn().mockReturnValue({
        type: 'custom',
        component: MockComponent,
        props: { foo: 'bar' },
      });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(), // MockComponent (markRaw)
        expect.objectContaining({
          editor: mockEditor,
          closePopover: mockClosePopover,
          foo: 'bar',
        }),
        expect.objectContaining({ left: '150px', top: '165px' }),
      );
    });

    it('should fallback to default when resolver returns { type: "custom" } without component', async () => {
      const resolver = vi.fn().mockReturnValue({
        type: 'custom',
        component: null,
        props: { foo: 'bar' },
      });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      expect(resolver).toHaveBeenCalled();
      // Should fallback to default LinkInput
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );
    });

    it('should call onException and fallback to default when resolver throws', async () => {
      const error = new Error('Resolver exploded');
      const resolver = vi.fn().mockImplementation(() => {
        throw error;
      });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      // onException should have been called with the error
      expect(mockEditor.options.onException).toHaveBeenCalledWith({
        error,
        editor: mockEditor,
      });

      // Should fallback to default popover
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );
    });

    it('should pass correct context to resolver', async () => {
      const resolver = vi.fn().mockReturnValue({ type: 'default' });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      const linkElement = document.createElement('a');
      linkElement.dataset.pmStart = '10';

      await dispatchLinkClick(mockSurfaceElement, {
        href: 'https://example.com',
        target: '_blank',
        rel: 'noopener',
        tooltip: 'Example',
        element: linkElement,
        clientX: 250,
        clientY: 250,
      });

      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({
          editor: mockEditor,
          href: 'https://example.com',
          target: '_blank',
          rel: 'noopener',
          tooltip: 'Example',
          element: linkElement,
          clientX: 250,
          clientY: 250,
          isAnchorLink: false,
          documentMode: 'editing',
          position: { left: '150px', top: '165px' },
          closePopover: mockClosePopover,
        }),
      );
    });

    it('should correctly detect anchor links in context', async () => {
      const resolver = vi.fn().mockReturnValue({ type: 'default' });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement, { href: '#section-1' });

      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ isAnchorLink: true }));
    });

    it('should allow conditional resolution based on href', async () => {
      const MockCustom = { template: '<div>Custom</div>' };
      const resolver = vi.fn().mockImplementation(({ href }) => {
        if (href.includes('customer://')) {
          return { type: 'custom', component: MockCustom, props: { href } };
        }
        return { type: 'default' };
      });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          linkPopoverResolver: resolver,
        },
      });

      // First: regular link → default popover
      await dispatchLinkClick(mockSurfaceElement, { href: 'https://example.com' });
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(),
        { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
        expect.any(Object),
      );

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 350));
      mockOpenPopover.mockClear();

      // Second: custom link → custom popover
      await dispatchLinkClick(mockSurfaceElement, { href: 'customer://abc-123' });
      expect(mockOpenPopover).toHaveBeenCalledWith(
        expect.anything(), // MockCustom (markRaw)
        expect.objectContaining({
          editor: mockEditor,
          closePopover: mockClosePopover,
          href: 'customer://abc-123',
        }),
        expect.any(Object),
      );
    });

    it('should close popover without invoking resolver when popoverVisible is true', async () => {
      const resolver = vi.fn().mockReturnValue({ type: 'none' });

      mount(LinkClickHandler, {
        props: {
          editor: mockEditor,
          openPopover: mockOpenPopover,
          closePopover: mockClosePopover,
          popoverVisible: true,
          linkPopoverResolver: resolver,
        },
      });

      await dispatchLinkClick(mockSurfaceElement);

      // Popover should be closed
      expect(mockClosePopover).toHaveBeenCalled();

      // Resolver should NOT have been invoked (early return before resolver)
      expect(resolver).not.toHaveBeenCalled();

      // openPopover should NOT have been called
      expect(mockOpenPopover).not.toHaveBeenCalled();

      // editor.dispatch should NOT have been called (early return before cursor movement)
      expect(mockEditor.dispatch).not.toHaveBeenCalled();
    });

    // ─── External type (framework-agnostic) ───────────────────────────────

    describe('external type', () => {
      let editorContainer;
      let editorWrapper;

      beforeEach(() => {
        // External popovers need a parent container to mount into.
        // Mirrors the real DOM: .super-editor-container > .super-editor > surface
        editorContainer = document.createElement('div');
        editorContainer.classList.add('super-editor-container');
        editorWrapper = document.createElement('div');
        editorWrapper.classList.add('super-editor');
        editorContainer.appendChild(editorWrapper);
        editorWrapper.appendChild(mockSurfaceElement);
        document.body.appendChild(editorContainer);
      });

      afterEach(() => {
        editorContainer.remove();
      });

      it('should call render with container, closePopover, editor, and href', async () => {
        const renderFn = vi.fn();
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement, { href: 'https://example.com' });

        expect(renderFn).toHaveBeenCalledTimes(1);
        const ctx = renderFn.mock.calls[0][0];
        expect(ctx.container).toBeInstanceOf(HTMLElement);
        expect(typeof ctx.closePopover).toBe('function');
        expect(ctx.editor.state).toStrictEqual(mockEditor.state);
        expect(ctx.href).toBe('https://example.com');
      });

      it('should append a positioned container to .super-editor-container (not .super-editor)', async () => {
        const renderFn = vi.fn();
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        const container = renderFn.mock.calls[0][0].container;
        // Must mount to .super-editor-container (not .super-editor) to avoid overflow:hidden clipping
        expect(container.parentElement).toBe(editorContainer);
        expect(container.classList.contains('sd-external-link-popover')).toBe(true);
        expect(container.style.position).toBe('absolute');
        expect(container.style.left).toBe('150px');
        expect(container.style.top).toBe('165px');
      });

      it('should call destroy and remove container when closePopover is called', async () => {
        const destroyFn = vi.fn();
        const renderFn = vi.fn().mockReturnValue({ destroy: destroyFn });
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        const ctx = renderFn.mock.calls[0][0];
        const container = ctx.container;
        expect(container.parentElement).toBe(editorContainer);

        // Close the external popover
        ctx.closePopover();

        expect(destroyFn).toHaveBeenCalledTimes(1);
        expect(container.parentElement).toBeNull();
      });

      it('should clean up container even when render returns void (no destroy)', async () => {
        const renderFn = vi.fn(); // returns undefined
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        const container = renderFn.mock.calls[0][0].container;
        expect(container.parentElement).toBe(editorContainer);

        renderFn.mock.calls[0][0].closePopover();
        expect(container.parentElement).toBeNull();
      });

      it('should close on Escape key', async () => {
        const destroyFn = vi.fn();
        const renderFn = vi.fn().mockReturnValue({ destroy: destroyFn });
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        const container = renderFn.mock.calls[0][0].container;
        expect(container.parentElement).toBe(editorContainer);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(destroyFn).toHaveBeenCalledTimes(1);
        expect(container.parentElement).toBeNull();
      });

      it('should close on click outside', async () => {
        const destroyFn = vi.fn();
        const renderFn = vi.fn().mockReturnValue({ destroy: destroyFn });
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        const container = renderFn.mock.calls[0][0].container;
        expect(container.parentElement).toBe(editorContainer);

        // Click outside the container
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

        expect(destroyFn).toHaveBeenCalledTimes(1);
        expect(container.parentElement).toBeNull();
      });

      it('should toggle off external popover when clicking another link', async () => {
        const destroyFn = vi.fn();
        const renderFn = vi.fn().mockReturnValue({ destroy: destroyFn });
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        // First click opens external popover
        await dispatchLinkClick(mockSurfaceElement);
        expect(renderFn).toHaveBeenCalledTimes(1);

        // Wait for debounce
        await new Promise((resolve) => setTimeout(resolve, 350));

        // Second click should close the external popover (toggle-off)
        await dispatchLinkClick(mockSurfaceElement);

        expect(destroyFn).toHaveBeenCalledTimes(1);
        // Resolver is NOT called again — early return from toggle-off guard
        expect(resolver).toHaveBeenCalledTimes(1);
      });

      it('should fallback to default when render is not a function', async () => {
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: 'not-a-function' });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        expect(mockOpenPopover).toHaveBeenCalledWith(
          expect.anything(),
          { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
          expect.any(Object),
        );
      });

      it('should call onException and fallback to default when render throws', async () => {
        const error = new Error('Render exploded');
        const renderFn = vi.fn().mockImplementation(() => {
          throw error;
        });
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        expect(mockEditor.options.onException).toHaveBeenCalledWith({
          error,
          editor: mockEditor,
        });

        // Container should have been removed (not left in DOM)
        const orphanedContainers = editorContainer.querySelectorAll('[style*="position: absolute"]');
        expect(orphanedContainers.length).toBe(0);

        // Should fallback to default popover
        expect(mockOpenPopover).toHaveBeenCalledWith(
          expect.anything(),
          { showInput: true, editor: mockEditor, closePopover: mockClosePopover },
          expect.any(Object),
        );
      });

      it('should not bypass GenericPopover — openPopover is not called for external', async () => {
        const renderFn = vi.fn();
        const resolver = vi.fn().mockReturnValue({ type: 'external', render: renderFn });

        mount(LinkClickHandler, {
          props: {
            editor: mockEditor,
            openPopover: mockOpenPopover,
            closePopover: mockClosePopover,
            linkPopoverResolver: resolver,
          },
        });

        await dispatchLinkClick(mockSurfaceElement);

        // openPopover (which routes through GenericPopover) should NOT be called
        expect(mockOpenPopover).not.toHaveBeenCalled();
        // The render function should have been called instead
        expect(renderFn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
