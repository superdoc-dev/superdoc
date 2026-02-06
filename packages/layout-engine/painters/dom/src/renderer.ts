import type {
  FlowBlock,
  Fragment,
  Layout,
  Measure,
  Page,
  PageMargins,
  ParaFragment,
  ImageFragment,
  DrawingFragment,
  Run,
  TextRun,
  ImageRun,
  FieldAnnotationRun,
  Line,
  LineSegment,
  ParagraphBlock,
  ParagraphMeasure,
  ImageBlock,
  ImageDrawing,
  ParagraphAttrs,
  ParagraphBorder,
  ListItemFragment,
  ListBlock,
  ListMeasure,
  TableBlock,
  TableFragment,
  TrackedChangeKind,
  TrackedChangesMode,
  SdtMetadata,
  DrawingBlock,
  VectorShapeDrawing,
  ShapeGroupDrawing,
  ShapeGroupChild,
  DrawingGeometry,
  PositionedDrawingGeometry,
  VectorShapeStyle,
  FlowRunLink,
  GradientFill,
  SolidFillWithAlpha,
  ShapeTextContent,
  DropCapDescriptor,
  TableAttrs,
  TableCellAttrs,
  PositionMapping,
} from '@superdoc/contracts';
import { calculateJustifySpacing, computeLinePmRange, shouldApplyJustify, SPACE_CHARS } from '@superdoc/contracts';
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
import { applyGradientToSVG, applyAlphaToSVG, validateHexColor } from './svg-utils.js';
import {
  CLASS_NAMES,
  containerStyles,
  containerStylesHorizontal,
  spreadStyles,
  fragmentStyles,
  lineStyles,
  pageStyles,
  ensurePrintStyles,
  ensureLinkStyles,
  ensureTrackChangeStyles,
  ensureSdtContainerStyles,
  ensureFieldAnnotationStyles,
  ensureImageSelectionStyles,
  ensureNativeSelectionStyles,
  type PageStyles,
} from './styles.js';
import { DOM_CLASS_NAMES } from './constants.js';
import { sanitizeHref, encodeTooltip } from '@superdoc/url-validation';
import { renderTableFragment as renderTableFragmentElement } from './table/renderTableFragment.js';
import { assertPmPositions, assertFragmentPmPositions } from './pm-position-validation.js';
import { applySdtContainerStyling, getSdtContainerKey, type SdtBoundaryOptions } from './utils/sdt-helpers.js';
import { generateRulerDefinitionFromPx, createRulerElement, ensureRulerStyles } from './ruler/index.js';
import { toCssFontFamily } from '@superdoc/font-utils';
import {
  hashParagraphBorders,
  hashTableBorders,
  hashCellBorders,
  getRunStringProp,
  getRunNumberProp,
  getRunBooleanProp,
  getRunUnderlineStyle,
  getRunUnderlineColor,
} from './paragraph-hash-utils.js';

/**
 * Minimal type for WordParagraphLayoutOutput marker data used in rendering.
 * Extracted to avoid dependency on @superdoc/word-layout package.
 */
type WordLayoutMarker = {
  markerText?: string;
  justification?: 'left' | 'right' | 'center';
  gutterWidthPx?: number;
  markerBoxWidthPx?: number;
  suffix?: 'tab' | 'space' | 'nothing';
  /** Pre-calculated X position where the marker should be placed (used in firstLineIndentMode). */
  markerX?: number;
  /** Pre-calculated X position where paragraph text should begin after the marker (used in firstLineIndentMode). */
  textStartX?: number;
  run: {
    fontFamily: string;
    fontSize: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    letterSpacing?: number;
  };
};

/**
 * Minimal type for wordLayout property used in this renderer.
 *
 * This is a subset of the full WordParagraphLayoutOutput type from @superdoc/word-layout.
 * We extract only the fields needed for rendering to avoid a direct dependency on the
 * word-layout package from the renderer. This allows the renderer to work with any object
 * that provides these properties, maintaining loose coupling between packages.
 *
 * The wordLayout property is attached to ParagraphBlock.attrs during block processing
 * and contains layout metadata needed for proper list marker and indent rendering.
 *
 * @property marker - Optional list marker layout containing text, styling, and positioning info
 * @property indentLeftPx - Left indent in pixels (used for marker positioning calculations)
 * @property firstLineIndentMode - When true, indicates the paragraph uses firstLine indent
 *   pattern (marker at left+firstLine) instead of standard hanging indent (marker at left-hanging).
 *   This flag changes how markers are positioned and how tab spacing is calculated.
 * @property textStartPx - X position where paragraph text should begin (used for tab width calculation)
 * @property tabsPx - Array of explicit tab stop positions in pixels
 */
type MinimalWordLayout = {
  marker?: WordLayoutMarker;
  indentLeftPx?: number;
  /** True for firstLine indent pattern (marker at left+firstLine vs left-hanging). */
  firstLineIndentMode?: boolean;
  /** X position where paragraph text should begin. */
  textStartPx?: number;
  /** Array of explicit tab stop positions in pixels. */
  tabsPx?: number[];
};

type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

type LineEnds = {
  head?: LineEnd;
  tail?: LineEnd;
};

type EffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type VectorShapeDrawingWithEffects = VectorShapeDrawing & {
  lineEnds?: LineEnds;
  effectExtent?: EffectExtent;
};

/**
 * Type guard to check if a value is a valid MinimalWordLayout object.
 *
 * This guard validates that the object has the expected structure for MinimalWordLayout
 * without unsafe type assertions. It checks for the presence of valid properties and
 * ensures type safety when accessing wordLayout from block attributes.
 *
 * @param value - The value to check (typically from block.attrs?.wordLayout)
 * @returns True if the value is a valid MinimalWordLayout object, false otherwise
 *
 * @example
 * ```typescript
 * const wordLayout = block.attrs?.wordLayout;
 * if (isMinimalWordLayout(wordLayout)) {
 *   // TypeScript now knows wordLayout is MinimalWordLayout
 *   const marker = wordLayout.marker;
 *   const isFirstLineMode = wordLayout.firstLineIndentMode === true;
 * }
 * ```
 */
function isMinimalWordLayout(value: unknown): value is MinimalWordLayout {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check marker property if present
  if (obj.marker !== undefined) {
    if (typeof obj.marker !== 'object' || obj.marker === null) {
      return false;
    }
    const marker = obj.marker as Record<string, unknown>;

    // Validate marker.markerText if present (must be a string)
    if (marker.markerText !== undefined && typeof marker.markerText !== 'string') {
      return false;
    }

    // Validate marker.markerX if present
    if (marker.markerX !== undefined && typeof marker.markerX !== 'number') {
      return false;
    }

    // Validate marker.textStartX if present
    if (marker.textStartX !== undefined && typeof marker.textStartX !== 'number') {
      return false;
    }
  }

  // Check indentLeftPx property if present
  if (obj.indentLeftPx !== undefined) {
    if (typeof obj.indentLeftPx !== 'number') {
      return false;
    }
  }

  // Check firstLineIndentMode property if present
  if (obj.firstLineIndentMode !== undefined) {
    if (typeof obj.firstLineIndentMode !== 'boolean') {
      return false;
    }
  }

  // Check textStartPx property if present
  if (obj.textStartPx !== undefined) {
    if (typeof obj.textStartPx !== 'number') {
      return false;
    }
  }

  // Check tabsPx property if present and validate all array elements are numbers
  if (obj.tabsPx !== undefined) {
    if (!Array.isArray(obj.tabsPx)) {
      return false;
    }
    // Validate that all elements are numbers
    for (const tab of obj.tabsPx) {
      if (typeof tab !== 'number') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Layout mode for document rendering.
 * @typedef {('vertical'|'horizontal'|'book')} LayoutMode
 * - 'vertical': Standard page-by-page vertical layout (default)
 * - 'horizontal': Pages arranged horizontally side-by-side
 * - 'book': Book-style layout with facing pages
 */
export type LayoutMode = 'vertical' | 'horizontal' | 'book';

type PageDecorationPayload = {
  fragments: Fragment[];
  height: number;
  /** Optional measured content height to aid bottom alignment in footers. */
  contentHeight?: number;
  offset?: number;
  marginLeft?: number;
  // Optional explicit content width (px) for the decoration container
  contentWidth?: number;
  headerId?: string;
  sectionType?: string;
  box?: { x: number; y: number; width: number; height: number };
  hitRegion?: { x: number; y: number; width: number; height: number };
};

/**
 * Provider function for page decorations (headers and footers).
 * Called for each page to generate header or footer content.
 *
 * @param {number} pageNumber - The page number (1-indexed)
 * @param {PageMargins} [pageMargins] - Page margin configuration
 * @param {Page} [page] - Full page object from the layout
 * @returns {PageDecorationPayload | null} Decoration payload containing fragments and layout info, or null if no decoration
 */
export type PageDecorationProvider = (
  pageNumber: number,
  pageMargins?: PageMargins,
  page?: Page,
) => PageDecorationPayload | null;

/**
 * Ruler configuration options for per-page rulers.
 */
export type RulerOptions = {
  /** Whether to show rulers on pages (default: false) */
  enabled?: boolean;
  /** Whether rulers are interactive with drag handles (default: false for per-page) */
  interactive?: boolean;
  /** Callback when margin handle drag ends (only used if interactive) */
  onMarginChange?: (side: 'left' | 'right', marginInches: number) => void;
};

type PainterOptions = {
  pageStyles?: PageStyles;
  layoutMode?: LayoutMode;
  /** Gap between pages in pixels (default: 24px for vertical, 20px for horizontal) */
  pageGap?: number;
  headerProvider?: PageDecorationProvider;
  footerProvider?: PageDecorationProvider;
  virtualization?: {
    enabled?: boolean;
    window?: number;
    overscan?: number;
    /** Virtualization gap override (defaults to 72px; independent of pageGap) */
    gap?: number;
    paddingTop?: number;
  };
  /** Per-page ruler options */
  ruler?: RulerOptions;
};

type BlockLookupEntry = {
  block: FlowBlock;
  measure: Measure;
  version: string;
};

/**
 * Map of block IDs to their corresponding block data and measurements.
 * Used by the renderer to efficiently look up block information during fragment rendering.
 * Each entry contains the block definition, its layout measurements, and a version string for cache invalidation.
 *
 * @typedef {Map<string, BlockLookupEntry>} BlockLookup
 */
export type BlockLookup = Map<string, BlockLookupEntry>;

type FragmentDomState = {
  key: string;
  signature: string;
  fragment: Fragment;
  element: HTMLElement;
  context: FragmentRenderContext;
};

type PageDomState = {
  element: HTMLElement;
  fragments: FragmentDomState[];
};

/**
 * Rendering context passed to fragment renderers containing page metadata.
 * Provides information about the current page position and section for dynamic content like page numbers.
 *
 * @typedef {Object} FragmentRenderContext
 * @property {number} pageNumber - Current page number (1-indexed)
 * @property {number} totalPages - Total number of pages in the document
 * @property {'body'|'header'|'footer'} section - Document section being rendered
 * @property {string} [pageNumberText] - Optional formatted page number text (e.g., "Page 1 of 10")
 */
export type FragmentRenderContext = {
  pageNumber: number;
  totalPages: number;
  section: 'body' | 'header' | 'footer';
  pageNumberText?: string;
};

const LIST_MARKER_GAP = 8;
/**
 * Default tab interval in pixels (0.5 inch at 96 DPI).
 * Used when calculating tab stops for list markers that extend past the implicit tab stop.
 * This matches Microsoft Word's default tab interval behavior.
 */
const DEFAULT_TAB_INTERVAL_PX = 48;
/**
 * Default page height in pixels (11 inches at 96 DPI).
 * Used as a fallback when page size information is not available for ruler rendering.
 */
const DEFAULT_PAGE_HEIGHT_PX = 1056;
/** Default gap used when virtualization is enabled (kept in sync with PresentationEditor layout defaults). */
const DEFAULT_VIRTUALIZED_PAGE_GAP = 72;
const COMMENT_EXTERNAL_COLOR = '#B1124B';
const COMMENT_INTERNAL_COLOR = '#078383';
const COMMENT_INACTIVE_ALPHA = '40'; // ~25% for inactive
const COMMENT_ACTIVE_ALPHA = '66'; // ~40% for active/selected

type LinkRenderData = {
  href?: string;
  target?: string;
  rel?: string;
  tooltip?: string | null;
  dataset?: Record<string, string>;
  blocked: boolean;
};

const LINK_DATASET_KEYS = {
  blocked: 'linkBlocked',
  docLocation: 'linkDocLocation',
  history: 'linkHistory',
  rId: 'linkRid',
  truncated: 'linkTooltipTruncated',
} as const;

const MAX_HREF_LENGTH = 2048;

const SAFE_ANCHOR_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Maximum allowed length for data URLs (10MB).
 * Prevents denial of service attacks from extremely large embedded images.
 */
const MAX_DATA_URL_LENGTH = 10 * 1024 * 1024; // 10MB

/**
 * Regular expression to validate data URL format for images.
 * Only allows common, safe image MIME types with base64 encoding.
 * Prevents XSS and malformed data URL attacks.
 */
const VALID_IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp|bmp|ico|tiff?);base64,/i;

/**
 * Maximum resize multiplier for image metadata.
 * Images can be resized up to 3x their original dimensions.
 */
const MAX_RESIZE_MULTIPLIER = 3;

/**
 * Fallback maximum dimension for image resizing when original size is small.
 * Ensures images can be resized to at least 1000px even if original is smaller.
 */
const FALLBACK_MAX_DIMENSION = 1000;

/**
 * Minimum image dimension in pixels.
 * Ensures images remain visible and interactive during resizing.
 */
const MIN_IMAGE_DIMENSION = 20;

/**
 * Pattern to detect ambiguous link text that doesn't convey destination (WCAG 2.4.4).
 * Matches common generic phrases like "click here", "read more", etc.
 */
const AMBIGUOUS_LINK_PATTERNS = /^(click here|read more|more|link|here|this|download|view)$/i;

/**
 * Hyperlink rendering metrics for observability.
 * Tracks sanitization, blocking, and security-related events.
 */
const linkMetrics = {
  sanitized: 0,
  blocked: 0,
  invalidProtocol: 0,
  homographWarnings: 0,

  reset() {
    this.sanitized = 0;
    this.blocked = 0;
    this.invalidProtocol = 0;
    this.homographWarnings = 0;
  },

  getMetrics() {
    return {
      'hyperlink.sanitized.count': this.sanitized,
      'hyperlink.blocked.count': this.blocked,
      'hyperlink.invalid_protocol.count': this.invalidProtocol,
      'hyperlink.homograph_warnings.count': this.homographWarnings,
    };
  },
};

// Export for testing/monitoring
export { linkMetrics };

const TRACK_CHANGE_BASE_CLASS: Record<TrackedChangeKind, string> = {
  insert: 'track-insert-dec',
  delete: 'track-delete-dec',
  format: 'track-format-dec',
};

const TRACK_CHANGE_MODIFIER_CLASS: Record<TrackedChangeKind, Record<TrackedChangesMode, string | undefined>> = {
  insert: {
    review: 'highlighted',
    original: 'hidden',
    final: 'normal',
    off: undefined,
  },
  delete: {
    review: 'highlighted',
    original: 'normal',
    final: 'hidden',
    off: undefined,
  },
  format: {
    review: 'highlighted',
    original: 'before',
    final: 'normal',
    off: undefined,
  },
};

type TrackedChangesRenderConfig = {
  mode: TrackedChangesMode;
  enabled: boolean;
};

/**
 * Sanitize a URL to prevent XSS attacks.
 * Only allows http, https, mailto, tel, and internal anchors.
 *
 * @param href - The URL to sanitize
 * @returns Sanitized URL or null if blocked
 */
export function sanitizeUrl(href: string): string | null {
  if (typeof href !== 'string') return null;
  const sanitized = sanitizeHref(href);
  return sanitized?.href ?? null;
}

const LINK_TARGET_SET = new Set(['_blank', '_self', '_parent', '_top']);

/**
 * Normalize and validate an anchor fragment identifier for use in hyperlinks.
 * Strips leading '#' if present and validates against safe character pattern.
 *
 * @param value - Raw anchor string (with or without leading '#')
 * @returns Normalized anchor with leading '#' (e.g., '#section-1'), or null if invalid
 *
 * @remarks
 * SECURITY: Only allows safe characters (A-Z, a-z, 0-9, ., _, -) to prevent HTML attribute injection.
 * Rejects characters like quotes, angle brackets, colons, and spaces that could break HTML structure
 * or enable XSS attacks when used in href attributes.
 *
 * @example
 * normalizeAnchor('section-1') // Returns: '#section-1'
 * normalizeAnchor('#bookmark') // Returns: '#bookmark'
 * normalizeAnchor('unsafe<script>') // Returns: null
 * normalizeAnchor('  whitespace  ') // Returns: null
 */
const normalizeAnchor = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Remove leading # if present, then validate
  const anchor = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  // SECURITY: Only allow safe characters to prevent attribute injection
  // Rejects characters like quotes, angle brackets, spaces that could break HTML
  if (!SAFE_ANCHOR_PATTERN.test(anchor)) {
    return null;
  }

  return `#${anchor}`;
};

/**
 * Check if a fragment string contains only safe anchor characters.
 * Safe characters are alphanumeric, dots, underscores, and hyphens.
 *
 * @param {string} fragment - Fragment to validate
 * @returns {boolean} True if fragment matches safe pattern
 * @private
 */
const isValidSafeFragment = (fragment: string): boolean => {
  return SAFE_ANCHOR_PATTERN.test(fragment);
};

/**
 * URL-encode a fragment string for use in a URL hash.
 * Returns null if encoding fails (rare edge case).
 *
 * @param {string} fragment - Fragment to encode
 * @returns {string | null} Encoded fragment or null if encoding fails
 * @private
 */
const encodeFragment = (fragment: string): string | null => {
  try {
    return encodeURIComponent(fragment);
  } catch {
    return null;
  }
};

/**
 * Append a document location fragment to an href.
 * CRITICAL FIX: URL-encode unsafe characters instead of destroying the entire href.
 *
 * @param href - Base URL or null
 * @param docLocation - Fragment identifier to append
 * @returns Combined URL with fragment, or original href if fragment is invalid
 */
const appendDocLocation = (href: string | null, docLocation?: string | null): string | null => {
  if (!docLocation?.trim()) return href;

  const fragment = docLocation.trim();
  if (href?.includes('#')) return href;

  const encoded = isValidSafeFragment(fragment) ? fragment : encodeFragment(fragment);

  if (!encoded) return href;
  return href ? `${href}#${encoded}` : `#${encoded}`;
};

/**
 * Build HTML data-* attributes object from hyperlink metadata for version 2 links.
 * Extracts relationship ID, document location fragment, and history preferences from link object.
 *
 * @param link - Flow run link object containing hyperlink metadata
 * @returns Record of data attribute keys and string values to be applied to anchor element
 *
 * @remarks
 * Only processes version 2 links (Office Open XML format). Version 1 links return empty object.
 * All dataset values are converted to strings for DOM compatibility.
 *
 * @example
 * buildLinkDataset({
 *   version: 2,
 *   rId: 'rId5',
 *   docLocation: 'bookmark1',
 *   history: true
 * })
 * // Returns: { rId: 'rId5', docLocation: 'bookmark1', history: 'true' }
 */
const buildLinkDataset = (link: FlowRunLink): Record<string, string> => {
  const dataset: Record<string, string> = {};
  if (link.version === 2) {
    if (link.rId) dataset[LINK_DATASET_KEYS.rId] = link.rId;
    if (link.docLocation) dataset[LINK_DATASET_KEYS.docLocation] = link.docLocation;
    if (typeof link.history === 'boolean') dataset[LINK_DATASET_KEYS.history] = String(link.history);
  }
  return dataset;
};

/**
 * Resolve the appropriate target attribute for a hyperlink anchor element.
 * Validates user-specified targets and auto-sets '_blank' for external HTTP(S) links.
 *
 * @param link - Flow run link object potentially containing target preference
 * @param sanitized - Sanitized URL metadata containing protocol information, or null if sanitization failed
 * @returns Valid target string ('_blank', '_self', '_parent', '_top') or undefined if not applicable
 *
 * @remarks
 * Target resolution follows this priority:
 * 1. If link.target is specified and valid (in LINK_TARGET_SET), use it
 * 2. If URL is external (http/https protocol), default to '_blank' for security
 * 3. Otherwise, return undefined (browser default behavior)
 *
 * @example
 * resolveLinkTarget(
 *   { target: '_self' },
 *   { protocol: 'https', href: 'https://example.com', isExternal: true }
 * ) // Returns: '_self' (user preference honored)
 *
 * resolveLinkTarget(
 *   {},
 *   { protocol: 'https', href: 'https://example.com', isExternal: true }
 * ) // Returns: '_blank' (external link default)
 */
const resolveLinkTarget = (
  link: FlowRunLink,
  sanitized?: ReturnType<typeof sanitizeHref> | null,
): string | undefined => {
  if (link.target && LINK_TARGET_SET.has(link.target)) {
    return link.target;
  }
  if (sanitized && (sanitized.protocol === 'http' || sanitized.protocol === 'https')) {
    return '_blank';
  }
  return undefined;
};

/**
 * Resolve the rel attribute value for a hyperlink, combining user-specified relationships
 * with security-critical values for external links.
 *
 * @param link - Flow run link object potentially containing rel preference (space-separated string)
 * @param target - Resolved target attribute value (e.g., '_blank', '_self')
 * @returns Space-separated rel values, or undefined if no rel values apply
 *
 * @remarks
 * SECURITY: Automatically adds 'noopener noreferrer' for target='_blank' links to prevent:
 * - Tabnabbing attacks (window.opener access)
 * - Referrer leakage to external sites
 *
 * User-specified rel values are parsed from link.rel (whitespace-separated string),
 * deduplicated, and merged with security values.
 *
 * @example
 * resolveLinkRel(
 *   { rel: 'nofollow external' },
 *   '_blank'
 * ) // Returns: 'nofollow external noopener noreferrer'
 *
 * resolveLinkRel(
 *   { rel: 'nofollow  noopener  ' },
 *   '_blank'
 * ) // Returns: 'nofollow noopener noreferrer' (deduplicated)
 *
 * resolveLinkRel({}, '_self') // Returns: undefined
 */
const resolveLinkRel = (link: FlowRunLink, target?: string): string | undefined => {
  const relValues = new Set<string>();
  if (typeof link.rel === 'string' && link.rel.trim()) {
    link.rel
      .trim()
      .split(/\s+/)
      .forEach((value) => {
        if (value) relValues.add(value);
      });
  }
  if (target === '_blank') {
    relValues.add('noopener');
    relValues.add('noreferrer');
  }
  if (relValues.size === 0) {
    return undefined;
  }
  return Array.from(relValues).join(' ');
};

/**
 * Apply data-* attributes to an HTML element from a dataset object.
 * Safely assigns dataset properties while filtering out null/undefined values.
 *
 * @param element - Target HTML element to receive data attributes
 * @param dataset - Object mapping data attribute keys to string values
 *
 * @remarks
 * Uses the element.dataset API which automatically prefixes keys with 'data-'.
 * Only assigns non-null, non-undefined values to prevent empty attributes.
 *
 * @example
 * const anchor = document.createElement('a');
 * applyLinkDataset(anchor, {
 *   rId: 'rId5',
 *   docLocation: 'bookmark1',
 *   history: 'true'
 * });
 * // Resulting HTML: <a data-r-id="rId5" data-doc-location="bookmark1" data-history="true"></a>
 */
const applyLinkDataset = (element: HTMLElement, dataset?: Record<string, string>): void => {
  if (!dataset) return;
  Object.entries(dataset).forEach(([key, value]) => {
    if (value != null) {
      element.dataset[key] = value;
    }
  });
};

/**
 * DOM-based document painter that renders layout fragments to HTML elements.
 * Manages page rendering, virtualization, headers/footers, and incremental updates.
 *
 * @class DomPainter
 *
 * @remarks
 * The DomPainter is responsible for:
 * - Rendering layout fragments (paragraphs, lists, images, tables, drawings) to DOM elements
 * - Managing page-level DOM structure and styling
 * - Providing virtualization for large documents (vertical mode only)
 * - Handling headers and footers via PageDecorationProvider
 * - Incremental re-rendering when only specific blocks change
 * - Hyperlink rendering with security sanitization and accessibility
 *
 * @example
 * ```typescript
 * const painter = new DomPainter(blocks, measures, {
 *   layoutMode: 'vertical',
 *   pageStyles: { width: '8.5in', height: '11in' }
 * });
 * painter.mount(document.getElementById('editor-container'));
 * painter.render(layout);
 * ```
 */
export class DomPainter {
  private blockLookup: BlockLookup;
  private readonly options: PainterOptions;
  private mount: HTMLElement | null = null;
  private doc: Document | null = null;
  private pageStates: PageDomState[] = [];
  private currentLayout: Layout | null = null;
  private changedBlocks = new Set<string>();
  private readonly layoutMode: LayoutMode;
  private headerProvider?: PageDecorationProvider;
  private footerProvider?: PageDecorationProvider;
  private totalPages = 0;
  private linkIdCounter = 0; // Counter for generating unique link IDs

  /**
   * WeakMap storing tooltip data for hyperlink elements before DOM insertion.
   * Uses WeakMap to prevent memory leaks - entries are automatically garbage collected
   * when the corresponding element is removed from memory.
   * @private
   */
  private pendingTooltips = new WeakMap<HTMLElement, string>();
  // Page gap for normal (non-virtualized) rendering
  private pageGap = 24; // px, default for vertical mode
  // Virtualization state (vertical mode only)
  private virtualEnabled = false;
  private virtualWindow = 5;
  private virtualOverscan = 0;
  private virtualGap = DEFAULT_VIRTUALIZED_PAGE_GAP; // px, default for virtualized mode
  private virtualPaddingTop: number | null = null; // px; computed from mount if not provided
  private topSpacerEl: HTMLElement | null = null;
  private bottomSpacerEl: HTMLElement | null = null;
  private virtualPagesEl: HTMLElement | null = null;
  private virtualGapSpacers: HTMLElement[] = [];
  private virtualPinnedPages: number[] = [];
  private virtualMountedKey = '';
  private pageIndexToState: Map<number, PageDomState> = new Map();
  private virtualHeights: number[] = [];
  private virtualOffsets: number[] = [];
  private virtualStart = 0;
  private virtualEnd = -1;
  private layoutVersion = 0;
  private layoutEpoch = 0;
  private processedLayoutVersion = -1;
  /** Current transaction mapping for position updates (null if no mapping or complex transaction) */
  private currentMapping: PositionMapping | null = null;
  private onScrollHandler: ((e: Event) => void) | null = null;
  private onWindowScrollHandler: ((e: Event) => void) | null = null;
  private onResizeHandler: ((e: Event) => void) | null = null;
  /** The currently active/selected comment ID for highlighting */
  private activeCommentId: string | null = null;

  constructor(blocks: FlowBlock[], measures: Measure[], options: PainterOptions = {}) {
    this.options = options;
    this.layoutMode = options.layoutMode ?? 'vertical';
    this.blockLookup = this.buildBlockLookup(blocks, measures);
    this.headerProvider = options.headerProvider;
    this.footerProvider = options.footerProvider;

    // Initialize page gap (defaults: 24px vertical, 20px horizontal)
    const defaultGap = this.layoutMode === 'horizontal' ? 20 : 24;
    this.pageGap =
      typeof options.pageGap === 'number' && Number.isFinite(options.pageGap)
        ? Math.max(0, options.pageGap)
        : defaultGap;

    // Initialize virtualization config (feature-flagged)
    if (this.layoutMode === 'vertical' && options.virtualization?.enabled) {
      this.virtualEnabled = true;
      this.virtualWindow = Math.max(1, options.virtualization.window ?? 5);
      this.virtualOverscan = Math.max(0, options.virtualization.overscan ?? 0);
      // Virtualization gap: use explicit virtualization.gap if provided, otherwise default to virtualized gap (72px)
      const maybeGap = options.virtualization.gap;
      if (typeof maybeGap === 'number' && Number.isFinite(maybeGap)) {
        this.virtualGap = Math.max(0, maybeGap);
      } else {
        this.virtualGap = DEFAULT_VIRTUALIZED_PAGE_GAP;
      }
      if (typeof options.virtualization.paddingTop === 'number' && Number.isFinite(options.virtualization.paddingTop)) {
        this.virtualPaddingTop = Math.max(0, options.virtualization.paddingTop);
      }
    }
  }

  public setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider): void {
    this.headerProvider = header;
    this.footerProvider = footer;
  }

  /**
   * Pins specific page indices so they remain mounted when virtualization is enabled.
   *
   * Used by selection/drag logic to ensure endpoints can be resolved via DOM
   * even when they fall outside the current scroll window.
   */
  public setVirtualizationPins(pageIndices: number[] | null | undefined): void {
    const next = Array.from(new Set((pageIndices ?? []).filter((n) => Number.isInteger(n)))).sort((a, b) => a - b);
    this.virtualPinnedPages = next;
    if (this.virtualEnabled && this.mount) {
      this.updateVirtualWindow();
    }
  }

  /**
   * Sets the active comment ID for highlighting.
   * When set, only the active comment's range is highlighted.
   * When null, all comments show depth-based highlighting.
   */
  public setActiveComment(commentId: string | null): void {
    if (this.activeCommentId !== commentId) {
      this.activeCommentId = commentId;
      // Force re-render of all pages by incrementing layout version
      // This bypasses the virtualization cache check
      this.layoutVersion += 1;
      // Clear page states to force full re-render (activeCommentId affects run rendering)
      // For virtualized mode: remove existing page elements before clearing state
      // to prevent duplicate pages in the DOM
      for (const state of this.pageIndexToState.values()) {
        state.element.remove();
      }
      this.pageIndexToState.clear();
      this.virtualMountedKey = '';
      // For non-virtualized mode:
      this.pageStates = [];
    }
  }

  /**
   * Gets the currently active comment ID.
   */
  public getActiveComment(): string | null {
    return this.activeCommentId;
  }

  /**
   * Updates the painter's block and measure data.
   *
   * @param blocks - Main document blocks
   * @param measures - Measures corresponding to main document blocks
   * @param headerBlocks - Optional header blocks from header/footer layout results
   * @param headerMeasures - Optional measures corresponding to header blocks
   * @param footerBlocks - Optional footer blocks from header/footer layout results
   * @param footerMeasures - Optional measures corresponding to footer blocks
   */
  public setData(
    blocks: FlowBlock[],
    measures: Measure[],
    headerBlocks?: FlowBlock[],
    headerMeasures?: Measure[],
    footerBlocks?: FlowBlock[],
    footerMeasures?: Measure[],
  ): void {
    // Validate main blocks and measures arrays
    if (blocks.length !== measures.length) {
      throw new Error(
        `setData: blocks and measures arrays must have the same length. ` +
          `Got blocks.length=${blocks.length}, measures.length=${measures.length}`,
      );
    }

    // Validate header blocks and measures
    const hasHeaderBlocks = headerBlocks !== undefined;
    const hasHeaderMeasures = headerMeasures !== undefined;
    if (hasHeaderBlocks !== hasHeaderMeasures) {
      throw new Error(
        `setData: headerBlocks and headerMeasures must both be provided or both be omitted. ` +
          `Got headerBlocks=${hasHeaderBlocks ? 'provided' : 'omitted'}, ` +
          `headerMeasures=${hasHeaderMeasures ? 'provided' : 'omitted'}`,
      );
    }
    if (hasHeaderBlocks && hasHeaderMeasures && headerBlocks!.length !== headerMeasures!.length) {
      throw new Error(
        `setData: headerBlocks and headerMeasures arrays must have the same length. ` +
          `Got headerBlocks.length=${headerBlocks!.length}, headerMeasures.length=${headerMeasures!.length}`,
      );
    }

    // Validate footer blocks and measures
    const hasFooterBlocks = footerBlocks !== undefined;
    const hasFooterMeasures = footerMeasures !== undefined;
    if (hasFooterBlocks !== hasFooterMeasures) {
      throw new Error(
        `setData: footerBlocks and footerMeasures must both be provided or both be omitted. ` +
          `Got footerBlocks=${hasFooterBlocks ? 'provided' : 'omitted'}, ` +
          `footerMeasures=${hasFooterMeasures ? 'provided' : 'omitted'}`,
      );
    }
    if (hasFooterBlocks && hasFooterMeasures && footerBlocks!.length !== footerMeasures!.length) {
      throw new Error(
        `setData: footerBlocks and footerMeasures arrays must have the same length. ` +
          `Got footerBlocks.length=${footerBlocks!.length}, footerMeasures.length=${footerMeasures!.length}`,
      );
    }

    // Build lookup for main document blocks
    const nextLookup = this.buildBlockLookup(blocks, measures);

    // Merge header blocks into the lookup if provided
    if (headerBlocks && headerMeasures) {
      const headerLookup = this.buildBlockLookup(headerBlocks, headerMeasures);
      headerLookup.forEach((entry, id) => {
        nextLookup.set(id, entry);
      });
    }

    // Merge footer blocks into the lookup if provided
    if (footerBlocks && footerMeasures) {
      const footerLookup = this.buildBlockLookup(footerBlocks, footerMeasures);
      footerLookup.forEach((entry, id) => {
        nextLookup.set(id, entry);
      });
    }

    // Track changed blocks
    const changed = new Set<string>();
    nextLookup.forEach((entry, id) => {
      const previous = this.blockLookup.get(id);
      if (!previous || previous.version !== entry.version) {
        changed.add(id);
      }
    });
    this.blockLookup = nextLookup;
    this.changedBlocks = changed;
  }

  public paint(layout: Layout, mount: HTMLElement, mapping?: PositionMapping): void {
    if (!(mount instanceof HTMLElement)) {
      throw new Error('DomPainter.paint requires a valid HTMLElement mount');
    }

    const doc = mount.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DomPainter.paint requires a DOM-like document');
    }
    this.doc = doc;

    // Simple transaction gate: only use position mapping optimization for single-step transactions.
    // Complex transactions (paste, multi-step replace, etc.) fall back to full rebuild.
    const isSimpleTransaction = mapping && mapping.maps.length === 1;
    if (mapping && !isSimpleTransaction) {
      // Complex transaction - force all fragments to rebuild (safe fallback)
      this.blockLookup.forEach((_, id) => this.changedBlocks.add(id));
      this.currentMapping = null;
    } else {
      this.currentMapping = mapping ?? null;
    }

    ensurePrintStyles(doc);
    ensureLinkStyles(doc);
    ensureTrackChangeStyles(doc);
    ensureFieldAnnotationStyles(doc);
    ensureSdtContainerStyles(doc);
    ensureImageSelectionStyles(doc);
    ensureNativeSelectionStyles(doc);
    if (this.options.ruler?.enabled) {
      ensureRulerStyles(doc);
    }
    mount.classList.add(CLASS_NAMES.container);

    if (this.mount && this.mount !== mount) {
      this.resetState();
    }
    this.layoutVersion += 1;
    this.layoutEpoch = layout.layoutEpoch ?? 0;
    this.mount = mount;

    this.totalPages = layout.pages.length;
    const mode = this.layoutMode;
    if (mode === 'horizontal') {
      applyStyles(mount, containerStylesHorizontal);
      // Use configured page gap for horizontal rendering
      mount.style.gap = `${this.pageGap}px`;
      this.renderHorizontal(layout, mount);
      this.currentLayout = layout;
      this.pageStates = [];
      this.changedBlocks.clear();
      this.currentMapping = null;
      return;
    }
    if (mode === 'book') {
      applyStyles(mount, containerStyles);
      this.renderBookMode(layout, mount);
      this.currentLayout = layout;
      this.pageStates = [];
      this.changedBlocks.clear();
      this.currentMapping = null;
      return;
    }

    // Vertical mode
    applyStyles(mount, containerStyles);

    if (this.virtualEnabled) {
      // Keep container gap at 0 so spacers don't introduce extra offsets.
      mount.style.gap = '0px';
      this.renderVirtualized(layout, mount);
      this.currentLayout = layout;
      this.changedBlocks.clear();
      this.currentMapping = null;
      return;
    }

    // Use configured page gap for normal vertical rendering
    mount.style.gap = `${this.pageGap}px`;
    if (!this.currentLayout || this.pageStates.length === 0) {
      this.fullRender(layout);
    } else {
      this.patchLayout(layout);
    }

    this.currentLayout = layout;
    this.changedBlocks.clear();
    this.currentMapping = null;
  }

  // ----------------
  // Virtualized path
  // ----------------
  private renderVirtualized(layout: Layout, mount: HTMLElement): void {
    if (!this.doc) return;
    // Always keep the latest layout reference for handlers
    this.currentLayout = layout;

    // First-time init, mount changed, or spacers were detached (e.g., by innerHTML='' on zero-page layout)
    const needsInit =
      !this.topSpacerEl ||
      !this.bottomSpacerEl ||
      !this.virtualPagesEl ||
      this.mount !== mount ||
      this.topSpacerEl.parentElement !== mount;
    if (needsInit) {
      this.ensureVirtualizationSetup(mount);
    }

    this.computeVirtualMetrics();
    this.updateVirtualWindow();
  }

  private ensureVirtualizationSetup(mount: HTMLElement): void {
    if (!this.doc) return;

    // Reset any prior non-virtual state
    mount.innerHTML = '';
    this.pageStates = [];
    this.pageIndexToState.clear();
    this.virtualGapSpacers = [];
    this.virtualMountedKey = '';

    // Create and configure spacer elements
    this.topSpacerEl = this.doc.createElement('div');
    this.bottomSpacerEl = this.doc.createElement('div');
    this.configureSpacerElement(this.topSpacerEl, 'top');
    this.configureSpacerElement(this.bottomSpacerEl, 'bottom');

    // Create and configure pages container (handles the inter-page gap)
    // Use pageGap for visual consistency with non-virtualized mode.
    this.virtualPagesEl = this.doc.createElement('div');
    this.virtualPagesEl.style.display = 'flex';
    this.virtualPagesEl.style.flexDirection = 'column';
    this.virtualPagesEl.style.alignItems = 'center';
    this.virtualPagesEl.style.width = '100%';
    this.virtualPagesEl.style.gap = `${this.pageGap}px`;

    mount.appendChild(this.topSpacerEl);
    mount.appendChild(this.virtualPagesEl);
    mount.appendChild(this.bottomSpacerEl);

    // Bind scroll and resize handlers
    this.bindVirtualizationHandlers(mount);
  }

  private configureSpacerElement(element: HTMLElement, type: 'top' | 'bottom' | 'gap'): void {
    element.style.width = '1px';
    element.style.height = '0px';
    element.style.flex = '0 0 auto';
    element.setAttribute('data-virtual-spacer', type);
  }

  private bindVirtualizationHandlers(mount: HTMLElement): void {
    // Bind scroll handler for container
    if (this.onScrollHandler) {
      mount.removeEventListener('scroll', this.onScrollHandler);
    }
    this.onScrollHandler = () => {
      this.updateVirtualWindow();
    };
    mount.addEventListener('scroll', this.onScrollHandler);

    // Bind window scroll/resize for cases where the page scrolls the window
    const win = this.doc?.defaultView;
    if (win) {
      if (this.onWindowScrollHandler) {
        win.removeEventListener('scroll', this.onWindowScrollHandler);
      }
      this.onWindowScrollHandler = () => {
        this.updateVirtualWindow();
      };
      // passive to avoid blocking scrolling
      win.addEventListener('scroll', this.onWindowScrollHandler, { passive: true });

      if (this.onResizeHandler) {
        win.removeEventListener('resize', this.onResizeHandler);
      }
      this.onResizeHandler = () => {
        this.updateVirtualWindow();
      };
      win.addEventListener('resize', this.onResizeHandler);
    }
  }

  private computeVirtualMetrics(): void {
    if (!this.currentLayout) return;
    const N = this.currentLayout.pages.length;
    if (N !== this.virtualHeights.length) {
      this.virtualHeights = this.currentLayout.pages.map((p) => p.size?.h ?? this.currentLayout!.pageSize.h);
    }
    // Build offsets where offsets[i] = sum_{k < i} (height[k] + gap)
    // Use pageGap for consistency with CSS gap on virtualPagesEl
    const offsets: number[] = new Array(this.virtualHeights.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < this.virtualHeights.length; i += 1) {
      offsets[i + 1] = offsets[i] + this.virtualHeights[i] + this.pageGap;
    }
    this.virtualOffsets = offsets;
  }

  private topOfIndex(i: number): number {
    // Offset to the top of page i (0 for first). Includes gaps before page i.
    if (i <= 0) return 0;
    return this.virtualOffsets[i];
  }

  private contentTotalHeight(): number {
    // Total content height without trailing gap after last page
    const n = this.virtualHeights.length;
    if (n <= 0) return 0;
    return this.virtualOffsets[n] - this.pageGap;
  }

  private getMountPaddingTopPx(): number {
    if (this.virtualPaddingTop != null) return this.virtualPaddingTop;
    if (!this.mount || !this.doc) return 0;
    const win = this.doc.defaultView;
    if (!win) return 0;
    const style = win.getComputedStyle(this.mount);
    const pt = style?.paddingTop ?? '0';
    const val = Number.parseFloat(pt.replace('px', ''));
    if (Number.isFinite(val)) return Math.max(0, val);
    return 0;
  }

  /**
   * Public method to trigger virtualization window update on scroll.
   * Call this from external scroll handlers when the scroll container
   * is different from the painter's mount element.
   */
  public onScroll(): void {
    if (this.virtualEnabled) {
      this.updateVirtualWindow();
    }
  }

  private updateVirtualWindow(): void {
    if (!this.mount || !this.topSpacerEl || !this.bottomSpacerEl || !this.virtualPagesEl || !this.currentLayout) return;
    const layout = this.currentLayout;
    const N = layout.pages.length;
    if (N === 0) {
      this.mount.innerHTML = '';
      this.processedLayoutVersion = this.layoutVersion;
      return;
    }

    // Map scrollTop -> anchor page index via prefix sums
    const paddingTop = this.getMountPaddingTopPx();
    let scrollY: number;
    const isContainerScrollable = this.mount.scrollHeight > this.mount.clientHeight + 1;
    if (isContainerScrollable) {
      scrollY = Math.max(0, this.mount.scrollTop - paddingTop);
    } else {
      const rect = this.mount.getBoundingClientRect();
      // Translate viewport scroll to content-space scroll offset
      scrollY = Math.max(0, -rect.top - paddingTop);
    }

    // Binary search for anchor index such that topOfIndex(i) <= scrollY < topOfIndex(i+1)
    let lo = 0;
    let hi = N; // exclusive
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.topOfIndex(mid) <= scrollY) lo = mid + 1;
      else hi = mid;
    }
    const anchor = Math.max(0, lo - 1);

    // Compute window centered around anchor (approximately), with overscan
    const baseWindow = this.virtualWindow;
    const overscan = this.virtualOverscan;
    let start = anchor - Math.floor(baseWindow / 2) - overscan;
    start = Math.max(0, Math.min(start, Math.max(0, N - baseWindow)));
    const end = Math.min(N - 1, start + baseWindow - 1 + overscan * 2);
    // Adjust start if we overshot end due to trailing clamp
    start = Math.max(0, Math.min(start, end - baseWindow + 1));

    const needed = new Set<number>();
    for (let i = start; i <= end; i += 1) needed.add(i);
    for (const pageIndex of this.virtualPinnedPages) {
      const idx = Math.max(0, Math.min(pageIndex, N - 1));
      needed.add(idx);
    }

    const mounted = Array.from(needed).sort((a, b) => a - b);
    const mountedKey = mounted.join(',');

    // No-op if mounted pages unchanged and nothing changed
    const alreadyProcessedLayout = this.processedLayoutVersion === this.layoutVersion;
    if (mountedKey === this.virtualMountedKey && this.changedBlocks.size === 0 && alreadyProcessedLayout) {
      this.virtualStart = start;
      this.virtualEnd = end;
      this.updateSpacersForMountedPages(mounted);
      return;
    }

    this.virtualMountedKey = mountedKey;
    this.virtualStart = start;
    this.virtualEnd = end;

    // Update spacers + rebuild gap spacers
    this.updateSpacersForMountedPages(mounted);
    this.clearGapSpacers();

    // Remove pages that are no longer needed
    for (const [idx, state] of this.pageIndexToState.entries()) {
      if (!needed.has(idx)) {
        state.element.remove();
        this.pageIndexToState.delete(idx);
      }
    }

    // Insert or patch needed pages
    for (const i of mounted) {
      const page = layout.pages[i];
      const pageSize = page.size ?? layout.pageSize;
      const existing = this.pageIndexToState.get(i);
      if (!existing) {
        const newState = this.createPageState(page, pageSize);
        newState.element.dataset.pageNumber = String(page.number);
        newState.element.dataset.pageIndex = String(i);
        // Ensure virtualization uses page margin 0
        applyStyles(newState.element, pageStyles(pageSize.w, pageSize.h, this.getEffectivePageStyles()));
        this.virtualPagesEl.appendChild(newState.element);
        this.pageIndexToState.set(i, newState);
      } else {
        // Patch in place
        this.patchPage(existing, page, pageSize);
      }
    }

    // Ensure top spacer is first, pages container is in the middle, and bottom spacer is last.
    if (this.mount.firstChild !== this.topSpacerEl) {
      this.mount.insertBefore(this.topSpacerEl, this.mount.firstChild);
    }
    if (this.virtualPagesEl.parentElement !== this.mount) {
      this.mount.insertBefore(this.virtualPagesEl, this.bottomSpacerEl);
    }
    this.mount.appendChild(this.bottomSpacerEl);

    // Ensure mounted pages are ordered (with gap spacers) before bottom spacer.
    let prevIndex: number | null = null;
    for (const idx of mounted) {
      if (prevIndex != null && idx > prevIndex + 1) {
        const gap = this.doc!.createElement('div');
        this.configureSpacerElement(gap, 'gap');
        gap.dataset.gapFrom = String(prevIndex);
        gap.dataset.gapTo = String(idx);
        const gapHeight =
          this.topOfIndex(idx) - this.topOfIndex(prevIndex) - this.virtualHeights[prevIndex] - this.pageGap * 2;
        gap.style.height = `${Math.max(0, Math.floor(gapHeight))}px`;
        this.virtualGapSpacers.push(gap);
        this.virtualPagesEl.appendChild(gap);
      }
      const state = this.pageIndexToState.get(idx)!;
      this.virtualPagesEl.appendChild(state.element);
      prevIndex = idx;
    }

    // Clear changed blocks now that current visible pages are patched
    this.changedBlocks.clear();
    this.processedLayoutVersion = this.layoutVersion;
  }

  private updateSpacers(start: number, end: number): void {
    if (!this.topSpacerEl || !this.bottomSpacerEl) return;
    const top = this.topOfIndex(start);
    const bottom = this.contentTotalHeight() - this.topOfIndex(end + 1);
    this.topSpacerEl.style.height = `${Math.max(0, Math.floor(top))}px`;
    this.bottomSpacerEl.style.height = `${Math.max(0, Math.floor(bottom))}px`;
  }

  private updateSpacersForMountedPages(mountedPageIndices: number[]): void {
    if (!this.topSpacerEl || !this.bottomSpacerEl) return;
    if (mountedPageIndices.length === 0) {
      this.topSpacerEl.style.height = '0px';
      this.bottomSpacerEl.style.height = '0px';
      return;
    }

    const first = mountedPageIndices[0];
    const last = mountedPageIndices[mountedPageIndices.length - 1];
    const n = this.virtualHeights.length;
    const clampedFirst = Math.max(0, Math.min(first, Math.max(0, n - 1)));
    const clampedLast = Math.max(0, Math.min(last, Math.max(0, n - 1)));

    const top = this.topOfIndex(clampedFirst);
    const bottom = this.topOfIndex(n) - this.topOfIndex(clampedLast + 1) - this.pageGap;
    this.topSpacerEl.style.height = `${Math.max(0, Math.floor(top))}px`;
    this.bottomSpacerEl.style.height = `${Math.max(0, Math.floor(bottom))}px`;
  }

  private clearGapSpacers(): void {
    for (const el of this.virtualGapSpacers) {
      el.remove();
    }
    this.virtualGapSpacers = [];
  }

  private renderHorizontal(layout: Layout, mount: HTMLElement): void {
    if (!this.doc) return;
    mount.innerHTML = '';
    layout.pages.forEach((page, pageIndex) => {
      const pageSize = page.size ?? layout.pageSize;
      const pageEl = this.renderPage(pageSize.w, pageSize.h, page);
      pageEl.dataset.pageNumber = String(page.number);
      pageEl.dataset.pageIndex = String(pageIndex);
      mount.appendChild(pageEl);
    });
  }

  private renderBookMode(layout: Layout, mount: HTMLElement): void {
    if (!this.doc) return;
    mount.innerHTML = '';
    const pages = layout.pages;
    if (pages.length === 0) return;

    const firstPageSize = pages[0].size ?? layout.pageSize;
    const firstPageEl = this.renderPage(firstPageSize.w, firstPageSize.h, pages[0]);
    firstPageEl.dataset.pageNumber = String(pages[0].number);
    firstPageEl.dataset.pageIndex = '0';
    mount.appendChild(firstPageEl);

    for (let i = 1; i < pages.length; i += 2) {
      const spreadEl = this.doc!.createElement('div');
      spreadEl.classList.add(CLASS_NAMES.spread);
      applyStyles(spreadEl, spreadStyles);

      const leftPage = pages[i];
      const leftPageSize = leftPage.size ?? layout.pageSize;
      const leftPageEl = this.renderPage(leftPageSize.w, leftPageSize.h, leftPage);
      leftPageEl.dataset.pageNumber = String(leftPage.number);
      leftPageEl.dataset.pageIndex = String(i);
      spreadEl.appendChild(leftPageEl);

      if (i + 1 < pages.length) {
        const rightPage = pages[i + 1];
        const rightPageSize = rightPage.size ?? layout.pageSize;
        const rightPageEl = this.renderPage(rightPageSize.w, rightPageSize.h, rightPage);
        rightPageEl.dataset.pageNumber = String(rightPage.number);
        rightPageEl.dataset.pageIndex = String(i + 1);
        spreadEl.appendChild(rightPageEl);
      }

      mount.appendChild(spreadEl);
    }
  }

  private renderPage(width: number, height: number, page: Page): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }
    const el = this.doc.createElement('div');
    el.classList.add(CLASS_NAMES.page);
    applyStyles(el, pageStyles(width, height, this.getEffectivePageStyles()));
    el.dataset.layoutEpoch = String(this.layoutEpoch);

    // Render per-page ruler if enabled
    if (this.options.ruler?.enabled) {
      const rulerEl = this.renderPageRuler(width, page);
      if (rulerEl) {
        el.appendChild(rulerEl);
      }
    }

    const contextBase: FragmentRenderContext = {
      pageNumber: page.number,
      totalPages: this.totalPages,
      section: 'body',
      pageNumberText: page.numberText,
    };

    const sdtBoundaries = computeSdtBoundaries(page.fragments, this.blockLookup);

    page.fragments.forEach((fragment, index) => {
      const sdtBoundary = sdtBoundaries.get(index);
      el.appendChild(this.renderFragment(fragment, contextBase, sdtBoundary));
    });
    this.renderDecorationsForPage(el, page);
    return el;
  }

  /**
   * Render a ruler element for a page.
   *
   * Creates a horizontal ruler with tick marks and optional interactive margin handles.
   * The ruler is positioned at the top of the page and displays inch measurements.
   *
   * @param pageWidthPx - Page width in pixels
   * @param page - Page data containing margins and optional size information
   * @returns Ruler element, or null if this.doc is unavailable or page margins are missing
   *
   * Side effects:
   * - Creates DOM elements and applies inline styles
   * - May invoke the onMarginChange callback if interactive mode is enabled
   *
   * Fallback behavior:
   * - Uses DEFAULT_PAGE_HEIGHT_PX (1056px = 11 inches) if page.size.h is not available
   * - Defaults margins to 0 if not explicitly provided
   */
  private renderPageRuler(pageWidthPx: number, page: Page): HTMLElement | null {
    if (!this.doc) {
      console.warn('[renderPageRuler] Cannot render ruler: document is not available.');
      return null;
    }

    if (!page.margins) {
      console.warn(`[renderPageRuler] Cannot render ruler for page ${page.number}: margins not available.`);
      return null;
    }

    const margins = page.margins;
    const leftMargin = margins.left ?? 0;
    const rightMargin = margins.right ?? 0;

    try {
      const rulerDefinition = generateRulerDefinitionFromPx({
        pageWidthPx,
        pageHeightPx: page.size?.h ?? DEFAULT_PAGE_HEIGHT_PX,
        leftMarginPx: leftMargin,
        rightMarginPx: rightMargin,
      });

      const interactive = this.options.ruler?.interactive ?? false;
      const onMarginChange = this.options.ruler?.onMarginChange;

      const rulerEl = createRulerElement({
        definition: rulerDefinition,
        doc: this.doc,
        interactive,
        onDragEnd:
          interactive && onMarginChange
            ? (side, x) => {
                // Convert pixel position to inches for callback
                try {
                  const ppi = 96;
                  const marginInches = side === 'left' ? x / ppi : (pageWidthPx - x) / ppi;
                  onMarginChange(side, marginInches);
                } catch (error) {
                  console.error('[renderPageRuler] Error in onMarginChange callback:', error);
                }
              }
            : undefined,
      });

      // Position ruler at top of page (above content area)
      rulerEl.style.position = 'absolute';
      rulerEl.style.top = '0';
      rulerEl.style.left = '0';
      rulerEl.style.zIndex = '20';
      rulerEl.dataset.pageNumber = String(page.number);

      return rulerEl;
    } catch (error) {
      console.error(`[renderPageRuler] Failed to create ruler for page ${page.number}:`, error);
      return null;
    }
  }

  private renderDecorationsForPage(pageEl: HTMLElement, page: Page): void {
    this.renderDecorationSection(pageEl, page, 'header');
    this.renderDecorationSection(pageEl, page, 'footer');
  }

  private renderDecorationSection(pageEl: HTMLElement, page: Page, kind: 'header' | 'footer'): void {
    if (!this.doc) return;
    const provider = kind === 'header' ? this.headerProvider : this.footerProvider;
    const className = kind === 'header' ? CLASS_NAMES.pageHeader : CLASS_NAMES.pageFooter;
    const existing = pageEl.querySelector(`.${className}`);
    const data = provider ? provider(page.number, page.margins, page) : null;

    if (!data || data.fragments.length === 0) {
      existing?.remove();
      return;
    }

    const container = (existing as HTMLElement) ?? this.doc.createElement('div');
    container.className = className;
    container.innerHTML = '';
    const baseOffset = data.offset ?? (kind === 'footer' ? pageEl.clientHeight - data.height : 0);
    const marginLeft = data.marginLeft ?? 0;
    const marginRight = page.margins?.right ?? 0;

    // For footers, if content is taller than reserved space, expand container upward
    // The container bottom stays anchored at footerMargin from page bottom
    let effectiveHeight = data.height;
    let effectiveOffset = baseOffset;
    if (
      kind === 'footer' &&
      typeof data.contentHeight === 'number' &&
      Number.isFinite(data.contentHeight) &&
      data.contentHeight > 0 &&
      data.contentHeight > data.height
    ) {
      effectiveHeight = data.contentHeight;
      // Move container up to accommodate taller content while keeping bottom edge in place
      effectiveOffset = baseOffset - (data.contentHeight - data.height);
    }

    container.style.position = 'absolute';
    container.style.left = `${marginLeft}px`;
    if (typeof data.contentWidth === 'number') {
      container.style.width = `${Math.max(0, data.contentWidth)}px`;
    } else {
      container.style.width = `calc(100% - ${marginLeft + marginRight}px)`;
    }
    container.style.pointerEvents = 'none';
    container.style.height = `${effectiveHeight}px`;
    container.style.top = `${Math.max(0, effectiveOffset)}px`;
    container.style.zIndex = '1';
    // Allow header/footer content to overflow its container bounds.
    // In OOXML, headers and footers can extend past their allocated margin space
    // into the body region, similar to how body content can have negative indents.
    container.style.overflow = 'visible';

    // For footers, calculate offset to push content to bottom of container
    // Fragments are absolutely positioned, so we need to adjust their y values
    // Use effectiveHeight (which accounts for overflow) rather than reserved height
    let footerYOffset = 0;
    if (kind === 'footer' && data.fragments.length > 0) {
      const contentHeight =
        typeof data.contentHeight === 'number'
          ? data.contentHeight
          : data.fragments.reduce((max, f) => {
              const fragHeight =
                'height' in f && typeof f.height === 'number' ? f.height : this.estimateFragmentHeight(f);
              return Math.max(max, f.y + Math.max(0, fragHeight));
            }, 0);
      // Offset to push content to bottom of container
      // When container has expanded (effectiveHeight >= contentHeight), offset is 0
      footerYOffset = Math.max(0, effectiveHeight - contentHeight);
    }

    const context: FragmentRenderContext = {
      pageNumber: page.number,
      totalPages: this.totalPages,
      section: kind,
      pageNumberText: page.numberText,
    };

    // Separate behindDoc fragments from normal fragments.
    // Prefer explicit fragment.behindDoc when present. Keep zIndex===0 as a
    // compatibility fallback for older layouts that predate explicit metadata.
    const behindDocFragments: typeof data.fragments = [];
    const normalFragments: typeof data.fragments = [];

    for (const fragment of data.fragments) {
      let isBehindDoc = false;
      if (fragment.kind === 'image' || fragment.kind === 'drawing') {
        isBehindDoc =
          fragment.behindDoc === true || (fragment.behindDoc == null && 'zIndex' in fragment && fragment.zIndex === 0);
      }
      if (isBehindDoc) {
        behindDocFragments.push(fragment);
      } else {
        normalFragments.push(fragment);
      }
    }

    // Remove any previously rendered behindDoc fragments for this section before re-rendering.
    // Unlike the header/footer container (which uses innerHTML = '' to clear), behindDoc
    // fragments are placed directly on the page element and must be explicitly removed.
    const behindDocSelector = `[data-behind-doc-section="${kind}"]`;
    pageEl.querySelectorAll(behindDocSelector).forEach((el) => el.remove());

    // Render behindDoc fragments directly on the page with z-index: 0
    // and insert them at the beginning of the page so they render behind body content.
    // We can't use z-index: -1 because that goes behind the page's white background.
    // By inserting at the beginning and using z-index: 0, they render below body content
    // which also has z-index values but comes later in DOM order.
    behindDocFragments.forEach((fragment) => {
      const fragEl = this.renderFragment(fragment, context);
      // Adjust position: fragment.y is relative to header container, we need page-relative
      const pageY = effectiveOffset + fragment.y + (kind === 'footer' ? footerYOffset : 0);
      fragEl.style.top = `${pageY}px`;
      fragEl.style.left = `${marginLeft + fragment.x}px`;
      fragEl.style.zIndex = '0'; // Same level as page, but inserted first so renders behind
      fragEl.dataset.behindDocSection = kind; // Track for cleanup on re-render
      // Insert at beginning of page so it renders behind body content due to DOM order
      pageEl.insertBefore(fragEl, pageEl.firstChild);
    });

    // Render normal fragments in the header/footer container
    normalFragments.forEach((fragment) => {
      const fragEl = this.renderFragment(fragment, context);
      // Apply footer offset to push content to bottom
      if (footerYOffset > 0) {
        const currentTop = parseFloat(fragEl.style.top) || fragment.y;
        fragEl.style.top = `${currentTop + footerYOffset}px`;
      }
      container.appendChild(fragEl);
    });

    if (!existing) {
      pageEl.appendChild(container);
    }
  }

  private resetState(): void {
    if (this.mount) {
      if (this.onScrollHandler) {
        try {
          this.mount.removeEventListener('scroll', this.onScrollHandler);
        } catch {}
      }
      if (this.onWindowScrollHandler && this.doc?.defaultView) {
        try {
          this.doc.defaultView.removeEventListener('scroll', this.onWindowScrollHandler);
        } catch {}
      }
      if (this.onResizeHandler && this.doc?.defaultView) {
        try {
          this.doc.defaultView.removeEventListener('resize', this.onResizeHandler);
        } catch {}
      }
      this.mount.innerHTML = '';
    }
    this.pageStates = [];
    this.currentLayout = null;
    this.pageIndexToState.clear();
    this.topSpacerEl = null;
    this.bottomSpacerEl = null;
    this.virtualPagesEl = null;
    this.onScrollHandler = null;
    this.onWindowScrollHandler = null;
    this.onResizeHandler = null;
    this.layoutVersion = 0;
    this.processedLayoutVersion = -1;
  }

  private fullRender(layout: Layout): void {
    if (!this.mount || !this.doc) return;
    this.mount.innerHTML = '';
    this.pageStates = [];

    layout.pages.forEach((page, pageIndex) => {
      const pageSize = page.size ?? layout.pageSize;
      const pageState = this.createPageState(page, pageSize);
      pageState.element.dataset.pageNumber = String(page.number);
      pageState.element.dataset.pageIndex = String(pageIndex);
      this.mount!.appendChild(pageState.element);
      this.pageStates.push(pageState);
    });
  }

  private patchLayout(layout: Layout): void {
    if (!this.mount || !this.doc) return;

    const nextStates: PageDomState[] = [];

    layout.pages.forEach((page, index) => {
      const pageSize = page.size ?? layout.pageSize;
      const prevState = this.pageStates[index];
      if (!prevState) {
        const newState = this.createPageState(page, pageSize);
        newState.element.dataset.pageNumber = String(page.number);
        newState.element.dataset.pageIndex = String(index);
        this.mount!.insertBefore(newState.element, this.mount!.children[index] ?? null);
        nextStates.push(newState);
        return;
      }
      this.patchPage(prevState, page, pageSize);
      nextStates.push(prevState);
    });

    if (this.pageStates.length > layout.pages.length) {
      for (let i = layout.pages.length; i < this.pageStates.length; i += 1) {
        this.pageStates[i]?.element.remove();
      }
    }

    this.pageStates = nextStates;
  }

  private patchPage(state: PageDomState, page: Page, pageSize: { w: number; h: number }): void {
    const pageEl = state.element;
    applyStyles(pageEl, pageStyles(pageSize.w, pageSize.h, this.getEffectivePageStyles()));
    pageEl.dataset.pageNumber = String(page.number);
    pageEl.dataset.layoutEpoch = String(this.layoutEpoch);
    // pageIndex is already set during creation and doesn't change during patch

    const existing = new Map(state.fragments.map((frag) => [frag.key, frag]));
    const nextFragments: FragmentDomState[] = [];
    const sdtBoundaries = computeSdtBoundaries(page.fragments, this.blockLookup);

    const contextBase: FragmentRenderContext = {
      pageNumber: page.number,
      totalPages: this.totalPages,
      section: 'body',
      pageNumberText: page.numberText,
    };

    page.fragments.forEach((fragment, index) => {
      const key = fragmentKey(fragment);
      const current = existing.get(key);
      const sdtBoundary = sdtBoundaries.get(index);

      if (current) {
        existing.delete(key);
        const sdtBoundaryMismatch = shouldRebuildForSdtBoundary(current.element, sdtBoundary);
        const needsRebuild =
          this.changedBlocks.has(fragment.blockId) ||
          current.signature !== fragmentSignature(fragment, this.blockLookup) ||
          sdtBoundaryMismatch;

        if (needsRebuild) {
          const replacement = this.renderFragment(fragment, contextBase, sdtBoundary);
          pageEl.replaceChild(replacement, current.element);
          current.element = replacement;
          current.signature = fragmentSignature(fragment, this.blockLookup);
        } else if (this.currentMapping) {
          // Fragment NOT rebuilt - update position attributes to reflect document changes
          this.updatePositionAttributes(current.element, this.currentMapping);
        }

        this.updateFragmentElement(current.element, fragment, contextBase.section);
        if (sdtBoundary?.widthOverride != null) {
          current.element.style.width = `${sdtBoundary.widthOverride}px`;
        }
        current.fragment = fragment;
        current.key = key;
        current.context = contextBase;
        nextFragments.push(current);

        return;
      }

      const fresh = this.renderFragment(fragment, contextBase, sdtBoundary);
      pageEl.insertBefore(fresh, pageEl.children[index] ?? null);
      nextFragments.push({
        key,
        fragment,
        element: fresh,
        signature: fragmentSignature(fragment, this.blockLookup),
        context: contextBase,
      });
    });

    existing.forEach((state) => state.element.remove());

    nextFragments.forEach((fragmentState, index) => {
      const desiredChild = pageEl.children[index];
      if (fragmentState.element !== desiredChild) {
        pageEl.insertBefore(fragmentState.element, desiredChild ?? null);
      }
    });

    state.fragments = nextFragments;
    this.renderDecorationsForPage(pageEl, page);
  }

  /**
   * Updates data-pm-start/data-pm-end attributes on all elements within a fragment
   * using the transaction's mapping. Skips header/footer content (separate PM coordinate space).
   * Also skips fragments that end before the edit point (their positions don't change).
   */
  private updatePositionAttributes(fragmentEl: HTMLElement, mapping: PositionMapping): void {
    // Skip header/footer elements (they use a separate PM coordinate space)
    if (fragmentEl.closest('.superdoc-page-header, .superdoc-page-footer')) {
      return;
    }

    // Wrap mapping logic in try-catch to prevent corrupted mappings from crashing paint cycle
    try {
      // Quick check: if the fragment's end position doesn't change, nothing inside needs updating.
      // This happens for all content BEFORE the edit point.
      const fragEnd = fragmentEl.dataset.pmEnd;
      if (fragEnd !== undefined && fragEnd !== '') {
        const endNum = Number(fragEnd);
        if (Number.isFinite(endNum) && mapping.map(endNum, -1) === endNum) {
          // Fragment ends before edit point - no position changes needed
          return;
        }
      }

      // Get all elements with position attributes (including the fragment element itself)
      const elements = fragmentEl.querySelectorAll('[data-pm-start], [data-pm-end]');
      const allElements = [fragmentEl, ...Array.from(elements)] as HTMLElement[];

      for (const el of allElements) {
        const oldStart = el.dataset.pmStart;
        const oldEnd = el.dataset.pmEnd;

        if (oldStart !== undefined && oldStart !== '') {
          const num = Number(oldStart);
          if (Number.isFinite(num)) {
            el.dataset.pmStart = String(mapping.map(num));
          }
        }

        if (oldEnd !== undefined && oldEnd !== '') {
          const num = Number(oldEnd);
          if (Number.isFinite(num)) {
            // Use bias -1 for end positions to handle edge cases correctly
            el.dataset.pmEnd = String(mapping.map(num, -1));
          }
        }
      }
    } catch (error) {
      // Log the error but don't crash the paint cycle - corrupted mappings shouldn't break rendering
      console.error('Error updating position attributes with mapping:', error);
    }
  }

  private createPageState(page: Page, pageSize: { w: number; h: number }): PageDomState {
    if (!this.doc) {
      throw new Error('DomPainter.createPageState requires a document');
    }
    const el = this.doc.createElement('div');
    el.classList.add(CLASS_NAMES.page);
    applyStyles(el, pageStyles(pageSize.w, pageSize.h, this.getEffectivePageStyles()));
    el.dataset.layoutEpoch = String(this.layoutEpoch);

    const contextBase: FragmentRenderContext = {
      pageNumber: page.number,
      totalPages: this.totalPages,
      section: 'body',
    };

    const sdtBoundaries = computeSdtBoundaries(page.fragments, this.blockLookup);
    const fragmentStates: FragmentDomState[] = page.fragments.map((fragment, index) => {
      const sdtBoundary = sdtBoundaries.get(index);
      const fragmentEl = this.renderFragment(fragment, contextBase, sdtBoundary);
      el.appendChild(fragmentEl);
      return {
        key: fragmentKey(fragment),
        signature: fragmentSignature(fragment, this.blockLookup),
        fragment,
        element: fragmentEl,
        context: contextBase,
      };
    });

    this.renderDecorationsForPage(el, page);
    return { element: el, fragments: fragmentStates };
  }

  private getEffectivePageStyles(): PageStyles | undefined {
    if (this.virtualEnabled && this.layoutMode === 'vertical') {
      // Remove top/bottom margins to avoid double-counting with container gap during virtualization
      const base = this.options.pageStyles ?? {};
      return { ...base, margin: '0 auto' };
    }
    return this.options.pageStyles;
  }

  private renderFragment(
    fragment: Fragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
  ): HTMLElement {
    if (fragment.kind === 'para') {
      return this.renderParagraphFragment(fragment, context, sdtBoundary);
    }
    if (fragment.kind === 'list-item') {
      return this.renderListItemFragment(fragment, context, sdtBoundary);
    }
    if (fragment.kind === 'image') {
      return this.renderImageFragment(fragment, context);
    }
    if (fragment.kind === 'drawing') {
      return this.renderDrawingFragment(fragment, context);
    }
    if (fragment.kind === 'table') {
      return this.renderTableFragment(fragment, context, sdtBoundary);
    }
    throw new Error(`DomPainter: unsupported fragment kind ${(fragment as Fragment).kind}`);
  }

  /**
   * Renders a paragraph fragment with defensive error handling.
   * Falls back to error placeholder on rendering errors to prevent full paint failure.
   *
   * @param fragment - The paragraph fragment to render
   * @param context - Rendering context with page and column information
   * @param sdtBoundary - Optional SDT boundary overrides for multi-fragment containers
   * @returns HTMLElement containing the rendered fragment or error placeholder
   */
  private renderParagraphFragment(
    fragment: ParaFragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
  ): HTMLElement {
    try {
      const lookup = this.blockLookup.get(fragment.blockId);
      if (!lookup || lookup.block.kind !== 'paragraph' || lookup.measure.kind !== 'paragraph') {
        throw new Error(`DomPainter: missing block/measure for fragment ${fragment.blockId}`);
      }

      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }

      const block = lookup.block as ParagraphBlock;
      const measure = lookup.measure as ParagraphMeasure;
      const wordLayout = isMinimalWordLayout(block.attrs?.wordLayout) ? block.attrs.wordLayout : undefined;

      const fragmentEl = this.doc.createElement('div');
      fragmentEl.classList.add(CLASS_NAMES.fragment);

      // For TOC entries, override white-space to prevent wrapping
      const isTocEntry = block.attrs?.isTocEntry;
      // For fragments with markers, allow overflow to show markers positioned at negative left
      const hasMarker = !fragment.continuesFromPrev && fragment.markerWidth && wordLayout?.marker;
      // SDT containers need overflow visible for tooltips/labels positioned above
      const hasSdtContainer =
        block.attrs?.sdt?.type === 'documentSection' ||
        block.attrs?.sdt?.type === 'structuredContent' ||
        block.attrs?.containerSdt?.type === 'documentSection' ||
        block.attrs?.containerSdt?.type === 'structuredContent';
      // Negative indents extend text into the margin area, requiring overflow:visible
      const paraIndentForOverflow = block.attrs?.indent;
      const hasNegativeIndent = (paraIndentForOverflow?.left ?? 0) < 0 || (paraIndentForOverflow?.right ?? 0) < 0;
      const styles = isTocEntry
        ? { ...fragmentStyles, whiteSpace: 'nowrap' }
        : hasMarker || hasSdtContainer || hasNegativeIndent
          ? { ...fragmentStyles, overflow: 'visible' }
          : fragmentStyles;
      applyStyles(fragmentEl, styles);
      this.applyFragmentFrame(fragmentEl, fragment, context.section);

      // Add TOC-specific styling class
      if (isTocEntry) {
        fragmentEl.classList.add('superdoc-toc-entry');
      }

      if (fragment.continuesFromPrev) {
        fragmentEl.dataset.continuesFromPrev = 'true';
      }
      if (fragment.continuesOnNext) {
        fragmentEl.dataset.continuesOnNext = 'true';
      }

      // Use fragment.lines if available (set when paragraph was remeasured for narrower column).
      // Otherwise, fall back to slicing from the original measure.
      const lines = fragment.lines ?? measure.lines.slice(fragment.fromLine, fragment.toLine);
      applyParagraphBlockStyles(fragmentEl, block.attrs);
      const { shadingLayer, borderLayer } = createParagraphDecorationLayers(this.doc, fragment.width, block.attrs);
      if (shadingLayer) {
        fragmentEl.appendChild(shadingLayer);
      }
      if (borderLayer) {
        fragmentEl.appendChild(borderLayer);
      }
      if (block.attrs?.styleId) {
        fragmentEl.dataset.styleId = block.attrs.styleId;
        fragmentEl.setAttribute('styleid', block.attrs.styleId);
      }
      this.applySdtDataset(fragmentEl, block.attrs?.sdt);
      this.applyContainerSdtDataset(fragmentEl, block.attrs?.containerSdt);

      // Apply SDT container styling (document sections, structured content blocks)
      applySdtContainerStyling(this.doc, fragmentEl, block.attrs?.sdt, block.attrs?.containerSdt, sdtBoundary);

      // Render drop cap if present (only on the first fragment, not continuation)
      const dropCapDescriptor = block.attrs?.dropCapDescriptor;
      const dropCapMeasure = measure.dropCap;
      if (dropCapDescriptor && dropCapMeasure && !fragment.continuesFromPrev) {
        const dropCapEl = this.renderDropCap(dropCapDescriptor, dropCapMeasure);
        fragmentEl.appendChild(dropCapEl);
      }

      // Remove fragment-level indent so line-level indent handling doesn't double-apply.
      // Include margin properties for negative indents (which use margin instead of padding).
      if (fragmentEl.style.paddingLeft) fragmentEl.style.removeProperty('padding-left');
      if (fragmentEl.style.paddingRight) fragmentEl.style.removeProperty('padding-right');
      if (fragmentEl.style.marginLeft) fragmentEl.style.removeProperty('margin-left');
      if (fragmentEl.style.marginRight) fragmentEl.style.removeProperty('margin-right');
      if (fragmentEl.style.textIndent) fragmentEl.style.removeProperty('text-indent');

      const paraIndent = block.attrs?.indent;
      const paraIndentLeft = paraIndent?.left ?? 0;
      const paraIndentRight = paraIndent?.right ?? 0;
      // Word quirk: justified paragraphs ignore first-line indent. The pm-adapter sets // => This is not true
      // suppressFirstLineIndent=true for these cases.
      const suppressFirstLineIndent = (block.attrs as Record<string, unknown>)?.suppressFirstLineIndent === true;
      const firstLineOffset = suppressFirstLineIndent ? 0 : (paraIndent?.firstLine ?? 0) - (paraIndent?.hanging ?? 0);

      // Check if the paragraph ends with a lineBreak run.
      // In Word, justified text stretches all lines EXCEPT the true last line of a paragraph.
      // However, if the paragraph ends with a <w:br/> (lineBreak), the visible text before
      // the break should still be justified because the "last line" is the empty line after the break.
      const lastRun = block.runs.length > 0 ? block.runs[block.runs.length - 1] : null;
      const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';

      // Pre-calculate actual marker+tab inline width for list first lines.
      // The measurer uses textStartPx to calculate line.maxWidth, but the painter renders
      // marker+tab as inline elements that may consume MORE space than textStartPx indicates.
      // This causes justify overflow when line.maxWidth > (fragment.width - actualMarkerTabWidth).
      let listFirstLineMarkerTabEndPx: number | null = null;
      let listTabWidth = 0;
      let markerStartPos: number;
      if (!fragment.continuesFromPrev && fragment.markerWidth && wordLayout?.marker) {
        const markerTextWidth = fragment.markerTextWidth!;
        const anchorPoint = paraIndentLeft - (paraIndent?.hanging ?? 0) + (paraIndent?.firstLine ?? 0);
        const markerJustification = wordLayout.marker.justification ?? 'left';
        let currentPos: number;
        if (markerJustification === 'left') {
          markerStartPos = anchorPoint;
          currentPos = markerStartPos + markerTextWidth;
        } else if (markerJustification === 'right') {
          markerStartPos = anchorPoint - markerTextWidth;
          currentPos = anchorPoint;
        } else {
          markerStartPos = anchorPoint - markerTextWidth / 2;
          currentPos = markerStartPos + markerTextWidth;
        }

        // Calculate tab width using same logic as marker rendering section
        const suffix = wordLayout.marker.suffix ?? 'tab';
        if (suffix === 'tab') {
          listTabWidth = computeTabWidth(
            currentPos,
            markerJustification,
            wordLayout.tabsPx,
            paraIndent?.hanging,
            paraIndent?.firstLine,
            paraIndentLeft,
          );
        } else if (suffix === 'space') {
          listTabWidth = 4;
        }
        listFirstLineMarkerTabEndPx = currentPos + listTabWidth;
      }

      lines.forEach((line, index) => {
        // Calculate available width from fragment dimensions (the actual rendered width).
        // This is the ground truth for justify calculations since it matches what's visible.
        // Only subtract positive indents - negative indents already expand fragment.width in layout
        const positiveIndentReduction = Math.max(0, paraIndentLeft) + Math.max(0, paraIndentRight);
        const fallbackAvailableWidth = Math.max(0, fragment.width - positiveIndentReduction);
        // Use line.maxWidth if available (accounts for drop caps, exclusion zones), but cap it at
        // fallbackAvailableWidth to handle cases where measurement used a different width than layout
        // (e.g., paragraph measured at full page width but laid out in narrower column).
        let availableWidthOverride =
          line.maxWidth != null ? Math.min(line.maxWidth, fallbackAvailableWidth) : fallbackAvailableWidth;

        // For list first lines, use the actual marker+tab inline width instead of line.maxWidth
        // which is based on textStartPx and may not match the actual rendered inline width.
        // Must also subtract paraIndentRight to match measurer's calculation:
        // initialAvailableWidth = maxWidth - textStartPx - indentRight
        // Only subtract positive paraIndentRight - negative indents already expand fragment.width
        if (index === 0 && listFirstLineMarkerTabEndPx != null) {
          availableWidthOverride = fragment.width - listFirstLineMarkerTabEndPx - Math.max(0, paraIndentRight);
        }

        // Determine if this is the true last line of the paragraph that should skip justification.
        // Skip justify if: this is the last line of the last fragment AND no trailing lineBreak.
        //
        // IMPORTANT: List paragraphs (paragraphs with fragment.markerWidth and wordLayout.marker)
        // SHOULD be justified per MS Word specification when alignment is 'justify'. Do NOT add
        // an isListParagraph check here - the last line rule applies equally to list and non-list
        // paragraphs (both skip justification on the final line unless it ends with lineBreak).
        const isLastLineOfFragment = index === lines.length - 1;
        const isLastLineOfParagraph = isLastLineOfFragment && !fragment.continuesOnNext;
        const shouldSkipJustifyForLastLine = isLastLineOfParagraph && !paragraphEndsWithLineBreak;

        const lineEl = this.renderLine(
          block,
          line,
          context,
          availableWidthOverride,
          fragment.fromLine + index,
          shouldSkipJustifyForLastLine,
        );

        // List first lines handle indentation via marker positioning and tab stops,
        // not CSS padding/text-indent. This matches Word's rendering model.
        const isListFirstLine =
          index === 0 &&
          !fragment.continuesFromPrev &&
          fragment.markerWidth &&
          fragment.markerTextWidth &&
          wordLayout?.marker;

        /**
         * Determines if this line contains segments with explicit X positioning (typically from tabs).
         * When segments have explicit X positions, they are rendered with absolute positioning,
         * which means CSS textIndent has no effect on their placement.
         */
        const hasExplicitSegmentPositioning = line.segments?.some((seg) => seg.x !== undefined);

        /**
         * Identifies first lines that require special indent handling.
         * This includes both hanging indents (negative firstLineOffset) and positive firstLine indents.
         * When combined with explicit segment positioning, we must adjust paddingLeft instead of
         * using textIndent, since absolutely positioned segments are not affected by textIndent.
         */
        const isFirstLine = index === 0 && !fragment.continuesFromPrev;

        // Apply paragraph indent via padding (skip for list first lines)
        if (!isListFirstLine) {
          /**
           * Special handling for first lines with explicit segment positioning.
           *
           * Normally we implement first-line/hanging indents with:
           * - paddingLeft = leftIndent
           * - textIndent = firstLine - hanging (positive for firstLine, negative for hanging)
           *
           * However, when tabs are present, segments have explicit X positions calculated
           * during layout that are relative to the content area start. Since these segments
           * use absolute positioning, CSS textIndent doesn't affect them.
           *
           * Therefore, we must incorporate the firstLineOffset into paddingLeft to match
           * where the absolutely positioned segments expect to start.
           *
           * Examples:
           * - leftIndent=360, hanging=360 (firstLineOffset=-360)
           *   Normal: paddingLeft=360px, textIndent=-360px → first line content at 0px
           *   With tabs: paddingLeft=0px, no textIndent → segments positioned correctly
           *
           * - leftIndent=360, firstLine=720 (firstLineOffset=+720)
           *   Normal: paddingLeft=360px, textIndent=720px → first line content at 1080px
           *   With tabs: paddingLeft=1080px, no textIndent → segments positioned correctly
           */
          if (hasExplicitSegmentPositioning) {
            // When segments have explicit X positions (from tabs), they are absolutely positioned.
            // Absolutely positioned elements ignore padding, so we must NOT set paddingLeft.
            // The segment X positions already include the paragraph indent from layout calculation.
            // For first lines with firstLineOffset, adjust the starting position.
            if (isFirstLine && firstLineOffset !== 0) {
              // For negative left indent, fragment position is already adjusted in layout engine.
              // Only apply padding for the firstLineOffset (relative to the paragraph indent).
              const effectiveLeftIndent = paraIndentLeft < 0 ? 0 : paraIndentLeft;
              const adjustedPadding = effectiveLeftIndent + firstLineOffset;
              if (adjustedPadding > 0) {
                lineEl.style.paddingLeft = `${adjustedPadding}px`;
              }
              // Note: negative adjustedPadding (from hanging indent) is handled by textIndent below
            }
            // Otherwise, don't set paddingLeft - segment positions handle indentation
          } else if (paraIndentLeft && paraIndentLeft > 0) {
            // Only apply positive left indent as padding.
            // Negative left indent is handled by fragment positioning in layout engine.
            lineEl.style.paddingLeft = `${paraIndentLeft}px`;
          } else if (
            !isFirstLine &&
            paraIndent?.hanging &&
            paraIndent.hanging > 0 &&
            // Only apply hanging padding when left indent is NOT negative.
            // When left indent is negative, the fragment position already accounts for it.
            // Adding padding here would shift body lines right, causing right-side overflow.
            !(paraIndentLeft != null && paraIndentLeft < 0)
          ) {
            // Body lines with hanging indent need paddingLeft = hanging when left indent is non-negative.
            // First line doesn't get this padding because it "hangs" (starts further left).
            lineEl.style.paddingLeft = `${paraIndent.hanging}px`;
          }
        }
        if (paraIndentRight && paraIndentRight > 0) {
          // Only apply positive right indent as padding.
          // Negative right indent is handled by fragment positioning in layout engine.
          lineEl.style.paddingRight = `${paraIndentRight}px`;
        }
        // Apply first-line/hanging text-indent (skip for list first lines and lines with explicit positioning)
        // When using explicit segment positioning, segments are absolutely positioned and textIndent
        // has no effect, so we skip it to avoid confusion.
        if (!fragment.continuesFromPrev && index === 0 && firstLineOffset && !isListFirstLine) {
          if (!hasExplicitSegmentPositioning) {
            lineEl.style.textIndent = `${firstLineOffset}px`;
          }
        } else if (firstLineOffset && !isListFirstLine) {
          lineEl.style.textIndent = '0px';
        }

        if (isListFirstLine) {
          const marker = wordLayout.marker!;
          lineEl.style.paddingLeft = `${paraIndentLeft + (paraIndent?.firstLine ?? 0) - (paraIndent?.hanging ?? 0)}px`; // HERE CONTROLS WHERE TAB STARTS - I think this will vary with justification

          const markerContainer = this.doc!.createElement('span');
          markerContainer.style.display = 'inline-block';
          // Justification is implemented via `word-spacing` on the line element. The list marker (and its
          // tab/space suffix) must not inherit this spacing or it will shift the text start and can
          // cause overflow for justified list paragraphs.
          markerContainer.style.wordSpacing = '0px';

          const markerEl = this.doc!.createElement('span');
          markerEl.classList.add('superdoc-paragraph-marker');
          markerEl.textContent = marker.markerText ?? '';
          markerEl.style.pointerEvents = 'none';

          // Left-justified markers stay inline to share flow with the tab spacer.
          // Other justifications use absolute positioning.
          const markerJustification = marker.justification ?? 'left';

          markerContainer.style.position = 'relative';
          if (markerJustification === 'right') {
            markerContainer.style.position = 'absolute';
            markerContainer.style.left = `${markerStartPos}px`; // HERE CONTROLS MARKER POSITION - I think this will vary with justification
          } else if (markerJustification === 'center') {
            markerContainer.style.position = 'absolute';
            markerContainer.style.left = `${markerStartPos - fragment.markerTextWidth! / 2}px`; // HERE CONTROLS MARKER POSITION - I think this will vary with justification
            lineEl.style.paddingLeft = parseFloat(lineEl.style.paddingLeft) + fragment.markerTextWidth! / 2 + 'px';
          }

          // Apply marker run styling with font fallback chain
          markerEl.style.fontFamily = toCssFontFamily(marker.run.fontFamily) ?? marker.run.fontFamily;
          markerEl.style.fontSize = `${marker.run.fontSize}px`;
          markerEl.style.fontWeight = marker.run.bold ? 'bold' : '';
          markerEl.style.fontStyle = marker.run.italic ? 'italic' : '';
          if (marker.run.color) {
            markerEl.style.color = marker.run.color;
          }
          if (marker.run.letterSpacing != null) {
            markerEl.style.letterSpacing = `${marker.run.letterSpacing}px`;
          }
          markerContainer.appendChild(markerEl);

          const suffix = marker.suffix ?? 'tab';
          if (suffix === 'tab') {
            const tabEl = this.doc!.createElement('span');
            tabEl.className = 'superdoc-tab';
            tabEl.innerHTML = '&nbsp;';
            tabEl.style.display = 'inline-block';
            tabEl.style.wordSpacing = '0px';
            tabEl.style.width = `${listTabWidth}px`;

            lineEl.prepend(tabEl);
          } else if (suffix === 'space') {
            // Insert a non-breaking space in the inline flow to separate marker and text.
            // Wrap it so it can opt out of inherited `word-spacing` used for justification.
            const spaceEl = this.doc!.createElement('span');
            spaceEl.classList.add('superdoc-marker-suffix-space');
            spaceEl.style.wordSpacing = '0px';
            spaceEl.textContent = '\u00A0';

            lineEl.prepend(spaceEl);
          }
          lineEl.prepend(markerContainer);
        }
        fragmentEl.appendChild(lineEl);
      });

      return fragmentEl;
    } catch (error) {
      console.error('[DomPainter] Fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  /**
   * Creates an error placeholder element for failed fragment renders.
   * Prevents entire paint operation from failing due to single fragment error.
   *
   * @param blockId - The block ID that failed to render
   * @param error - The error that occurred
   * @returns HTMLElement showing the error
   */
  private createErrorPlaceholder(blockId: string, error: unknown): HTMLElement {
    if (!this.doc) {
      // Fallback if doc is not available
      const el = document.createElement('div');
      el.className = 'render-error-placeholder';
      el.style.cssText = 'color: red; padding: 4px; border: 1px solid red; background: #fee;';
      el.textContent = `[Render Error: ${blockId}]`;
      return el;
    }

    const el = this.doc.createElement('div');
    el.className = 'render-error-placeholder';
    el.style.cssText = 'color: red; padding: 4px; border: 1px solid red; background: #fee;';
    el.textContent = `[Render Error: ${blockId}]`;
    if (error instanceof Error) {
      el.title = error.message;
    }
    return el;
  }

  /**
   * Renders a drop cap element as a floated span at the start of a paragraph.
   *
   * Drop caps are large initial letters that span multiple lines of text.
   * This method creates a floated element with the drop cap letter styled
   * according to the descriptor's run properties.
   *
   * @param descriptor - The drop cap descriptor with text and styling info
   * @param measure - The measured dimensions of the drop cap
   * @returns HTMLElement containing the rendered drop cap
   */
  private renderDropCap(descriptor: DropCapDescriptor, measure: ParagraphMeasure['dropCap']): HTMLElement {
    const doc = this.doc!;
    const { run, mode } = descriptor;

    const dropCapEl = doc.createElement('span');
    dropCapEl.classList.add('superdoc-drop-cap');
    dropCapEl.textContent = run.text;

    // Apply styling from the run
    dropCapEl.style.fontFamily = run.fontFamily;
    dropCapEl.style.fontSize = `${run.fontSize}px`;
    if (run.bold) {
      dropCapEl.style.fontWeight = 'bold';
    }
    if (run.italic) {
      dropCapEl.style.fontStyle = 'italic';
    }
    if (run.color) {
      dropCapEl.style.color = run.color;
    }

    // Position the drop cap based on mode
    if (mode === 'drop') {
      // Float left so text wraps around it
      dropCapEl.style.float = 'left';
      dropCapEl.style.marginRight = '4px'; // Small gap between drop cap and text
      dropCapEl.style.lineHeight = '1'; // Prevent extra line height from affecting layout
    } else if (mode === 'margin') {
      // Position in the margin (left of the text area)
      dropCapEl.style.position = 'absolute';
      dropCapEl.style.left = '0';
      dropCapEl.style.lineHeight = '1';
    }

    // Apply vertical position offset if specified
    if (run.position && run.position !== 0) {
      dropCapEl.style.position = dropCapEl.style.position || 'relative';
      dropCapEl.style.top = `${run.position}px`;
    }

    // Set dimensions from measurement
    if (measure) {
      dropCapEl.style.width = `${measure.width}px`;
      dropCapEl.style.height = `${measure.height}px`;
    }

    return dropCapEl;
  }

  private renderListItemFragment(
    fragment: ListItemFragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
  ): HTMLElement {
    try {
      const lookup = this.blockLookup.get(fragment.blockId);
      if (!lookup || lookup.block.kind !== 'list' || lookup.measure.kind !== 'list') {
        throw new Error(`DomPainter: missing list data for fragment ${fragment.blockId}`);
      }

      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }

      const block = lookup.block as ListBlock;
      const measure = lookup.measure as ListMeasure;
      const item = block.items.find((entry) => entry.id === fragment.itemId);
      const itemMeasure = measure.items.find((entry) => entry.itemId === fragment.itemId);
      if (!item || !itemMeasure) {
        throw new Error(`DomPainter: missing list item ${fragment.itemId}`);
      }

      const fragmentEl = this.doc.createElement('div');
      fragmentEl.classList.add(CLASS_NAMES.fragment, `${CLASS_NAMES.fragment}-list-item`);
      applyStyles(fragmentEl, fragmentStyles);
      fragmentEl.style.left = `${fragment.x - fragment.markerWidth}px`;
      fragmentEl.style.top = `${fragment.y}px`;
      fragmentEl.style.width = `${fragment.markerWidth + fragment.width}px`;
      fragmentEl.dataset.blockId = fragment.blockId;
      fragmentEl.dataset.itemId = fragment.itemId;

      const paragraphMetadata = item.paragraph.attrs?.sdt;
      this.applySdtDataset(fragmentEl, paragraphMetadata);

      // Apply SDT container styling (document sections, structured content blocks)
      applySdtContainerStyling(
        this.doc,
        fragmentEl,
        paragraphMetadata,
        item.paragraph.attrs?.containerSdt,
        sdtBoundary,
      );

      if (fragment.continuesFromPrev) {
        fragmentEl.dataset.continuesFromPrev = 'true';
      }
      if (fragment.continuesOnNext) {
        fragmentEl.dataset.continuesOnNext = 'true';
      }

      const markerEl = this.doc.createElement('span');
      markerEl.classList.add('superdoc-list-marker');

      // Track B: Use marker styling from wordLayout if available
      const wordLayout: MinimalWordLayout | undefined = item.paragraph.attrs?.wordLayout as
        | MinimalWordLayout
        | undefined;
      const marker = wordLayout?.marker;
      if (marker) {
        markerEl.textContent = marker.markerText ?? null;
        markerEl.style.display = 'inline-block';
        markerEl.style.width = `${Math.max(0, fragment.markerWidth - LIST_MARKER_GAP)}px`;
        markerEl.style.paddingRight = `${LIST_MARKER_GAP}px`;
        markerEl.style.textAlign = marker.justification ?? 'left';

        // Apply marker run styling with font fallback chain
        markerEl.style.fontFamily = toCssFontFamily(marker.run.fontFamily) ?? marker.run.fontFamily;
        markerEl.style.fontSize = `${marker.run.fontSize}px`;
        if (marker.run.bold) markerEl.style.fontWeight = 'bold';
        if (marker.run.italic) markerEl.style.fontStyle = 'italic';
        if (marker.run.color) markerEl.style.color = marker.run.color;
        if (marker.run.letterSpacing) markerEl.style.letterSpacing = `${marker.run.letterSpacing}px`;
      } else {
        // Fallback: legacy behavior
        markerEl.textContent = item.marker.text;
        markerEl.style.display = 'inline-block';
        markerEl.style.width = `${Math.max(0, fragment.markerWidth - LIST_MARKER_GAP)}px`;
        markerEl.style.paddingRight = `${LIST_MARKER_GAP}px`;
        if (item.marker.align) {
          markerEl.style.textAlign = item.marker.align;
        }
      }
      fragmentEl.appendChild(markerEl);

      const contentEl = this.doc.createElement('div');
      contentEl.classList.add('superdoc-list-content');
      this.applySdtDataset(contentEl, paragraphMetadata);
      contentEl.style.display = 'inline-block';
      contentEl.style.position = 'relative';
      contentEl.style.width = `${fragment.width}px`;
      const lines = itemMeasure.paragraph.lines.slice(fragment.fromLine, fragment.toLine);
      // Track B: preserve indent for wordLayout-based lists to show hierarchy
      const contentAttrs = wordLayout ? item.paragraph.attrs : stripListIndent(item.paragraph.attrs);
      applyParagraphBlockStyles(contentEl, contentAttrs);
      const { shadingLayer, borderLayer } = createParagraphDecorationLayers(this.doc, fragment.width, contentAttrs);
      if (shadingLayer) {
        contentEl.appendChild(shadingLayer);
      }
      if (borderLayer) {
        contentEl.appendChild(borderLayer);
      }
      // INTENTIONAL DIVERGENCE: Force list content to left alignment
      // Microsoft Word DOES justify list paragraphs when alignment is 'justify',
      // but we intentionally keep lists left-aligned to match user expectations
      // and current behavior. This is a documented design decision, not a bug.
      // Applied AFTER applyParagraphBlockStyles (which may set justify from paragraph properties).
      contentEl.style.textAlign = 'left';
      // Override alignment to left for list content rendering
      const paraForList: ParagraphBlock = {
        ...item.paragraph,
        attrs: { ...(item.paragraph.attrs || {}), alignment: 'left' },
      };
      lines.forEach((line, idx) => {
        const lineEl = this.renderLine(paraForList, line, context, fragment.width, fragment.fromLine + idx, true);
        contentEl.appendChild(lineEl);
      });
      fragmentEl.appendChild(contentEl);

      return fragmentEl;
    } catch (error) {
      console.error('[DomPainter] List item fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  private renderImageFragment(fragment: ImageFragment, context: FragmentRenderContext): HTMLElement {
    try {
      const lookup = this.blockLookup.get(fragment.blockId);
      if (!lookup || lookup.block.kind !== 'image' || lookup.measure.kind !== 'image') {
        throw new Error(`DomPainter: missing image block for fragment ${fragment.blockId}`);
      }

      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }

      const block = lookup.block as ImageBlock;

      const fragmentEl = this.doc.createElement('div');
      fragmentEl.classList.add(CLASS_NAMES.fragment, 'superdoc-image-fragment');
      applyStyles(fragmentEl, fragmentStyles);
      this.applyFragmentFrame(fragmentEl, fragment, context.section);
      fragmentEl.style.height = `${fragment.height}px`;
      this.applySdtDataset(fragmentEl, block.attrs?.sdt);
      this.applyContainerSdtDataset(fragmentEl, block.attrs?.containerSdt);

      // Apply z-index for anchored images
      if (fragment.isAnchored && fragment.zIndex != null) {
        fragmentEl.style.zIndex = String(fragment.zIndex);
      }

      // Add block ID for PM transaction targeting
      if (block.id) {
        fragmentEl.setAttribute('data-sd-block-id', block.id);
      }

      // Add PM position markers for transaction targeting
      if (fragment.pmStart != null) {
        fragmentEl.dataset.pmStart = String(fragment.pmStart);
      }
      if (fragment.pmEnd != null) {
        fragmentEl.dataset.pmEnd = String(fragment.pmEnd);
      }

      // Add metadata for interactive image resizing (skip watermarks - they should not be interactive)
      if (fragment.metadata && !block.attrs?.vmlWatermark) {
        fragmentEl.setAttribute('data-image-metadata', JSON.stringify(fragment.metadata));
      }

      // behindDoc images are supported via z-index; suppress noisy debug logs

      const img = this.doc.createElement('img');
      if (block.src) {
        img.src = block.src;
      }
      img.alt = block.alt ?? '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = block.objectFit ?? 'contain';
      // MS Word anchors stretched images to top-left, clipping from right/bottom
      if (block.objectFit === 'cover') {
        img.style.objectPosition = 'left top';
      }
      img.style.display = block.display === 'inline' ? 'inline-block' : 'block';

      // Apply VML image adjustments (gain/blacklevel) as CSS filters for watermark effects
      // conversion formulas calculated based on Libreoffice vml reader
      // https://github.com/LibreOffice/core/blob/951a74d047cfddff78014225f55ecb2bbdcd9c4c/oox/source/vml/vmlshapecontext.cxx#L465C13-L493C1
      const filters: string[] = [];
      if (block.gain != null || block.blacklevel != null) {
        // Convert VML gain to CSS contrast
        // VML gain is a hex string like "19661f" - higher = more contrast
        if (block.gain && typeof block.gain === 'string' && block.gain.endsWith('f')) {
          const contrast = Math.max(0, parseInt(block.gain) / 65536) * (2 / 3); // 2/3 factor based on visual comparison.
          if (contrast > 0) {
            filters.push(`contrast(${contrast})`);
          }
        }

        // Convert VML blacklevel (brightness) to CSS brightness
        // VML blacklevel is a hex string like "22938f" - lower = less brightness
        if (block.blacklevel && typeof block.blacklevel === 'string' && block.blacklevel.endsWith('f')) {
          const brightness = Math.max(0, 1 + parseInt(block.blacklevel) / 327 / 100) * 1.3; // 1.3 factor added based on visual comparison.
          if (brightness > 0) {
            filters.push(`brightness(${brightness})`);
          }
        }

        if (filters.length > 0) {
          img.style.filter = filters.join(' ');
        }
      }
      fragmentEl.appendChild(img);

      return fragmentEl;
    } catch (error) {
      console.error('[DomPainter] Image fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  private renderDrawingFragment(fragment: DrawingFragment, context: FragmentRenderContext): HTMLElement {
    try {
      const lookup = this.blockLookup.get(fragment.blockId);
      if (!lookup || lookup.block.kind !== 'drawing' || lookup.measure.kind !== 'drawing') {
        throw new Error(`DomPainter: missing drawing block for fragment ${fragment.blockId}`);
      }
      if (!this.doc) {
        throw new Error('DomPainter: document is not available');
      }

      const block = lookup.block as DrawingBlock;
      const isVectorShapeBlock = block.kind === 'drawing' && block.drawingKind === 'vectorShape';

      const fragmentEl = this.doc.createElement('div');
      fragmentEl.classList.add(CLASS_NAMES.fragment, 'superdoc-drawing-fragment');
      applyStyles(fragmentEl, fragmentStyles);
      this.applyFragmentFrame(fragmentEl, fragment, context.section);
      fragmentEl.style.height = `${fragment.height}px`;
      fragmentEl.style.position = 'absolute';
      fragmentEl.style.overflow = 'hidden';

      if (fragment.isAnchored && fragment.zIndex != null) {
        fragmentEl.style.zIndex = String(fragment.zIndex);
      }

      const innerWrapper = this.doc.createElement('div');
      innerWrapper.classList.add('superdoc-drawing-inner');
      innerWrapper.style.position = 'absolute';
      innerWrapper.style.left = '50%';
      innerWrapper.style.top = '50%';
      innerWrapper.style.width = `${fragment.geometry.width}px`;
      innerWrapper.style.height = `${fragment.geometry.height}px`;
      innerWrapper.style.transformOrigin = 'center';

      const scale = fragment.scale ?? 1;
      const transforms: string[] = ['translate(-50%, -50%)'];
      if (!isVectorShapeBlock) {
        transforms.push(`rotate(${fragment.geometry.rotation ?? 0}deg)`);
        transforms.push(`scaleX(${fragment.geometry.flipH ? -1 : 1})`);
        transforms.push(`scaleY(${fragment.geometry.flipV ? -1 : 1})`);
      }
      transforms.push(`scale(${scale})`);
      innerWrapper.style.transform = transforms.join(' ');

      innerWrapper.appendChild(this.renderDrawingContent(block, fragment, context));
      fragmentEl.appendChild(innerWrapper);

      return fragmentEl;
    } catch (error) {
      console.error('[DomPainter] Drawing fragment rendering failed:', { fragment, error });
      return this.createErrorPlaceholder(fragment.blockId, error);
    }
  }

  private renderDrawingContent(
    block: DrawingBlock,
    fragment: DrawingFragment,
    context?: FragmentRenderContext,
  ): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }
    if (block.drawingKind === 'image') {
      return this.createDrawingImageElement(block);
    }
    if (block.drawingKind === 'vectorShape') {
      return this.createVectorShapeElement(block, fragment.geometry, true, 1, 1, context);
    }
    if (block.drawingKind === 'shapeGroup') {
      return this.createShapeGroupElement(block, context);
    }
    return this.createDrawingPlaceholder();
  }

  private createDrawingImageElement(block: DrawingBlock): HTMLElement {
    const drawing = block as ImageDrawing;
    const img = this.doc!.createElement('img');
    img.classList.add('superdoc-drawing-image');
    if (drawing.src) {
      img.src = drawing.src;
    }
    img.alt = drawing.alt ?? '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = drawing.objectFit ?? 'contain';
    // MS Word anchors stretched images to top-left, clipping from right/bottom
    if (drawing.objectFit === 'cover') {
      img.style.objectPosition = 'left top';
    }
    img.style.display = 'block';
    return img;
  }

  private createVectorShapeElement(
    block: VectorShapeDrawingWithEffects,
    geometry?: DrawingGeometry,
    applyTransforms = false,
    groupScaleX = 1,
    groupScaleY = 1,
    context?: FragmentRenderContext,
  ): HTMLElement {
    const container = this.doc!.createElement('div');
    container.classList.add('superdoc-vector-shape');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    const { offsetX, offsetY, innerWidth, innerHeight } = this.getEffectExtentMetrics(block, geometry);
    const contentContainer = this.doc!.createElement('div');
    contentContainer.style.position = 'absolute';
    contentContainer.style.left = `${offsetX}px`;
    contentContainer.style.top = `${offsetY}px`;
    contentContainer.style.width = `${innerWidth}px`;
    contentContainer.style.height = `${innerHeight}px`;

    const svgMarkup = block.shapeKind ? this.tryCreatePresetSvg(block, innerWidth, innerHeight) : null;
    if (svgMarkup) {
      const svgElement = this.parseSafeSvg(svgMarkup);
      if (svgElement) {
        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
        svgElement.style.display = 'block';

        // Apply gradient fill if present
        if (block.fillColor && typeof block.fillColor === 'object') {
          if ('type' in block.fillColor && block.fillColor.type === 'gradient') {
            applyGradientToSVG(svgElement, block.fillColor as GradientFill);
          } else if ('type' in block.fillColor && block.fillColor.type === 'solidWithAlpha') {
            applyAlphaToSVG(svgElement, block.fillColor as SolidFillWithAlpha);
          }
        }

        this.applyLineEnds(svgElement, block);
        if (applyTransforms && geometry) {
          this.applyVectorShapeTransforms(svgElement, geometry);
        }
        contentContainer.appendChild(svgElement);

        // Apply text content as an overlay div (not inside SVG to avoid viewBox scaling)
        if (block.textContent && block.textContent.parts.length > 0) {
          const textDiv = this.createFallbackTextElement(
            block.textContent,
            block.textAlign ?? 'center',
            block.textVerticalAlign,
            block.textInsets,
            groupScaleX,
            groupScaleY,
            context,
          );
          contentContainer.appendChild(textDiv);
        }

        container.appendChild(contentContainer);
        return container;
      }
    }

    // Fallback rendering when no preset shape SVG is available
    this.applyFallbackShapeStyle(contentContainer, block);

    // Apply text content to fallback rendering
    if (block.textContent && block.textContent.parts.length > 0) {
      const textDiv = this.createFallbackTextElement(
        block.textContent,
        block.textAlign ?? 'center',
        block.textVerticalAlign,
        block.textInsets,
        groupScaleX,
        groupScaleY,
        context,
      );
      contentContainer.appendChild(textDiv);
    }

    if (applyTransforms && geometry) {
      this.applyVectorShapeTransforms(contentContainer, geometry);
    }
    container.appendChild(contentContainer);
    return container;
  }

  /**
   * Apply fill and stroke styles to a fallback shape container
   */
  private applyFallbackShapeStyle(container: HTMLElement, block: VectorShapeDrawing): void {
    // Handle fill color
    if (block.fillColor === null) {
      container.style.background = 'none';
    } else if (typeof block.fillColor === 'string') {
      container.style.background = block.fillColor;
    } else if (typeof block.fillColor === 'object' && 'type' in block.fillColor) {
      if (block.fillColor.type === 'solidWithAlpha') {
        const alpha = (block.fillColor as SolidFillWithAlpha).alpha;
        const color = (block.fillColor as SolidFillWithAlpha).color;
        container.style.background = color;
        container.style.opacity = alpha.toString();
      } else if (block.fillColor.type === 'gradient') {
        // For CSS gradients in fallback, we'd need to convert
        // For now, use a placeholder color
        container.style.background = 'rgba(15, 23, 42, 0.1)';
      }
    } else {
      container.style.background = 'rgba(15, 23, 42, 0.1)';
    }

    // Handle stroke color
    if (block.strokeColor === null) {
      container.style.border = 'none';
    } else if (typeof block.strokeColor === 'string') {
      const strokeWidth = block.strokeWidth ?? 1;
      container.style.border = `${strokeWidth}px solid ${block.strokeColor}`;
    } else {
      container.style.border = '1px solid rgba(15, 23, 42, 0.3)';
    }
  }

  /**
   * Create a fallback text element for shapes without SVG
   * @param textContent - Text content with formatting
   * @param textAlign - Horizontal text alignment
   * @param textVerticalAlign - Vertical text alignment (top, center, bottom)
   * @param textInsets - Text insets in pixels (top, right, bottom, left)
   * @param groupScaleX - Scale factor applied by parent group (for counter-scaling)
   * @param groupScaleY - Scale factor applied by parent group (for counter-scaling)
   */
  private createFallbackTextElement(
    textContent: ShapeTextContent,
    textAlign: string,
    textVerticalAlign?: 'top' | 'center' | 'bottom',
    textInsets?: { top: number; right: number; bottom: number; left: number },
    groupScaleX = 1,
    groupScaleY = 1,
    context?: FragmentRenderContext,
  ): HTMLElement {
    const textDiv = this.doc!.createElement('div');
    textDiv.style.position = 'absolute';
    textDiv.style.top = '0';
    textDiv.style.left = '0';
    textDiv.style.width = '100%';
    textDiv.style.height = '100%';
    textDiv.style.display = 'flex';
    textDiv.style.flexDirection = 'column';

    // Use extracted vertical alignment or default to top per OOXML spec
    // In flex-direction: column, justifyContent controls vertical (main axis)
    const verticalAlign = textVerticalAlign ?? 'top';
    if (verticalAlign === 'top') {
      textDiv.style.justifyContent = 'flex-start';
    } else if (verticalAlign === 'bottom') {
      textDiv.style.justifyContent = 'flex-end';
    } else {
      textDiv.style.justifyContent = 'center';
    }

    // Use extracted text insets or default to 10px all around
    if (textInsets) {
      textDiv.style.padding = `${textInsets.top}px ${textInsets.right}px ${textInsets.bottom}px ${textInsets.left}px`;
    } else {
      textDiv.style.padding = '10px';
    }

    textDiv.style.boxSizing = 'border-box';
    textDiv.style.wordWrap = 'break-word';
    textDiv.style.overflowWrap = 'break-word';
    textDiv.style.overflow = 'hidden';
    // min-width: 0 allows flex container to shrink below content size for text wrapping
    textDiv.style.minWidth = '0';
    // Set explicit base font-size to prevent CSS inheritance issues
    // Individual spans will override with their own sizes from textContent.parts
    textDiv.style.fontSize = '12px';
    textDiv.style.lineHeight = '1.2';

    // Apply counter-scaling to prevent text from being stretched by parent group transform
    if (groupScaleX !== 1 || groupScaleY !== 1) {
      const counterScaleX = 1 / groupScaleX;
      const counterScaleY = 1 / groupScaleY;
      textDiv.style.transform = `scale(${counterScaleX}, ${counterScaleY})`;
      textDiv.style.transformOrigin = 'top left';
      // Adjust dimensions to compensate for counter-scaling
      textDiv.style.width = `${100 * groupScaleX}%`;
      textDiv.style.height = `${100 * groupScaleY}%`;
    }

    // Horizontal text alignment uses CSS text-align property
    // Note: justifyContent is already set above for vertical alignment
    if (textAlign === 'center') {
      textDiv.style.textAlign = 'center';
    } else if (textAlign === 'right' || textAlign === 'r') {
      textDiv.style.textAlign = 'right';
    } else {
      textDiv.style.textAlign = 'left';
    }

    // Create paragraphs by splitting on line breaks
    let currentParagraph = this.doc!.createElement('div');
    // Set width to 100% to enable text wrapping within the shape bounds
    currentParagraph.style.width = '100%';
    // min-width: 0 prevents flex item from overflowing (flexbox default is min-width: auto)
    currentParagraph.style.minWidth = '0';
    // Override inherited white-space: pre from parent fragment to allow text wrapping
    currentParagraph.style.whiteSpace = 'normal';

    const resolvePartText = (part: ShapeTextContent['parts'][number]) => {
      if (part.fieldType === 'PAGE') {
        return context?.pageNumberText ?? String(context?.pageNumber ?? 1);
      }
      if (part.fieldType === 'NUMPAGES') {
        return String(context?.totalPages ?? 1);
      }
      return part.text;
    };

    textContent.parts.forEach((part) => {
      if (part.isLineBreak) {
        // Finish current paragraph and start a new one
        textDiv.appendChild(currentParagraph);
        currentParagraph = this.doc!.createElement('div');
        currentParagraph.style.width = '100%';
        currentParagraph.style.minWidth = '0';
        currentParagraph.style.whiteSpace = 'normal';
        // Empty paragraphs create extra spacing (blank line)
        if (part.isEmptyParagraph) {
          currentParagraph.style.minHeight = '1em';
        }
      } else {
        const span = this.doc!.createElement('span');
        span.textContent = resolvePartText(part);
        if (part.formatting) {
          if (part.formatting.bold) {
            span.style.fontWeight = 'bold';
          }
          if (part.formatting.italic) {
            span.style.fontStyle = 'italic';
          }
          if (part.formatting.fontFamily) {
            span.style.fontFamily = part.formatting.fontFamily;
          }
          if (part.formatting.color) {
            // Validate and normalize color format (handles both with and without # prefix)
            const validatedColor = validateHexColor(part.formatting.color);
            if (validatedColor) {
              span.style.color = validatedColor;
            }
          }
          if (part.formatting.fontSize) {
            span.style.fontSize = `${part.formatting.fontSize}px`;
          }
        }
        currentParagraph.appendChild(span);
      }
    });

    // Add the final paragraph
    textDiv.appendChild(currentParagraph);

    return textDiv;
  }

  private tryCreatePresetSvg(
    block: VectorShapeDrawing,
    widthOverride?: number,
    heightOverride?: number,
  ): string | null {
    try {
      // For preset shapes, we need to pass string colors only
      // Gradients and alpha will be applied after SVG is created
      // null means explicitly "no fill" (from <a:noFill/> or fillRef idx="0"), so use 'none'
      // undefined means no explicit fill, so we let the preset library use its default
      let fillColor: string | undefined;
      if (block.fillColor === null) {
        fillColor = 'none';
      } else if (typeof block.fillColor === 'string') {
        fillColor = block.fillColor;
      }
      const strokeColor =
        block.strokeColor === null ? 'none' : typeof block.strokeColor === 'string' ? block.strokeColor : undefined;

      // Special case: handle line-like shapes directly since getPresetShapeSvg doesn't support them well
      if (block.shapeKind === 'line' || block.shapeKind === 'straightConnector1') {
        const width = widthOverride ?? block.geometry.width;
        const height = heightOverride ?? block.geometry.height;
        const stroke = strokeColor ?? '#000000';
        const strokeWidth = block.strokeWidth ?? 1;

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="${stroke}" stroke-width="${strokeWidth}" />
</svg>`;
      }

      return getPresetShapeSvg({
        preset: block.shapeKind ?? '',
        styleOverrides: () => ({
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: block.strokeWidth ?? undefined,
        }),
        width: widthOverride ?? block.geometry.width,
        height: heightOverride ?? block.geometry.height,
      });
    } catch (error) {
      console.warn(`[DomPainter] Unable to render preset shape "${block.shapeKind}":`, error);
      return null;
    }
  }

  private parseSafeSvg(markup: string): SVGElement | null {
    const DOMParserCtor = this.doc?.defaultView?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!DOMParserCtor) {
      return null;
    }
    const parser = new DOMParserCtor();
    const parsed = parser.parseFromString(markup, 'image/svg+xml');
    if (!parsed || parsed.getElementsByTagName('parsererror').length > 0) {
      return null;
    }
    // documentElement might be HTMLElement or Element, use type guard via unknown
    const svgElement = parsed.documentElement as unknown as SVGElement | null;
    if (!svgElement) return null;
    this.stripUnsafeSvgContent(svgElement);
    // Safe cast: importNode preserves the element type, and we've verified it's an SVGElement
    const imported = this.doc?.importNode(svgElement, true);
    return imported ? (imported as unknown as SVGElement) : null;
  }

  private stripUnsafeSvgContent(element: Element): void {
    element.querySelectorAll('script').forEach((script) => script.remove());
    const sanitize = (node: Element) => {
      Array.from(node.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith('on')) {
          node.removeAttribute(attr.name);
        }
      });
      Array.from(node.children).forEach((child) => {
        sanitize(child as Element);
      });
    };
    sanitize(element);
  }

  private getEffectExtentMetrics(
    block: VectorShapeDrawingWithEffects,
    geometry?: DrawingGeometry,
  ): {
    offsetX: number;
    offsetY: number;
    innerWidth: number;
    innerHeight: number;
  } {
    const left = block.effectExtent?.left ?? 0;
    const top = block.effectExtent?.top ?? 0;
    const right = block.effectExtent?.right ?? 0;
    const bottom = block.effectExtent?.bottom ?? 0;
    const sourceGeometry = geometry ?? block.geometry;
    const width = sourceGeometry.width ?? 0;
    const height = sourceGeometry.height ?? 0;
    const innerWidth = Math.max(0, width - left - right);
    const innerHeight = Math.max(0, height - top - bottom);
    return { offsetX: left, offsetY: top, innerWidth, innerHeight };
  }

  private applyLineEnds(svgElement: SVGElement, block: VectorShapeDrawingWithEffects): void {
    const lineEnds = block.lineEnds;
    if (!lineEnds) return;
    if (block.strokeColor === null) return;
    const strokeColor = typeof block.strokeColor === 'string' ? block.strokeColor : '#000000';
    const strokeWidth = block.strokeWidth ?? 1;
    if (strokeWidth <= 0) return;

    const target = this.findLineEndTarget(svgElement);
    if (!target) return;

    const defs = this.ensureSvgDefs(svgElement);
    const baseId = this.sanitizeSvgId(`sd-line-${block.id}`);

    if (lineEnds.tail) {
      const id = `${baseId}-tail`;
      this.appendLineEndMarker(
        defs,
        id,
        lineEnds.tail,
        strokeColor,
        strokeWidth,
        true,
        block.effectExtent ?? undefined,
      );
      target.setAttribute('marker-start', `url(#${id})`);
    }

    if (lineEnds.head) {
      const id = `${baseId}-head`;
      this.appendLineEndMarker(
        defs,
        id,
        lineEnds.head,
        strokeColor,
        strokeWidth,
        false,
        block.effectExtent ?? undefined,
      );
      target.setAttribute('marker-end', `url(#${id})`);
    }
  }

  private findLineEndTarget(svgElement: SVGElement): SVGElement | null {
    const line = svgElement.querySelector('line');
    if (line) return line as SVGElement;
    const path = svgElement.querySelector('path');
    if (path) return path as SVGElement;
    const polyline = svgElement.querySelector('polyline');
    return polyline as SVGElement | null;
  }

  private ensureSvgDefs(svgElement: SVGElement): SVGDefsElement {
    const existing = svgElement.querySelector('defs');
    if (existing) return existing as SVGDefsElement;
    const defs = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgElement.insertBefore(defs, svgElement.firstChild);
    return defs;
  }

  private appendLineEndMarker(
    defs: SVGDefsElement,
    id: string,
    lineEnd: LineEnd,
    strokeColor: string,
    _strokeWidth: number,
    isStart: boolean,
    effectExtent?: EffectExtent,
  ): void {
    if (defs.querySelector(`#${id}`)) return;

    const marker = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('orient', 'auto');

    const sizeScale = (value?: string): number => {
      if (value === 'sm') return 0.75;
      if (value === 'lg') return 1.25;
      return 1;
    };
    const effectMax = effectExtent
      ? Math.max(effectExtent.left ?? 0, effectExtent.right ?? 0, effectExtent.top ?? 0, effectExtent.bottom ?? 0)
      : 0;
    const useEffectExtent = Number.isFinite(effectMax) && effectMax > 0;
    const markerWidth = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.length);
    const markerHeight = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.width);
    marker.setAttribute('markerUnits', useEffectExtent ? 'userSpaceOnUse' : 'strokeWidth');
    marker.setAttribute('markerWidth', markerWidth.toString());
    marker.setAttribute('markerHeight', markerHeight.toString());
    marker.setAttribute('refX', isStart ? '0' : '10');
    marker.setAttribute('refY', '5');

    const shape = this.createLineEndShape(lineEnd.type ?? 'triangle', strokeColor, isStart);
    marker.appendChild(shape);
    defs.appendChild(marker);
  }

  private createLineEndShape(type: string, strokeColor: string, isStart: boolean): SVGElement {
    const normalized = type.toLowerCase();
    if (normalized === 'diamond') {
      const path = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0 5 L 5 0 L 10 5 L 5 10 Z');
      path.setAttribute('fill', strokeColor);
      path.setAttribute('stroke', 'none');
      return path;
    }
    if (normalized === 'oval') {
      const circle = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '5');
      circle.setAttribute('cy', '5');
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', strokeColor);
      circle.setAttribute('stroke', 'none');
      return circle;
    }

    const path = this.doc!.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = isStart ? 'M 10 0 L 0 5 L 10 10 Z' : 'M 0 0 L 10 5 L 0 10 Z';
    path.setAttribute('d', d);
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    return path;
  }

  private sanitizeSvgId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private applyVectorShapeTransforms(target: HTMLElement | SVGElement, geometry: DrawingGeometry): void {
    const transforms: string[] = [];
    if (geometry.rotation) {
      transforms.push(`rotate(${geometry.rotation}deg)`);
    }
    if (geometry.flipH) {
      transforms.push('scaleX(-1)');
    }
    if (geometry.flipV) {
      transforms.push('scaleY(-1)');
    }
    if (transforms.length > 0) {
      target.style.transformOrigin = 'center';
      target.style.transform = transforms.join(' ');
    } else {
      target.style.removeProperty('transform');
      target.style.removeProperty('transform-origin');
    }
  }

  private createShapeGroupElement(block: ShapeGroupDrawing, context?: FragmentRenderContext): HTMLElement {
    const groupEl = this.doc!.createElement('div');
    groupEl.classList.add('superdoc-shape-group');
    groupEl.style.position = 'relative';
    groupEl.style.width = '100%';
    groupEl.style.height = '100%';

    const groupTransform = block.groupTransform;
    let contentContainer: HTMLElement = groupEl;

    // Calculate scale factors for counter-scaling text
    const groupScaleX = 1;
    const groupScaleY = 1;

    if (groupTransform) {
      const inner = this.doc!.createElement('div');
      inner.style.position = 'absolute';
      inner.style.left = '0';
      inner.style.top = '0';
      const childWidth = groupTransform.childWidth ?? groupTransform.width ?? block.geometry.width ?? 0;
      const childHeight = groupTransform.childHeight ?? groupTransform.height ?? block.geometry.height ?? 0;
      inner.style.width = `${Math.max(1, childWidth)}px`;
      inner.style.height = `${Math.max(1, childHeight)}px`;
      const transforms: string[] = [];
      const offsetX = groupTransform.childX ?? 0;
      const offsetY = groupTransform.childY ?? 0;
      if (offsetX || offsetY) {
        transforms.push(`translate(${-offsetX}px, ${-offsetY}px)`);
      }
      if (transforms.length > 0) {
        inner.style.transformOrigin = 'top left';
        inner.style.transform = transforms.join(' ');
      }
      groupEl.appendChild(inner);
      contentContainer = inner;
    }

    block.shapes.forEach((child) => {
      const childContent = this.createGroupChildContent(child, groupScaleX, groupScaleY, context);
      if (!childContent) return;
      const attrs = (child as ShapeGroupChild).attrs ?? {};
      const wrapper = this.doc!.createElement('div');
      wrapper.classList.add('superdoc-shape-group__child');
      wrapper.style.position = 'absolute';
      wrapper.style.left = `${attrs.x ?? 0}px`;
      wrapper.style.top = `${attrs.y ?? 0}px`;
      const childWidthValue = typeof attrs.width === 'number' ? attrs.width : block.geometry.width;
      const childHeightValue = typeof attrs.height === 'number' ? attrs.height : block.geometry.height;
      wrapper.style.width = `${Math.max(1, childWidthValue)}px`;
      wrapper.style.height = `${Math.max(1, childHeightValue)}px`;
      wrapper.style.transformOrigin = 'center';
      const transforms: string[] = [];
      if (attrs.rotation) {
        transforms.push(`rotate(${attrs.rotation}deg)`);
      }
      if (attrs.flipH) {
        transforms.push('scaleX(-1)');
      }
      if (attrs.flipV) {
        transforms.push('scaleY(-1)');
      }
      if (transforms.length > 0) {
        wrapper.style.transform = transforms.join(' ');
      }
      childContent.style.width = '100%';
      childContent.style.height = '100%';
      wrapper.appendChild(childContent);
      contentContainer.appendChild(wrapper);
    });

    return groupEl;
  }

  private createGroupChildContent(
    child: ShapeGroupChild,
    groupScaleX: number = 1,
    groupScaleY: number = 1,
    context?: FragmentRenderContext,
  ): HTMLElement | null {
    // Type narrowing with explicit checks to help TypeScript distinguish union members
    if (child.shapeType === 'vectorShape' && 'fillColor' in child.attrs) {
      // After this check, child should be ShapeGroupVectorChild
      const attrs = child.attrs as PositionedDrawingGeometry &
        VectorShapeStyle & {
          kind?: string;
          shapeId?: string;
          shapeName?: string;
          textContent?: ShapeTextContent;
          textAlign?: string;
          lineEnds?: LineEnds;
        };
      const childGeometry = {
        width: attrs.width ?? 0,
        height: attrs.height ?? 0,
        rotation: attrs.rotation ?? 0,
        flipH: attrs.flipH ?? false,
        flipV: attrs.flipV ?? false,
      };
      const vectorChild: VectorShapeDrawingWithEffects = {
        drawingKind: 'vectorShape',
        kind: 'drawing',
        id: `${attrs.shapeId ?? child.shapeType}`,
        geometry: childGeometry,
        padding: undefined,
        margin: undefined,
        anchor: undefined,
        wrap: undefined,
        attrs: child.attrs,
        drawingContentId: undefined,
        drawingContent: undefined,
        shapeKind: attrs.kind,
        fillColor: attrs.fillColor,
        strokeColor: attrs.strokeColor,
        strokeWidth: attrs.strokeWidth,
        lineEnds: attrs.lineEnds,
        textContent: attrs.textContent,
        textAlign: attrs.textAlign,
        textVerticalAlign: attrs.textVerticalAlign,
        textInsets: attrs.textInsets,
      };
      // Pass geometry and scale factors to ensure text overlay has correct dimensions
      return this.createVectorShapeElement(vectorChild, childGeometry, false, groupScaleX, groupScaleY, context);
    }
    if (child.shapeType === 'image' && 'src' in child.attrs) {
      // After this check, child should be ShapeGroupImageChild
      const attrs = child.attrs as PositionedDrawingGeometry & {
        src: string;
        alt?: string;
      };
      const img = this.doc!.createElement('img');
      img.src = attrs.src;
      img.alt = attrs.alt ?? '';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      return img;
    }
    return this.createDrawingPlaceholder();
  }

  private createDrawingPlaceholder(): HTMLElement {
    const placeholder = this.doc!.createElement('div');
    placeholder.classList.add('superdoc-drawing-placeholder');
    placeholder.style.width = '100%';
    placeholder.style.height = '100%';
    placeholder.style.background =
      'repeating-linear-gradient(45deg, rgba(15,23,42,0.1), rgba(15,23,42,0.1) 6px, rgba(15,23,42,0.2) 6px, rgba(15,23,42,0.2) 12px)';
    placeholder.style.border = '1px dashed rgba(15, 23, 42, 0.3)';
    return placeholder;
  }

  private renderTableFragment(
    fragment: TableFragment,
    context: FragmentRenderContext,
    sdtBoundary?: SdtBoundaryOptions,
  ): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }

    // Wrap applyFragmentFrame to capture section from context
    // This ensures table cell fragments receive proper section context for PM position validation
    const applyFragmentFrameWithSection = (el: HTMLElement, frag: Fragment): void => {
      this.applyFragmentFrame(el, frag, context.section);
    };

    // Create a wrapper for renderLine that applies Word's justification rules for table cells.
    // Word DOES justify text inside table cells, but skips justification on the last line
    // (unless the paragraph ends with a line break, which shifts the "last line" down).
    const renderLineForTableCell = (
      block: ParagraphBlock,
      line: Line,
      ctx: FragmentRenderContext,
      lineIndex: number,
      isLastLine: boolean,
    ): HTMLElement => {
      // Check if paragraph ends with a line break
      const lastRun = block.runs.length > 0 ? block.runs[block.runs.length - 1] : null;
      const paragraphEndsWithLineBreak = lastRun?.kind === 'lineBreak';

      // Skip justify only on the last line, unless the paragraph ends with a line break
      const shouldSkipJustify = isLastLine && !paragraphEndsWithLineBreak;

      return this.renderLine(block, line, ctx, undefined, lineIndex, shouldSkipJustify);
    };

    /**
     * Wrapper function for rendering drawing content inside table cells.
     *
     * This function delegates to the appropriate DomPainter methods based on the drawing kind:
     * - 'image': Creates a standard image element with src and object-fit
     * - 'shapeGroup': Creates a group container with positioned child shapes (images and vectors)
     * - 'vectorShape': Creates an SVG element for the vector shape (without geometry transforms in table cells)
     *
     * For unsupported or unrecognized drawing kinds, returns a placeholder element with diagonal stripes.
     *
     * @param block - The DrawingBlock to render
     * @returns HTMLElement representing the rendered drawing content
     *
     * @remarks
     * This wrapper is specifically designed for table cell rendering where:
     * - Vector shapes are rendered without geometry transforms (to avoid layout conflicts)
     * - The returned element will have width: 100% and height: 100% applied by the table cell renderer
     */
    const renderDrawingContentForTableCell = (block: DrawingBlock): HTMLElement => {
      if (block.drawingKind === 'image') {
        return this.createDrawingImageElement(block);
      }
      if (block.drawingKind === 'shapeGroup') {
        return this.createShapeGroupElement(block, context);
      }
      if (block.drawingKind === 'vectorShape') {
        // For vectorShapes in table cells, render without geometry transforms
        return this.createVectorShapeElement(block, block.geometry, false, 1, 1, context);
      }
      return this.createDrawingPlaceholder();
    };

    return renderTableFragmentElement({
      doc: this.doc,
      fragment,
      context,
      blockLookup: this.blockLookup,
      sdtBoundary,
      renderLine: renderLineForTableCell,
      renderDrawingContent: renderDrawingContentForTableCell,
      applyFragmentFrame: applyFragmentFrameWithSection,
      applySdtDataset: this.applySdtDataset.bind(this),
      applyStyles,
    });
  }

  /**
   * Extract link data from a run, including sanitization.
   * @returns Sanitized link data or null if invalid/missing
   */
  private extractLinkData(run: Run): LinkRenderData | null {
    if (run.kind === 'tab' || run.kind === 'image' || run.kind === 'lineBreak') {
      return null;
    }
    const link = (run as TextRun).link as FlowRunLink | undefined;
    if (!link) {
      return null;
    }
    return this.buildLinkRenderData(link);
  }

  private buildLinkRenderData(link: FlowRunLink): LinkRenderData | null {
    const dataset = buildLinkDataset(link);
    const sanitized = typeof link.href === 'string' ? sanitizeHref(link.href) : null;
    const anchorHref = normalizeAnchor(link.anchor ?? link.name ?? '');
    let href: string | null = sanitized?.href ?? anchorHref;
    if (link.version === 2) {
      href = appendDocLocation(href, link.docLocation ?? null);
    }

    // Track metrics: successful sanitization
    if (sanitized) {
      linkMetrics.sanitized++;

      // Check for homograph if hostname has non-ASCII (in raw href before URL parsing)
      if (sanitized.href && typeof link.href === 'string') {
        const hostStartIndex = link.href.indexOf('://') + 3;
        let hostEndIndex = link.href.indexOf('/', hostStartIndex);
        if (hostEndIndex === -1) {
          hostEndIndex = link.href.indexOf('?', hostStartIndex);
        }
        if (hostEndIndex === -1) {
          hostEndIndex = link.href.indexOf('#', hostStartIndex);
        }
        if (hostEndIndex === -1) {
          hostEndIndex = link.href.length;
        }
        const rawHostname = link.href.slice(hostStartIndex, hostEndIndex);
        if (rawHostname && /[^\x00-\x7F]/.test(rawHostname)) {
          linkMetrics.homographWarnings++;
        }
      }
    }

    // Defense-in-depth: Enforce maximum URL length even if sanitization was bypassed
    if (sanitized && sanitized.href.length > MAX_HREF_LENGTH) {
      console.warn(`[DomPainter] Rejecting URL exceeding ${MAX_HREF_LENGTH} characters`);
      linkMetrics.blocked++;
      return { blocked: true, dataset: { [LINK_DATASET_KEYS.blocked]: 'true' } };
    }

    if (!href) {
      if (typeof link.href === 'string' && link.href.trim()) {
        dataset[LINK_DATASET_KEYS.blocked] = 'true';
        console.warn(`[DomPainter] Blocked potentially unsafe URL: ${link.href.slice(0, 50)}`);
        linkMetrics.blocked++;
        // Track invalid protocol if sanitized was null
        if (!sanitized) {
          linkMetrics.invalidProtocol++;
        }
        return { blocked: true, dataset };
      }
      // Check if there was an anchor/name that failed validation
      const hadAnchor = (link.anchor ?? link.name ?? null) != null;
      if (Object.keys(dataset).length > 0 || hadAnchor) {
        dataset[LINK_DATASET_KEYS.blocked] = 'true';
        linkMetrics.blocked++;
        return { blocked: true, dataset };
      }
      return null;
    }

    const target = resolveLinkTarget(link, sanitized);
    const rel = resolveLinkRel(link, target);
    const tooltipSource = link.version === 2 ? (link.tooltip ?? link.title) : link.title;
    const tooltipResult = tooltipSource ? encodeTooltip(tooltipSource) : null;
    // Use raw text - browser will escape when setting attribute
    const tooltip = tooltipResult?.text ?? null;

    // Signal when tooltip is truncated
    if (tooltipResult?.wasTruncated) {
      dataset[LINK_DATASET_KEYS.truncated] = 'true';
    }

    return {
      href,
      target,
      rel,
      tooltip,
      dataset: Object.keys(dataset).length > 0 ? dataset : undefined,
      blocked: false,
    };
  }

  /**
   * Apply tooltip accessibility using aria-describedby for better screen reader support.
   * Creates a visually-hidden element containing the tooltip text and links it to the anchor.
   *
   * @param elem - The anchor element to enhance
   * @param tooltip - The tooltip text to make accessible
   * @returns The unique ID generated for this link
   */
  private applyTooltipAccessibility(elem: HTMLAnchorElement, tooltip: string | null): string {
    const linkId = `superdoc-link-${++this.linkIdCounter}`;
    elem.id = linkId;

    if (!tooltip || !this.doc) return linkId;

    // Keep title attribute for visual tooltip (browser default)
    elem.setAttribute('title', tooltip);

    // Create visually-hidden element for screen readers
    const descId = `link-desc-${linkId}`;
    const descElem = this.doc.createElement('span');
    descElem.id = descId;
    descElem.className = 'sr-only'; // Screen reader only class
    descElem.textContent = tooltip;

    // Insert description element after the link
    // Note: We'll insert it as a sibling in the parent line element
    if (elem.parentElement) {
      elem.parentElement.appendChild(descElem);
      // Reference from link only if we successfully added the description element
      elem.setAttribute('aria-describedby', descId);
    } else {
      // Element not yet in DOM - accessibility feature will degrade gracefully
      // The title attribute will still provide tooltip functionality
      console.warn('[DomPainter] Unable to add aria-describedby for tooltip (element not in DOM)');
    }

    return linkId;
  }

  /**
   * Enhance accessibility of a link element with ARIA labels and attributes.
   * Adds descriptive ARIA labels for ambiguous text and target=_blank links (WCAG 2.4.4).
   *
   * @param elem - The anchor element to enhance
   * @param linkData - Link metadata including href and target
   * @param textContent - The visible link text to analyze for ambiguity
   */
  private enhanceAccessibility(elem: HTMLAnchorElement, linkData: LinkRenderData, textContent: string): void {
    if (!linkData.href) return;

    const trimmedText = textContent.trim().toLowerCase();

    // Check if link text is ambiguous (e.g., "click here", "read more")
    if (AMBIGUOUS_LINK_PATTERNS.test(trimmedText)) {
      try {
        const url = new URL(linkData.href);
        const hostname = url.hostname.replace(/^www\./, '');

        // Generate descriptive aria-label for screen readers
        const ariaLabel = `${textContent.trim()} - ${hostname}`;
        elem.setAttribute('aria-label', ariaLabel);
        return; // Exit early since we've set the label
      } catch {
        // If URL parsing fails, add generic label
        elem.setAttribute('aria-label', `${textContent.trim()} - external link`);
        return;
      }
    }

    // Add aria-label for external links without one (indicates new tab)
    if (linkData.target === '_blank' && !elem.getAttribute('aria-label')) {
      elem.setAttribute('aria-label', `${textContent.trim()} (opens in new tab)`);
    }
  }

  /**
   * Apply link attributes to an anchor element.
   */
  private applyLinkAttributes(elem: HTMLAnchorElement, linkData: LinkRenderData): void {
    if (!linkData.href) return;
    elem.href = linkData.href;
    elem.classList.add('superdoc-link');

    if (linkData.target) {
      elem.target = linkData.target;
    } else {
      elem.removeAttribute('target');
    }
    if (linkData.rel) {
      elem.rel = linkData.rel;
    } else {
      elem.removeAttribute('rel');
    }
    if (linkData.tooltip) {
      elem.title = linkData.tooltip;
    } else {
      elem.removeAttribute('title');
    }

    // Explicitly set role for clarity (though <a> with href has implicit role="link")
    elem.setAttribute('role', 'link');

    // Ensure link is keyboard accessible (should be default for <a>, but verify)
    elem.setAttribute('tabindex', '0');

    // Note: Click handling is done via event delegation in EditorInputManager,
    // not per-element handlers. This avoids duplicate event dispatching.
  }

  /**
   * Render a single run as an HTML element (span or anchor).
   */
  /**
   * Type guard to check if a run is an image run.
   */
  private isImageRun(run: Run): run is ImageRun {
    return run.kind === 'image';
  }

  /**
   * Type guard to check if a run is a line break run.
   */
  private isLineBreakRun(run: Run): run is import('@superdoc/contracts').LineBreakRun {
    return run.kind === 'lineBreak';
  }

  /**
   * Type guard to check if a run is a break run.
   */
  private isBreakRun(run: Run): run is import('@superdoc/contracts').BreakRun {
    return run.kind === 'break';
  }

  /**
   * Type guard to check if a run is a field annotation run.
   */
  private isFieldAnnotationRun(run: Run): run is FieldAnnotationRun {
    return run.kind === 'fieldAnnotation';
  }

  private renderRun(
    run: Run,
    context: FragmentRenderContext,
    trackedConfig?: TrackedChangesRenderConfig,
  ): HTMLElement | null {
    // Handle ImageRun
    if (this.isImageRun(run)) {
      return this.renderImageRun(run);
    }

    // Handle FieldAnnotationRun - inline pill-styled form fields
    if (this.isFieldAnnotationRun(run)) {
      return this.renderFieldAnnotationRun(run);
    }

    // Handle LineBreakRun - line breaks are handled by the measurer creating new lines,
    // so we don't render anything for them in the DOM. They exist in the run array for
    // proper PM position tracking but don't need visual representation.
    if (this.isLineBreakRun(run)) {
      return null;
    }

    // Handle BreakRun - similar to LineBreakRun, breaks are handled by the measurer
    if (this.isBreakRun(run)) {
      return null;
    }

    // Handle TextRun
    if (!('text' in run) || !run.text || !this.doc) {
      return null;
    }

    const linkData = this.extractLinkData(run);
    const isActiveLink = !!(linkData && !linkData.blocked && linkData.href);
    const elem = isActiveLink ? this.doc.createElement('a') : this.doc.createElement('span');
    const text = resolveRunText(run, context);
    elem.textContent = text;

    if (linkData?.dataset) {
      applyLinkDataset(elem, linkData.dataset);
    }
    if (linkData?.blocked) {
      elem.dataset[LINK_DATASET_KEYS.blocked] = 'true';
      // For blocked links rendered as spans, set appropriate role
      elem.setAttribute('role', 'text');
      elem.setAttribute('aria-label', 'Invalid link - not clickable');
    }
    if (isActiveLink && linkData) {
      this.applyLinkAttributes(elem as HTMLAnchorElement, linkData);
      // Enhance accessibility with ARIA labels for ambiguous text
      this.enhanceAccessibility(elem as HTMLAnchorElement, linkData, text);

      // Note: Tooltip accessibility (aria-describedby) will be applied after
      // the element is added to the DOM in renderLine, since it creates a sibling element
      // Store tooltip for later processing
      if (linkData.tooltip) {
        this.pendingTooltips.set(elem, linkData.tooltip);
      }
    }

    // Pass isLink flag to skip applying inline color/decoration styles for links
    applyRunStyles(elem as HTMLElement, run, isActiveLink);
    const textRun = run as TextRun;
    const commentAnnotations = textRun.comments;
    const hasAnyComment = !!commentAnnotations?.length;
    const commentHighlight = getCommentHighlight(textRun, this.activeCommentId);

    if (commentHighlight.color && !textRun.highlight && hasAnyComment) {
      (elem as HTMLElement).style.backgroundColor = commentHighlight.color;
      // Add thin visual indicator for nested comments when outer comment is selected
      // Use box-shadow instead of border to avoid affecting text layout
      if (commentHighlight.hasNestedComments && commentHighlight.baseColor) {
        const borderColor = `${commentHighlight.baseColor}99`; // Semi-transparent for subtlety
        (elem as HTMLElement).style.boxShadow = `inset 1px 0 0 ${borderColor}, inset -1px 0 0 ${borderColor}`;
      } else {
        (elem as HTMLElement).style.boxShadow = '';
      }
    }
    // We still need to preserve the comment ids
    if (hasAnyComment) {
      elem.dataset.commentIds = commentAnnotations.map((c) => c.commentId).join(',');
      if (commentAnnotations.some((c) => c.internal)) {
        elem.dataset.commentInternal = 'true';
      }
      elem.classList.add('superdoc-comment-highlight');
    }
    // Ensure text renders above tab leaders (leaders are z-index: 0)
    elem.style.zIndex = '1';
    applyRunDataAttributes(elem as HTMLElement, (run as TextRun).dataAttrs);

    // Assert PM positions are present for cursor fallback
    assertPmPositions(run, 'paragraph text run');

    if (run.pmStart != null) elem.dataset.pmStart = String(run.pmStart);
    if (run.pmEnd != null) elem.dataset.pmEnd = String(run.pmEnd);
    elem.dataset.layoutEpoch = String(this.layoutEpoch);
    if (trackedConfig) {
      this.applyTrackedChangeDecorations(elem, run, trackedConfig);
    }
    this.applySdtDataset(elem, (run as TextRun).sdt);

    return elem;
  }

  /**
   * Renders an ImageRun as an inline <img> element.
   *
   * SECURITY NOTES:
   * - Data URLs are validated against VALID_IMAGE_DATA_URL regex to ensure proper format
   * - Size limit (MAX_DATA_URL_LENGTH) prevents DoS attacks from extremely large images
   * - Only allows safe image MIME types (png, jpeg, gif, etc.) with base64 encoding
   * - Non-data URLs are sanitized through sanitizeUrl to prevent XSS
   *
   * METADATA ATTRIBUTE:
   * - Adds `data-image-metadata` attribute to enable interactive resizing via ImageResizeOverlay
   * - Metadata includes: originalWidth, originalHeight, aspectRatio, min/max dimensions
   * - Only added when run.width > 0 && run.height > 0 to prevent invalid metadata
   * - Max dimensions: 3x original size or 1000px (whichever is larger)
   * - Min dimensions: 20px to ensure visibility and interactivity
   *
   * @param run - The ImageRun to render containing image source, dimensions, and spacing
   * @returns HTMLElement (img) or null if src is missing or invalid
   *
   * @example
   * ```typescript
   * // Valid data URL with metadata
   * renderImageRun({ kind: 'image', src: 'data:image/png;base64,iVBORw...', width: 100, height: 100 })
   * // Returns: <img> element with data-image-metadata attribute
   *
   * // Invalid dimensions - no metadata
   * renderImageRun({ kind: 'image', src: 'data:image/png;base64,iVBORw...', width: 0, height: 0 })
   * // Returns: <img> element WITHOUT data-image-metadata attribute
   *
   * // Invalid MIME type
   * renderImageRun({ kind: 'image', src: 'data:text/html;base64,PHNjcmlwdD4...', width: 100, height: 100 })
   * // Returns: null (blocked)
   *
   * // HTTP URL
   * renderImageRun({ kind: 'image', src: 'https://example.com/image.png', width: 100, height: 100 })
   * // Returns: <img> element (after sanitization) with data-image-metadata attribute
   * ```
   */
  private renderImageRun(run: ImageRun): HTMLElement | null {
    if (!this.doc || !run.src) {
      return null;
    }

    // Create img element
    const img = this.doc.createElement('img');
    img.classList.add('superdoc-inline-image');

    // Set source - validate data URLs with strict format and size checks
    // Note: data: URLs are blocked by sanitizeUrl for hyperlinks (XSS risk),
    // but are safe for <img> elements when properly validated
    const isDataUrl = typeof run.src === 'string' && run.src.startsWith('data:');
    if (isDataUrl) {
      // SECURITY: Validate data URL format and size
      if (run.src.length > MAX_DATA_URL_LENGTH) {
        // Reject data URLs that are too large (DoS prevention)
        return null;
      }
      if (!VALID_IMAGE_DATA_URL.test(run.src)) {
        // Reject data URLs with invalid MIME types or encoding
        return null;
      }
      img.src = run.src;
    } else {
      const sanitized = sanitizeUrl(run.src);
      if (sanitized) {
        img.src = sanitized;
      } else {
        // Invalid URL - return null
        return null;
      }
    }

    // Set dimensions
    img.width = run.width;
    img.height = run.height;

    // Add metadata for interactive image resizing (inline images)
    // Only add metadata if dimensions are valid (positive, non-zero values)
    if (run.width > 0 && run.height > 0) {
      // This enables the ImageResizeOverlay to work with inline images
      const aspectRatio = run.width / run.height;
      const inlineImageMetadata = {
        originalWidth: run.width,
        originalHeight: run.height,
        // Max dimensions: MAX_RESIZE_MULTIPLIER x original size or FALLBACK_MAX_DIMENSION, whichever is larger
        // This provides generous constraints while preventing excessive scaling
        maxWidth: Math.max(run.width * MAX_RESIZE_MULTIPLIER, FALLBACK_MAX_DIMENSION),
        maxHeight: Math.max(run.height * MAX_RESIZE_MULTIPLIER, FALLBACK_MAX_DIMENSION),
        aspectRatio,
        // Min dimensions: MIN_IMAGE_DIMENSION to ensure images remain visible and interactive
        minWidth: MIN_IMAGE_DIMENSION,
        minHeight: MIN_IMAGE_DIMENSION,
      };
      img.setAttribute('data-image-metadata', JSON.stringify(inlineImageMetadata));
    }

    // Set alt text (required for accessibility)
    img.alt = run.alt ?? '';

    // Set title if present
    if (run.title) {
      img.title = run.title;
    }

    // Apply inline-block display
    img.style.display = 'inline-block';

    // Apply vertical alignment (bottom-aligned to text baseline)
    img.style.verticalAlign = run.verticalAlign ?? 'bottom';

    // Apply spacing as CSS margins
    if (run.distTop) {
      img.style.marginTop = `${run.distTop}px`;
    }
    if (run.distBottom) {
      img.style.marginBottom = `${run.distBottom}px`;
    }
    if (run.distLeft) {
      img.style.marginLeft = `${run.distLeft}px`;
    }
    if (run.distRight) {
      img.style.marginRight = `${run.distRight}px`;
    }

    // Apply z-index to render above tab leaders
    img.style.zIndex = '1';

    // Assert PM positions are present for cursor fallback
    assertPmPositions(run, 'inline image run');

    // Apply PM position tracking for cursor placement
    if (run.pmStart != null) {
      img.dataset.pmStart = String(run.pmStart);
    }
    if (run.pmEnd != null) {
      img.dataset.pmEnd = String(run.pmEnd);
    }
    img.dataset.layoutEpoch = String(this.layoutEpoch);

    // Apply SDT metadata
    this.applySdtDataset(img, run.sdt);

    // Apply data attributes
    if (run.dataAttrs) {
      applyRunDataAttributes(img, run.dataAttrs);
    }

    return img;
  }

  /**
   * Renders a FieldAnnotationRun as an inline "pill" element matching super-editor's visual appearance.
   *
   * Field annotations are styled inline elements that display form fields with:
   * - Outer span with border, border-radius, padding, and background color
   * - Inner span containing the displayLabel or type-specific content (image, link, etc.)
   *
   * @param run - The FieldAnnotationRun to render containing field configuration and styling
   * @returns HTMLElement (span) or null if document is not available
   *
   * @example
   * ```typescript
   * // Text variant
   * renderFieldAnnotationRun({ kind: 'fieldAnnotation', variant: 'text', displayLabel: 'Full Name', fieldColor: '#980043' })
   * // Returns: <span class="annotation" style="border: 2px solid #b015b3; ..."><span class="annotation-content">Full Name</span></span>
   *
   * // Image variant with imageSrc
   * renderFieldAnnotationRun({ kind: 'fieldAnnotation', variant: 'image', displayLabel: 'Photo', imageSrc: 'data:image/png;...' })
   * // Returns: <span class="annotation"><span class="annotation-content"><img src="..." /></span></span>
   *
   * // Link variant
   * renderFieldAnnotationRun({ kind: 'fieldAnnotation', variant: 'link', displayLabel: 'Website', linkUrl: 'https://example.com' })
   * // Returns: <span class="annotation"><span class="annotation-content"><a href="...">https://example.com</a></span></span>
   * ```
   */
  private renderFieldAnnotationRun(run: FieldAnnotationRun): HTMLElement | null {
    if (!this.doc) {
      return null;
    }

    // Handle hidden fields
    if (run.hidden) {
      const hidden = this.doc.createElement('span');
      hidden.style.display = 'none';
      if (run.pmStart != null) hidden.dataset.pmStart = String(run.pmStart);
      if (run.pmEnd != null) hidden.dataset.pmEnd = String(run.pmEnd);
      hidden.dataset.layoutEpoch = String(this.layoutEpoch);
      return hidden;
    }

    // Default styling values (matching super-editor's FieldAnnotationView)
    const defaultBorderColor = '#b015b3';
    const defaultFieldColor = '#980043';

    // Create outer annotation wrapper
    const annotation = this.doc.createElement('span');
    annotation.classList.add('annotation');
    annotation.setAttribute('aria-label', 'Field annotation');

    // Apply pill styling (unless highlighted is explicitly false)
    const showHighlight = run.highlighted !== false;
    if (showHighlight) {
      const borderColor = run.borderColor || defaultBorderColor;
      annotation.style.border = `2px solid ${borderColor}`;
      annotation.style.borderRadius = '2px';
      annotation.style.padding = '1px 2px';
      annotation.style.boxSizing = 'border-box';

      // Apply background color with alpha
      const fieldColor = run.fieldColor || defaultFieldColor;
      // Add alpha to make it semi-transparent (matching super-editor's behavior)
      const bgColor = fieldColor.length === 7 ? `${fieldColor}33` : fieldColor;
      // textHighlight takes precedence over fieldColor
      if (run.textHighlight) {
        annotation.style.backgroundColor = run.textHighlight;
      } else {
        annotation.style.backgroundColor = bgColor;
      }
    }

    // Apply visibility
    if (run.visibility === 'hidden') {
      annotation.style.visibility = 'hidden';
    }

    // Apply explicit size if present
    if (run.size) {
      if (run.size.width) {
        const requiresImage = run.variant === 'image' || run.variant === 'signature';
        if (!requiresImage || run.imageSrc) {
          annotation.style.width = `${run.size.width}px`;
          annotation.style.display = 'inline-block';
          annotation.style.overflow = 'hidden';
        }
      }
      if (run.size.height && run.variant !== 'html') {
        const requiresImage = run.variant === 'image' || run.variant === 'signature';
        if (!requiresImage || run.imageSrc) {
          annotation.style.height = `${run.size.height}px`;
        }
      }
    }

    // Apply typography to the annotation element
    if (run.fontFamily) {
      annotation.style.fontFamily = run.fontFamily;
    }
    if (run.fontSize) {
      const fontSize = typeof run.fontSize === 'number' ? `${run.fontSize}pt` : run.fontSize;
      annotation.style.fontSize = fontSize;
    }
    if (run.textColor) {
      annotation.style.color = run.textColor;
    }
    if (run.bold) {
      annotation.style.fontWeight = 'bold';
    }
    if (run.italic) {
      annotation.style.fontStyle = 'italic';
    }
    if (run.underline) {
      annotation.style.textDecoration = 'underline';
    }

    // Apply z-index for proper layering
    annotation.style.zIndex = '1';

    // Create inner content wrapper
    const content = this.doc.createElement('span');
    content.classList.add('annotation-content');
    content.style.pointerEvents = 'none';
    content.setAttribute('contenteditable', 'false');

    // Render type-specific content
    switch (run.variant) {
      case 'image':
      case 'signature': {
        if (run.imageSrc) {
          const img = this.doc.createElement('img');
          // SECURITY: Validate data URLs
          const isDataUrl = run.imageSrc.startsWith('data:');
          if (isDataUrl) {
            if (run.imageSrc.length <= MAX_DATA_URL_LENGTH && VALID_IMAGE_DATA_URL.test(run.imageSrc)) {
              img.src = run.imageSrc;
            } else {
              // Invalid data URL - fall back to displayLabel
              content.textContent = run.displayLabel;
              break;
            }
          } else {
            const sanitized = sanitizeHref(run.imageSrc);
            if (sanitized) {
              img.src = sanitized.href;
            } else {
              content.textContent = run.displayLabel;
              break;
            }
          }
          img.alt = run.displayLabel;
          img.style.height = 'auto';
          img.style.maxWidth = '100%';
          img.style.pointerEvents = 'none';
          img.style.verticalAlign = 'middle';
          if (run.variant === 'signature') {
            img.style.maxHeight = '28px';
          }
          content.appendChild(img);
          annotation.style.display = 'inline-block';
          content.style.display = 'inline-block';
          // Prevent line-height inheritance from the line container from breaking image layout.
          annotation.style.lineHeight = 'normal';
          content.style.lineHeight = 'normal';
        } else {
          content.textContent = run.displayLabel || (run.variant === 'signature' ? 'Signature' : '');
        }
        break;
      }

      case 'link': {
        if (run.linkUrl) {
          const link = this.doc.createElement('a');
          const sanitized = sanitizeHref(run.linkUrl);
          if (sanitized) {
            link.href = sanitized.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = run.linkUrl;
            link.style.textDecoration = 'none';
            content.style.pointerEvents = 'all';
            content.appendChild(link);
          } else {
            content.textContent = run.displayLabel;
          }
        } else {
          content.textContent = run.displayLabel;
        }
        break;
      }

      case 'html': {
        if (run.rawHtml && typeof run.rawHtml === 'string') {
          // Note: rawHtml is expected to be sanitized upstream.
          content.innerHTML = run.rawHtml.trim();
          annotation.style.display = 'inline-block';
          content.style.display = 'inline-block';
          // Prevent line-height inheritance from the line container from affecting HTML layout.
          annotation.style.lineHeight = 'normal';
          content.style.lineHeight = 'normal';
        } else {
          content.textContent = run.displayLabel;
        }
        break;
      }

      case 'text':
      case 'checkbox':
      default: {
        content.textContent = run.displayLabel;
        break;
      }
    }

    annotation.appendChild(content);

    // Apply data attributes for field tracking
    annotation.dataset.type = run.variant;
    if (run.fieldId) {
      annotation.dataset.fieldId = run.fieldId;
    }
    if (run.fieldType) {
      annotation.dataset.fieldType = run.fieldType;
    }

    // Make field annotation draggable (matching super-editor behavior)
    annotation.draggable = true;
    annotation.dataset.draggable = 'true';

    // Store additional data for drag operations
    if (run.displayLabel) {
      annotation.dataset.displayLabel = run.displayLabel;
    }
    if (run.variant) {
      annotation.dataset.variant = run.variant;
    }

    // Assert PM positions are present for cursor fallback
    assertPmPositions(run, 'field annotation run');

    // Apply PM position tracking
    if (run.pmStart != null) {
      annotation.dataset.pmStart = String(run.pmStart);
    }
    if (run.pmEnd != null) {
      annotation.dataset.pmEnd = String(run.pmEnd);
    }
    annotation.dataset.layoutEpoch = String(this.layoutEpoch);

    this.appendAnnotationCaretAnchor(annotation, run);

    // Apply SDT metadata
    this.applySdtDataset(annotation, run.sdt);

    return annotation;
  }

  /**
   * Adds a hidden DOM anchor at pmEnd so caret placement after the annotation is correct.
   */
  private appendAnnotationCaretAnchor(annotation: HTMLElement, run: FieldAnnotationRun): void {
    if (!this.doc || run.pmEnd == null) return;

    const caretAnchor = this.doc.createElement('span');
    caretAnchor.dataset.pmStart = String(run.pmEnd);
    caretAnchor.dataset.pmEnd = String(run.pmEnd);
    caretAnchor.dataset.layoutEpoch = String(this.layoutEpoch);
    caretAnchor.classList.add('annotation-caret-anchor');
    caretAnchor.style.position = 'absolute';
    caretAnchor.style.left = '100%';
    caretAnchor.style.top = '0';
    caretAnchor.style.width = '0';
    caretAnchor.style.height = '1em';
    caretAnchor.style.overflow = 'hidden';
    caretAnchor.style.pointerEvents = 'none';
    caretAnchor.style.userSelect = 'none';
    caretAnchor.style.opacity = '0';
    caretAnchor.textContent = '\u200B';
    if (!annotation.style.position) {
      annotation.style.position = 'relative';
    }
    annotation.appendChild(caretAnchor);
  }

  /**
   * Renders a single line of a paragraph block.
   *
   * @param block - The paragraph block containing the line
   * @param line - The line measurement data
   * @param context - Rendering context with fragment information
   * @param availableWidthOverride - Optional override for available width used in justification calculations
   * @param lineIndex - Optional zero-based index of the line within the fragment
   * @param skipJustify - When true, prevents justification even if alignment is 'justify'
   * @returns The rendered line element
   */
  private renderLine(
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    availableWidthOverride?: number,
    lineIndex?: number,
    skipJustify?: boolean,
  ): HTMLElement {
    if (!this.doc) {
      throw new Error('DomPainter: document is not available');
    }

    const el = this.doc.createElement('div');
    el.classList.add(CLASS_NAMES.line);
    applyStyles(el, lineStyles(line.lineHeight));
    el.dataset.layoutEpoch = String(this.layoutEpoch);
    const styleId = (block.attrs as ParagraphAttrs | undefined)?.styleId;
    if (styleId) {
      el.setAttribute('styleid', styleId);
    }
    const alignment = (block.attrs as ParagraphAttrs | undefined)?.alignment;

    // Apply text-align for center/right immediately.
    // For justify, we keep 'left' and apply spacing via word-spacing.
    if (alignment === 'center' || alignment === 'right') {
      el.style.textAlign = alignment;
    } else {
      // Default to 'left' for 'left', 'justify', 'both', and undefined
      el.style.textAlign = 'left';
    }

    const lineRange = computeLinePmRange(block, line);

    if (lineRange.pmStart != null) {
      el.dataset.pmStart = String(lineRange.pmStart);
    }
    if (lineRange.pmEnd != null) {
      el.dataset.pmEnd = String(lineRange.pmEnd);
    }

    let runsForLine = sliceRunsForLine(block, line);
    const trackedConfig = this.resolveTrackedChangesConfig(block);

    // Preserve PM positions for DOM caret mapping on empty lines.
    if (runsForLine.length === 0) {
      const span = this.doc.createElement('span');
      span.classList.add('superdoc-empty-run');
      if (lineRange.pmStart != null) {
        span.dataset.pmStart = String(lineRange.pmStart);
      }
      if (lineRange.pmEnd != null) {
        span.dataset.pmEnd = String(lineRange.pmEnd);
      }
      span.innerHTML = '&nbsp;';
      el.appendChild(span);
    }

    // Render tab leaders (absolute positioned overlays)
    if (line.leaders && line.leaders.length > 0) {
      line.leaders.forEach((ld) => {
        const leaderEl = this.doc!.createElement('div');
        leaderEl.classList.add('superdoc-leader');
        leaderEl.setAttribute('data-style', ld.style);
        leaderEl.style.position = 'absolute';
        leaderEl.style.left = `${ld.from}px`;
        leaderEl.style.width = `${Math.max(0, ld.to - ld.from)}px`;
        // Align leaders closer to the text baseline using measured descent
        const baselineOffset = Math.max(1, Math.round(Math.max(1, line.descent * 0.5)));
        leaderEl.style.bottom = `${baselineOffset}px`;
        leaderEl.style.height = ld.style === 'heavy' ? '2px' : '1px';
        leaderEl.style.pointerEvents = 'none';
        leaderEl.style.zIndex = '0'; // Same layer as line, text will be z-index: 1

        // Map leader styles to CSS
        if (ld.style === 'dot' || ld.style === 'middleDot') {
          leaderEl.style.borderBottom = '1px dotted currentColor';
        } else if (ld.style === 'hyphen') {
          leaderEl.style.borderBottom = '1px dashed currentColor';
        } else if (ld.style === 'underscore') {
          leaderEl.style.borderBottom = '1px solid currentColor';
        } else if (ld.style === 'heavy') {
          leaderEl.style.borderBottom = '2px solid currentColor';
        }

        el.appendChild(leaderEl);
      });
    }

    // Render bar tabs (vertical hairlines)
    if (line.bars && line.bars.length > 0) {
      line.bars.forEach((bar) => {
        const barEl = this.doc!.createElement('div');
        barEl.classList.add('superdoc-tab-bar');
        barEl.style.position = 'absolute';
        barEl.style.left = `${bar.x}px`;
        barEl.style.top = '0px';
        barEl.style.bottom = '0px';
        barEl.style.width = '1px';
        barEl.style.background = 'currentColor';
        barEl.style.opacity = '0.6';
        barEl.style.pointerEvents = 'none';
        el.appendChild(barEl);
      });
    }

    // Check if any segments have explicit X positioning (from tab stops)
    const hasExplicitPositioning = line.segments?.some((seg) => seg.x !== undefined);
    const availableWidth = availableWidthOverride ?? line.maxWidth ?? line.width;

    const justifyShouldApply = shouldApplyJustify({
      alignment: (block as ParagraphBlock).attrs?.alignment,
      hasExplicitPositioning: hasExplicitPositioning ?? false,
      // Caller already folds last-line + trailing lineBreak behavior into skipJustify.
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
      skipJustifyOverride: skipJustify,
    });

    const countSpaces = (text: string): number => {
      let count = 0;
      for (let i = 0; i < text.length; i += 1) {
        if (SPACE_CHARS.has(text[i])) count += 1;
      }
      return count;
    };

    if (justifyShouldApply) {
      // The measurer trims wrap-point trailing spaces from line ranges, but slicing can still
      // produce whitespace-only runs at style boundaries. These runs are especially problematic
      // for justify because `word-spacing` behavior is inconsistent on pure-whitespace spans.
      //
      // Normalize by merging whitespace-only slices into adjacent runs with identical styling.
      const stableDataAttrs = (attrs: Record<string, string> | undefined): Record<string, string> | undefined => {
        if (!attrs) return undefined;
        const keys = Object.keys(attrs).sort();
        const out: Record<string, string> = {};
        keys.forEach((key) => {
          out[key] = attrs[key]!;
        });
        return out;
      };

      const mergeSignature = (run: TextRun): string =>
        JSON.stringify({
          kind: run.kind ?? 'text',
          fontFamily: run.fontFamily,
          fontSize: run.fontSize,
          bold: run.bold ?? false,
          italic: run.italic ?? false,
          letterSpacing: run.letterSpacing ?? null,
          color: run.color ?? null,
          underline: run.underline ?? null,
          strike: run.strike ?? false,
          highlight: run.highlight ?? null,
          textTransform: run.textTransform ?? null,
          token: run.token ?? null,
          pageRefMetadata: run.pageRefMetadata ?? null,
          trackedChange: run.trackedChange ?? null,
          sdt: run.sdt ?? null,
          link: run.link ?? null,
          comments: run.comments ?? null,
          dataAttrs: stableDataAttrs(run.dataAttrs) ?? null,
        });

      const isWhitespaceOnly = (text: string): boolean => {
        if (text.length === 0) return false;
        for (let i = 0; i < text.length; i += 1) {
          if (!SPACE_CHARS.has(text[i])) return false;
        }
        return true;
      };

      const cloneTextRun = (run: TextRun): TextRun => ({
        ...(run as TextRun),
        comments: run.comments ? [...run.comments] : undefined,
        dataAttrs: run.dataAttrs ? { ...run.dataAttrs } : undefined,
        underline: run.underline ? { ...run.underline } : undefined,
        pageRefMetadata: run.pageRefMetadata ? { ...run.pageRefMetadata } : undefined,
      });

      const normalized: Run[] = runsForLine.map((run) => {
        if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) return run;
        return cloneTextRun(run as TextRun);
      });

      const merged: Run[] = [];
      for (let i = 0; i < normalized.length; i += 1) {
        const run = normalized[i]!;
        if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) {
          merged.push(run);
          continue;
        }

        const textRun = run as TextRun;
        if (!isWhitespaceOnly(textRun.text ?? '')) {
          merged.push(textRun);
          continue;
        }

        const prev = merged[merged.length - 1];
        if (prev && (prev.kind === 'text' || prev.kind === undefined) && 'text' in prev) {
          const prevTextRun = prev as TextRun;
          if (mergeSignature(prevTextRun) === mergeSignature(textRun)) {
            const extra = textRun.text ?? '';
            prevTextRun.text = (prevTextRun.text ?? '') + extra;
            if (prevTextRun.pmStart != null) {
              prevTextRun.pmEnd = prevTextRun.pmStart + prevTextRun.text.length;
            } else if (prevTextRun.pmEnd != null) {
              prevTextRun.pmEnd = prevTextRun.pmEnd + extra.length;
            }
            continue;
          }
        }

        const next = normalized[i + 1];
        if (next && (next.kind === 'text' || next.kind === undefined) && 'text' in next) {
          const nextTextRun = next as TextRun;
          if (mergeSignature(nextTextRun) === mergeSignature(textRun)) {
            const extra = textRun.text ?? '';
            nextTextRun.text = extra + (nextTextRun.text ?? '');
            if (textRun.pmStart != null) {
              nextTextRun.pmStart = textRun.pmStart;
            } else if (nextTextRun.pmStart != null) {
              nextTextRun.pmStart = nextTextRun.pmStart - extra.length;
            }
            if (nextTextRun.pmStart != null && nextTextRun.pmEnd == null) {
              nextTextRun.pmEnd = nextTextRun.pmStart + nextTextRun.text.length;
            }
            continue;
          }
        }

        merged.push(textRun);
      }

      runsForLine = merged;

      // Suppress trailing wrap-point spaces on justified lines. With `white-space: pre`, they would
      // otherwise consume width and be stretched by word-spacing, producing a ragged visible edge.
      // Preserve intentionally space-only lines (rare but supported).
      const hasNonSpaceText = runsForLine.some(
        (run) => (run.kind === 'text' || run.kind === undefined) && 'text' in run && (run.text ?? '').trim().length > 0,
      );
      if (hasNonSpaceText) {
        for (let i = runsForLine.length - 1; i >= 0; i -= 1) {
          const run = runsForLine[i];
          if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run)) continue;
          const text = run.text ?? '';
          let trimCount = 0;
          for (let j = text.length - 1; j >= 0 && text[j] === ' '; j -= 1) {
            trimCount += 1;
          }
          if (trimCount === 0) break;

          const nextText = text.slice(0, Math.max(0, text.length - trimCount));
          if (nextText.length === 0) {
            runsForLine.splice(i, 1);
            continue;
          }
          (run as TextRun).text = nextText;
          if ((run as TextRun).pmEnd != null) {
            (run as TextRun).pmEnd = (run as TextRun).pmEnd! - trimCount;
          }
          break;
        }
      }
    }

    const spaceCount =
      line.spaceCount ??
      runsForLine.reduce((sum, run) => {
        if ((run.kind !== 'text' && run.kind !== undefined) || !('text' in run) || run.text == null) return sum;
        return sum + countSpaces(run.text);
      }, 0);
    const lineWidth = line.naturalWidth ?? line.width;
    const spacingPerSpace = calculateJustifySpacing({
      lineWidth,
      availableWidth,
      spaceCount,
      shouldJustify: justifyShouldApply,
    });

    if (spacingPerSpace !== 0) {
      // Each rendered line is its own block; relying on text-align-last is brittle, so we use word-spacing.
      el.style.wordSpacing = `${spacingPerSpace}px`;
    }

    if (hasExplicitPositioning && line.segments) {
      // Use segment-based rendering with absolute positioning for tab-aligned text
      // When rendering segments, we need to track cumulative X position
      // for segments that don't have explicit X coordinates.
      //
      // The segment x positions from layout are relative to the content area (left margin = 0).
      // We need to add the paragraph indent to ALL positions (both explicit and calculated).
      const paraIndent = (block.attrs as ParagraphAttrs | undefined)?.indent;
      const indentLeft = paraIndent?.left ?? 0;
      const firstLine = paraIndent?.firstLine ?? 0;
      const hanging = paraIndent?.hanging ?? 0;
      const isFirstLineOfPara = lineIndex === 0 || lineIndex === undefined;
      const firstLineOffsetForCumX = isFirstLineOfPara ? firstLine - hanging : 0;
      const wordLayoutValue = (block.attrs as ParagraphAttrs | undefined)?.wordLayout;
      const wordLayout = isMinimalWordLayout(wordLayoutValue) ? wordLayoutValue : undefined;
      const isListParagraph = Boolean(wordLayout?.marker);
      const rawTextStartPx =
        typeof wordLayout?.marker?.textStartX === 'number' && Number.isFinite(wordLayout.marker.textStartX)
          ? wordLayout.marker.textStartX
          : typeof wordLayout?.textStartPx === 'number' && Number.isFinite(wordLayout.textStartPx)
            ? wordLayout.textStartPx
            : undefined;
      const listIndentOffset = isFirstLineOfPara ? (rawTextStartPx ?? indentLeft) : indentLeft;
      const indentOffset = isListParagraph ? listIndentOffset : indentLeft + firstLineOffsetForCumX;
      let cumulativeX = 0; // Start at 0, we'll add indentOffset when positioning
      const segmentsByRun = new Map<number, LineSegment[]>();
      line.segments.forEach((segment) => {
        const list = segmentsByRun.get(segment.runIndex);
        if (list) {
          list.push(segment);
        } else {
          segmentsByRun.set(segment.runIndex, [segment]);
        }
      });

      /**
       * Finds the X position where the immediate next segment starts after a given run index.
       * Only returns the X if the very next run has a segment with explicit positioning.
       * This handles tab-aligned text where right/center alignment causes the text to start
       * before the tab stop target.
       *
       * WHY ONLY THE IMMEDIATE NEXT RUN:
       * When rendering a tab, we need to know where the content IMMEDIATELY after this tab begins
       * to correctly size the tab element. We don't look beyond the immediate next run because:
       * 1. Each tab is independent and should only consider its directly adjacent content
       * 2. Looking further ahead would incorrectly span multiple tabs or unrelated runs
       * 3. If there's another tab between this tab and some content, that intermediate tab is
       *    responsible for its own layout - we shouldn't reach across it
       *
       * For example, given: "Text[TAB1]Content[TAB2]MoreContent"
       * - When sizing TAB1, we only check "Content" (immediate next run)
       * - We don't check "MoreContent" because TAB2 is in between
       * - TAB2 will independently check "MoreContent" when it's rendered
       *
       * @param fromRunIndex - The run index to search after
       * @returns The X position of the immediate next segment, or undefined if not found or not immediate
       */
      const findImmediateNextSegmentX = (fromRunIndex: number): number | undefined => {
        // Only check the immediate next run - don't skip over other tabs
        const nextRunIdx = fromRunIndex + 1;
        if (nextRunIdx <= line.toRun) {
          const nextSegments = segmentsByRun.get(nextRunIdx);
          if (nextSegments && nextSegments.length > 0) {
            const firstSegment = nextSegments[0];
            // Return the segment's explicit X if it has one (from tab alignment)
            return firstSegment.x;
          }
        }
        return undefined;
      };

      for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
        const baseRun = block.runs[runIndex];
        if (!baseRun) continue;

        if (baseRun.kind === 'tab') {
          // Find where the immediate next content begins (if it's right after this tab)
          const immediateNextX = findImmediateNextSegmentX(runIndex);
          const tabStartX = cumulativeX;

          // The tab should span from where previous content ended to where next content begins.
          // If the immediate next segment has an explicit X (from tab alignment), use that.
          // Otherwise, use the tab's measured width to calculate the end position.
          const tabEndX = immediateNextX !== undefined ? immediateNextX : tabStartX + (baseRun.width ?? 0);
          const actualTabWidth = tabEndX - tabStartX;

          const tabEl = this.doc!.createElement('span');
          tabEl.style.position = 'absolute';
          tabEl.style.left = `${tabStartX + indentOffset}px`;
          tabEl.style.top = '0px';
          tabEl.style.width = `${actualTabWidth}px`;
          tabEl.style.height = `${line.lineHeight}px`;
          tabEl.style.display = 'inline-block';
          tabEl.style.pointerEvents = 'none';
          tabEl.style.zIndex = '1';

          // Apply underline styling to tab if present (common in signature lines)
          // TabRun can have RunMarks properties like underline, bold, etc.
          //
          // Signature line use case: In documents with signature lines, tabs are often used
          // to create underlined blank spaces where signatures should go. The underline mark
          // is inherited from a parent node (e.g., a paragraph with underline formatting) and
          // applied to the tab, creating a visible underline even though the tab itself has
          // no visible text content.
          if (baseRun.underline) {
            const underlineStyle = baseRun.underline.style ?? 'single';
            // We must use an explicit color instead of currentColor because tab content is
            // invisible (no text). If we used currentColor, the underline would inherit the
            // text color, which might be transparent or the same as the background, making
            // the underline invisible. Using an explicit color (defaulting to black) ensures
            // the underline is always visible for signature lines.
            const underlineColor = baseRun.underline.color ?? '#000000';
            const borderStyle = underlineStyle === 'double' ? 'double' : 'solid';
            tabEl.style.borderBottom = `1px ${borderStyle} ${underlineColor}`;
          } else {
            tabEl.style.visibility = 'hidden';
          }

          if (styleId) {
            tabEl.setAttribute('styleid', styleId);
          }
          if (baseRun.pmStart != null) tabEl.dataset.pmStart = String(baseRun.pmStart);
          if (baseRun.pmEnd != null) tabEl.dataset.pmEnd = String(baseRun.pmEnd);
          tabEl.dataset.layoutEpoch = String(this.layoutEpoch);
          el.appendChild(tabEl);

          // Update cumulativeX to where the next content begins
          // This ensures proper positioning for subsequent elements
          cumulativeX = tabEndX;
          continue;
        }

        // Handle ImageRun - render as-is (no slicing needed, atomic unit)
        if (this.isImageRun(baseRun)) {
          const elem = this.renderRun(baseRun, context, trackedConfig);
          if (elem) {
            if (styleId) {
              elem.setAttribute('styleid', styleId);
            }
            // Position image using explicit segment X when available; fallback to cumulative flow
            // Add indentOffset to position content at the correct paragraph indent.
            const runSegments = segmentsByRun.get(runIndex);
            const baseSegX = runSegments && runSegments[0]?.x !== undefined ? runSegments[0].x : cumulativeX;
            const segX = baseSegX + indentOffset;
            const segWidth =
              (runSegments && runSegments[0]?.width !== undefined ? runSegments[0].width : elem.offsetWidth) ?? 0;
            elem.style.position = 'absolute';
            elem.style.left = `${segX}px`;
            el.appendChild(elem);
            cumulativeX = baseSegX + segWidth;
          }
          continue;
        }

        // Handle LineBreakRun - line breaks are handled by line creation, skip here
        if (this.isLineBreakRun(baseRun)) {
          continue;
        }

        // Handle BreakRun - breaks are handled by line creation, skip here
        if (this.isBreakRun(baseRun)) {
          continue;
        }

        // Handle FieldAnnotationRun - render as-is (no slicing needed, atomic unit like images)
        if (this.isFieldAnnotationRun(baseRun)) {
          const elem = this.renderRun(baseRun, context, trackedConfig);
          if (elem) {
            if (styleId) {
              elem.setAttribute('styleid', styleId);
            }
            // Position using explicit segment X when available; fallback to cumulative flow
            // Add indentOffset to position content at the correct paragraph indent.
            const runSegments = segmentsByRun.get(runIndex);
            const baseSegX = runSegments && runSegments[0]?.x !== undefined ? runSegments[0].x : cumulativeX;
            const segX = baseSegX + indentOffset;
            const segWidth = (runSegments && runSegments[0]?.width !== undefined ? runSegments[0].width : 0) ?? 0;
            elem.style.position = 'absolute';
            elem.style.left = `${segX}px`;
            el.appendChild(elem);
            cumulativeX = baseSegX + segWidth;
          }
          continue;
        }

        const runSegments = segmentsByRun.get(runIndex);
        if (!runSegments || runSegments.length === 0) {
          continue;
        }

        // At this point, baseRun must be TextRun (has .text property)
        if (!('text' in baseRun)) {
          continue;
        }

        const baseText = baseRun.text ?? '';
        const runPmStart = baseRun.pmStart ?? null;
        const fallbackPmEnd =
          runPmStart != null && baseRun.pmEnd == null ? runPmStart + baseText.length : (baseRun.pmEnd ?? null);

        runSegments.forEach((segment) => {
          const segmentText = baseText.slice(segment.fromChar, segment.toChar);
          if (!segmentText) return;

          const pmSliceStart = runPmStart != null ? runPmStart + segment.fromChar : undefined;
          const pmSliceEnd = runPmStart != null ? runPmStart + segment.toChar : (fallbackPmEnd ?? undefined);
          const segmentRun: TextRun = {
            ...(baseRun as TextRun),
            text: segmentText,
            pmStart: pmSliceStart,
            pmEnd: pmSliceEnd,
          };

          const elem = this.renderRun(segmentRun, context, trackedConfig);
          if (elem) {
            if (styleId) {
              elem.setAttribute('styleid', styleId);
            }
            // Determine X position for this segment
            // Layout positions are relative to content area start (0).
            // Add indentOffset to position content at the correct paragraph indent.
            const baseX = segment.x !== undefined ? segment.x : cumulativeX;
            const xPos = baseX + indentOffset;

            elem.style.position = 'absolute';
            elem.style.left = `${xPos}px`;
            el.appendChild(elem);

            // Update cumulative X for next segment by measuring this element's width
            // This applies to ALL segments (both with and without explicit X)
            // Use baseX (without indent) to keep cumulativeX relative to content area,
            // matching how segment.x values are calculated in layout.
            let width = segment.width ?? 0;
            if (width <= 0 && this.doc) {
              const measureEl = elem.cloneNode(true) as HTMLElement;
              measureEl.style.position = 'absolute';
              measureEl.style.visibility = 'hidden';
              measureEl.style.left = '-9999px';
              this.doc.body.appendChild(measureEl);
              width = measureEl.offsetWidth;
              this.doc.body.removeChild(measureEl);
            }
            cumulativeX = baseX + width;
          }
        });
      }
    } else {
      // Use run-based rendering for normal text flow
      // Track current inline SDT wrapper to group adjacent runs with the same SDT id
      let currentInlineSdtWrapper: HTMLElement | null = null;
      let currentInlineSdtId: string | null = null;

      const closeCurrentWrapper = () => {
        if (currentInlineSdtWrapper) {
          el.appendChild(currentInlineSdtWrapper);
          currentInlineSdtWrapper = null;
          currentInlineSdtId = null;
        }
      };

      runsForLine.forEach((run) => {
        // Check if this run has inline structuredContent SDT
        const runSdt = (run as TextRun).sdt;
        const isInlineSdt = runSdt?.type === 'structuredContent' && runSdt?.scope === 'inline';
        const runSdtId = isInlineSdt && runSdt?.id ? String(runSdt.id) : null;

        // If SDT context changed, close the current wrapper
        if (runSdtId !== currentInlineSdtId) {
          closeCurrentWrapper();
        }

        // Special handling for TabRuns (e.g., signature lines with underlines)
        if (run.kind === 'tab') {
          const tabEl = this.doc!.createElement('span');
          tabEl.classList.add('superdoc-tab');

          // Calculate tab width - use measured width or estimate based on typical tab stop
          const tabWidth = run.width ?? 48; // Default tab width if not measured

          tabEl.style.display = 'inline-block';
          tabEl.style.width = `${tabWidth}px`;
          tabEl.style.height = `${line.lineHeight}px`;
          tabEl.style.verticalAlign = 'bottom';

          // Apply underline styling if present (common for signature lines)
          //
          // Signature line use case: In documents with signature lines, tabs are often used
          // to create underlined blank spaces where signatures should go. The underline mark
          // is inherited from a parent node (e.g., a paragraph with underline formatting) and
          // applied to the tab, creating a visible underline even though the tab itself has
          // no visible text content.
          if (run.underline) {
            const underlineStyle = run.underline.style ?? 'single';
            // We must use an explicit color instead of currentColor because tab content is
            // invisible (no text). If we used currentColor, the underline would inherit the
            // text color, which might be transparent or the same as the background, making
            // the underline invisible. Using an explicit color (defaulting to black) ensures
            // the underline is always visible for signature lines.
            const underlineColor = run.underline.color ?? '#000000';
            const borderStyle = underlineStyle === 'double' ? 'double' : 'solid';
            tabEl.style.borderBottom = `1px ${borderStyle} ${underlineColor}`;
          }

          if (styleId) {
            tabEl.setAttribute('styleid', styleId);
          }
          if (run.pmStart != null) tabEl.dataset.pmStart = String(run.pmStart);
          if (run.pmEnd != null) tabEl.dataset.pmEnd = String(run.pmEnd);
          tabEl.dataset.layoutEpoch = String(this.layoutEpoch);

          el.appendChild(tabEl);
          return;
        }

        const elem = this.renderRun(run, context, trackedConfig);
        if (elem) {
          if (styleId) {
            elem.setAttribute('styleid', styleId);
          }

          // If this run has inline SDT, add to or create wrapper
          if (isInlineSdt && runSdtId && this.doc) {
            if (!currentInlineSdtWrapper) {
              // Create new wrapper for this SDT group
              currentInlineSdtWrapper = this.doc.createElement('span');
              currentInlineSdtWrapper.className = DOM_CLASS_NAMES.INLINE_SDT_WRAPPER;
              currentInlineSdtWrapper.dataset.layoutEpoch = String(this.layoutEpoch);
              currentInlineSdtId = runSdtId;
              // Apply SDT metadata to wrapper
              this.applySdtDataset(currentInlineSdtWrapper, runSdt);
              // Add label element for hover display
              const alias = (runSdt as { alias?: string })?.alias || 'Inline content';
              const labelEl = this.doc.createElement('span');
              labelEl.className = `${DOM_CLASS_NAMES.INLINE_SDT_WRAPPER}__label`;
              labelEl.textContent = alias;
              currentInlineSdtWrapper.appendChild(labelEl);
            }
            // Update PM positions on wrapper to span all contained runs
            const wrapperPmStart = currentInlineSdtWrapper.dataset.pmStart;
            const wrapperPmEnd = currentInlineSdtWrapper.dataset.pmEnd;
            if (run.pmStart != null) {
              if (!wrapperPmStart || run.pmStart < parseInt(wrapperPmStart, 10)) {
                currentInlineSdtWrapper.dataset.pmStart = String(run.pmStart);
              }
            }
            if (run.pmEnd != null) {
              if (!wrapperPmEnd || run.pmEnd > parseInt(wrapperPmEnd, 10)) {
                currentInlineSdtWrapper.dataset.pmEnd = String(run.pmEnd);
              }
            }
            currentInlineSdtWrapper.appendChild(elem);
          } else {
            el.appendChild(elem);
          }
        }
      });

      // Close any remaining wrapper at end of line
      closeCurrentWrapper();
    }

    // Post-process: Apply tooltip accessibility for any links with pending tooltips
    // This must happen after elements are in the DOM so aria-describedby can reference siblings
    const anchors = el.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
      const pendingTooltip = this.pendingTooltips.get(anchor as HTMLElement);
      if (pendingTooltip) {
        this.applyTooltipAccessibility(anchor as HTMLAnchorElement, pendingTooltip);
        this.pendingTooltips.delete(anchor as HTMLElement); // Clean up memory
      }
    });

    return el;
  }

  private resolveTrackedChangesConfig(block: ParagraphBlock): TrackedChangesRenderConfig {
    const attrs = (block.attrs as ParagraphAttrs | undefined) ?? {};
    const mode = (attrs.trackedChangesMode as TrackedChangesMode | undefined) ?? 'review';
    const enabled = attrs.trackedChangesEnabled !== false;
    return { mode, enabled };
  }

  private applyTrackedChangeDecorations(elem: HTMLElement, run: Run, config: TrackedChangesRenderConfig): void {
    if (!config.enabled || config.mode === 'off') {
      return;
    }

    const textRun = run as TextRun;
    const meta = textRun.trackedChange;
    if (!meta) {
      return;
    }

    const baseClass = TRACK_CHANGE_BASE_CLASS[meta.kind];
    if (baseClass) {
      elem.classList.add(baseClass);
    }

    const modifier = TRACK_CHANGE_MODIFIER_CLASS[meta.kind]?.[config.mode];
    if (modifier) {
      elem.classList.add(modifier);
    }

    elem.dataset.trackChangeId = meta.id;
    elem.dataset.trackChangeKind = meta.kind;
    if (meta.author) {
      elem.dataset.trackChangeAuthor = meta.author;
    }
    if (meta.authorEmail) {
      elem.dataset.trackChangeAuthorEmail = meta.authorEmail;
    }
    if (meta.authorImage) {
      elem.dataset.trackChangeAuthorImage = meta.authorImage;
    }
    if (meta.date) {
      elem.dataset.trackChangeDate = meta.date;
    }
  }

  /**
   * Updates an existing fragment element's position and dimensions in place.
   * Used during incremental updates to efficiently reposition fragments without full re-render.
   *
   * @param el - The HTMLElement representing the fragment to update
   * @param fragment - The fragment data containing updated position and dimensions
   * @param section - The document section ('body', 'header', 'footer') containing this fragment.
   *                  Affects PM position validation - only body sections validate PM positions.
   *                  If undefined, defaults to 'body' section behavior.
   */
  private updateFragmentElement(el: HTMLElement, fragment: Fragment, section?: 'body' | 'header' | 'footer'): void {
    this.applyFragmentFrame(el, fragment, section);
    if (fragment.kind === 'image') {
      el.style.height = `${fragment.height}px`;
    }
    if (fragment.kind === 'drawing') {
      el.style.height = `${fragment.height}px`;
    }
  }

  /**
   * Applies fragment positioning, dimensions, and metadata to an HTML element.
   * Sets CSS positioning, block ID, and PM position data attributes for paragraph fragments.
   *
   * @param el - The HTMLElement to apply fragment properties to
   * @param fragment - The fragment data containing position, dimensions, and PM position information
   * @param section - The document section ('body', 'header', 'footer') containing this fragment.
   *                  Controls PM position validation behavior:
   *                  - 'body' or undefined: PM positions are validated and required for paragraph fragments
   *                  - 'header' or 'footer': PM position validation is skipped (these sections have separate PM coordinate spaces)
   *                  When undefined, defaults to 'body' section behavior (validation enabled).
   */
  private applyFragmentFrame(el: HTMLElement, fragment: Fragment, section?: 'body' | 'header' | 'footer'): void {
    el.style.left = `${fragment.x}px`;
    el.style.top = `${fragment.y}px`;
    el.style.width = `${fragment.width}px`;
    el.dataset.blockId = fragment.blockId;
    el.dataset.layoutEpoch = String(this.layoutEpoch);

    if (fragment.kind === 'para') {
      // Assert PM positions are present for paragraph fragments
      // Only validate for body sections - header/footer fragments have their own PM coordinate space
      // Note: undefined section defaults to body section behavior (validation enabled)
      if (section === 'body' || section === undefined) {
        assertFragmentPmPositions(fragment, 'paragraph fragment');
      }

      if (fragment.pmStart != null) {
        el.dataset.pmStart = String(fragment.pmStart);
      } else {
        delete el.dataset.pmStart;
      }
      if (fragment.pmEnd != null) {
        el.dataset.pmEnd = String(fragment.pmEnd);
      } else {
        delete el.dataset.pmEnd;
      }
      if (fragment.continuesFromPrev) {
        el.dataset.continuesFromPrev = 'true';
      } else {
        delete el.dataset.continuesFromPrev;
      }
      if (fragment.continuesOnNext) {
        el.dataset.continuesOnNext = 'true';
      } else {
        delete el.dataset.continuesOnNext;
      }
    }
  }

  /**
   * Estimates the height of a fragment when explicit height is not available.
   *
   * This method provides fallback height calculations for footer bottom-alignment
   * by consulting measure data for paragraphs and list items, or using the
   * fragment's height property for tables, images, and drawings.
   *
   * @param fragment - The fragment to estimate height for
   * @returns Estimated height in pixels, or 0 if height cannot be determined
   */
  private estimateFragmentHeight(fragment: Fragment): number {
    const lookup = this.blockLookup.get(fragment.blockId);
    const measure = lookup?.measure;

    if (fragment.kind === 'para' && measure?.kind === 'paragraph') {
      return measure.totalHeight;
    }

    if (fragment.kind === 'list-item' && measure?.kind === 'list') {
      return measure.totalHeight;
    }

    if (fragment.kind === 'table') {
      return fragment.height;
    }

    if (fragment.kind === 'image' || fragment.kind === 'drawing') {
      return fragment.height;
    }

    return 0;
  }

  private buildBlockLookup(blocks: FlowBlock[], measures: Measure[]): BlockLookup {
    if (blocks.length !== measures.length) {
      throw new Error('DomPainter requires the same number of blocks and measures');
    }

    const lookup: BlockLookup = new Map();
    blocks.forEach((block, index) => {
      lookup.set(block.id, {
        block,
        measure: measures[index],
        version: deriveBlockVersion(block),
      });
    });
    return lookup;
  }

  /**
   * All dataset keys used for SDT metadata.
   * Shared between applySdtDataset and clearSdtDataset to ensure consistency.
   */
  private static readonly SDT_DATASET_KEYS = [
    'sdtType',
    'sdtId',
    'sdtFieldId',
    'sdtFieldType',
    'sdtFieldVariant',
    'sdtFieldVisibility',
    'sdtFieldHidden',
    'sdtFieldLocked',
    'sdtScope',
    'sdtTag',
    'sdtAlias',
    'sdtSectionTitle',
    'sdtSectionType',
    'sdtSectionLocked',
    'sdtDocpartGallery',
    'sdtDocpartId',
    'sdtDocpartInstruction',
  ] as const;

  /**
   * Helper to set a string dataset attribute if the value is truthy.
   */
  private setDatasetString(el: HTMLElement, key: string, value: string | null | undefined): void {
    if (value) {
      el.dataset[key] = value;
    }
  }

  /**
   * Helper to set a boolean dataset attribute if the value is not null/undefined.
   */
  private setDatasetBoolean(el: HTMLElement, key: string, value: boolean | null | undefined): void {
    if (value != null) {
      el.dataset[key] = String(value);
    }
  }

  /**
   * Applies SDT (Structured Document Tag) metadata to an element's dataset as data-sdt-* attributes.
   * Supports field annotations, structured content, document sections, and doc parts.
   * Clears existing SDT metadata before applying new values.
   *
   * @param el - The HTML element to annotate
   * @param metadata - The SDT metadata to render as data attributes
   */
  private applySdtDataset(el: HTMLElement | null, metadata?: SdtMetadata | null): void {
    if (!el?.dataset) return;
    this.clearSdtDataset(el);
    if (!metadata) return;

    el.dataset.sdtType = metadata.type;

    if ('id' in metadata && metadata.id != null) {
      el.dataset.sdtId = String(metadata.id);
    }

    if (metadata.type === 'fieldAnnotation') {
      this.setDatasetString(el, 'sdtFieldId', metadata.fieldId);
      this.setDatasetString(el, 'sdtFieldType', metadata.fieldType);
      this.setDatasetString(el, 'sdtFieldVariant', metadata.variant);
      this.setDatasetString(el, 'sdtFieldVisibility', metadata.visibility);
      this.setDatasetBoolean(el, 'sdtFieldHidden', metadata.hidden);
      this.setDatasetBoolean(el, 'sdtFieldLocked', metadata.isLocked);
    } else if (metadata.type === 'structuredContent') {
      this.setDatasetString(el, 'sdtScope', metadata.scope);
      this.setDatasetString(el, 'sdtTag', metadata.tag);
      this.setDatasetString(el, 'sdtAlias', metadata.alias);
    } else if (metadata.type === 'documentSection') {
      this.setDatasetString(el, 'sdtSectionTitle', metadata.title);
      this.setDatasetString(el, 'sdtSectionType', metadata.sectionType);
      this.setDatasetBoolean(el, 'sdtSectionLocked', metadata.isLocked);
    } else if (metadata.type === 'docPartObject') {
      this.setDatasetString(el, 'sdtDocpartGallery', metadata.gallery);
      this.setDatasetString(el, 'sdtDocpartId', metadata.uniqueId);
      this.setDatasetString(el, 'sdtDocpartInstruction', metadata.instruction);
    }
  }

  private clearSdtDataset(el: HTMLElement): void {
    DomPainter.SDT_DATASET_KEYS.forEach((key) => {
      delete el.dataset[key];
    });
  }

  /**
   * Applies container SDT metadata to an element's dataset (data-sdt-container-* attributes).
   * Used when a block has both primary SDT metadata (e.g., docPartObject) and container
   * metadata (e.g., documentSection). The container metadata is rendered with a "Container"
   * prefix to distinguish it from the primary SDT metadata.
   *
   * @param el - The HTML element to annotate
   * @param metadata - The container SDT metadata (typically documentSection)
   */
  private applyContainerSdtDataset(el: HTMLElement | null, metadata?: SdtMetadata | null): void {
    if (!el?.dataset) return;
    if (!metadata) return;

    el.dataset.sdtContainerType = metadata.type;

    if ('id' in metadata && metadata.id != null) {
      el.dataset.sdtContainerId = String(metadata.id);
    }

    if (metadata.type === 'documentSection') {
      this.setDatasetString(el, 'sdtContainerSectionTitle', metadata.title);
      this.setDatasetString(el, 'sdtContainerSectionType', metadata.sectionType);
      this.setDatasetBoolean(el, 'sdtContainerSectionLocked', metadata.isLocked);
    }
    // Other container types can be added here if needed
  }
}

const getFragmentSdtContainerKey = (fragment: Fragment, blockLookup: BlockLookup): string | null => {
  const lookup = blockLookup.get(fragment.blockId);
  if (!lookup) return null;
  const block = lookup.block;

  if (fragment.kind === 'para' && block.kind === 'paragraph') {
    const attrs = (block as { attrs?: { sdt?: SdtMetadata; containerSdt?: SdtMetadata } }).attrs;
    return getSdtContainerKey(attrs?.sdt, attrs?.containerSdt);
  }

  if (fragment.kind === 'list-item' && block.kind === 'list') {
    const item = block.items.find((listItem) => listItem.id === fragment.itemId);
    const attrs = item?.paragraph.attrs;
    return getSdtContainerKey(attrs?.sdt, attrs?.containerSdt);
  }

  if (fragment.kind === 'table' && block.kind === 'table') {
    const attrs = (block as { attrs?: { sdt?: SdtMetadata; containerSdt?: SdtMetadata } }).attrs;
    return getSdtContainerKey(attrs?.sdt, attrs?.containerSdt);
  }

  return null;
};

const computeSdtBoundaries = (
  fragments: readonly Fragment[],
  blockLookup: BlockLookup,
): Map<number, SdtBoundaryOptions> => {
  const boundaries = new Map<number, SdtBoundaryOptions>();
  const containerKeys = fragments.map((fragment) => getFragmentSdtContainerKey(fragment, blockLookup));

  let i = 0;
  while (i < fragments.length) {
    const currentKey = containerKeys[i];
    if (!currentKey) {
      i += 1;
      continue;
    }

    let groupRight = fragments[i].x + fragments[i].width;
    let j = i;

    while (j + 1 < fragments.length && containerKeys[j + 1] === currentKey) {
      j += 1;
      const fragmentRight = fragments[j].x + fragments[j].width;
      if (fragmentRight > groupRight) {
        groupRight = fragmentRight;
      }
    }

    for (let k = i; k <= j; k += 1) {
      const fragment = fragments[k];
      boundaries.set(k, {
        isStart: k === i,
        isEnd: k === j,
        widthOverride: groupRight - fragment.x,
      });
    }

    i = j + 1;
  }

  return boundaries;
};

const shouldRebuildForSdtBoundary = (element: HTMLElement, boundary: SdtBoundaryOptions | undefined): boolean => {
  if (!boundary) return false;
  const startAttr = element.dataset.sdtContainerStart;
  const endAttr = element.dataset.sdtContainerEnd;
  const expectedStart = String(boundary.isStart ?? true);
  const expectedEnd = String(boundary.isEnd ?? true);
  if (startAttr === undefined || endAttr === undefined) {
    return true;
  }
  return startAttr !== expectedStart || endAttr !== expectedEnd;
};

const fragmentKey = (fragment: Fragment): string => {
  if (fragment.kind === 'para') {
    return `para:${fragment.blockId}:${fragment.fromLine}:${fragment.toLine}`;
  }
  if (fragment.kind === 'list-item') {
    return `list-item:${fragment.blockId}:${fragment.itemId}:${fragment.fromLine}:${fragment.toLine}`;
  }
  if (fragment.kind === 'image') {
    return `image:${fragment.blockId}:${fragment.x}:${fragment.y}`;
  }
  if (fragment.kind === 'drawing') {
    return `drawing:${fragment.blockId}:${fragment.x}:${fragment.y}`;
  }
  if (fragment.kind === 'table') {
    // Include row range and partial row info to uniquely identify table fragments
    // This is critical for mid-row splitting where multiple fragments can exist for the same table
    const partialKey = fragment.partialRow
      ? `:${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}`
      : '';
    return `table:${fragment.blockId}:${fragment.fromRow}:${fragment.toRow}${partialKey}`;
  }
  // Exhaustive check - all fragment kinds should be handled above
  const _exhaustiveCheck: never = fragment;
  return _exhaustiveCheck;
};

const fragmentSignature = (fragment: Fragment, lookup: BlockLookup): string => {
  const base = lookup.get(fragment.blockId)?.version ?? 'missing';
  if (fragment.kind === 'para') {
    // Note: pmStart/pmEnd intentionally excluded to prevent O(n) change detection
    return [
      base,
      fragment.fromLine,
      fragment.toLine,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
      fragment.markerWidth ?? '', // Include markerWidth to trigger re-render when list status changes
    ].join('|');
  }
  if (fragment.kind === 'list-item') {
    return [
      base,
      fragment.itemId,
      fragment.fromLine,
      fragment.toLine,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
    ].join('|');
  }
  if (fragment.kind === 'image') {
    return [base, fragment.width, fragment.height].join('|');
  }
  if (fragment.kind === 'drawing') {
    return [
      base,
      fragment.drawingKind,
      fragment.drawingContentId ?? '',
      fragment.width,
      fragment.height,
      fragment.geometry.width,
      fragment.geometry.height,
      fragment.geometry.rotation ?? 0,
      fragment.scale ?? 1,
      fragment.zIndex ?? '',
    ].join('|');
  }
  if (fragment.kind === 'table') {
    // Include all properties that affect table fragment rendering
    const partialSig = fragment.partialRow
      ? `${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}-${fragment.partialRow.partialHeight}`
      : '';
    return [
      base,
      fragment.fromRow,
      fragment.toRow,
      fragment.width,
      fragment.height,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
      fragment.repeatHeaderCount ?? 0,
      partialSig,
    ].join('|');
  }
  return base;
};

/**
 * Type guard to validate list marker attributes structure.
 *
 * @param attrs - The paragraph attributes to validate
 * @returns True if the attrs contain valid list marker properties
 */
const hasListMarkerProperties = (
  attrs: unknown,
): attrs is {
  numberingProperties: { numId?: number | string; ilvl?: number };
  wordLayout?: { marker?: { markerText?: string } };
} => {
  if (!attrs || typeof attrs !== 'object') return false;
  const obj = attrs as Record<string, unknown>;

  if (!obj.numberingProperties || typeof obj.numberingProperties !== 'object') return false;
  const numProps = obj.numberingProperties as Record<string, unknown>;

  // Validate numId is number or string if present
  if ('numId' in numProps) {
    const numId = numProps.numId;
    if (typeof numId !== 'number' && typeof numId !== 'string') return false;
  }

  // Validate ilvl is number if present
  if ('ilvl' in numProps) {
    const ilvl = numProps.ilvl;
    if (typeof ilvl !== 'number') return false;
  }

  // Validate wordLayout structure if present
  if ('wordLayout' in obj && obj.wordLayout !== undefined) {
    if (typeof obj.wordLayout !== 'object' || obj.wordLayout === null) return false;
    const wordLayout = obj.wordLayout as Record<string, unknown>;

    if ('marker' in wordLayout && wordLayout.marker !== undefined) {
      if (typeof wordLayout.marker !== 'object' || wordLayout.marker === null) return false;
      const marker = wordLayout.marker as Record<string, unknown>;

      if ('markerText' in marker && marker.markerText !== undefined) {
        if (typeof marker.markerText !== 'string') return false;
      }
    }
  }

  return true;
};

/**
 * Derives a version string for a flow block based on its content and styling properties.
 *
 * This version string is used for cache invalidation - when any visual property of the block
 * changes, the version string changes, triggering a DOM rebuild instead of reusing cached elements.
 *
 * The version includes all properties that affect visual rendering:
 * - Text content
 * - Font properties (family, size, bold, italic)
 * - Text decorations (underline style/color, strike, highlight)
 * - Spacing (letterSpacing)
 * - Position markers (pmStart, pmEnd)
 * - Special tokens (page numbers, etc.)
 * - List marker properties (numId, ilvl, markerText) - for list indent changes
 * - Paragraph attributes (alignment, spacing, indent, borders, shading, direction, rtl, tabs)
 * - Table cell content and paragraph formatting within cells
 *
 * For table blocks, a deep hash is computed across all rows and cells, including:
 * - Cell block content (paragraph runs, text, formatting)
 * - Paragraph-level attributes in cells (alignment, spacing, line height, indent, borders, shading)
 * - Run-level formatting (color, highlight, bold, italic, fontSize, fontFamily, underline, strike)
 *
 * This ensures toolbar commands that modify paragraph or run formatting within tables
 * trigger proper DOM updates.
 *
 * @param block - The flow block to generate a version string for
 * @returns A pipe-delimited string representing all visual properties of the block.
 *          Changes to any included property will change the version string.
 */
const deriveBlockVersion = (block: FlowBlock): string => {
  if (block.kind === 'paragraph') {
    // Include list marker info in version to detect indent/marker changes
    const markerVersion = hasListMarkerProperties(block.attrs)
      ? `marker:${block.attrs.numberingProperties.numId ?? ''}:${block.attrs.numberingProperties.ilvl ?? 0}:${block.attrs.wordLayout?.marker?.markerText ?? ''}`
      : '';

    const runsVersion = block.runs
      .map((run) => {
        // Handle ImageRun
        if (run.kind === 'image') {
          const imgRun = run as ImageRun;
          return [
            'img',
            imgRun.src,
            imgRun.width,
            imgRun.height,
            imgRun.alt ?? '',
            imgRun.title ?? '',
            imgRun.distTop ?? '',
            imgRun.distBottom ?? '',
            imgRun.distLeft ?? '',
            imgRun.distRight ?? '',
            // Note: pmStart/pmEnd intentionally excluded to prevent O(n) change detection
          ].join(',');
        }

        // Handle LineBreakRun
        if (run.kind === 'lineBreak') {
          // Note: pmStart/pmEnd intentionally excluded to prevent O(n) change detection
          return 'linebreak';
        }

        // Handle TabRun
        if (run.kind === 'tab') {
          // Note: pmStart/pmEnd intentionally excluded to prevent O(n) change detection
          return [run.text ?? '', 'tab'].join(',');
        }

        // Handle FieldAnnotationRun
        if (run.kind === 'fieldAnnotation') {
          const size = run.size ? `${run.size.width ?? ''}x${run.size.height ?? ''}` : '';
          const highlighted = run.highlighted !== false ? 1 : 0;
          return [
            'field',
            run.variant ?? '',
            run.displayLabel ?? '',
            run.fieldColor ?? '',
            run.borderColor ?? '',
            highlighted,
            run.hidden ? 1 : 0,
            run.visibility ?? '',
            run.imageSrc ?? '',
            run.linkUrl ?? '',
            run.rawHtml ?? '',
            size,
            run.fontFamily ?? '',
            run.fontSize ?? '',
            run.textColor ?? '',
            run.textHighlight ?? '',
            run.bold ? 1 : 0,
            run.italic ? 1 : 0,
            run.underline ? 1 : 0,
            run.fieldId ?? '',
            run.fieldType ?? '',
          ].join(',');
        }

        // Handle TextRun (kind is 'text' or undefined)
        const textRun = run as TextRun;
        return [
          textRun.text ?? '',
          textRun.fontFamily,
          textRun.fontSize,
          textRun.bold ? 1 : 0,
          textRun.italic ? 1 : 0,
          textRun.color ?? '',
          // Text decorations - ensures DOM updates when decoration properties change.
          textRun.underline?.style ?? '',
          textRun.underline?.color ?? '',
          textRun.strike ? 1 : 0,
          textRun.highlight ?? '',
          textRun.letterSpacing != null ? textRun.letterSpacing : '',
          // Note: pmStart/pmEnd intentionally excluded to prevent O(n) change detection
          textRun.token ?? '',
          // Tracked changes - force re-render when added or removed tracked change
          textRun.trackedChange ? 1 : 0,
          // Comment annotations - force re-render when comments are enabled/disabled
          textRun.comments?.length ?? 0,
        ].join(',');
      })
      .join('|');

    // Include paragraph-level attributes that affect rendering (alignment, spacing, indent, etc.)
    // This ensures DOM updates when toolbar commands like "align center" change these properties.
    const attrs = block.attrs as ParagraphAttrs | undefined;

    const paragraphAttrsVersion = attrs
      ? [
          attrs.alignment ?? '',
          attrs.spacing?.before ?? '',
          attrs.spacing?.after ?? '',
          attrs.spacing?.line ?? '',
          attrs.spacing?.lineRule ?? '',
          attrs.indent?.left ?? '',
          attrs.indent?.right ?? '',
          attrs.indent?.firstLine ?? '',
          attrs.indent?.hanging ?? '',
          attrs.borders ? hashParagraphBorders(attrs.borders) : '',
          attrs.shading?.fill ?? '',
          attrs.shading?.color ?? '',
          attrs.direction ?? '',
          attrs.rtl ? '1' : '',
          attrs.tabs?.length ? JSON.stringify(attrs.tabs) : '',
        ].join(':')
      : '';

    // Combine marker version, runs version, and paragraph attrs version
    const parts = [markerVersion, runsVersion, paragraphAttrsVersion].filter(Boolean);
    return parts.join('|');
  }

  if (block.kind === 'list') {
    return block.items.map((item) => `${item.id}:${item.marker.text}:${deriveBlockVersion(item.paragraph)}`).join('|');
  }

  if (block.kind === 'image') {
    return [block.src ?? '', block.width ?? '', block.height ?? '', block.alt ?? '', block.title ?? ''].join('|');
  }

  if (block.kind === 'drawing') {
    if (block.drawingKind === 'image') {
      // Type narrowing: block is ImageDrawing (not ImageBlock)
      const imageLike = block as ImageDrawing;
      return [
        'drawing:image',
        imageLike.src ?? '',
        imageLike.width ?? '',
        imageLike.height ?? '',
        imageLike.alt ?? '',
      ].join('|');
    }
    if (block.drawingKind === 'vectorShape') {
      const vector = block as VectorShapeDrawing;
      return [
        'drawing:vector',
        vector.shapeKind ?? '',
        vector.fillColor ?? '',
        vector.strokeColor ?? '',
        vector.strokeWidth ?? '',
        vector.geometry.width,
        vector.geometry.height,
        vector.geometry.rotation ?? 0,
        vector.geometry.flipH ? 1 : 0,
        vector.geometry.flipV ? 1 : 0,
      ].join('|');
    }
    if (block.drawingKind === 'shapeGroup') {
      const group = block as ShapeGroupDrawing;
      const childSignature = group.shapes
        .map((child) => `${child.shapeType}:${JSON.stringify(child.attrs ?? {})}`)
        .join(';');
      return [
        'drawing:group',
        group.geometry.width,
        group.geometry.height,
        group.groupTransform ? JSON.stringify(group.groupTransform) : '',
        childSignature,
      ].join('|');
    }
    // Exhaustiveness check: if a new drawingKind is added, TypeScript will error here
    const _exhaustive: never = block;
    return `drawing:unknown:${(block as DrawingBlock).id}`;
  }

  if (block.kind === 'table') {
    const tableBlock = block as TableBlock;
    /**
     * Local hash function for strings using FNV-1a algorithm.
     * Used to create a robust hash across all table rows/cells so deep edits invalidate version.
     *
     * @param seed - Initial hash value
     * @param value - String value to hash
     * @returns Updated hash value
     */
    const hashString = (seed: number, value: string): number => {
      let hash = seed >>> 0;
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619); // FNV-style mix
      }
      return hash >>> 0;
    };

    /**
     * Local hash function for numbers.
     * Handles undefined/null values safely by treating them as 0.
     *
     * @param seed - Initial hash value
     * @param value - Number value to hash (or undefined/null)
     * @returns Updated hash value
     */
    const hashNumber = (seed: number, value: number | undefined | null): number => {
      const n = Number.isFinite(value) ? (value as number) : 0;
      let hash = seed ^ n;
      hash = Math.imul(hash, 16777619);
      hash ^= hash >>> 13;
      return hash >>> 0;
    };

    let hash = 2166136261;
    hash = hashString(hash, block.id);
    hash = hashNumber(hash, tableBlock.rows.length);
    hash = (tableBlock.columnWidths ?? []).reduce((acc, width) => hashNumber(acc, Math.round(width * 1000)), hash);

    // Defensive guards: ensure rows array exists and iterate safely
    const rows = tableBlock.rows ?? [];
    for (const row of rows) {
      if (!row || !Array.isArray(row.cells)) continue;
      hash = hashNumber(hash, row.cells.length);
      for (const cell of row.cells) {
        if (!cell) continue;
        const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
        hash = hashNumber(hash, cellBlocks.length);
        // Include cell attributes that affect rendering (rowSpan, colSpan, borders, etc.)
        hash = hashNumber(hash, cell.rowSpan ?? 1);
        hash = hashNumber(hash, cell.colSpan ?? 1);

        // Include cell-level attributes (borders, padding, background) that affect rendering
        // This ensures cache invalidation when cell formatting changes (e.g., remove borders).
        if (cell.attrs) {
          const cellAttrs = cell.attrs as TableCellAttrs;
          if (cellAttrs.borders) {
            hash = hashString(hash, hashCellBorders(cellAttrs.borders));
          }
          if (cellAttrs.padding) {
            const p = cellAttrs.padding;
            hash = hashNumber(hash, p.top ?? 0);
            hash = hashNumber(hash, p.right ?? 0);
            hash = hashNumber(hash, p.bottom ?? 0);
            hash = hashNumber(hash, p.left ?? 0);
          }
          if (cellAttrs.verticalAlign) {
            hash = hashString(hash, cellAttrs.verticalAlign);
          }
          if (cellAttrs.background) {
            hash = hashString(hash, cellAttrs.background);
          }
        }

        for (const cellBlock of cellBlocks) {
          hash = hashString(hash, cellBlock?.kind ?? 'unknown');
          if (cellBlock?.kind === 'paragraph') {
            const paragraphBlock = cellBlock as ParagraphBlock;
            const runs = paragraphBlock.runs ?? [];
            hash = hashNumber(hash, runs.length);

            // Include paragraph-level attributes that affect rendering
            // (alignment, spacing, indent, etc.) - fixes toolbar commands not updating tables
            const attrs = paragraphBlock.attrs as ParagraphAttrs | undefined;

            if (attrs) {
              hash = hashString(hash, attrs.alignment ?? '');
              hash = hashNumber(hash, attrs.spacing?.before ?? 0);
              hash = hashNumber(hash, attrs.spacing?.after ?? 0);
              hash = hashNumber(hash, attrs.spacing?.line ?? 0);
              hash = hashString(hash, attrs.spacing?.lineRule ?? '');
              hash = hashNumber(hash, attrs.indent?.left ?? 0);
              hash = hashNumber(hash, attrs.indent?.right ?? 0);
              hash = hashNumber(hash, attrs.indent?.firstLine ?? 0);
              hash = hashNumber(hash, attrs.indent?.hanging ?? 0);
              hash = hashString(hash, attrs.shading?.fill ?? '');
              hash = hashString(hash, attrs.shading?.color ?? '');
              hash = hashString(hash, attrs.direction ?? '');
              hash = hashString(hash, attrs.rtl ? '1' : '');
              if (attrs.borders) {
                hash = hashString(hash, hashParagraphBorders(attrs.borders));
              }
            }

            for (const run of runs) {
              // Only text runs have .text property; ImageRun does not
              if ('text' in run && typeof run.text === 'string') {
                hash = hashString(hash, run.text);
              }
              hash = hashNumber(hash, run.pmStart ?? -1);
              hash = hashNumber(hash, run.pmEnd ?? -1);

              // Include run formatting properties that affect rendering
              // (color, highlight, bold, italic, etc.) - fixes toolbar commands not updating tables
              hash = hashString(hash, getRunStringProp(run, 'color'));
              hash = hashString(hash, getRunStringProp(run, 'highlight'));
              hash = hashString(hash, getRunBooleanProp(run, 'bold') ? '1' : '');
              hash = hashString(hash, getRunBooleanProp(run, 'italic') ? '1' : '');
              hash = hashNumber(hash, getRunNumberProp(run, 'fontSize'));
              hash = hashString(hash, getRunStringProp(run, 'fontFamily'));
              hash = hashString(hash, getRunUnderlineStyle(run));
              hash = hashString(hash, getRunUnderlineColor(run));
              hash = hashString(hash, getRunBooleanProp(run, 'strike') ? '1' : '');
            }
          }
        }
      }
    }

    // Include table-level attributes (borders, etc.) that affect rendering
    // This ensures cache invalidation when table formatting changes (e.g., remove borders).
    if (tableBlock.attrs) {
      const tblAttrs = tableBlock.attrs as TableAttrs;
      if (tblAttrs.borders) {
        hash = hashString(hash, hashTableBorders(tblAttrs.borders));
      }
      if (tblAttrs.borderCollapse) {
        hash = hashString(hash, tblAttrs.borderCollapse);
      }
      if (tblAttrs.cellSpacing !== undefined) {
        hash = hashNumber(hash, tblAttrs.cellSpacing);
      }
    }

    return [block.id, tableBlock.rows.length, hash.toString(16)].join('|');
  }

  return block.id;
};

/**
 * Applies run styling properties to a DOM element.
 *
 * @param element - The HTML element to style
 * @param run - The run object containing styling information
 * @param _isLink - Whether this run is part of a hyperlink. Note: This parameter
 *                  is kept for API compatibility but no longer affects behavior -
 *                  inline colors are now applied to all runs (including links) to
 *                  ensure OOXML hyperlink character styles appear correctly.
 */
const applyRunStyles = (element: HTMLElement, run: Run, _isLink = false): void => {
  if (
    run.kind === 'tab' ||
    run.kind === 'image' ||
    run.kind === 'lineBreak' ||
    run.kind === 'break' ||
    run.kind === 'fieldAnnotation'
  ) {
    // Tab, image, lineBreak, break, and fieldAnnotation runs don't have text styling properties
    return;
  }

  element.style.fontFamily = run.fontFamily;
  element.style.fontSize = `${run.fontSize}px`;
  if (run.bold) element.style.fontWeight = 'bold';
  if (run.italic) element.style.fontStyle = 'italic';

  // Apply inline color even for links so OOXML hyperlink styles appear when CSS is absent
  if (run.color) element.style.color = run.color;

  if (run.letterSpacing != null) {
    element.style.letterSpacing = `${run.letterSpacing}px`;
  }
  if (run.highlight) {
    element.style.backgroundColor = run.highlight;
  }
  if (run.textTransform) {
    element.style.textTransform = run.textTransform;
  }

  // Apply text decorations from the run. Even for links, inline decorations should reflect
  // the document styling (tests assert underline presence on anchors).
  const decorations: string[] = [];
  if (run.underline) {
    decorations.push('underline');
    const u = run.underline;
    element.style.textDecorationStyle = u.style && u.style !== 'single' ? u.style : 'solid';
    if (u.color) {
      element.style.textDecorationColor = u.color;
    }
  }
  if (run.strike) {
    decorations.push('line-through');
  }
  if (decorations.length > 0) {
    element.style.textDecorationLine = decorations.join(' ');
  }
};

interface CommentHighlightResult {
  color?: string;
  baseColor?: string;
  hasNestedComments?: boolean;
}

const getCommentHighlight = (run: TextRun, activeCommentId: string | null): CommentHighlightResult => {
  const comments = run.comments;
  if (!comments || comments.length === 0) return {};

  // Helper to match comment by ID or importedId
  const matchesId = (c: { commentId: string; importedId?: string }, id: string) =>
    c.commentId === id || c.importedId === id;

  // When a comment is selected, only highlight that comment's range
  if (activeCommentId != null) {
    const activeComment = comments.find((c) =>
      matchesId(c as { commentId: string; importedId?: string }, activeCommentId),
    );
    if (activeComment) {
      const base = activeComment.internal ? COMMENT_INTERNAL_COLOR : COMMENT_EXTERNAL_COLOR;
      // Check if there are OTHER comments besides the active one (nested comments)
      const nestedComments = comments.filter(
        (c) => !matchesId(c as { commentId: string; importedId?: string }, activeCommentId),
      );
      return {
        color: `${base}${COMMENT_ACTIVE_ALPHA}`,
        baseColor: base,
        hasNestedComments: nestedComments.length > 0,
      };
    }
    // This run doesn't contain the active comment - still show light highlight for its own comments
    const primary = comments[0];
    const base = primary.internal ? COMMENT_INTERNAL_COLOR : COMMENT_EXTERNAL_COLOR;
    return { color: `${base}${COMMENT_INACTIVE_ALPHA}` };
  }

  // No active comment - show uniform light highlight (like Word/Google Docs)
  const primary = comments[0];
  const base = primary.internal ? COMMENT_INTERNAL_COLOR : COMMENT_EXTERNAL_COLOR;
  return { color: `${base}${COMMENT_INACTIVE_ALPHA}` };
};

/**
 * Applies data-* attributes from a text run to a DOM element.
 * Validates attribute names and safely sets them on the element.
 * Invalid or unsafe attributes are skipped with development-mode logging.
 *
 * @param element - The HTML element to apply attributes to
 * @param dataAttrs - Record of data-* attribute key-value pairs from the text run
 *
 * @example
 * ```typescript
 * const span = document.createElement('span');
 * applyRunDataAttributes(span, { 'data-id': '123', 'data-name': 'test' });
 * // span now has: <span data-id="123" data-name="test"></span>
 * ```
 */
export const applyRunDataAttributes = (element: HTMLElement, dataAttrs?: Record<string, string>): void => {
  if (!dataAttrs) return;
  Object.entries(dataAttrs).forEach(([key, value]) => {
    if (typeof key !== 'string' || !key.toLowerCase().startsWith('data-')) return;
    if (typeof value !== 'string') return;
    try {
      element.setAttribute(key, value);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[DomPainter] Failed to set data attribute "${key}":`, error);
      }
    }
  });
};

const applyParagraphBlockStyles = (element: HTMLElement, attrs?: ParagraphAttrs): void => {
  if (!attrs) return;
  if (attrs.styleId) {
    element.setAttribute('styleid', attrs.styleId);
  }
  if (attrs.alignment) {
    // Avoid native CSS justify: DomPainter applies justify via per-line word-spacing.
    element.style.textAlign = attrs.alignment === 'justify' ? 'left' : attrs.alignment;
  }
  if ((attrs as Record<string, unknown>).dropCap) {
    element.classList.add('sd-editor-dropcap');
  }
  const indent = attrs.indent;
  if (indent) {
    // Only apply positive indents as padding.
    // Negative indents are handled by fragment positioning in the layout engine.
    if (indent.left && indent.left > 0) {
      element.style.paddingLeft = `${indent.left}px`;
    }
    if (indent.right && indent.right > 0) {
      element.style.paddingRight = `${indent.right}px`;
    }
    // Skip textIndent when left indent is negative - fragment positioning handles the indent,
    // and per-line paddingLeft handles the hanging indent for body lines.
    const hasNegativeLeftIndent = indent.left != null && indent.left < 0;
    if (!hasNegativeLeftIndent) {
      const textIndent = (indent.firstLine ?? 0) - (indent.hanging ?? 0);
      if (textIndent) {
        element.style.textIndent = `${textIndent}px`;
      }
    }
  }
};

const getParagraphBorderBox = (
  fragmentWidth: number,
  indent?: ParagraphAttrs['indent'],
): { leftInset: number; width: number } => {
  const indentLeft = Number.isFinite(indent?.left) ? indent!.left! : 0;
  const indentRight = Number.isFinite(indent?.right) ? indent!.right! : 0;
  const firstLine = Number.isFinite(indent?.firstLine) ? indent!.firstLine! : 0;
  const hanging = Number.isFinite(indent?.hanging) ? indent!.hanging! : 0;
  const firstLineOffset = firstLine - hanging;
  const minLeftInset = Math.min(indentLeft, indentLeft + firstLineOffset);
  const leftInset = Math.max(0, minLeftInset);
  const rightInset = Math.max(0, indentRight);
  return {
    leftInset,
    width: Math.max(0, fragmentWidth - leftInset - rightInset),
  };
};

/**
 * Builds overlay elements for paragraph shading and borders with indent-aware sizing.
 * Returns layers in the order they should be appended (shading below borders).
 */
const createParagraphDecorationLayers = (
  doc: Document,
  fragmentWidth: number,
  attrs?: ParagraphAttrs,
): { shadingLayer?: HTMLElement; borderLayer?: HTMLElement } => {
  if (!attrs?.borders && !attrs?.shading) return {};
  const borderBox = getParagraphBorderBox(fragmentWidth, attrs.indent);
  const baseStyles = {
    position: 'absolute',
    top: '0px',
    bottom: '0px',
    left: `${borderBox.leftInset}px`,
    width: `${borderBox.width}px`,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  } as const;

  let shadingLayer: HTMLElement | undefined;
  if (attrs.shading) {
    shadingLayer = doc.createElement('div');
    shadingLayer.classList.add('superdoc-paragraph-shading');
    Object.assign(shadingLayer.style, baseStyles);
    applyParagraphShadingStyles(shadingLayer, attrs.shading);
  }

  let borderLayer: HTMLElement | undefined;
  if (attrs.borders) {
    borderLayer = doc.createElement('div');
    borderLayer.classList.add('superdoc-paragraph-border');
    Object.assign(borderLayer.style, baseStyles);
    borderLayer.style.zIndex = '1';
    applyParagraphBorderStyles(borderLayer, attrs.borders);
  }

  return { shadingLayer, borderLayer };
};

type BorderSide = keyof NonNullable<ParagraphAttrs['borders']>;
const BORDER_SIDES: BorderSide[] = ['top', 'right', 'bottom', 'left'];

/**
 * Applies paragraph border styles to an HTML element.
 * Sets CSS border properties (width, style, color) for each side specified in the borders object.
 *
 * @param {HTMLElement} element - The HTML element to apply border styles to
 * @param {ParagraphAttrs['borders']} borders - Optional borders object containing border definitions for top, right, bottom, and left sides
 *
 * @remarks
 * - Sets box-sizing to 'border-box' to ensure borders are included in element dimensions
 * - Each side's border is processed independently - only specified sides receive border styles
 * - Border width defaults to 1px if not specified, and negative widths are clamped to 0px
 * - Border style defaults to 'solid' if not specified or if style is not 'none'
 * - Border color defaults to '#000' (black) if not specified
 * - Border style 'none' is handled specially to ensure no visible border
 *
 * @example
 * ```typescript
 * applyParagraphBorderStyles(paraElement, {
 *   top: { width: 2, style: 'solid', color: '#FF0000' },
 *   bottom: { width: 1, style: 'dashed', color: '#0000FF' }
 * });
 * ```
 */
export const applyParagraphBorderStyles = (element: HTMLElement, borders?: ParagraphAttrs['borders']): void => {
  if (!borders) return;
  element.style.boxSizing = 'border-box';
  BORDER_SIDES.forEach((side) => {
    const border = borders[side];
    if (!border) return;
    setBorderSideStyle(element, side, border);
  });
};

const setBorderSideStyle = (element: HTMLElement, side: BorderSide, border: ParagraphBorder): void => {
  const cssSide = side;
  const resolvedStyle =
    border.style && border.style !== 'none' ? border.style : border.style === 'none' ? 'none' : 'solid';
  if (resolvedStyle === 'none') {
    element.style.setProperty(`border-${cssSide}-style`, 'none');
    element.style.setProperty(`border-${cssSide}-width`, '0px');
    if (border.color) {
      element.style.setProperty(`border-${cssSide}-color`, border.color);
    }
    return;
  }

  const width = border.width != null ? Math.max(0, border.width) : undefined;
  element.style.setProperty(`border-${cssSide}-style`, resolvedStyle);
  element.style.setProperty(`border-${cssSide}-width`, `${width ?? 1}px`);
  element.style.setProperty(`border-${cssSide}-color`, border.color ?? '#000');
};

const stripListIndent = (attrs?: ParagraphAttrs): ParagraphAttrs | undefined => {
  if (!attrs?.indent || attrs.indent.left == null) {
    return attrs;
  }
  const nextIndent = { ...attrs.indent };
  delete nextIndent.left;

  return {
    ...attrs,
    indent: Object.keys(nextIndent).length > 0 ? nextIndent : undefined,
  };
};

/**
 * Applies paragraph shading (background color) styles to an HTML element.
 * Sets the CSS background-color property based on the shading fill value.
 *
 * @param {HTMLElement} element - The HTML element to apply shading styles to
 * @param {ParagraphAttrs['shading']} shading - Optional shading object containing fill color definition
 *
 * @remarks
 * - Only applies background color if shading.fill is defined
 * - Currently only supports the `fill` property for solid color backgrounds
 * - Theme-based shading properties (themeColor, themeTint, themeShade) are not yet supported
 * - The fill value should be a valid CSS color string (hex, rgb, named color, etc.)
 *
 * @example
 * ```typescript
 * applyParagraphShadingStyles(paraElement, {
 *   fill: '#FFFF00'
 * });
 * ```
 */
export const applyParagraphShadingStyles = (element: HTMLElement, shading?: ParagraphAttrs['shading']): void => {
  if (!shading?.fill) return;
  element.style.backgroundColor = shading.fill;
};

/**
 * Extracts and slices text runs that belong to a specific line within a paragraph block.
 * Handles partial runs at line boundaries by creating sliced copies with correct character ranges.
 *
 * @param {ParagraphBlock} block - The paragraph block containing runs
 * @param {Line} line - The line definition with fromRun/toRun and fromChar/toChar ranges
 * @returns {Run[]} Array of runs (or sliced run portions) that comprise the line
 *
 * @remarks
 * - Preserves run styling and metadata (pmStart, pmEnd positions) in sliced runs
 * - Tab runs are only included if the slice contains the actual tab character
 * - Text runs are sliced to match exact character boundaries of the line
 * - Returns empty array if no valid runs are found within the line range
 *
 * @example
 * ```typescript
 * const line = { fromRun: 0, toRun: 2, fromChar: 5, toChar: 10 };
 * const runs = sliceRunsForLine(paragraphBlock, line);
 * // Returns runs or run slices that fall within the specified character range
 * ```
 */
export const sliceRunsForLine = (block: ParagraphBlock, line: Line): Run[] => {
  const result: Run[] = [];

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    // FIXED: ImageRun handling - images are atomic units, no slicing needed
    if (run.kind === 'image') {
      result.push(run);
      continue;
    }

    // LineBreakRun handling - line breaks don't have text content and are handled
    // by the measurer creating new lines. Include them for PM position tracking.
    if (run.kind === 'lineBreak') {
      result.push(run);
      continue;
    }

    // BreakRun handling - similar to LineBreakRun
    if (run.kind === 'break') {
      result.push(run);
      continue;
    }

    // TabRun handling - tabs don't need slicing
    if (run.kind === 'tab') {
      result.push(run);
      continue;
    }

    // FieldAnnotationRun handling - field annotations are atomic units like images
    if (run.kind === 'fieldAnnotation') {
      result.push(run);
      continue;
    }

    // At this point, run must be TextRun (has .text property)
    if (!('text' in run)) {
      continue;
    }

    const text = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;
    const runLength = text.length;
    const runPmStart = run.pmStart ?? null;
    const fallbackPmEnd = runPmStart != null && run.pmEnd == null ? runPmStart + runLength : (run.pmEnd ?? null);

    if (isFirstRun || isLastRun) {
      const start = isFirstRun ? line.fromChar : 0;
      const end = isLastRun ? line.toChar : text.length;
      const slice = text.slice(start, end);
      if (!slice) continue;

      const pmSliceStart = runPmStart != null ? runPmStart + start : undefined;
      const pmSliceEnd = runPmStart != null ? runPmStart + end : (fallbackPmEnd ?? undefined);

      // TextRun: return a sliced TextRun preserving styles
      const sliced: TextRun = {
        ...(run as TextRun),
        text: slice,
        pmStart: pmSliceStart,
        pmEnd: pmSliceEnd,
        comments: (run as TextRun).comments ? [...(run as TextRun).comments!] : undefined,
      };
      result.push(sliced);
    } else {
      result.push(run);
    }
  }

  return result;
};

const applyStyles = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void => {
  Object.entries(styles).forEach(([key, value]) => {
    if (value != null && value !== '' && key in el.style) {
      (el.style as unknown as Record<string, string>)[key] = String(value);
    }
  });
};

const resolveRunText = (run: Run, context: FragmentRenderContext): string => {
  const runToken = 'token' in run ? run.token : undefined;

  if (run.kind === 'tab') {
    return run.text;
  }
  if (run.kind === 'image') {
    // Image runs don't have text content
    return '';
  }
  if (run.kind === 'lineBreak') {
    // Line break runs don't render text - the measurer creates new lines for them
    return '';
  }
  if (run.kind === 'break') {
    // Break runs don't render text - the measurer creates new lines for them
    return '';
  }
  if (!('text' in run)) {
    // Safety check - if run doesn't have text property, return empty string
    return '';
  }
  if (!runToken) {
    return run.text ?? '';
  }
  if (runToken === 'pageNumber') {
    return context.pageNumberText ?? String(context.pageNumber);
  }
  if (runToken === 'totalPageCount') {
    return context.totalPages ? String(context.totalPages) : (run.text ?? '');
  }
  return run.text ?? '';
};

const computeTabWidth = (
  currentPos: number,
  justification: string,
  tabs: number[] | undefined,
  hangingIndent: number | undefined,
  firstLineIndent: number | undefined,
  leftIndent: number,
): number => {
  const nextDefaultTabStop = currentPos + DEFAULT_TAB_INTERVAL_PX - (currentPos % DEFAULT_TAB_INTERVAL_PX);
  let tabWidth: number;
  if ((justification ?? 'left') === 'left') {
    // Check for explicit tab stops past current position
    const explicitTabs = [...(tabs ?? [])];
    if (hangingIndent && hangingIndent > 0) {
      // Account for hanging indent by adding an implicit tab stop at (left + hanging)
      const implicitTabPos = leftIndent; // paraIndentLeft already accounts for hanging
      explicitTabs.push(implicitTabPos);
      // Sort tab stops to maintain order
      explicitTabs.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
        }
        return 0;
      });
    }
    let targetTabStop: number | undefined;

    if (Array.isArray(explicitTabs) && explicitTabs.length > 0) {
      // Find the first tab stop that's past the current position
      for (const tab of explicitTabs) {
        if (typeof tab === 'number' && tab > currentPos) {
          targetTabStop = tab;
          break;
        }
      }
    }

    if (targetTabStop === undefined) {
      // advance to next default 48px tab interval, matching Word behavior.
      targetTabStop = nextDefaultTabStop;
    }
    tabWidth = targetTabStop - currentPos;
  } else if (justification === 'right') {
    if (firstLineIndent != null && firstLineIndent > 0) {
      tabWidth = nextDefaultTabStop - currentPos;
    } else {
      tabWidth = hangingIndent ?? 0;
    }
  } else {
    tabWidth = nextDefaultTabStop - currentPos;
  }
  return tabWidth;
};
