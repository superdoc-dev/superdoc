import { DOM_CLASS_NAMES } from './constants.js';

export const CLASS_NAMES = {
  container: 'superdoc-layout',
  page: 'superdoc-page',
  fragment: 'superdoc-fragment',
  line: 'superdoc-line',
  spread: 'superdoc-spread',
  pageHeader: 'superdoc-page-header',
  pageFooter: 'superdoc-page-footer',
};

export type PageStyles = {
  background?: string;
  boxShadow?: string;
  border?: string;
  margin?: string;
};

export const DEFAULT_PAGE_STYLES: Required<PageStyles> = {
  background: '#fff',
  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  margin: '0 auto',
};

export const containerStyles: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'transparent',
  padding: '0',
  // gap is set dynamically by renderer based on pageGap option (default: 24px)
  overflowY: 'auto',
};

export const containerStylesHorizontal: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'safe center',
  background: 'transparent',
  padding: '0',
  // gap is set dynamically by renderer based on pageGap option (default: 20px for horizontal)
  overflowX: 'auto',
  minHeight: '100%',
};

export const spreadStyles: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '0px',
};

export const pageStyles = (width: number, height: number, overrides?: PageStyles): Partial<CSSStyleDeclaration> => {
  const merged = { ...DEFAULT_PAGE_STYLES, ...(overrides || {}) };

  return {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    minWidth: `${width}px`,
    minHeight: `${height}px`,
    flexShrink: '0',
    background: merged.background,
    boxShadow: merged.boxShadow,
    border: merged.border,
    margin: merged.margin,
    overflow: 'hidden',
  };
};

export const fragmentStyles: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  whiteSpace: 'pre',
  overflow: 'visible',
  boxSizing: 'border-box',
};

/**
 * Line container styles. z-index is intentionally not set on the line so that
 * the resize overlay (and other UI) can stack above content. Only the image
 * element itself gets z-index for layering within the line (e.g. above tab leaders).
 */
export const lineStyles = (lineHeight: number): Partial<CSSStyleDeclaration> => ({
  lineHeight: `${lineHeight}px`,
  height: `${lineHeight}px`,
  position: 'relative',
  display: 'block',
  whiteSpace: 'pre',
  // Allow text to overflow the line container as a safety net.
  // The primary fix uses accurate font metrics from Canvas API, but this
  // provides defense-in-depth against any remaining sub-pixel rendering
  // differences between measurement and display.
  overflow: 'visible',
});

const PRINT_STYLES = `
@media print {
  .${CLASS_NAMES.container} {
    background: transparent;
    padding: 0;
  }

  .${CLASS_NAMES.page} {
    margin: 0;
    border: none;
    box-shadow: none;
    page-break-after: always;
  }
}
`;

const LINK_AND_TOC_STYLES = `
/* Reset browser default link styling - allow run colors to show through from inline styles
 *
 * Note: !important was removed from these rules to allow inline styles to take precedence.
 * This is necessary because OOXML hyperlink character styles apply colors via inline style
 * attributes on the run elements. The CSS cascade ensures that inline styles (applied via
 * element.style.color in applyRunStyles) override these class-based rules naturally.
 *
 * Implications:
 * - OOXML hyperlink character styles will correctly display their assigned colors
 * - Browser default link colors are still reset by these inherit rules
 * - Inline color styles from run objects override the inherit value as expected
 */
.superdoc-link {
  color: inherit;
  text-decoration: none;
}

.superdoc-link:visited {
  color: inherit;
}

.superdoc-link:hover {
  text-decoration: underline;
}

/* Focus visible for keyboard navigation (WCAG 2.1 SC 2.4.7) */
.superdoc-link:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
  border-radius: 2px;
}

/* Remove outline for mouse users */
.superdoc-link:focus:not(:focus-visible) {
  outline: none;
}

/* Active state */
.superdoc-link:active {
  opacity: 0.8;
}

/* Print mode: show URLs after links */
@media print {
  .superdoc-link::after {
    content: " (" attr(href) ")";
    font-size: 0.9em;
    color: #666;
  }

  /* Don't show URL for anchor-only links */
  .superdoc-link[href^="#"]::after {
    content: "";
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .superdoc-link:focus-visible {
    outline-width: 3px;
    outline-offset: 3px;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .superdoc-link {
    transition: none;
  }
}

/* Screen reader only content (WCAG SC 1.3.1) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* TOC entry specific styles - prevent wrapping */
.superdoc-toc-entry {
  white-space: nowrap !important;
}

.superdoc-toc-entry .superdoc-link {
  color: inherit !important;
  text-decoration: none !important;
  cursor: default;
}

.superdoc-toc-entry .superdoc-link:hover {
  text-decoration: none;
}

/* Override focus styles for TOC links (they're not interactive) */
.superdoc-toc-entry .superdoc-link:focus-visible {
  outline: none;
}

/* Remove focus outlines from layout engine elements */
.superdoc-layout,
.superdoc-page,
.superdoc-layout:focus,
.superdoc-page:focus {
  outline: none !important;
}
`;

const TRACK_CHANGE_STYLES = `
.superdoc-layout .track-insert-dec.hidden,
.superdoc-layout .track-delete-dec.hidden {
  display: none;
}

.superdoc-layout .track-insert-dec.highlighted {
  border-top: 1px dashed #00853d;
  border-bottom: 1px dashed #00853d;
  background-color: #399c7222;
}

.superdoc-layout .track-delete-dec.highlighted {
  border-top: 1px dashed #cb0e47;
  border-bottom: 1px dashed #cb0e47;
  background-color: #cb0e4722;
  text-decoration: line-through !important;
  text-decoration-thickness: 2px !important;
}

.superdoc-layout .track-format-dec.highlighted {
  border-bottom: 2px solid gold;
}
`;

/**
 * SDT Container Styles - Styling for document sections and structured content containers.
 *
 * These CSS rules provide visual styling for Structured Document Tag (SDT) containers,
 * matching the appearance in super-editor. SDTs are Word/OOXML content controls that
 * wrap regions of the document to provide semantic structure and metadata.
 *
 * **Supported SDT Types:**
 * - Document Section (.superdoc-document-section): Gray bordered regions with hover tooltip
 * - Structured Content Block (.superdoc-structured-content-block): Blue bordered regions with label
 * - Structured Content Inline (.superdoc-structured-content-inline): Inline blue border with tooltip
 *
 * **Container Continuation:**
 * When an SDT spans multiple page fragments, visual continuity is maintained via data attributes:
 * - [data-sdt-container-start="true"]: First fragment gets top borders/radius
 * - [data-sdt-container-end="true"]: Last fragment gets bottom borders/radius
 * - Middle fragments: No top border, no border radius (seamless continuation)
 *
 * **Accessibility:**
 * - Labels/tooltips are pointer-events: none to avoid interfering with selection
 * - Print mode hides all visual SDT styling (borders, backgrounds, labels)
 *
 * **Implementation Note:**
 * These styles are injected once per document via ensureSdtContainerStyles() to avoid
 * duplication. The DOM painter applies corresponding classes via applySdtContainerStyling().
 */
const SDT_CONTAINER_STYLES = `
/* Document Section - Block-level container with gray border and hover tooltip */
.superdoc-document-section {
  background-color: #fafafa;
  border: 1px solid #ababab;
  border-radius: 4px;
  position: relative;
  box-sizing: border-box;
}

/* Document section tooltip - positioned above the fragment */
.superdoc-document-section__tooltip {
  position: absolute;
  top: -19px;
  left: -1px;
  max-width: 100px;
  min-width: 0;
  height: 18px;
  border: 1px solid #ababab;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 0 8px;
  align-items: center;
  font-size: 10px;
  display: none;
  z-index: 100;
  background-color: #fafafa;
  pointer-events: none;
}

.superdoc-document-section__tooltip span {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Show tooltip on hover - adjust border radius to connect with tooltip tab */
.superdoc-document-section:hover {
  border-radius: 0 4px 4px 4px;
}

.superdoc-document-section:hover .superdoc-document-section__tooltip {
  display: flex;
  align-items: center;
}

/* Continuation styling: SDT container boundary handling for multi-fragment document sections */
/* Single fragment (both start and end): full border radius */
.superdoc-document-section[data-sdt-container-start="true"][data-sdt-container-end="true"] {
  border-radius: 4px;
}

/* First fragment of a multi-fragment SDT: top corners, no bottom border */
.superdoc-document-section[data-sdt-container-start="true"]:not([data-sdt-container-end="true"]) {
  border-radius: 4px 4px 0 0;
  border-bottom: none;
}

/* Last fragment of a multi-fragment SDT: bottom corners, no top border */
.superdoc-document-section[data-sdt-container-end="true"]:not([data-sdt-container-start="true"]) {
  border-radius: 0 0 4px 4px;
  border-top: none;
}

.superdoc-document-section[data-sdt-container-start="true"]:hover {
  border-radius: 0 4px 0 0;
}

/* Middle fragments (neither start nor end): no corners, no top/bottom borders */
.superdoc-document-section:not([data-sdt-container-start="true"]):not([data-sdt-container-end="true"]) {
  border-radius: 0;
  border-top: none;
  border-bottom: none;
}

/* Structured Content Block - Blue border container */
.superdoc-structured-content-block {
  padding: 1px;
  box-sizing: border-box;
  border-radius: 4px;
  border: 1px solid transparent;
  position: relative;
}

.superdoc-structured-content-block:not(.ProseMirror-selectednode):hover {
  background-color: #f2f2f2;
  border-color: transparent;
}

/* Group hover (JavaScript-coordinated) */
.superdoc-structured-content-block.sdt-group-hover:not(.ProseMirror-selectednode),
.superdoc-structured-content-block.sdt-hover:not(.ProseMirror-selectednode) {
  background-color: #f2f2f2;
  border-color: transparent;
}

.superdoc-structured-content-block.ProseMirror-selectednode {
  border-color: #629be7;
  outline: none;
}

/* Structured content drag handle/label - positioned above */
.superdoc-structured-content__label {
  font-size: 11px;
  align-items: center;
  justify-content: center;
  position: absolute;
  left: 2px;
  top: -19px;
  width: calc(100% - 4px);
  max-width: 130px;
  min-width: 0;
  height: 18px;
  padding: 0 4px;
  border: 1px solid #629be7;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background-color: #629be7ee;
  box-sizing: border-box;
  z-index: 10;
  display: none;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.superdoc-structured-content__label span {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.superdoc-structured-content-block.ProseMirror-selectednode .superdoc-structured-content__label,
.superdoc-structured-content-block.sdt-hover:not(.ProseMirror-selectednode) .superdoc-structured-content__label {
  display: inline-flex;
}

/* Continuation styling for structured content blocks */
/* Single fragment (both start and end): full border radius */
.superdoc-structured-content-block[data-sdt-container-start="true"][data-sdt-container-end="true"] {
  border-radius: 4px;
}

/* First fragment of a multi-fragment SDT: top corners, no bottom border */
.superdoc-structured-content-block[data-sdt-container-start="true"]:not([data-sdt-container-end="true"]) {
  border-radius: 4px 4px 0 0;
  border-bottom: none;
}

/* Last fragment of a multi-fragment SDT: bottom corners, no top border */
.superdoc-structured-content-block[data-sdt-container-end="true"]:not([data-sdt-container-start="true"]) {
  border-radius: 0 0 4px 4px;
  border-top: none;
}

/* Middle fragment (neither start nor end): no corners, no top/bottom borders */
.superdoc-structured-content-block:not([data-sdt-container-start="true"]):not([data-sdt-container-end="true"]) {
  border-radius: 0;
  border-top: none;
  border-bottom: none;
}

/* Collapse double borders between adjacent SDT blocks */
.superdoc-structured-content-block + .superdoc-structured-content-block {
  border-top: none;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

/* Structured Content Inline - Inline wrapper with blue border */
.superdoc-structured-content-inline {
  padding: 1px;
  box-sizing: border-box;
  border-radius: 4px;
  border: 1px solid transparent;
  position: relative;
  display: inline;
  z-index: 10;
}

/* Hover effect for inline structured content */
.superdoc-structured-content-inline:not(.ProseMirror-selectednode):hover {
  background-color: #f2f2f2;
  border-color: transparent;
}

.superdoc-structured-content-inline.ProseMirror-selectednode {
  border-color: #629be7;
  outline: none;
  background-color: transparent;
}
/* Inline structured content label - shown on hover */
.superdoc-structured-content-inline__label {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  padding: 0 4px;
  background-color: #629be7ee;
  color: white;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 100;
  display: none;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.superdoc-structured-content-inline.ProseMirror-selectednode .superdoc-structured-content-inline__label {
  display: block;
}

.superdoc-structured-content-inline:not(.ProseMirror-selectednode):hover .superdoc-structured-content-inline__label {
  display: none;
}

/* Hover highlight for SDT containers.
 * Hover adds background highlight and z-index boost.
 * Block SDTs use .sdt-hover class (event delegation for multi-fragment coordination).
 * Inline SDTs use :hover (single element, no coordination needed).
 * Hover is suppressed when the node is selected (SD-1584). */
.superdoc-structured-content-block[data-lock-mode].sdt-hover:not(.ProseMirror-selectednode),
.superdoc-structured-content-inline[data-lock-mode]:hover:not(.ProseMirror-selectednode) {
  background-color: rgba(98, 155, 231, 0.08);
  z-index: 9999999;
}

/* Viewing mode: remove structured content affordances */
.presentation-editor--viewing .superdoc-structured-content-block,
.presentation-editor--viewing .superdoc-structured-content-inline {
  background: none;
  border: none;
  padding: 0;
}

.presentation-editor--viewing .superdoc-structured-content-block:hover {
  background: none;
  border: none;
}

.presentation-editor--viewing .superdoc-structured-content-inline:hover {
  background: none;
  border: none;
}

.presentation-editor--viewing .superdoc-structured-content__label,
.presentation-editor--viewing .superdoc-structured-content-inline__label {
  display: none !important;
}

/* Print mode: hide visual styling for SDT containers */
@media print {
  .superdoc-document-section,
  .superdoc-structured-content-block,
  .superdoc-structured-content-inline {
    background: none;
    border: none;
    padding: 0;
  }

  .superdoc-document-section__tooltip,
  .superdoc-structured-content__label,
  .superdoc-structured-content-inline__label {
    display: none !important;
  }
}
`;

const FIELD_ANNOTATION_STYLES = `
/* Field annotation draggable styles */
.superdoc-layout .annotation[data-draggable="true"] {
  user-select: text;
}

.superdoc-layout .annotation::selection,
.superdoc-layout .annotation *::selection {
  background: transparent;
}

.superdoc-layout .annotation::-moz-selection,
.superdoc-layout .annotation *::-moz-selection  {
  background: transparent;
}

.superdoc-layout .annotation,
.superdoc-layout .annotation * {
  caret-color: transparent;
}

.superdoc-layout .annotation[data-draggable="true"]:hover {
  opacity: 0.9;
}

.superdoc-layout .annotation[data-draggable="true"]:active {
  cursor: grabbing;
}

/* Drag over indicator for drop targets */
.superdoc-layout.drag-over {
  outline: 2px dashed #b015b3;
  outline-offset: -2px;
}

/* Drop zone indicator */
.superdoc-layout .superdoc-drop-indicator {
  position: absolute;
  width: 2px;
  background-color: #b015b3;
  pointer-events: none;
  z-index: 1000;
}
`;

const IMAGE_SELECTION_STYLES = `
/* Highlight for selected images (block or inline) */
.superdoc-image-selected {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(74, 144, 226, 0.35);
}

/* Ensure inline images can be targeted */
.${DOM_CLASS_NAMES.INLINE_IMAGE}.superdoc-image-selected {
  outline-offset: 2px;
}

/* Selection on clip wrapper so outline matches the visible cropped portion, not the scaled image */
.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}.superdoc-image-selected {
  outline-offset: 2px;
}
`;

/**
 * Native Selection Hiding Styles
 *
 * Hides the browser's native text selection highlight on layout engine content.
 * The PresentationEditor renders its own selection overlay for precise control
 * over selection appearance across pages, zoom levels, and virtualization.
 *
 * Without these styles, users would see BOTH the custom selection overlay AND
 * the native browser selection, causing a "double selection" visual artifact.
 */
const NATIVE_SELECTION_STYLES = `
/* Hide native browser selection on layout engine content.
 * We render our own selection overlay via PresentationEditor's #localSelectionLayer
 * for precise control over selection geometry across pages and zoom levels. */
.superdoc-layout *::selection {
  background: transparent;
}

.superdoc-layout *::-moz-selection {
  background: transparent;
}
`;

let printStylesInjected = false;
let linkStylesInjected = false;
let trackChangeStylesInjected = false;
let sdtContainerStylesInjected = false;
let fieldAnnotationStylesInjected = false;
let imageSelectionStylesInjected = false;
let nativeSelectionStylesInjected = false;

export const ensurePrintStyles = (doc: Document | null | undefined) => {
  if (printStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-print-styles', 'true');
  styleEl.textContent = PRINT_STYLES;
  doc.head?.appendChild(styleEl);
  printStylesInjected = true;
};

export const ensureLinkStyles = (doc: Document | null | undefined) => {
  if (linkStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-link-styles', 'true');
  styleEl.textContent = LINK_AND_TOC_STYLES;
  doc.head?.appendChild(styleEl);
  linkStylesInjected = true;
};

export const ensureTrackChangeStyles = (doc: Document | null | undefined) => {
  if (trackChangeStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-track-change-styles', 'true');
  styleEl.textContent = TRACK_CHANGE_STYLES;
  doc.head?.appendChild(styleEl);
  trackChangeStylesInjected = true;
};

export const ensureSdtContainerStyles = (doc: Document | null | undefined) => {
  if (sdtContainerStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-sdt-container-styles', 'true');
  styleEl.textContent = SDT_CONTAINER_STYLES;
  doc.head?.appendChild(styleEl);
  sdtContainerStylesInjected = true;
};

export const ensureFieldAnnotationStyles = (doc: Document | null | undefined) => {
  if (fieldAnnotationStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-field-annotation-styles', 'true');
  styleEl.textContent = FIELD_ANNOTATION_STYLES;
  doc.head?.appendChild(styleEl);
  fieldAnnotationStylesInjected = true;
};

/**
 * Injects image selection highlight styles into the document head.
 * Ensures styles are only injected once per document lifecycle.
 * @param {Document | null | undefined} doc - The document to inject styles into
 * @returns {void}
 */
export const ensureImageSelectionStyles = (doc: Document | null | undefined) => {
  if (imageSelectionStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-image-selection-styles', 'true');
  styleEl.textContent = IMAGE_SELECTION_STYLES;
  doc.head?.appendChild(styleEl);
  imageSelectionStylesInjected = true;
};

/**
 * Injects styles to hide native browser selection on layout engine content.
 * This prevents the "double selection" visual artifact where both the browser's
 * native selection and our custom overlay are visible simultaneously.
 *
 * The function is idempotent - calling it multiple times on the same document
 * will only inject the styles once. This is tracked via the module-level
 * `nativeSelectionStylesInjected` flag.
 *
 * @param doc - The document to inject styles into. If null or undefined, the function returns early without action.
 * @returns void
 */
export const ensureNativeSelectionStyles = (doc: Document | null | undefined): void => {
  if (nativeSelectionStylesInjected || !doc) return;
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-superdoc-native-selection-styles', 'true');
  styleEl.textContent = NATIVE_SELECTION_STYLES;
  doc.head?.appendChild(styleEl);
  nativeSelectionStylesInjected = true;
};
