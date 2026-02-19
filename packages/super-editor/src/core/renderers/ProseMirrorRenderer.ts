import { EditorView } from 'prosemirror-view';
import type { DirectEditorProps } from 'prosemirror-view';
import { DOMSerializer as PmDOMSerializer } from 'prosemirror-model';
import { transformListsInCopiedContent } from '@core/inputRules/html/transform-copied-lists.js';
import { applyStyleIsolationClass } from '../../utils/styleIsolation.js';
import { canUseDOM } from '../../utils/canUseDOM.js';
import type { EditorRenderer, EditorRendererAttachParams } from './EditorRenderer.js';
import type { Editor } from '../Editor.js';
import type { EditorOptions } from '../types/EditorConfig.js';

/**
 * Default fallback margin for presentation mode when pageMargins.top is undefined.
 * This value provides consistent spacing for header/footer content.
 */
const DEFAULT_FALLBACK_MARGIN_INCHES = 1;

/**
 * Minimum side margin for mobile devices to ensure content doesn't touch screen edges.
 * This provides visual breathing room and improves touch target accessibility.
 */
const MIN_MOBILE_SIDE_MARGIN_PX = 10;

/**
 * Debounce delay for window resize handlers to prevent excessive recalculations.
 * This improves performance during continuous resize operations like orientation changes.
 */
const RESIZE_DEBOUNCE_MS = 150;

/**
 * Default line height multiplier for text content.
 * This value provides consistent vertical spacing and improves readability.
 */
const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * Listener cleanup function type for tracking registered event listeners.
 */
type ListenerCleanup = () => void;

/**
 * Standard DOM-based renderer for the SuperDoc editor.
 *
 * This renderer creates and manages a ProseMirror EditorView, handles DOM initialization,
 * and provides platform-specific behaviors for browser environments.
 *
 * Responsibilities:
 * - Creating and destroying ProseMirror views
 * - Initializing editor container elements and styles
 * - Managing fonts, mobile scaling, and responsive behaviors
 * - Handling copy/paste operations with custom transformations
 * - Integrating with browser developer tools
 *
 * This renderer is used automatically in browser environments and is skipped in headless mode.
 */
export class ProseMirrorRenderer implements EditorRenderer {
  /**
   * The current ProseMirror EditorView instance.
   * Null when the renderer is not attached to a DOM element.
   */
  view: EditorView | null = null;

  /**
   * Array of cleanup functions for registered event listeners.
   * Each function removes a specific event listener when called.
   * This enables proper cleanup in destroy() to prevent memory leaks.
   */
  private eventListenerCleanups: ListenerCleanup[] = [];

  /**
   * Timeout ID for the debounced resize handler.
   * Tracked to enable proper cleanup and prevent multiple pending timeouts.
   */
  private resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Attach the renderer to a DOM element and create a ProseMirror view.
   *
   * Destroys any existing view before creating a new one to prevent memory leaks.
   *
   * @param params - Configuration including element, state, and callbacks
   * @param params.element - DOM element to mount into (or null for headless)
   * @param params.state - Initial ProseMirror editor state
   * @param params.editorProps - Additional ProseMirror view properties
   * @param params.dispatchTransaction - Transaction dispatch callback
   * @param params.handleClick - Optional click handler
   * @returns The created ProseMirror EditorView instance
   */
  attach({
    element,
    state,
    editorProps = {},
    dispatchTransaction,
    handleClick,
  }: EditorRendererAttachParams): EditorView {
    this.view?.destroy();

    // Validate that editorProps is an object before spreading
    // This prevents runtime errors if editorProps is accidentally null or a primitive
    const validatedEditorProps = editorProps && typeof editorProps === 'object' ? editorProps : {};

    this.view = new EditorView(element, {
      ...(validatedEditorProps as unknown as DirectEditorProps),
      dispatchTransaction,
      state,
      handleClick,
    });
    return this.view;
  }

  /**
   * Destroy the renderer and clean up all resources.
   *
   * Destroys the ProseMirror view, removes all event listeners, and sets view to null.
   * Should be called when the editor is unmounted or destroyed.
   */
  destroy(): void {
    // Clear pending resize timeout to prevent memory leaks
    if (this.resizeTimeoutId !== null) {
      clearTimeout(this.resizeTimeoutId);
      this.resizeTimeoutId = null;
    }

    // Clean up all registered event listeners to prevent memory leaks
    for (const cleanup of this.eventListenerCleanups) {
      cleanup();
    }
    this.eventListenerCleanups = [];

    this.view?.destroy();
    this.view = null;
  }

  /**
   * Initialize the container element for the editor.
   *
   * Handles element selection via selector, applies style isolation class,
   * and configures headless mode if DOM is unavailable.
   *
   * In headless mode or when DOM is unavailable:
   * - Sets isHeadless to true
   * - Sets element to null
   *
   * In browser mode:
   * - Resolves element from selector (# or . prefix, or getElementById)
   * - Creates a new div if no element provided
   * - Applies style isolation class
   *
   * @param options - Partial editor options containing element/selector configuration
   */
  initContainerElement(options: Partial<EditorOptions>): void {
    if (!canUseDOM()) {
      options.isHeadless = true;
      options.element = null;
      return;
    }

    if (!options.element && options.selector) {
      const { selector } = options;
      let foundElement: HTMLElement | null = null;

      if (selector.startsWith('#') || selector.startsWith('.')) {
        const queriedElement = document.querySelector(selector);
        // Safely check if the element is an HTMLElement before assigning
        foundElement = queriedElement instanceof HTMLElement ? queriedElement : null;
      } else {
        foundElement = document.getElementById(selector);
      }

      options.element = foundElement;

      const textModes = ['text', 'html'];
      if (textModes.includes(options.mode!) && options.element) {
        options.element.classList.add('sd-super-editor-html');
      }
    }

    if (options.isHeadless) {
      options.element = null;
      return;
    }

    options.element = options.element || document.createElement('div');
    applyStyleIsolationClass(options.element);
  }

  /**
   * Initialize and inject document fonts into the DOM.
   *
   * Extracts font data from the converter, generates @font-face CSS rules,
   * and appends them to the document head for use throughout the application.
   *
   * Updates editor.fontsImported with the list of imported font families.
   *
   * Wraps DOM manipulation in try-catch to handle cases where document.head
   * is inaccessible or DOM operations fail (e.g., in restricted iframe contexts).
   *
   * @param editor - The editor instance containing font data via converter
   */
  initFonts(editor: Editor): void {
    const results = editor.converter.getFontFaceImportString();

    if (results?.styleString?.length) {
      try {
        const style = document.createElement('style');
        style.textContent = results.styleString;
        document.head.appendChild(style);

        editor.fontsImported = results.fontsImported;
      } catch (error) {
        // Log error but don't crash - fonts are a progressive enhancement
        console.warn('Failed to inject fonts into DOM:', error);
      }
    }
  }

  /**
   * Update styles on the editor container and ProseMirror element.
   *
   * Applies:
   * - Page dimensions (width, height) from converter pageStyles
   * - Page margins (left, right, top for presentation mode)
   * - Accessibility attributes (role, aria-multiline, aria-label)
   * - Typography (font family, font size from document defaults)
   * - Mobile-specific styles (transform-origin, touch-action)
   * - Line height and padding for proper text layout
   *
   * @param editor - The editor instance
   * @param element - The container element to style
   * @param proseMirror - The ProseMirror content element (.ProseMirror)
   */
  updateEditorStyles(editor: Editor, element: HTMLElement, proseMirror: HTMLElement): void {
    if (!proseMirror || !element) {
      return;
    }

    this.#applyBaseStyles(editor, element, proseMirror);

    if (editor.isWebLayout()) {
      this.#applyWebLayoutStyles(element, proseMirror);
    } else {
      this.#applyPrintLayoutStyles(editor, element, proseMirror);
    }
  }

  /**
   * Apply base styles common to both web and print layouts.
   * Includes accessibility attributes, colors, typography, and mobile styles.
   */
  #applyBaseStyles(editor: Editor, element: HTMLElement, proseMirror: HTMLElement): void {
    // Accessibility
    proseMirror.setAttribute('role', 'document');
    proseMirror.setAttribute('aria-multiline', 'true');
    proseMirror.setAttribute('aria-label', 'Main content area, start typing to enter text.');
    proseMirror.setAttribute('aria-description', '');
    proseMirror.classList.remove('view-mode');

    // Box model
    element.style.boxSizing = 'border-box';
    element.style.isolation = 'isolate';

    // Colors
    proseMirror.style.outline = 'none';
    proseMirror.style.border = 'none';
    element.style.backgroundColor = '#fff';
    proseMirror.style.backgroundColor = '#fff';

    // Typography from document defaults
    const { typeface, fontSizePt, fontFamilyCss } = editor.converter.getDocumentDefaultStyles() ?? {};
    const resolvedFontFamily = fontFamilyCss || typeface;
    if (resolvedFontFamily) {
      element.style.fontFamily = resolvedFontFamily;
    }
    if (fontSizePt) {
      element.style.fontSize = `${fontSizePt}pt`;
    }

    // Line height
    proseMirror.style.lineHeight = String(DEFAULT_LINE_HEIGHT);

    // Mobile styles
    element.style.transformOrigin = 'top left';
    element.style.touchAction = 'auto';
    const elementStyleWithVendor = element.style as CSSStyleDeclaration & {
      webkitOverflowScrolling?: string;
    };
    if ('webkitOverflowScrolling' in element.style || typeof elementStyleWithVendor === 'object') {
      elementStyleWithVendor.webkitOverflowScrolling = 'touch';
    }
  }

  /**
   * Apply styles for web layout mode (OOXML ST_View 'web').
   * Content reflows to fit container width - CSS handles dimensions and text reflow.
   * This method resets inline styles that print mode may have set.
   */
  #applyWebLayoutStyles(element: HTMLElement, proseMirror: HTMLElement): void {
    // Reset dimension styles - CSS .web-layout class handles these
    element.style.width = '';
    element.style.minWidth = '';
    element.style.minHeight = '';

    // Reset padding - consuming app controls via CSS
    element.style.paddingLeft = '';
    element.style.paddingRight = '';
    proseMirror.style.paddingTop = '0';
    proseMirror.style.paddingBottom = '0';
  }

  /**
   * Apply styles for print layout mode (OOXML ST_View 'print').
   * Fixed page dimensions with document margins for print fidelity.
   */
  #applyPrintLayoutStyles(editor: Editor, element: HTMLElement, proseMirror: HTMLElement): void {
    const { pageSize, pageMargins } = editor.converter.pageStyles ?? {};

    // Fixed page dimensions
    if (pageSize?.width != null) {
      element.style.width = `${pageSize.width}in`;
      element.style.minWidth = `${pageSize.width}in`;
      if (pageSize?.height != null) {
        element.style.minHeight = `${pageSize.height}in`;
      }
    }

    // Document margins as padding
    if (pageMargins) {
      element.style.paddingLeft = `${pageMargins.left}in`;
      element.style.paddingRight = `${pageMargins.right}in`;
    }

    // Top padding for body baseline (presentation editor only)
    if (editor.presentationEditor && pageMargins?.top != null) {
      proseMirror.style.paddingTop = `${pageMargins.top}in`;
    } else if (editor.presentationEditor) {
      proseMirror.style.paddingTop = `${DEFAULT_FALLBACK_MARGIN_INCHES}in`;
    } else {
      proseMirror.style.paddingTop = '0';
    }
    proseMirror.style.paddingBottom = '0';
  }

  /**
   * Initialize default styles for the editor container and ProseMirror element.
   *
   * Skipped in headless mode or when suppressDefaultDocxStyles is enabled.
   * Calls updateEditorStyles and initMobileStyles to apply all default styling.
   *
   * @param editor - The editor instance
   * @param element - The container element (defaults to editor.element)
   */
  initDefaultStyles(editor: Editor, element: HTMLElement | null = editor.element): void {
    if (editor.options.isHeadless || editor.options.suppressDefaultDocxStyles) return;

    if (!element) {
      return;
    }

    const proseMirrorElement = element.querySelector('.ProseMirror');
    const proseMirror = proseMirrorElement instanceof HTMLElement ? proseMirrorElement : null;

    if (!proseMirror) {
      return;
    }

    this.updateEditorStyles(editor, element, proseMirror);
    this.initMobileStyles(editor, element);
  }

  /**
   * Initialize responsive styles for mobile devices.
   *
   * Sets up viewport-based scaling to fit the editor within mobile screen widths.
   * Listens for orientation changes and window resize events to update scaling dynamically.
   *
   * Note: Scaling is skipped in responsive layout mode since content reflows naturally.
   *
   * Scaling calculation:
   * - Maintains minimum side margins (MIN_MOBILE_SIDE_MARGIN_PX)
   * - Scales editor down if viewport is narrower than content
   * - Scales to 1.0 (100%) if viewport is wide enough
   *
   * Event listeners are tracked for proper cleanup in destroy().
   *
   * @param editor - The editor instance
   * @param element - The container element to apply mobile scaling to
   */
  initMobileStyles(editor: Editor, element: HTMLElement | null): void {
    if (!element) {
      return;
    }

    // In web layout mode, content reflows naturally - no scaling needed
    if (editor.isWebLayout()) {
      return;
    }

    const initialWidth = element.offsetWidth;

    const updateScale = () => {
      const elementWidth = initialWidth;
      const availableWidth = document.documentElement.clientWidth - MIN_MOBILE_SIDE_MARGIN_PX;

      editor.options.scale = Math.min(1, availableWidth / elementWidth);

      const superEditorElement = element.closest('.super-editor');
      const superEditorContainer = element.closest('.super-editor-container');

      // Safely check if elements are HTMLElements
      if (!(superEditorElement instanceof HTMLElement) || !(superEditorContainer instanceof HTMLElement)) {
        return;
      }

      if (editor.options.scale! < 1) {
        superEditorElement.style.maxWidth = `${elementWidth * editor.options.scale!}px`;
        superEditorContainer.style.minWidth = '0px';

        element.style.transform = `scale(${editor.options.scale})`;
      } else {
        superEditorElement.style.maxWidth = '';
        superEditorContainer.style.minWidth = '';

        element.style.transform = 'none';
      }
    };

    // Initial scale
    updateScale();

    const handleResize = () => {
      // Clear existing timeout to prevent multiple pending updates
      if (this.resizeTimeoutId !== null) {
        clearTimeout(this.resizeTimeoutId);
      }

      // Set new timeout and track its ID for cleanup
      this.resizeTimeoutId = setTimeout(() => {
        updateScale();
        this.resizeTimeoutId = null;
      }, RESIZE_DEBOUNCE_MS);
    };

    // Register orientation change listener if supported
    if ('orientation' in screen && 'addEventListener' in screen.orientation) {
      screen.orientation.addEventListener('change', handleResize);
      this.eventListenerCleanups.push(() => {
        screen.orientation.removeEventListener('change', handleResize);
      });
    } else {
      // jsdom (and some older browsers) don't implement matchMedia; skip listener in that case
      const mediaQueryList =
        typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null;
      if (mediaQueryList?.addEventListener) {
        mediaQueryList.addEventListener('change', handleResize);
        this.eventListenerCleanups.push(() => {
          mediaQueryList.removeEventListener('change', handleResize);
        });
      }
    }

    // Register window resize listener
    window.addEventListener('resize', handleResize);
    this.eventListenerCleanups.push(() => {
      window.removeEventListener('resize', handleResize);
    });
  }

  /**
   * Register a copy event handler for transforming copied content.
   *
   * Intercepts the native copy event to apply custom transformations to the clipboard data.
   * Specifically transforms lists to ensure proper HTML structure when pasting into other applications.
   *
   * The handler:
   * - Serializes the current selection to HTML
   * - Applies list transformation via transformListsInCopiedContent
   * - Sets the transformed HTML on the clipboard
   *
   * Wraps clipboard operations in try-catch to handle permission errors or API failures.
   * The listener is tracked for cleanup in destroy().
   *
   * @param _editor - The editor instance (unused, kept for interface compatibility)
   */
  registerCopyHandler(_editor: Editor): void {
    const dom = this.view?.dom;
    if (!dom || !canUseDOM()) {
      return;
    }

    const copyHandler = (event: ClipboardEvent) => {
      try {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return;

        event.preventDefault();

        if (!this.view) return;

        const { from, to } = this.view.state.selection;
        const slice = this.view.state.doc.slice(from, to);
        const fragment = slice.content;

        const div = document.createElement('div');
        const serializer = PmDOMSerializer.fromSchema(this.view.state.schema);
        div.appendChild(serializer.serializeFragment(fragment));

        const html = transformListsInCopiedContent(div.innerHTML);

        clipboardData.setData('text/html', html);
      } catch (error) {
        // Log but don't crash - fallback to native copy behavior
        console.warn('Failed to transform copied content:', error);
      }
    };

    dom.addEventListener('copy', copyHandler);
    this.eventListenerCleanups.push(() => {
      dom.removeEventListener('copy', copyHandler);
    });
  }

  /**
   * Initialize developer tools integration.
   *
   * Exposes editor and converter instances to window.superdocdev in development mode or when isDebug is enabled.
   * Skipped for header/footer editors to avoid cluttering the global scope.
   *
   * Available in:
   * - Development builds (process.env.NODE_ENV === 'development')
   * - Production builds with editor.options.isDebug = true
   *
   * Wraps in try-catch to handle cases where window is frozen or property assignment fails.
   *
   * @param editor - The editor instance to expose to developer tools
   */
  initDevTools(editor: Editor): void {
    if (editor.options.isHeaderOrFooter) return;

    if (process.env.NODE_ENV === 'development' || editor.options.isDebug) {
      try {
        (window as Window & { superdocdev?: unknown }).superdocdev = {
          converter: editor.converter,
          editor,
        };
      } catch (error) {
        // Log but don't crash - dev tools are not critical
        console.warn('Failed to initialize developer tools:', error);
      }
    }
  }
}
