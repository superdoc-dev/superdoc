import type { TabStop } from './engines/tabs.js';
export { computeTabStops, layoutWithTabs, calculateTabWidth } from './engines/tabs.js';

// Re-export TabStop for external consumers
export type { TabStop };

// Export table contracts
export { OOXML_PCT_DIVISOR, type TableWidthAttr, type TableColumnSpec } from './engines/tables.js';

// Export justify utilities
export {
  shouldApplyJustify,
  calculateJustifySpacing,
  SPACE_CHARS,
  type ShouldApplyJustifyParams,
  type CalculateJustifySpacingParams,
} from './justify-utils.js';

export { computeFragmentPmRange, computeLinePmRange, type LinePmRange } from './pm-range.js';
/** Inline field annotation metadata extracted from w:sdt nodes. */
export type FieldAnnotationMetadata = {
  type: 'fieldAnnotation';
  variant?: 'text' | 'image' | 'signature' | 'checkbox' | 'html' | 'link';
  fieldId: string;
  fieldType?: string;
  displayLabel?: string;
  defaultDisplayLabel?: string;
  alias?: string;
  fieldColor?: string;
  borderColor?: string;
  highlighted?: boolean;
  fontFamily?: string | null;
  fontSize?: string | number | null;
  textColor?: string | null;
  textHighlight?: string | null;
  linkUrl?: string | null;
  imageSrc?: string | null;
  rawHtml?: unknown;
  size?: {
    width?: number;
    height?: number;
  } | null;
  extras?: Record<string, unknown> | null;
  multipleImage?: boolean;
  hash?: string | null;
  generatorIndex?: number | null;
  sdtId?: string | null;
  hidden?: boolean;
  visibility?: 'visible' | 'hidden';
  isLocked?: boolean;
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
  marks?: Record<string, unknown>;
};

export type StructuredContentMetadata = {
  type: 'structuredContent';
  scope: 'inline' | 'block';
  id?: string | null;
  tag?: string | null;
  alias?: string | null;
  sdtPr?: unknown;
};

export type DocumentSectionMetadata = {
  type: 'documentSection';
  id?: string | null;
  title?: string | null;
  description?: string | null;
  sectionType?: string | null;
  isLocked?: boolean;
  sdBlockId?: string | null;
};

export type DocPartMetadata = {
  type: 'docPartObject';
  gallery?: string | null;
  uniqueId?: string | null;
  alias?: string | null;
  instruction?: string | null;
};

/**
 * Union of all SDT (Structured Document Tag) metadata variants.
 *
 * Word SDTs are flexible containers that can represent:
 * - Field annotations: inline placeholders for user input
 * - Structured content: containers with semantic tags (inline or block-level)
 * - Document sections: locked or conditional regions with titles
 * - Doc parts: special objects like tables of contents
 */
export type SdtMetadata =
  | FieldAnnotationMetadata
  | StructuredContentMetadata
  | DocumentSectionMetadata
  | DocPartMetadata;

export const CONTRACTS_VERSION = '1.0.0';

/** Unique identifier for a block in the document. Format: `${pos}-${type}`. */
export type BlockId = string;

/** Tab leader type for filling space before tab stops. */
export type LeaderType = 'dot' | 'heavy' | 'hyphen' | 'middleDot' | 'underscore';

export type TrackedChangeKind = 'insert' | 'delete' | 'format';

export type TrackedChangesMode = 'review' | 'original' | 'final' | 'off';

/** Formatting mark for track-format metadata. */
export type RunMark = {
  type: string;
  attrs?: Record<string, unknown> | null;
};

export type TrackedChangeMeta = {
  kind: TrackedChangeKind;
  id: string;
  author?: string;
  authorEmail?: string;
  authorImage?: string;
  date?: string;
  before?: RunMark[];
  after?: RunMark[];
};

export type FlowRunLinkTarget = '_blank' | '_self' | '_parent' | '_top';

export type FlowRunLink = {
  version?: 1 | 2;
  href?: string;
  title?: string;
  target?: FlowRunLinkTarget;
  rel?: string;
  tooltip?: string;
  anchor?: string;
  docLocation?: string;
  rId?: string;
  name?: string;
  history?: boolean;
};

/**
 * Common formatting marks that can be applied to any run type.
 * Used by TextRun, TabRun, and other run types that support inline formatting.
 */
export type RunMarks = {
  /** Bold text styling. */
  bold?: boolean;
  /** Italic text styling. */
  italic?: boolean;
  /** Additional letter spacing in pixels (positive for expanded, negative for condensed). */
  letterSpacing?: number;
  /** Text color as hex string (e.g., "#FF0000"). */
  color?: string;
  /** Underline decoration with optional style and color. */
  underline?: {
    /** Underline style (defaults to 'single'). */
    style?: 'single' | 'double' | 'dotted' | 'dashed' | 'wavy';
    /** Underline color as hex string (defaults to text color). */
    color?: string;
  } | null;
  /** Strikethrough text decoration. */
  strike?: boolean;
  /** Highlight (background) color as hex string. */
  highlight?: string;
  /** Text transformation (case modification). */
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
};

export type TextRun = RunMarks & {
  kind?: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  /** Comment annotations applied to this run (supports overlapping comments). */
  comments?: Array<{
    commentId: string;
    importedId?: string;
    internal?: boolean;
    trackedChange?: boolean;
  }>;
  /**
   * Custom data attributes propagated from ProseMirror marks (keys must be data-*).
   */
  dataAttrs?: Record<string, string>;
  sdt?: SdtMetadata;
  link?: FlowRunLink;
  /** Token annotations for dynamic content (page numbers, etc.). */
  token?: 'pageNumber' | 'totalPageCount' | 'pageReference';
  /** Absolute ProseMirror position (inclusive) of first character in this run. */
  pmStart?: number;
  /** Absolute ProseMirror position (exclusive) after the last character. */
  pmEnd?: number;
  /** Metadata for page reference tokens (only when token === 'pageReference'). */
  pageRefMetadata?: {
    bookmarkId: string;
    instruction: string;
  };
  /** Tracked-change metadata from ProseMirror marks. */
  trackedChange?: TrackedChangeMeta;
};

export type TabRun = RunMarks & {
  kind: 'tab';
  text: '\t';
  /** Width in pixels (assigned by measurer/resolver). */
  width?: number;
  tabStops?: TabStop[];
  tabIndex?: number;
  leader?: LeaderType | null;
  decimalChar?: string;
  indent?: ParagraphIndent;
  pmStart?: number;
  pmEnd?: number;
};

export type LineBreakRun = {
  kind: 'lineBreak';
  /**
   * Optional attributes carried through from the source document.
   * Mirrors OOXML <w:br> attributes (type/clear) to preserve fidelity.
   */
  attrs?: {
    lineBreakType?: string;
    clear?: string;
  };
  pmStart?: number;
  pmEnd?: number;
};

/**
 * Inline image run for images that flow with text on the same line.
 * Unlike ImageBlock (anchored/floating images), ImageRun is part of the paragraph's run array
 * and participates in line breaking alongside text.
 *
 * Corresponds to Microsoft Word's inline images (<wp:inline> in DOCX).
 *
 * @example
 * // A paragraph with text and inline image:
 * {
 *   kind: 'paragraph',
 *   runs: [
 *     { kind: 'text', text: 'Here is an image: ', ... },
 *     { kind: 'image', src: 'data:...', width: 100, height: 50, ... },
 *     { kind: 'text', text: ' within text.', ... }
 *   ]
 * }
 */
export type ImageRun = {
  kind: 'image';
  /** Image source URL (data URI or external URL). */
  src: string;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Alternative text for accessibility. */
  alt?: string;
  /** Image title (tooltip). */
  title?: string;

  /**
   * Spacing around the image (from DOCX distT/distB/distL/distR attributes).
   * Applied as CSS margins in the DOM painter.
   * All values in pixels.
   */
  distTop?: number;
  distBottom?: number;
  distLeft?: number;
  distRight?: number;

  /**
   * Vertical alignment of image relative to text baseline.
   * Currently only 'bottom' is supported (image sits on baseline).
   * Future: 'top', 'middle', 'baseline', 'text-top', 'text-bottom'.
   */
  verticalAlign?: 'bottom';

  /** Absolute ProseMirror position (inclusive) of this image run. */
  pmStart?: number;
  /** Absolute ProseMirror position (exclusive) after this image run. */
  pmEnd?: number;

  /** SDT metadata if image is wrapped in a structured document tag. */
  sdt?: SdtMetadata;

  /**
   * Custom data attributes propagated from ProseMirror marks (keys must be data-*).
   */
  dataAttrs?: Record<string, string>;
};

export type BreakRun = {
  kind: 'break';
  /** Optional break type (e.g., 'line', 'page', 'column') */
  breakType?: 'line' | 'page' | 'column' | string;
  pmStart?: number;
  pmEnd?: number;
  sdt?: SdtMetadata;
};

/**
 * Inline field annotation run for interactive form fields displayed as styled "pills".
 * Renders as a bordered, rounded inline element with displayLabel or type-specific content.
 *
 * Corresponds to super-editor's FieldAnnotation node which renders via FieldAnnotationView.
 *
 * @example
 * // A paragraph with text and field annotation:
 * {
 *   kind: 'paragraph',
 *   runs: [
 *     { kind: 'text', text: 'Enter name: ', ... },
 *     { kind: 'fieldAnnotation', variant: 'text', displayLabel: 'Full Name', fieldColor: '#980043', ... },
 *   ]
 * }
 */
export type FieldAnnotationRun = {
  kind: 'fieldAnnotation';
  /** The variant/type of field annotation. */
  variant: 'text' | 'image' | 'signature' | 'checkbox' | 'html' | 'link';
  /** Display text shown inside the pill (fallback for all types). */
  displayLabel: string;
  /** Unique field identifier. */
  fieldId?: string;
  /** Field type identifier (e.g., 'TEXTINPUT', 'SIGNATURE'). */
  fieldType?: string;
  /** Background color as hex string (e.g., "#980043"). Applied with alpha. */
  fieldColor?: string;
  /** Border color as hex string (e.g., "#b015b3"). */
  borderColor?: string;
  /** Whether to show the pill styling (border, background). Defaults to true. */
  highlighted?: boolean;
  /** Whether the field is hidden (display: none). */
  hidden?: boolean;
  /** CSS visibility value. */
  visibility?: 'visible' | 'hidden';

  // Type-specific content
  /** Image source URL for image/signature variants. */
  imageSrc?: string | null;
  /** Link URL for link variant. */
  linkUrl?: string | null;
  /** Raw HTML content for html variant. */
  rawHtml?: string | null;

  // Sizing
  /** Explicit size for the annotation (used for images). */
  size?: {
    width?: number;
    height?: number;
  } | null;

  // Typography (applied to the displayLabel text)
  /** Font family for the label text. */
  fontFamily?: string | null;
  /** Font size in points or pixels (e.g., "12pt", 14). */
  fontSize?: string | number | null;
  /** Text color as hex string. */
  textColor?: string | null;
  /** Text highlight/background color (overrides fieldColor). */
  textHighlight?: string | null;
  /** Bold text styling. */
  bold?: boolean;
  /** Italic text styling. */
  italic?: boolean;
  /** Underline text styling. */
  underline?: boolean;

  /** Absolute ProseMirror position (inclusive) of this run. */
  pmStart?: number;
  /** Absolute ProseMirror position (exclusive) after this run. */
  pmEnd?: number;

  /** Full SDT metadata if available. */
  sdt?: SdtMetadata;
};

export type Run = TextRun | TabRun | ImageRun | LineBreakRun | BreakRun | FieldAnnotationRun;

export type ParagraphBlock = {
  kind: 'paragraph';
  id: BlockId;
  runs: Run[];
  attrs?: ParagraphAttrs;
};

/** Border style (subset of OOXML ST_Border). */
export type BorderStyle =
  | 'none'
  | 'single'
  | 'double'
  | 'dashed'
  | 'dotted'
  | 'thick'
  | 'triple'
  | 'dotDash'
  | 'dotDotDash'
  | 'wave'
  | 'doubleWave';

/** Border specification for table and cell borders. */
export type BorderSpec = {
  style?: BorderStyle;
  width?: number;
  color?: string;
  space?: number;
};

/**
 * Three-state border value for table borders.
 * - `null`: inherit from table style
 * - `{ none: true }`: explicit "no border"
 * - `BorderSpec`: explicit border
 */
export type TableBorderValue = null | { none: true } | BorderSpec;

/** Table-level border configuration (outer + inner borders). */
export type TableBorders = {
  top?: TableBorderValue;
  right?: TableBorderValue;
  bottom?: TableBorderValue;
  left?: TableBorderValue;
  insideH?: TableBorderValue;
  insideV?: TableBorderValue;
};

/** Cell-level border configuration (overrides table-level borders). */
export type CellBorders = {
  top?: BorderSpec;
  right?: BorderSpec;
  bottom?: BorderSpec;
  left?: BorderSpec;
};

export type TableCellAttrs = {
  borders?: CellBorders;
  padding?: BoxSpacing;
  verticalAlign?: 'top' | 'middle' | 'center' | 'bottom';
  background?: string;
  tableCellProperties?: Record<string, unknown>;
};

export type TableAttrs = {
  borders?: TableBorders;
  borderCollapse?: 'collapse' | 'separate';
  cellSpacing?: number;
  sdt?: SdtMetadata;
  containerSdt?: SdtMetadata;
  [key: string]: unknown;
};

export type TableCell = {
  id: BlockId;
  /** Multi-block cell content (new feature) */
  blocks?: (ParagraphBlock | ImageBlock | DrawingBlock | TableBlock)[];
  /** Single paragraph (backward compatibility) */
  paragraph?: ParagraphBlock;
  rowSpan?: number;
  colSpan?: number;
  attrs?: TableCellAttrs;
};

export type TableRowAttrs = {
  tableRowProperties?: Record<string, unknown>;
  rowHeight?: {
    value: number;
    rule?: 'auto' | 'atLeast' | 'exact' | string;
  };
};

export type TableRow = {
  id: BlockId;
  cells: TableCell[];
  attrs?: TableRowAttrs;
};

export type TableBlock = {
  kind: 'table';
  id: BlockId;
  rows: TableRow[];
  attrs?: TableAttrs;
  /** Column widths in pixels from OOXML w:tblGrid. */
  columnWidths?: number[];
  /** Anchor positioning for floating tables (from w:tblpPr). */
  anchor?: TableAnchor;
  /** Text wrapping for floating tables (from w:tblpPr distances). */
  wrap?: TableWrap;
};

export type BoxSpacing = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type PageMargins = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  header?: number;
  footer?: number;
  gutter?: number;
};

export type ImageBlockAttrs = {
  sdt?: SdtMetadata;
  containerSdt?: SdtMetadata;
  [key: string]: unknown;
};

export type ImageBlock = {
  kind: 'image';
  id: BlockId;
  src: string;
  width?: number;
  height?: number;
  alt?: string;
  title?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'scale-down';
  display?: 'inline' | 'block';
  padding?: BoxSpacing;
  margin?: BoxSpacing;
  anchor?: ImageAnchor;
  wrap?: ImageWrap;
  attrs?: ImageBlockAttrs;
  // VML image adjustments for watermark effects
  gain?: string | number; // Brightness/washout (VML hex string or number)
  blacklevel?: string | number; // Contrast adjustment (VML hex string or number)
};

export type DrawingKind = 'image' | 'vectorShape' | 'shapeGroup';

export type DrawingContentSnapshot = {
  name: string;
  attributes?: Record<string, unknown>;
  elements?: unknown[];
};

export type DrawingGeometry = {
  width: number;
  height: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
};

export type PositionedDrawingGeometry = DrawingGeometry & {
  x?: number;
  y?: number;
};

/** Gradient stop for gradient fills. Defines a color at a specific position along the gradient. */
export type GradientStop = {
  /** Position along the gradient (0-1 range, where 0 is start and 1 is end). */
  position: number;
  /** Hex color code (e.g., "#FF0000"). */
  color: string;
  /** Optional alpha/opacity value (0-1 range). */
  alpha?: number;
};

/** Gradient fill configuration for linear or radial gradients. */
export type GradientFill = {
  type: 'gradient';
  /** Type of gradient: linear (directional) or radial (circular). */
  gradientType: 'linear' | 'radial';
  /** Array of color stops defining the gradient. */
  stops: GradientStop[];
  /** Angle in degrees for linear gradients (0 = left to right, 90 = bottom to top). */
  angle: number;
  /** Path descriptor for radial gradients (e.g., 'circle'). */
  path?: string;
};

/** Solid fill with alpha transparency. */
export type SolidFillWithAlpha = {
  type: 'solidWithAlpha';
  /** Hex color code. */
  color: string;
  /** Alpha/opacity value (0-1 range, where 0 is fully transparent and 1 is fully opaque). */
  alpha: number;
};

/**
 * Fill color for shapes. Can be:
 * - string: Simple hex color (e.g., "#FF0000") for backward compatibility
 * - GradientFill: Linear or radial gradient
 * - SolidFillWithAlpha: Solid color with transparency
 * - null: No fill
 */
export type FillColor = string | GradientFill | SolidFillWithAlpha | null;

/**
 * Stroke color for shapes. Can be:
 * - string: Hex color (e.g., "#000000")
 * - null: Explicitly no border/stroke
 */
export type StrokeColor = string | null;

/** Text formatting options for shape text content. */
export type TextFormatting = {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
};

/** A single text part with optional formatting. */
export type TextPart = {
  text: string;
  formatting?: TextFormatting;
  /** Optional field token (e.g., PAGE/NUMPAGES) resolved at render time. */
  fieldType?: 'PAGE' | 'NUMPAGES';
  /** Indicates this part represents a line break between paragraphs. */
  isLineBreak?: boolean;
  /** Indicates this line break follows an empty paragraph (creates extra spacing). */
  isEmptyParagraph?: boolean;
};

/** Text content configuration for shapes. */
export type ShapeTextContent = {
  /** Array of text parts with individual formatting. */
  parts: TextPart[];
  /** Horizontal text alignment within the shape. */
  horizontalAlign?: 'left' | 'center' | 'right';
};

export type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

export type LineEnds = {
  head?: LineEnd;
  tail?: LineEnd;
};

export type EffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type VectorShapeStyle = {
  fillColor?: FillColor;
  strokeColor?: StrokeColor;
  strokeWidth?: number;
  lineEnds?: LineEnds;
  textContent?: ShapeTextContent;
  textAlign?: string;
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type ShapeGroupTransform = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  childX?: number;
  childY?: number;
  childWidth?: number;
  childHeight?: number;
  childOriginXEmu?: number;
  childOriginYEmu?: number;
};

export type ShapeGroupVectorChild = {
  shapeType: 'vectorShape';
  attrs: PositionedDrawingGeometry &
    VectorShapeStyle & {
      kind?: string;
      shapeId?: string;
      shapeName?: string;
    };
};

export type ShapeGroupImageChild = {
  shapeType: 'image';
  attrs: PositionedDrawingGeometry & {
    src: string;
    alt?: string;
    imageId?: string;
    imageName?: string;
  };
};

export type ShapeGroupUnknownChild = {
  shapeType: string;
  attrs: Record<string, unknown>;
};

export type ShapeGroupChild = ShapeGroupVectorChild | ShapeGroupImageChild | ShapeGroupUnknownChild;

export type DrawingBlockBase = {
  kind: 'drawing';
  id: BlockId;
  drawingKind: DrawingKind;
  margin?: BoxSpacing;
  padding?: BoxSpacing;
  anchor?: ImageAnchor;
  wrap?: ImageWrap;
  zIndex?: number;
  drawingContentId?: string;
  drawingContent?: DrawingContentSnapshot;
  attrs?: Record<string, unknown>;
};

export type VectorShapeDrawing = DrawingBlockBase & {
  drawingKind: 'vectorShape';
  geometry: DrawingGeometry;
  shapeKind?: string;
  fillColor?: FillColor;
  strokeColor?: StrokeColor;
  strokeWidth?: number;
  lineEnds?: LineEnds;
  effectExtent?: EffectExtent;
  textContent?: ShapeTextContent;
  textAlign?: string;
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type ShapeGroupDrawing = DrawingBlockBase & {
  drawingKind: 'shapeGroup';
  geometry: DrawingGeometry;
  groupTransform?: ShapeGroupTransform;
  shapes: ShapeGroupChild[];
  size?: {
    width?: number;
    height?: number;
  };
};

export type ImageDrawing = DrawingBlockBase &
  Omit<ImageBlock, 'kind' | 'id' | 'margin' | 'padding' | 'anchor' | 'wrap'> & {
    drawingKind: 'image';
  };

export type DrawingBlock = VectorShapeDrawing | ShapeGroupDrawing | ImageDrawing;

/**
 * Vertical alignment of content within a section/page.
 * Maps to OOXML w:vAlign values in sectPr.
 */
export type SectionVerticalAlign = 'top' | 'center' | 'bottom' | 'both';

export type SectionBreakBlock = {
  kind: 'sectionBreak';
  id: BlockId;
  type?: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage';
  pageSize?: { w: number; h: number };
  orientation?: 'portrait' | 'landscape';
  margins: {
    /** Header margin (distance from top of page to header content) */
    header?: number;
    /** Footer margin (distance from bottom of page to footer content) */
    footer?: number;
    /** Top page margin (distance from top of page to body content) */
    top?: number;
    /** Right page margin */
    right?: number;
    /** Bottom page margin */
    bottom?: number;
    /** Left page margin */
    left?: number;
  };
  numbering?: {
    format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
    start?: number;
  };
  headerRefs?: {
    default?: string;
    first?: string;
    even?: string;
    odd?: string;
  };
  footerRefs?: {
    default?: string;
    first?: string;
    even?: string;
    odd?: string;
  };
  columns?: {
    count: number;
    gap: number;
    equalWidth?: boolean;
  };
  /**
   * Vertical alignment of content within the section's pages.
   * - 'top': Content starts at top margin (default behavior)
   * - 'center': Content is vertically centered between margins
   * - 'bottom': Content is aligned to bottom margin
   * - 'both': Content is vertically justified (distributed)
   */
  vAlign?: SectionVerticalAlign;
  attrs?: {
    source?: string;
    requirePageBoundary?: boolean;
    [key: string]: unknown;
  };
};

export type SectionRefType = 'default' | 'first' | 'even' | 'odd';

export type SectionRefs = {
  headerRefs?: Partial<Record<SectionRefType, string>>;
  footerRefs?: Partial<Record<SectionRefType, string>>;
};

export type SectionNumbering = {
  format?: 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'numberInDash';
  start?: number;
};

export type SectionMetadata = {
  sectionIndex: number;
  headerRefs?: Partial<Record<SectionRefType, string>>;
  footerRefs?: Partial<Record<SectionRefType, string>>;
  numbering?: SectionNumbering;
  /** Whether first page has a different header/footer (w:titlePg in OOXML) */
  titlePg?: boolean;
  /** Vertical alignment of content within this section's pages */
  vAlign?: SectionVerticalAlign;
};

export type PageBreakBlock = {
  kind: 'pageBreak';
  id: BlockId;
  attrs?: Record<string, unknown>;
};

export type ColumnBreakBlock = {
  kind: 'columnBreak';
  id: BlockId;
  attrs?: Record<string, unknown>;
};

/** Positioning for anchored images (offsets in CSS px). */
export type ImageAnchor = {
  isAnchored?: boolean;
  hRelativeFrom?: 'column' | 'page' | 'margin';
  vRelativeFrom?: 'paragraph' | 'page' | 'margin';
  alignH?: 'left' | 'center' | 'right';
  alignV?: 'top' | 'center' | 'bottom';
  offsetH?: number;
  offsetV?: number;
  behindDoc?: boolean;
  padding?: BoxSpacing | undefined;
  margin?: BoxSpacing | undefined;
};

/** Text wrapping for floating images (distances in px). */
export type ImageWrap = {
  type: 'None' | 'Square' | 'Tight' | 'Through' | 'TopAndBottom' | 'Inline';
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  distTop?: number;
  distBottom?: number;
  distLeft?: number;
  distRight?: number;
  polygon?: number[][];
  behindDoc?: boolean;
};

/**
 * Positioning for anchored/floating tables (offsets in CSS px).
 * Corresponds to OOXML w:tblpPr attributes.
 */
export type TableAnchor = {
  isAnchored?: boolean;
  /** Horizontal anchor reference: column, page, or margin. Maps from w:horzAnchor. */
  hRelativeFrom?: 'column' | 'page' | 'margin';
  /** Vertical anchor reference: paragraph (text), page, or margin. Maps from w:vertAnchor. */
  vRelativeFrom?: 'paragraph' | 'page' | 'margin';
  /** Horizontal alignment relative to anchor. Maps from w:tblpXSpec. */
  alignH?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  /** Vertical alignment relative to anchor. Maps from w:tblpYSpec. */
  alignV?: 'top' | 'center' | 'bottom' | 'inside' | 'outside' | 'inline';
  /** Absolute horizontal offset in px. Maps from w:tblpX (twips converted to px). */
  offsetH?: number;
  /** Absolute vertical offset in px. Maps from w:tblpY (twips converted to px). */
  offsetV?: number;
};

/**
 * Text wrapping for floating tables (distances in px).
 * Tables only support Square or None wrapping (not Tight/Through like images).
 */
export type TableWrap = {
  /** Wrap type: Square for text wrapping, None for absolute positioning. */
  type: 'Square' | 'None';
  /** Which side(s) text flows on. */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Distance from text above table (px). Maps from w:topFromText. */
  distTop?: number;
  /** Distance from text below table (px). Maps from w:bottomFromText. */
  distBottom?: number;
  /** Distance from text to left of table (px). Maps from w:leftFromText. */
  distLeft?: number;
  /** Distance from text to right of table (px). Maps from w:rightFromText. */
  distRight?: number;
};

/** Exclusion zone for text wrapping around anchored images. */
export type ExclusionZone = {
  imageBlockId: BlockId;
  pageNumber: number;
  columnIndex: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  distances: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  wrapMode: 'left' | 'right' | 'both' | 'none' | 'largest';
  polygon?: number[][];
};

export type ParagraphSpacing = {
  before?: number;
  after?: number;
  line?: number;
  lineUnit?: 'px' | 'multiplier';
  lineRule?: 'auto' | 'exact' | 'atLeast';
  beforeAutospacing?: boolean;
  afterAutospacing?: boolean;
};

export type ParagraphIndent = {
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
};

export type ParagraphBorder = {
  style?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
  width?: number;
  color?: string;
  space?: number;
};

export type ParagraphBorders = {
  top?: ParagraphBorder;
  right?: ParagraphBorder;
  bottom?: ParagraphBorder;
  left?: ParagraphBorder;
};

export type ParagraphShading = {
  fill?: string;
  color?: string;
  val?: string;
  themeColor?: string;
  themeFill?: string;
  themeFillShade?: string;
  themeFillTint?: string;
  themeShade?: string;
  themeTint?: string;
};

/**
 * Run styling for drop cap letter.
 * Contains the text and font properties of the drop cap character(s).
 */
export type DropCapRun = {
  /** The drop cap text (usually a single capital letter). */
  text: string;
  /** Font family for the drop cap. */
  fontFamily: string;
  /** Font size in pixels (typically much larger than body text, e.g., 117pt). */
  fontSize: number;
  /** Bold styling. */
  bold?: boolean;
  /** Italic styling. */
  italic?: boolean;
  /** Text color. */
  color?: string;
  /** Vertical position offset in pixels (from w:position, e.g., -10). */
  position?: number;
};

/**
 * Structured drop cap descriptor for layout engine.
 *
 * Drop caps are enlarged initial letters that span multiple lines of text.
 * OOXML encodes drop caps via w:framePr with @w:dropCap attribute on a separate
 * paragraph containing just the drop cap letter, followed by the text paragraph.
 *
 * Layout engine merges these into a single paragraph with this descriptor
 * to enable proper measurement and rendering.
 */
export type DropCapDescriptor = {
  /**
   * Drop cap mode:
   * - 'drop': Letter drops into the text area (most common)
   * - 'margin': Letter sits in the left margin
   */
  mode: 'drop' | 'margin';
  /**
   * Number of lines the drop cap spans (from w:lines attribute, typically 2-5).
   * Determines the height of the drop cap box.
   */
  lines: number;
  /**
   * The drop cap run containing text and styling.
   */
  run: DropCapRun;
  /**
   * Text wrapping mode (from w:wrap attribute on framePr).
   * - 'around': Text wraps around the drop cap (default)
   * - 'notBeside': Text does not wrap beside drop cap
   * - 'none': No special wrapping
   * - 'tight': Tight wrapping
   */
  wrap?: 'around' | 'notBeside' | 'none' | 'tight';
  /**
   * Measured width of the drop cap in pixels (populated during measurement).
   */
  measuredWidth?: number;
  /**
   * Measured height of the drop cap in pixels (populated during measurement).
   */
  measuredHeight?: number;
};

/**
 * Marker metadata for word-layout lists.
 * Contains styling and positioning information for list markers.
 */
export type WordLayoutMarker = {
  /** The text content of the marker (e.g., "1.", "a)", "•"). */
  markerText?: string;
  /** Horizontal alignment of the marker within its allocated space. */
  justification?: 'left' | 'right' | 'center';
  /** Spacing between marker text and paragraph content in pixels. */
  gutterWidthPx?: number;
  /** Total width allocated for the marker box in pixels. */
  markerBoxWidthPx?: number;
  /** Type of separator between marker and text (tab, space, or nothing). */
  suffix?: 'tab' | 'space' | 'nothing';
  /** Pre-calculated X position where the marker should be placed (used in firstLineIndentMode). */
  markerX?: number;
  /** Pre-calculated X position where paragraph text should begin after the marker (used in firstLineIndentMode). */
  textStartX?: number;
  /** Style properties for the marker text. */
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
 * Word layout configuration for list items created via input rules.
 *
 * This type represents the structure of wordLayout data produced by @superdoc/word-layout
 * for paragraphs with list markers. It contains metadata about marker positioning and
 * text alignment that differs from standard hanging-indent lists.
 *
 * Two distinct list rendering modes exist:
 * 1. **Standard hanging indent**: Marker sits in hanging indent area, text starts at paraIndentLeft
 * 2. **First-line indent mode**: Marker is at paraIndentLeft + firstLine, text starts at textStartPx
 *
 * This type enables type-safe access to word-layout-specific properties without unsafe casts.
 *
 * @example
 * ```typescript
 * // Standard hanging indent list (marker in hanging indent area)
 * const standardListConfig: WordLayoutConfig = {
 *   marker: {
 *     markerText: "1.",
 *     justification: "right",
 *     gutterWidthPx: 18
 *   }
 * };
 * // Text starts at paraIndentLeft, marker is placed in hanging indent area
 * ```
 *
 * @example
 * ```typescript
 * // First-line indent mode list (input-rule created, e.g., typing "1. ")
 * const firstLineIndentConfig: WordLayoutConfig = {
 *   firstLineIndentMode: true,
 *   textStartPx: 56,  // Pre-calculated: paraIndentLeft + firstLine + markerWidth + tabWidth
 *   marker: {
 *     markerText: "1.",
 *     markerX: 36,      // Position where marker renders
 *     textStartX: 56    // Where text starts after marker
 *   }
 * };
 * // Text starts at textStartPx (56px), marker is at markerX (36px)
 * ```
 *
 * @example
 * ```typescript
 * // Checking for first-line indent mode in layout code
 * const wordLayout = block.attrs?.wordLayout;
 * if (wordLayout?.firstLineIndentMode) {
 *   const textStart = wordLayout.textStartPx ?? 0;
 *   // Use textStart for positioning text on first line
 * } else {
 *   // Use standard hanging indent calculations
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Non-list paragraph (no word layout config)
 * const regularParagraph = {
 *   kind: 'paragraph',
 *   attrs: {
 *     indent: { left: 36, firstLine: 18 }
 *     // No wordLayout property
 *   }
 * };
 * // Text positioning uses standard paragraph indent logic
 * ```
 */
export type WordLayoutConfig = {
  /**
   * Whether this list uses first-line indent mode (true for input-rule-created lists).
   * When true, text positioning uses textStartPx instead of standard hanging indent calculations.
   */
  firstLineIndentMode?: boolean;
  /**
   * Absolute X position in pixels where text content starts on the first line.
   * Includes marker width, tab width, and any additional spacing.
   * Only meaningful when firstLineIndentMode is true.
   */
  textStartPx?: number;
  /**
   * Marker metadata for word-layout lists.
   * Present when the paragraph is part of a list structure.
   */
  marker?: WordLayoutMarker;
  /**
   * Additional word-layout properties may be present but are not yet typed.
   */
  [key: string]: unknown;
};

export type ParagraphAttrs = {
  styleId?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  spacing?: ParagraphSpacing;
  /**
   * Indicates which spacing properties were explicitly set on the paragraph.
   * Used to preserve Word behavior for empty paragraphs when spacing only comes
   * from docDefaults or styles.
   */
  spacingExplicit?: {
    before?: boolean;
    after?: boolean;
    line?: boolean;
  };
  contextualSpacing?: boolean;
  indent?: ParagraphIndent;
  /** Word quirk: justified paragraphs ignore first-line indent. Set by pm-adapter. */
  suppressFirstLineIndent?: boolean;
  /**
   * Legacy drop cap flag from w:framePr/@w:dropCap.
   * @deprecated Use dropCapDescriptor for full drop cap support.
   */
  dropCap?: string | number | boolean;
  /**
   * Structured drop cap descriptor with full metadata.
   * When present, layout engine will render the drop cap with proper geometry.
   */
  dropCapDescriptor?: DropCapDescriptor;
  frame?: ParagraphFrame;
  numberingProperties?: { ilvl?: number; numId?: number } | null;
  borders?: ParagraphBorders;
  shading?: ParagraphShading;
  tabs?: TabStop[];
  decimalSeparator?: string;
  tabIntervalTwips?: number;
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  trackedChangesMode?: TrackedChangesMode;
  trackedChangesEnabled?: boolean;
  /** Marks an empty paragraph that only exists to carry section properties. */
  sectPrMarker?: boolean;
  direction?: 'ltr' | 'rtl';
  rtl?: boolean;
  isTocEntry?: boolean;
  tocInstruction?: string;
  /** Floating alignment for positioned paragraphs (from w:framePr/@w:xAlign). */
  floatAlignment?: 'left' | 'right' | 'center';
  /**
   * Word paragraph layout output from @superdoc/word-layout.
   * Contains metadata about list marker positioning and text alignment for word-layout lists.
   * Use WordLayoutConfig type for type-safe access to known properties.
   */
  wordLayout?: WordLayoutConfig;
  sdt?: SdtMetadata;
  /** Container SDT for blocks with both primary and container metadata. */
  containerSdt?: SdtMetadata;
};

export type ParagraphFrame = {
  wrap?: string;
  x?: number;
  y?: number;
  xAlign?: 'left' | 'right' | 'center';
  yAlign?: 'top' | 'center' | 'bottom';
  hAnchor?: string;
  vAnchor?: string;
};

export type ListMarker = {
  kind: 'bullet' | 'number';
  text: string;
  level: number;
  order?: number;
  style?: string;
  numId?: string;
  levels?: number[];
  numberingType?: string;
  lvlText?: string;
  customFormat?: string;
  align?: 'left' | 'center' | 'right';
};

export type ListItem = {
  id: BlockId;
  marker: ListMarker;
  paragraph: ParagraphBlock;
};

export type ListBlock = {
  kind: 'list';
  id: BlockId;
  listType: 'bullet' | 'number';
  items: ListItem[];
};

export type FlowBlock =
  | ParagraphBlock
  | ImageBlock
  | DrawingBlock
  | ListBlock
  | TableBlock
  | SectionBreakBlock
  | PageBreakBlock
  | ColumnBreakBlock;

export type ColumnLayout = {
  count: number;
  gap: number;
};

/** A measured line within a block, output by the measurer. */
export type Line = {
  fromRun: number;
  fromChar: number;
  toRun: number;
  toChar: number;
  width: number;
  ascent: number;
  descent: number;
  lineHeight: number;
  /** Maximum available width for this line (used during measurement). */
  maxWidth?: number;
  /** Content width before justify compression (used for negative word-spacing calculation). */
  naturalWidth?: number;
  /** Number of spaces in the line (pre-computed for efficiency in justify calculations). */
  spaceCount?: number;
  segments?: LineSegment[];
  leaders?: LeaderDecoration[];
  bars?: BarDecoration[];
};

export type LineSegment = {
  runIndex: number;
  fromChar: number;
  toChar: number;
  width: number;
  x?: number;
};

export type LeaderDecoration = {
  from: number;
  to: number;
  style: 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';
};

export type BarDecoration = {
  x: number;
};

export type ParagraphMeasure = {
  kind: 'paragraph';
  lines: Line[];
  totalHeight: number;
  marker?: {
    markerWidth: number;
    /**
     * The actual rendered text width of the marker glyphs in pixels (e.g., "1." text width).
     * This represents the precise width of the marker text content, as opposed to markerWidth
     * which includes padding and represents the full marker box width.
     *
     * Used by the renderer for tab positioning calculations to match Word's behavior, where
     * tabs extend from the end of the actual marker text (not the marker box edge) to the
     * next tab stop. This ensures proper alignment between the marker and paragraph content.
     *
     * When undefined or null, the renderer falls back to using markerWidth for compatibility.
     *
     * @see markerWidth - The full marker box width including padding
     * @see ParagraphFragment.markerTextWidth - The corresponding property in layout fragments
     */
    markerTextWidth: number;
    indentLeft: number;
    /**
     * The gutter (spacing) width between the marker text and the paragraph content, in pixels.
     * Used by the renderer for calculating tab stops in word-layout lists.
     * When present, this value comes from Word's gutterWidthPx and is used to match Word's
     * list marker tab alignment behavior.
     */
    gutterWidth?: number;
  };
  /**
   * Measured drop cap information, populated when the paragraph has a drop cap.
   * Used by the renderer to position the drop cap element.
   */
  dropCap?: {
    /** Measured width of the drop cap box (including padding). */
    width: number;
    /** Measured height of the drop cap (based on lines * lineHeight). */
    height: number;
    /** Number of lines the drop cap spans. */
    lines: number;
    /** Drop cap mode: 'drop' inside text area, 'margin' in the margin. */
    mode: 'drop' | 'margin';
  };
};

export type ImageMeasure = {
  kind: 'image';
  width: number;
  height: number;
};

export type DrawingMeasure = {
  kind: 'drawing';
  drawingKind: DrawingKind;
  width: number;
  height: number;
  scale: number;
  naturalWidth: number;
  naturalHeight: number;
  geometry: DrawingGeometry;
  groupTransform?: ShapeGroupTransform;
};

export type TableCellMeasure = {
  /** Multi-block cell measurements (new feature) */
  blocks?: Measure[];
  /** Single paragraph measure (backward compatibility) */
  paragraph?: ParagraphMeasure;
  width: number;
  height: number;
  /** Starting grid column index (0-based) */
  gridColumnStart?: number;
  /** Number of grid columns this cell spans */
  colSpan?: number;
  /** Number of rows this cell spans */
  rowSpan?: number;
};

export type TableRowMeasure = {
  cells: TableCellMeasure[];
  height: number;
};

export type TableMeasure = {
  kind: 'table';
  rows: TableRowMeasure[];
  columnWidths: number[];
  totalWidth: number;
  totalHeight: number;
};

export type SectionBreakMeasure = {
  kind: 'sectionBreak';
};

export type PageBreakMeasure = {
  kind: 'pageBreak';
};

export type ColumnBreakMeasure = {
  kind: 'columnBreak';
};

export type ListItemMeasure = {
  itemId: BlockId;
  markerWidth: number;
  markerTextWidth: number;
  indentLeft: number;
  paragraph: ParagraphMeasure;
};

export type ListMeasure = {
  kind: 'list';
  items: ListItemMeasure[];
  totalHeight: number;
};

export type Measure =
  | ParagraphMeasure
  | ImageMeasure
  | DrawingMeasure
  | TableMeasure
  | ListMeasure
  | SectionBreakMeasure
  | PageBreakMeasure
  | ColumnBreakMeasure;

/** A rendered page containing positioned fragments. Page numbers are 1-indexed. */
export type Page = {
  number: number;
  fragments: Fragment[];
  margins?: PageMargins;
  /**
   * Extra bottom space reserved on this page for footnotes (in px).
   * Used by consumers (e.g. editors/painters) to keep footer hit regions and
   * decoration boxes anchored to the real bottom margin while the body shrinks.
   */
  footnoteReserved?: number;
  numberText?: string;
  size?: { w: number; h: number };
  orientation?: 'portrait' | 'landscape';
  sectionRefs?: {
    headerRefs?: { default?: string; first?: string; even?: string; odd?: string };
    footerRefs?: { default?: string; first?: string; even?: string; odd?: string };
  };
  /**
   * Vertical alignment of content within this page.
   * Used for post-layout adjustment of fragment Y positions.
   */
  vAlign?: SectionVerticalAlign;
  /**
   * Base section margins before header/footer inflation.
   * Used for vAlign centering calculations to match Word's behavior
   * where headers/footers don't affect vertical alignment.
   */
  baseMargins?: { top: number; bottom: number };
  /**
   * Index of the section this page belongs to.
   * Used for section-aware page numbering and header/footer selection.
   * Sections are 0-indexed, matching the sectionIndex in SectionMetadata.
   */
  sectionIndex?: number;
};

/** A paragraph fragment positioned on a page. */
export type ParaFragment = {
  kind: 'para';
  blockId: BlockId;
  fromLine: number;
  toLine: number;
  x: number;
  y: number;
  width: number;
  continuesFromPrev?: boolean;
  continuesOnNext?: boolean;
  /** The marker box width in pixels (includes padding). Used for visual sizing. */
  markerWidth?: number;
  /**
   * The actual rendered text width of the marker glyphs in pixels (e.g., "1." text width).
   * Used for tab width calculation to match Word's behavior where the tab extends from
   * the end of the actual marker text to the next tab stop, not from the box edge.
   */
  markerTextWidth?: number;
  /**
   * The gutter width for word-layout list markers, in pixels.
   * This value is propagated from ParagraphMeasure.marker.gutterWidth and is used by the
   * renderer to calculate tab stop widths for right-justified or centered markers.
   * Only present for word-layout lists with marker.gutterWidth defined.
   */
  markerGutter?: number;
  /**
   * Remeasured lines for this fragment when the paragraph was re-wrapped at a different width.
   * When present, the renderer should use these lines instead of looking up lines from
   * the original measure using fromLine/toLine indices. This occurs when a paragraph
   * measured at one column width is placed in a narrower column (e.g., multi-column layouts).
   */
  lines?: Line[];
  pmStart?: number;
  pmEnd?: number;
};

export type TableColumnBoundary = {
  index: number;
  x: number;
  width: number;
  minWidth: number;
  resizable: boolean;
};

export type TableRowBoundary = {
  index: number;
  y: number;
  height: number;
};

export type TableFragmentMetadata = {
  columnBoundaries: TableColumnBoundary[];
  rowBoundaries?: TableRowBoundary[];
  coordinateSystem: 'fragment';
};

export type ImageFragmentMetadata = {
  originalWidth: number;
  originalHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number;
  minWidth: number;
  minHeight: number;
};

export type PartialRowInfo = {
  rowIndex: number; // Which row is partially split
  fromLineByCell: number[]; // Per-cell line start (inclusive) - 0 for first part
  toLineByCell: number[]; // Per-cell line cutoff (exclusive) - -1 means render to end
  isFirstPart: boolean; // True if this is the first part of a split row
  isLastPart: boolean; // True if this is the last part of a split row
  /** Height of this partial row portion in pixels */
  partialHeight: number;
};

export type TableFragment = {
  kind: 'table';
  blockId: BlockId;
  fromRow: number;
  toRow: number;
  x: number;
  y: number;
  width: number;
  height: number;
  continuesFromPrev?: boolean;
  continuesOnNext?: boolean;
  repeatHeaderCount?: number;
  partialRow?: PartialRowInfo;
  metadata?: TableFragmentMetadata;
  pmStart?: number;
  pmEnd?: number;
};

export type ImageFragment = {
  kind: 'image';
  blockId: BlockId;
  x: number;
  y: number;
  width: number;
  height: number;
  isAnchored?: boolean;
  zIndex?: number;
  pmStart?: number;
  pmEnd?: number;
  metadata?: ImageFragmentMetadata;
};

export type DrawingFragment = {
  kind: 'drawing';
  blockId: BlockId;
  drawingKind: DrawingKind;
  x: number;
  y: number;
  width: number;
  height: number;
  isAnchored?: boolean;
  zIndex?: number;
  geometry: DrawingGeometry;
  scale: number;
  drawingContentId?: string;
  pmStart?: number;
  pmEnd?: number;
};

export type ListItemFragment = {
  kind: 'list-item';
  blockId: BlockId;
  itemId: BlockId;
  fromLine: number;
  toLine: number;
  x: number;
  y: number;
  width: number;
  markerWidth: number;
  continuesFromPrev?: boolean;
  continuesOnNext?: boolean;
};

export type Fragment = ParaFragment | ImageFragment | DrawingFragment | ListItemFragment | TableFragment;

export type HeaderFooterType = 'default' | 'first' | 'even' | 'odd';

export type HeaderFooterPage = {
  number: number;
  fragments: Fragment[];
  numberText?: string;
};

export type HeaderFooterLayout = {
  height: number;
  minY?: number;
  maxY?: number;
  pages: HeaderFooterPage[];
};

/** Final layout output ready for painting. */
export type Layout = {
  pageSize: { w: number; h: number };
  pages: Page[];
  columns?: ColumnLayout;
  headerFooter?: Partial<Record<HeaderFooterType, HeaderFooterLayout>>;
  /**
   * Gap between pages in pixels. Used by hit testing to correctly calculate
   * which page a click lands on when pages are rendered with spacing between them.
   * Defaults to 0 if not specified (pages assumed to be stacked with no gap).
   */
  pageGap?: number;
  /**
   * Document epoch identifier for the document state used to produce this layout.
   *
   * This value is set by higher-level orchestration (e.g., PresentationEditor) and is
   * stamped into the painted DOM as `data-layout-epoch` to enable deterministic mapping
   * from DOM-derived positions back to the current ProseMirror document state.
   */
  layoutEpoch?: number;
};

export type WrapTextMode = 'bothSides' | 'left' | 'right' | 'largest';

export type WrapExclusion = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  wrapText: WrapTextMode;
};

export type RenderedLineInfo = {
  el: HTMLElement;
  top: number;
  height: number;
};

/**
 * Interface for position mapping from ProseMirror transactions.
 * Used to efficiently update DOM position attributes without full re-render.
 */
export interface PositionMapping {
  /** Transform a position from old to new document coordinates */
  map(pos: number, bias?: number): number;
  /** Array of step maps - length indicates transaction complexity */
  readonly maps: readonly unknown[];
}

export interface PainterDOM {
  paint(layout: Layout, mount: HTMLElement, mapping?: PositionMapping): void;
  /**
   * Updates the painter's internal block and measure data without reinstantiating.
   *
   * This method is an optimization for incremental rendering pipelines that need to
   * refresh the underlying data (e.g., after content edits) without creating a new
   * painter instance. It updates the painter's internal lookup tables to reflect
   * the new blocks and measures.
   *
   * Header and footer blocks should be provided when the layout includes header/footer
   * content that needs to be rendered. These are typically generated by the layout
   * engine's header/footer adapter and should be passed through to the painter.
   *
   * @param blocks - Main document blocks to be rendered in the page body
   * @param measures - Measurements corresponding to the main document blocks (must match blocks array length)
   * @param headerBlocks - Optional array of blocks for header content. When provided, headerMeasures must also be provided.
   * @param headerMeasures - Optional measurements for header blocks (must match headerBlocks array length when provided)
   * @param footerBlocks - Optional array of blocks for footer content. When provided, footerMeasures must also be provided.
   * @param footerMeasures - Optional measurements for footer blocks (must match footerBlocks array length when provided)
   *
   * @throws {Error} When blocks and measures array lengths don't match
   * @throws {Error} When headerBlocks is provided without headerMeasures or vice versa
   * @throws {Error} When headerBlocks and headerMeasures lengths don't match
   * @throws {Error} When footerBlocks is provided without footerMeasures or vice versa
   * @throws {Error} When footerBlocks and footerMeasures lengths don't match
   *
   * @example
   * ```typescript
   * // Basic usage with main document only
   * painter.setData(blocks, measures);
   *
   * // With headers and footers
   * painter.setData(
   *   mainBlocks,
   *   mainMeasures,
   *   headerBlocks,
   *   headerMeasures,
   *   footerBlocks,
   *   footerMeasures
   * );
   * ```
   */
  setData?(
    blocks: FlowBlock[],
    measures: Measure[],
    headerBlocks?: FlowBlock[],
    headerMeasures?: Measure[],
    footerBlocks?: FlowBlock[],
    footerMeasures?: Measure[],
  ): void;
}

export interface PainterPDF {
  render(layout: Layout): Promise<Blob>;
}

export const extractHeaderFooterSpace = (
  margins?: PageMargins | null,
): {
  headerSpace: number;
  footerSpace: number;
} => {
  return {
    headerSpace: margins?.header ?? 0,
    footerSpace: margins?.footer ?? 0,
  };
};

export * as Engines from './engines/index.js';
