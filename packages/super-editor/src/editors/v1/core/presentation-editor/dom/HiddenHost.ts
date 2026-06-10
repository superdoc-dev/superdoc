/**
 * Result of creating the hidden ProseMirror editor host.
 *
 * The hidden host is wrapped in a scroll-isolation container that prevents the
 * browser's native caret-tracking scroll from leaking to the page. Without this
 * wrapper, when the focused contenteditable has a deep caret position (e.g., end
 * of a long document), the browser continuously scrolls the page to reveal it —
 * fighting any programmatic scroll the user or virtualization system performs.
 *
 * @remarks
 * The wrapper is the element to insert into the DOM tree. The host is the element
 * passed to ProseMirror's Editor as its container.
 */
export type HiddenHostElements = {
  /** Outer wrapper — append this to the DOM. Provides scroll isolation via overflow:hidden. */
  wrapper: HTMLElement;
  /** Inner host — pass this to ProseMirror as the editor container. */
  host: HTMLElement;
};

/**
 * Creates a hidden host element for the ProseMirror editor, wrapped in a
 * scroll-isolating container.
 *
 * The hidden host contains the actual ProseMirror editor DOM, which provides semantic
 * document structure for accessibility (screen readers, keyboard navigation) while being
 * visually hidden off-screen. The visual presentation is rendered separately in the
 * viewport host using the layout engine.
 *
 * @param doc - The document object to create the element in
 * @param widthPx - The width of the hidden host in pixels (should match document width)
 * @returns The wrapper (for DOM insertion) and the host (for ProseMirror)
 *
 * @remarks
 * **Scroll isolation (wrapper):**
 * - `position: fixed; overflow: hidden; width: 1px; height: 1px` — creates a tiny,
 *   off-screen scroll container. When the browser's native caret-tracking tries to
 *   scroll to the focused contenteditable's caret, it adjusts the wrapper's scrollTop
 *   (a no-op since the wrapper is 1×1) instead of the page's scrollTop.
 *
 * **Hidden host (inner element):**
 * - `position: absolute` inside the wrapper — takes the full document width for accurate
 *   text measurement while being visually clipped by the wrapper.
 * - Inherits invisibility and non-interactivity from the wrapper (`opacity: 0`,
 *   `pointer-events: none`). Does NOT use `visibility: hidden` — that prevents focusing.
 * - Does NOT set `aria-hidden="true"` because the editor must remain accessible.
 * - Sets `user-select: none` to prevent text selection in the hidden editor.
 * - Sets `overflow-anchor: none` to prevent scroll anchoring issues when content changes.
 */
const HIDDEN_HOST_STYLE_ID = 'sd-presentation-hidden-host-styles';

/**
 * Injects (once per document) CSS required for IME composition to survive in
 * hidden editors.
 *
 * SD-2368: paragraphs render their content inside an inline
 * `span.sd-paragraph-content` (the NodeView's contentDOM). Chrome's IME
 * updates preedit text by deleting it and re-inserting the new preedit; when
 * the deletion empties that span, Blink's editing cleanup removes the
 * "redundant" empty inline element entirely and rewrites the preedit as bare
 * text in the `<p>`. ProseMirror then loses its contentDOM, parses the
 * paragraph as empty, and redraws — detaching Chrome's composition anchor and
 * killing the composition (first keystrokes of CJK input in an empty
 * paragraph vanish). Emptied *block* containers get a placeholder `<br>`
 * instead of being removed, so forcing the span to `display: block` keeps the
 * contentDOM alive through the preedit rewrite. Scoped to hidden hosts only:
 * they are never displayed, while visible editors render list markers inline
 * before the span and would change appearance.
 */
function ensureHiddenHostStylesheet(doc: Document): void {
  if (doc.getElementById(HIDDEN_HOST_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HIDDEN_HOST_STYLE_ID;
  style.textContent = '.presentation-editor__hidden-host .sd-paragraph-content { display: block; }';
  (doc.head ?? doc.documentElement)?.appendChild(style);
}

export function createHiddenHost(doc: Document, widthPx: number): HiddenHostElements {
  ensureHiddenHostStylesheet(doc);

  // --- Scroll-isolation wrapper ---
  const wrapper = doc.createElement('div');
  wrapper.className = 'presentation-editor__hidden-host-wrapper';
  wrapper.style.setProperty('position', 'fixed');
  wrapper.style.setProperty('left', '-9999px');
  wrapper.style.setProperty('top', '0');
  wrapper.style.setProperty('width', '1px');
  wrapper.style.setProperty('height', '1px');
  wrapper.style.setProperty('overflow', 'hidden');
  wrapper.style.setProperty('opacity', '0');
  wrapper.style.setProperty('z-index', '-1');
  wrapper.style.setProperty('pointer-events', 'none');

  // --- Inner host for ProseMirror ---
  const host = doc.createElement('div');
  host.className = 'presentation-editor__hidden-host';
  host.style.setProperty('position', 'absolute');
  host.style.setProperty('left', '0');
  host.style.setProperty('top', '0');
  if (widthPx >= 0) {
    host.style.setProperty('width', `${widthPx}px`);
  }
  host.style.setProperty('overflow-anchor', 'none');
  // DO NOT use visibility:hidden - it prevents focusing!
  host.style.setProperty('user-select', 'none');
  // DO NOT set aria-hidden="true" on this element.
  // This hidden host contains the actual ProseMirror editor which must remain accessible
  // to screen readers and keyboard navigation. The viewport (#viewportHost) is aria-hidden
  // because it's purely visual, but this editor provides the semantic document structure.

  wrapper.appendChild(host);
  return { wrapper, host };
}
