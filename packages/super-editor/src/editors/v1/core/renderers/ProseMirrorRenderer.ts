import { EditorView } from 'prosemirror-view';
import type { DirectEditorProps } from 'prosemirror-view';
import { DOMSerializer as PmDOMSerializer } from 'prosemirror-model';
import type { Node as PmNode } from 'prosemirror-model';
import {
  annotateFragmentDomWithClipboardData,
  mergeSerializedClipboardMetadataIntoDomContainer,
} from '../helpers/clipboardFragmentAnnotate.js';
import { transformListsInCopiedContent } from '@core/inputRules/html/transform-copied-lists.js';
import {
  bodySectPrShouldEmbed,
  collectReferencedImageMediaForClipboard,
  embedSliceInHtml,
  SUPERDOC_MEDIA_MIME,
} from '../helpers/superdocClipboardSlice.js';
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
const HEADER_FOOTER_LINE_HEIGHT = 1;

/**
 * Listener cleanup function type for tracking registered event listeners.
 */
type ListenerCleanup = () => void;

const RUNTIME_COPY_STRIP_SELECTOR = ['.list-marker', '.sd-editor-tab', '.ProseMirror-trailingBreak'].join(', ');
const PARAGRAPH_CONTENT_SELECTOR = 'span.sd-paragraph-content';
const BLOCK_COPY_CONTEXT_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, table';
const WORD_HTML_META = '<meta name="Generator" content="Microsoft Word">';

const WORD_NUM_FMT_BY_LIST_FMT = new Map<string, string>([
  ['decimal', 'decimal'],
  ['lowerLetter', 'alpha-lower'],
  ['upperLetter', 'alpha-upper'],
  ['lowerRoman', 'roman-lower'],
  ['upperRoman', 'roman-upper'],
  ['bullet', 'bullet'],
]);

function closestCopyBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;

  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement;
      if (element.matches(BLOCK_COPY_CONTEXT_SELECTOR)) {
        return element;
      }
    }
    current = current.parentNode;
  }

  return null;
}

function fragmentHasBlockElements(fragment: DocumentFragment): boolean {
  const container = document.createElement('div');
  container.appendChild(fragment.cloneNode(true));
  return Boolean(container.querySelector(BLOCK_COPY_CONTEXT_SELECTOR));
}

function getInlineTextStyle(element: HTMLElement): string {
  const styles: string[] = [];
  const computedStyle = globalThis.getComputedStyle?.(element);

  const color =
    element.style.color || (computedStyle?.color && computedStyle.color !== 'rgb(0, 0, 0)' ? computedStyle.color : '');
  const fontFamily = element.style.fontFamily || '';
  const fontSize =
    element.style.fontSize ||
    (computedStyle?.fontSize && computedStyle.fontSize !== '16px' ? computedStyle.fontSize : '');
  const textTransform =
    element.style.textTransform ||
    (computedStyle?.textTransform && computedStyle.textTransform !== 'none' ? computedStyle.textTransform : '');
  const fontWeight =
    element.style.fontWeight ||
    (computedStyle?.fontWeight && computedStyle.fontWeight !== '400' ? computedStyle.fontWeight : '');

  if (color) styles.push(`color: ${color}`);
  if (fontFamily) styles.push(`font-family: ${fontFamily}`);
  if (fontSize) styles.push(`font-size: ${fontSize}`);
  if (textTransform) styles.push(`text-transform: ${textTransform}`);
  if (fontWeight) styles.push(`font-weight: ${fontWeight}`);

  return styles.join('; ');
}

function wrapInlineOnlyRange(range: Range, view: EditorView): DocumentFragment {
  const fragment = range.cloneContents();
  if (fragmentHasBlockElements(fragment)) {
    return fragment;
  }

  const startBlock = closestCopyBlock(range.startContainer, view.dom);
  const endBlock = closestCopyBlock(range.endContainer, view.dom);
  if (!startBlock || startBlock !== endBlock) {
    return fragment;
  }

  const wrapper = startBlock.cloneNode(false) as HTMLElement;
  const inheritedTextStyle = getInlineTextStyle(startBlock);

  if (inheritedTextStyle) {
    const span = document.createElement('span');
    span.setAttribute('style', inheritedTextStyle);
    span.appendChild(fragment);
    wrapper.appendChild(span);
  } else {
    wrapper.appendChild(fragment);
  }

  const contextualFragment = document.createDocumentFragment();
  contextualFragment.appendChild(wrapper);
  return contextualFragment;
}

/**
 * Paragraphs use a NodeView whose DOM is `<p>` wrapping `.sd-paragraph-content`.
 * `posAtDOM(p, 0)` usually lands inside content, so `doc.nodeAt(pos)` is an inline node — not the block.
 * Walk resolved parents to find the paragraph for copy-time data-* annotations.
 */
function getParagraphNodeFromBlockDom(view: EditorView, blockDom: HTMLElement): PmNode | null {
  let pos: number;
  try {
    pos = view.posAtDOM(blockDom, 0);
  } catch {
    return null;
  }
  const { doc } = view.state;
  if (pos < 0 || pos > doc.content.size) {
    return null;
  }
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d -= 1) {
    const n = $pos.node(d);
    if (n.type.name === 'paragraph') {
      return n;
    }
  }
  return null;
}

function normalizeCopiedListMetadata(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('p[data-num-id], p[data-list-numbering-type]').forEach((node) => {
    const numberingType = node.getAttribute('data-list-numbering-type');
    const markerText = node.getAttribute('data-marker-type');

    if (numberingType && !node.hasAttribute('data-num-fmt')) {
      node.setAttribute('data-num-fmt', numberingType);
    }

    if (markerText && !node.hasAttribute('data-lvl-text')) {
      node.setAttribute('data-lvl-text', markerText);
    }
  });
}

function annotateCopiedSectionMetadata(container: HTMLElement, view: EditorView): void {
  const copiedBlocks = Array.from(container.querySelectorAll<HTMLElement>('[data-sd-block-id]'));
  if (copiedBlocks.length === 0) {
    return;
  }

  copiedBlocks.forEach((node) => {
    const blockId = node.getAttribute('data-sd-block-id');
    if (!blockId) return;

    const sourceNode = view.dom.querySelector<HTMLElement>(
      `[data-sd-block-id="${globalThis.CSS?.escape?.(blockId) ?? blockId}"]`,
    );
    if (!sourceNode) return;

    const pmNode = getParagraphNodeFromBlockDom(view, sourceNode);
    const paragraphProperties = pmNode?.attrs?.paragraphProperties;
    const sectPr = paragraphProperties?.sectPr;
    if (!sectPr || typeof sectPr !== 'object') {
      return;
    }

    node.setAttribute('data-sd-sect-pr', JSON.stringify(sectPr));

    const pageBreakSource = pmNode?.attrs?.pageBreakSource;
    if (typeof pageBreakSource === 'string' && pageBreakSource.length > 0) {
      node.setAttribute('data-sd-page-break-source', pageBreakSource);
    }
  });
}

function parseCopiedListPath(pathAttr: string | null): number[] {
  if (!pathAttr) return [];

  try {
    const parsed = JSON.parse(pathAttr);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
  } catch {
    return [];
  }
}

function getWordLevelText(level: number, fmt: string, markerText: string, storedLevelText: string | null): string {
  if (fmt === 'bullet') {
    return markerText || storedLevelText || '•';
  }

  if (storedLevelText?.includes('%')) {
    return storedLevelText;
  }

  const punctuation = markerText.match(/[.)]$/)?.[0] || '.';
  return `%${level + 1}${punctuation}`;
}

function buildWordListPrefix(markerText: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(document.createComment('[if !supportLists]'));

  const span = document.createElement('span');
  span.textContent = markerText;
  fragment.appendChild(span);

  fragment.appendChild(document.createComment('[endif]'));
  return fragment;
}

function serializeSelectionAsWordHtml(container: HTMLElement): string | null {
  const copiedListParagraphs = Array.from(
    container.querySelectorAll<HTMLElement>('p[data-num-id], p[data-list-numbering-type]'),
  );
  if (copiedListParagraphs.length === 0) {
    return null;
  }

  const wordContainer = container.cloneNode(true) as HTMLElement;
  const cssRules = ['.MsoNormal {}', '.MsoListParagraph {}'];
  const seenLevels = new Set<string>();

  wordContainer.querySelectorAll<HTMLElement>('p[data-num-id], p[data-list-numbering-type]').forEach((node) => {
    const level = Number.parseInt(node.getAttribute('data-level') || '0', 10) || 0;
    const wordLevel = level + 1;
    const importedNumId = node.getAttribute('data-num-id') || '1';
    const abstractId = importedNumId;
    const fmt = node.getAttribute('data-num-fmt') || node.getAttribute('data-list-numbering-type') || 'decimal';
    const wordNumFmt = WORD_NUM_FMT_BY_LIST_FMT.get(fmt) || 'decimal';
    const markerText = node.getAttribute('data-marker-type') || node.getAttribute('data-lvl-text') || '1.';
    const levelText = getWordLevelText(level, fmt, markerText, node.getAttribute('data-lvl-text'));
    const levelKey = `${abstractId}:${wordLevel}:${importedNumId}`;
    const styleAttr = node.getAttribute('style');
    const msoListStyle = `mso-list:l${abstractId} level${wordLevel} lfo${importedNumId}`;

    node.setAttribute('class', 'MsoListParagraph');
    node.setAttribute('style', styleAttr ? `${msoListStyle};${styleAttr}` : msoListStyle);

    if (!seenLevels.has(levelKey)) {
      cssRules.push(
        `@list l${abstractId}:level${wordLevel} lfo${importedNumId} { mso-level-number-format: ${wordNumFmt}; mso-level-text: "${levelText}"; }`,
      );
      seenLevels.add(levelKey);
    }

    const path = parseCopiedListPath(node.getAttribute('data-list-level'));
    const startValue = path[level] ?? path[path.length - 1] ?? 1;
    const markerPrefix = fmt === 'bullet' ? markerText : `${markerText}`.trim() || `${startValue}.`;
    node.prepend(buildWordListPrefix(markerPrefix));
  });

  return `${WORD_HTML_META}<style>${cssRules.join('\n')}</style>${wordContainer.innerHTML}`;
}

/**
 * `Selection` for ProseMirror `view.root`. `Document` has `getSelection()` in typings; `ShadowRoot`
 * has it in Chromium but often not in `lib.dom`, so we call it via a narrow cast with fallback.
 */
function getSelectionFromViewRoot(root: Document | ShadowRoot | Element): Selection | null {
  if (root instanceof Document) {
    return root.getSelection();
  }
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    const extended = root as ShadowRoot & { getSelection?: () => Selection | null };
    if (typeof extended.getSelection === 'function') {
      return extended.getSelection() ?? null;
    }
    return extended.ownerDocument.getSelection();
  }
  return typeof document !== 'undefined' ? document.getSelection() : null;
}

export function buildSelectionClipboardHtml(view: EditorView, editor?: Editor): string | null {
  const rootSelection = getSelectionFromViewRoot(view.root);
  if (!rootSelection || rootSelection.isCollapsed || rootSelection.rangeCount === 0) {
    return null;
  }

  const container = document.createElement('div');
  let appendedContent = false;

  for (let index = 0; index < rootSelection.rangeCount; index += 1) {
    const range = rootSelection.getRangeAt(index);
    const commonAncestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;

    if (commonAncestor && !view.dom.contains(commonAncestor)) {
      continue;
    }

    container.appendChild(wrapInlineOnlyRange(range, view));
    appendedContent = true;
  }

  if (!appendedContent) {
    return null;
  }

  container.querySelectorAll(RUNTIME_COPY_STRIP_SELECTOR).forEach((node) => {
    node.parentNode?.removeChild(node);
  });

  container.querySelectorAll<HTMLElement>(PARAGRAPH_CONTENT_SELECTOR).forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  });

  container
    .querySelectorAll<HTMLElement>('[contenteditable], [draggable], [spellcheck], [data-pm-slice]')
    .forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('draggable');
      node.removeAttribute('spellcheck');
      node.removeAttribute('data-pm-slice');
    });

  container.querySelectorAll<HTMLElement>('[class]').forEach((node) => {
    const retainedClasses = (node.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) => !className.startsWith('ProseMirror'));

    if (retainedClasses.length > 0) {
      node.setAttribute('class', retainedClasses.join(' '));
    } else {
      node.removeAttribute('class');
    }
  });

  mergeSerializedClipboardMetadataIntoDomContainer(container, view, editor);
  normalizeCopiedListMetadata(container);
  annotateCopiedSectionMetadata(container, view);

  return serializeSelectionAsWordHtml(container) || container.innerHTML || null;
}

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
    proseMirror.style.lineHeight = editor.options.isHeaderOrFooter
      ? String(HEADER_FOOTER_LINE_HEIGHT)
      : String(DEFAULT_LINE_HEIGHT);

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
   * @param editor - SuperEditor instance (numbering defs + body section metadata on copy)
   */
  registerCopyHandler(editor: Editor): void {
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
        let sliceJson = '';
        if (from !== to) {
          const slice = this.view.state.doc.slice(from, to);
          sliceJson = JSON.stringify(slice.toJSON());
          clipboardData.setData('application/x-superdoc-slice', sliceJson);
          const mediaJson = collectReferencedImageMediaForClipboard(sliceJson, editor);
          if (mediaJson) {
            clipboardData.setData(SUPERDOC_MEDIA_MIME, mediaJson);
          }
        }

        const richHtml = buildSelectionClipboardHtml(this.view, editor);
        const bodySectPr = this.view.state.doc.attrs?.bodySectPr;
        const bodySectPrJson = bodySectPr && bodySectPrShouldEmbed(bodySectPr) ? JSON.stringify(bodySectPr) : '';

        if (richHtml) {
          clipboardData.setData('text/html', embedSliceInHtml(richHtml, sliceJson, bodySectPrJson));
          clipboardData.setData('text/plain', getSelectionFromViewRoot(this.view.root)?.toString() ?? '');
          return;
        }

        const slice = this.view.state.doc.slice(from, to);
        const fragment = slice.content;

        const div = document.createElement('div');
        const serializer = PmDOMSerializer.fromSchema(this.view.state.schema);
        div.appendChild(serializer.serializeFragment(fragment));

        annotateFragmentDomWithClipboardData(div, fragment, editor);

        const html = transformListsInCopiedContent(div.innerHTML);

        clipboardData.setData('text/html', embedSliceInHtml(html, sliceJson, bodySectPrJson));
        clipboardData.setData('text/plain', this.view.state.doc.textBetween(from, to, '\n'));
      } catch (error) {
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
