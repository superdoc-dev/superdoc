/**
 * Node attribute type definitions and augmentations.
 *
 * This file defines all node attribute interfaces and augments the NodeAttributesMap.
 *
 * @module NodeAttributes
 */

import type {
  BlockNodeAttributes,
  OxmlNodeAttributes,
  TableNodeAttributes,
  TextContainerAttributes,
  InlineNodeAttributes,
  ShapeNodeAttributes,
} from '../../core/types/NodeCategories.js';

// ============================================
// SHARED TYPES
// ============================================

/** Theme color options from OOXML */
export type ThemeColor =
  | 'dark1'
  | 'light1'
  | 'dark2'
  | 'light2'
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'hyperlink'
  | 'followedHyperlink'
  | 'none'
  | 'background1'
  | 'text1'
  | 'background2'
  | 'text2';

/** Shading pattern options */
export type ShadingPattern =
  | 'nil'
  | 'clear'
  | 'solid'
  | 'horzStripe'
  | 'vertStripe'
  | 'reverseDiagStripe'
  | 'diagStripe'
  | 'horzCross'
  | 'diagCross'
  | 'thinHorzStripe'
  | 'thinVertStripe'
  | 'thinReverseDiagStripe'
  | 'thinDiagStripe'
  | 'thinHorzCross'
  | 'thinDiagCross';

/** Shading properties for cells and tables */
export interface ShadingProperties {
  color?: string | 'auto';
  fill?: string | 'auto';
  themeColor?: ThemeColor;
  themeFill?: ThemeColor;
  themeFillShade?: string;
  themeFillTint?: string;
  themeShade?: string;
  themeTint?: string;
  val?: ShadingPattern;
}

/** Table measurement with value and type */
export interface TableMeasurement {
  value: number;
  type?: 'dxa' | 'pct' | 'auto';
}

/** Border specification */
export interface BorderSpec {
  val?: string;
  color?: string;
  themeColor?: ThemeColor;
  themeTint?: string;
  themeShade?: string;
  size?: number;
  space?: number;
  shadow?: boolean;
  frame?: boolean;
}

/** Table borders configuration */
export interface TableBorders {
  bottom?: BorderSpec;
  end?: BorderSpec;
  insideH?: BorderSpec;
  insideV?: BorderSpec;
  left?: BorderSpec;
  right?: BorderSpec;
  start?: BorderSpec;
  top?: BorderSpec;
}

/** Cell margins configuration */
export interface CellMargins {
  top?: number | TableMeasurement;
  right?: number | TableMeasurement;
  bottom?: number | TableMeasurement;
  left?: number | TableMeasurement;
  start?: TableMeasurement;
  end?: TableMeasurement;
}

// ============================================
// PARAGRAPH
// ============================================

/** Numbering properties for lists */
export interface NumberingProperties {
  numId?: number | string;
  ilvl?: number;
  abstractNumId?: number | string;
}

/** Indentation properties */
export interface IndentationProperties {
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
  start?: number;
  end?: number;
}

/** Spacing properties */
export interface SpacingProperties {
  before?: number;
  after?: number;
  line?: number;
  lineRule?: 'auto' | 'exact' | 'atLeast';
  beforeAutospacing?: boolean;
  afterAutospacing?: boolean;
}

/** Paragraph formatting properties from OOXML */
export interface ParagraphProperties {
  styleId?: string;
  numberingProperties?: NumberingProperties;
  justification?: 'left' | 'center' | 'right' | 'both' | 'start' | 'end';
  indentation?: IndentationProperties;
  spacing?: SpacingProperties;
  outlineLevel?: number;
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  textDirection?: 'lrTb' | 'tbRl' | 'btLr';
  tabs?: Array<{ val: string; pos: number }>;
  suppressAutoHyphens?: boolean;
  contextualSpacing?: boolean;
}

/** List rendering metadata computed at runtime */
export interface ListRendering {
  markerText?: string;
  path?: number[];
  numberingType?: string;
}

/** Section margins for headers/footers */
export interface SectionMargins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  header?: number;
  footer?: number;
}

/** Paragraph node attributes */
export interface ParagraphAttrs extends TextContainerAttributes {
  /** Paragraph formatting properties */
  paragraphProperties: ParagraphProperties | null;
  /** Computed list rendering data */
  listRendering: ListRendering | null;
  /** SuperDoc block tracking ID */
  sdBlockId: string | null;
  /** Additional HTML attributes */
  extraAttrs: Record<string, string>;
  /** Paragraph identifier (w:paraId) */
  paraId: string | null;
  /** Text identifier (w:textId) */
  textId: string | null;
  /** Revision save ID */
  rsidR: string | null;
  /** Default revision save ID */
  rsidRDefault: string | null;
  /** Paragraph revision save ID */
  rsidP: string | null;
  /** Run properties revision save ID */
  rsidRPr: string | null;
  /** Deletion revision save ID */
  rsidDel: string | null;
  /** Internal attributes storage */
  attributes: Record<string, unknown> | null;
  /** Associated filename */
  filename: string | null;
  /** Page break source identifier */
  pageBreakSource: string | null;
  /** Section margins for header/footer */
  sectionMargins: SectionMargins | null;
}

// ============================================
// TABLE
// ============================================

/** Table look options */
export interface TableLook {
  firstColumn?: boolean;
  firstRow?: boolean;
  lastColumn?: boolean;
  lastRow?: boolean;
  noHBand?: boolean;
  noVBand?: boolean;
}

/** Floating table properties */
export interface FloatingTableProperties {
  leftFromText?: number;
  rightFromText?: number;
  topFromText?: number;
  bottomFromText?: number;
  tblpX?: number;
  tblpY?: number;
  horzAnchor?: 'margin' | 'page' | 'text';
  vertAnchor?: 'margin' | 'page' | 'text';
  tblpXSpec?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  tblpYSpec?: 'inline' | 'top' | 'center' | 'bottom' | 'inside' | 'outside';
}

/** Table properties */
export interface TableProperties {
  rightToLeft?: boolean;
  justification?: 'center' | 'end' | 'left' | 'right' | 'start';
  shading?: ShadingProperties;
  caption?: string;
  description?: string;
  tableCellSpacing?: TableMeasurement;
  tableIndent?: TableMeasurement;
  tableLayout?: 'fixed' | 'autofit';
  tableLook?: TableLook;
  overlap?: 'never' | 'overlap';
  tableStyleId?: string;
  tableStyleColBandSize?: number;
  tableStyleRowBandSize?: number;
  tableWidth?: TableMeasurement;
  floatingTableProperties?: FloatingTableProperties;
  borders?: TableBorders;
  cellMargins?: CellMargins;
}

/** Column width definition */
export interface ColWidth {
  col: number;
}

/** Table grid definition */
export interface TableGrid {
  colWidths?: ColWidth[];
}

/** Table node attributes */
export interface TableAttrs extends TableNodeAttributes {
  /** Table grid definition */
  tableGrid: TableGrid | null;
  /** Table properties */
  tableProperties: TableProperties | null;
  /** Table look settings */
  tableLook: TableLook | null;
}

// ============================================
// TABLE ROW
// ============================================

/** Table row properties */
export interface TableRowProperties {
  trHeight?: { val: number; hRule?: 'atLeast' | 'exact' | 'auto' };
  cantSplit?: boolean;
  tblHeader?: boolean;
  jc?: 'center' | 'end' | 'left' | 'right' | 'start';
}

/** Table row node attributes */
export interface TableRowAttrs extends TableNodeAttributes {
  /** Row properties */
  tableRowProperties: TableRowProperties | null;
  /** Paragraph revision save ID */
  rsidRPr?: string | null;
  /** Tracking revision save ID */
  rsidTr?: string | null;
}

// ============================================
// TABLE CELL
// ============================================

/** Conditional formatting style */
export interface CnfStyle {
  firstRow?: boolean;
  lastRow?: boolean;
  firstColumn?: boolean;
  lastColumn?: boolean;
  oddVBand?: boolean;
  evenVBand?: boolean;
  oddHBand?: boolean;
  evenHBand?: boolean;
  firstRowFirstColumn?: boolean;
  firstRowLastColumn?: boolean;
  lastRowFirstColumn?: boolean;
  lastRowLastColumn?: boolean;
}

/** Table cell properties */
export interface TableCellProperties {
  cnfStyle?: CnfStyle;
  cellWidth?: TableMeasurement;
  gridSpan?: number;
  vMerge?: 'restart' | 'continue';
  borders?: TableBorders;
  shading?: ShadingProperties;
  noWrap?: boolean;
  cellMargins?: CellMargins;
  textDirection?: 'btLr' | 'tbRl';
  tcFitText?: boolean;
  vAlign?: 'top' | 'center' | 'bottom';
  hideMark?: boolean;
  headers?: Array<{ header: string }>;
}

/** Table cell border styling */
export interface CellBorder {
  size?: number;
  color?: string;
  style?: string;
}

/** Table cell border map */
export interface CellBorders {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

/** Cell background configuration */
export interface CellBackground {
  color: string;
}

/** Table cell node attributes */
export interface TableCellAttrs extends TableNodeAttributes {
  /** Number of columns this cell spans */
  colspan: number;
  /** Number of rows this cell spans */
  rowspan: number;
  /** Column widths array in pixels */
  colwidth: number[] | null;
  /** Cell background color configuration */
  background: CellBackground | null;
  /** Vertical content alignment */
  verticalAlign: 'top' | 'center' | 'bottom' | null;
  /** Cell margin configuration */
  cellMargins: CellMargins | null;
  /** Cell border configuration */
  borders: CellBorders | null;
  /** Cell properties from OOXML */
  tableCellProperties: TableCellProperties | null;
  /** Width type */
  widthType: string;
  /** Width unit */
  widthUnit: string;
  /** Placeholder key for temporary cells */
  __placeholder: string | null;
}

/** Table header cell attributes (same as TableCellAttrs) */
export interface TableHeaderAttrs extends TableCellAttrs {}

// ============================================
// IMAGE
// ============================================

/** Image size configuration */
export interface ImageSize {
  width?: number;
  height?: number;
}

/** Image padding configuration */
export interface ImagePadding {
  left?: number;
  top?: number;
  bottom?: number;
  right?: number;
}

/** Image margin offset for anchored images */
export interface ImageMarginOffset {
  horizontal?: number;
  top?: number;
}

/** Image wrap configuration */
export interface ImageWrap {
  type: 'None' | 'Square' | 'Through' | 'Tight' | 'TopAndBottom' | 'Inline';
  attrs?: {
    wrapText?: 'bothSides' | 'largest' | 'left' | 'right';
    distTop?: number;
    distBottom?: number;
    distLeft?: number;
    distRight?: number;
    polygon?: Array<[number, number]>;
    behindDoc?: boolean;
  };
}

/** Image transform data */
export interface ImageTransformData {
  rotation?: number;
  verticalFlip?: boolean;
  horizontalFlip?: boolean;
  sizeExtension?: {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
}

/** Image node attributes */
export interface ImageAttrs extends ShapeNodeAttributes {
  /** Image source URL or base64 data */
  src: string | null;
  /** Alternative text for accessibility */
  alt: string;
  /** Image title/tooltip */
  title: string | null;
  /** Image dimensions */
  size?: ImageSize;
  /** Image padding */
  padding?: ImagePadding;
  /** Margin offset for anchored images */
  marginOffset?: ImageMarginOffset;
  /** Custom inline styles */
  style?: string;
  /** Text wrapping configuration */
  wrap?: ImageWrap;
  /** Transform data (rotation, flip) */
  transformData?: ImageTransformData;
  /** @internal Image element ID */
  id?: string;
  /** @internal Relationship ID for Word export */
  rId?: string | null;
  /** @internal Original padding from import */
  originalPadding?: ImagePadding | null;
  /** @internal Original attributes from import */
  originalAttributes?: Record<string, unknown>;
  /** @internal Anchor positioning data */
  anchorData?: Record<string, unknown> | null;
  /** @internal Whether image is anchored */
  isAnchor?: boolean;
  /** @internal Simple positioning flag */
  simplePos?: boolean;
  /** @internal File extension */
  extension?: string;
  /** @internal Original extension (for EMF/WMF) */
  originalExtension?: string;
  /** @internal Original source */
  originalSrc?: string;
  /** @internal Should use cover+clip mode (from empty srcRect with stretch/fillRect) */
  shouldCover?: boolean;
}

// ============================================
// RUN (Inline container)
// ============================================

/** Run properties from OOXML */
export interface RunProperties {
  rStyle?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: { val?: string; color?: string };
  strike?: boolean;
  dstrike?: boolean;
  outline?: boolean;
  shadow?: boolean;
  emboss?: boolean;
  imprint?: boolean;
  noProof?: boolean;
  snapToGrid?: boolean;
  vanish?: boolean;
  webHidden?: boolean;
  color?: { val?: string; themeColor?: ThemeColor };
  spacing?: number;
  w?: number;
  kern?: number;
  position?: number;
  sz?: number;
  szCs?: number;
  highlight?: string;
  u?: { val?: string; color?: string };
  effect?: string;
  bdr?: BorderSpec;
  shd?: ShadingProperties;
  fitText?: { val?: number; id?: string };
  vertAlign?: 'superscript' | 'subscript' | 'baseline';
  rtl?: boolean;
  cs?: boolean;
  em?: string;
  lang?: { val?: string; eastAsia?: string; bidi?: string };
  rFonts?: {
    ascii?: string;
    hAnsi?: string;
    eastAsia?: string;
    cs?: string;
    hint?: string;
  };
}

/** Run node attributes */
export interface RunAttrs extends OxmlNodeAttributes {
  /** Run properties from OOXML */
  runProperties: RunProperties | null;
  /** Run properties revision save ID */
  rsidRPr?: string | null;
  /** Deletion revision save ID */
  rsidDel?: string | null;
}

// ============================================
// DOCUMENT
// ============================================

/** Document node attributes */
export interface DocumentAttrs extends BlockNodeAttributes {
  /** @internal Internal document attributes */
  attributes?: Record<string, unknown>;
  /** Body-level section properties (raw w:sectPr JSON) from DOCX */
  bodySectPr?: Record<string, unknown> | null;
}

// ============================================
// TEXT
// ============================================

/** Text node has no attributes */
export interface TextAttrs extends InlineNodeAttributes {}

// ============================================
// LINE BREAK
// ============================================

/** Line break (soft break) attributes */
export interface LineBreakAttrs extends InlineNodeAttributes {
  /** Type of line break */
  lineBreakType?: string | null;
  /** Clear attribute for text wrapping */
  clear?: string | null;
}

// ============================================
// HARD BREAK
// ============================================

/** Hard break (page break) attributes */
export interface HardBreakAttrs extends InlineNodeAttributes {
  /** Source of the page break */
  pageBreakSource?: string | null;
  /** Type of page break */
  pageBreakType?: string | null;
  /** Type of line break (passthrough) */
  lineBreakType?: string | null;
  /** Clear attribute (passthrough) */
  clear?: string | null;
}

// ============================================
// STRUCTURED CONTENT
// ============================================

/** Structured content node attributes */
export interface StructuredContentAttrs extends BlockNodeAttributes {
  /** Unique identifier */
  id: string;
  /** Content type */
  type?: 'inline' | 'block';
  /** Custom data */
  data?: Record<string, unknown>;
  /** Title/label */
  title?: string;
  /** Description */
  description?: string;
  /** Whether the content is locked */
  isLocked?: boolean;
}

// ============================================
// DOCUMENT SECTION
// ============================================

/** Document section attributes */
export interface DocumentSectionAttrs extends OxmlNodeAttributes {
  /** Section ID */
  id: number;
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Section type */
  sectionType?: string;
  /** Whether the section is locked */
  isLocked?: boolean;
}

// ============================================
// TAB
// ============================================

/** Tab node attributes */
export interface TabAttrs extends InlineNodeAttributes {
  /** Width of the tab in pixels */
  tabSize?: number;
}

// ============================================
// BOOKMARKS
// ============================================

/** Bookmark start node attributes */
export interface BookmarkStartAttrs extends InlineNodeAttributes {
  /** Bookmark name for cross-references and navigation */
  name?: string | null;
  /** Unique identifier for the bookmark */
  id?: string | null;
}

/** Bookmark end node attributes */
export interface BookmarkEndAttrs extends InlineNodeAttributes {
  /** Unique identifier matching the corresponding bookmarkStart */
  id?: string | null;
  /** Indicates if bookmark was displaced by custom XML */
  displacedByCustomXml?: string | null;
  /** First column reference */
  colFirst?: number | null;
  /** Last column reference */
  colLast?: number | null;
}

// ============================================
// SHAPE CONTAINER
// ============================================

/** Shape container node attributes */
export interface ShapeContainerAttrs extends BlockNodeAttributes {
  /** Background color for the shape */
  fillcolor?: string;
  /** CSS style string */
  style?: string;
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
  /** @internal Wrapper attributes */
  wrapAttributes?: Record<string, unknown>;
  /** @internal Attributes storage */
  attributes?: Record<string, unknown>;
}

// ============================================
// SHAPE GROUP
// ============================================

/** Shape group size configuration */
export interface ShapeGroupSize {
  width?: number;
  height?: number;
}

/** Shape group padding configuration */
export interface ShapeGroupPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Shape group margin offset configuration */
export interface ShapeGroupMarginOffset {
  horizontal?: number;
  top?: number;
}

/** Shape group node attributes */
export interface ShapeGroupAttrs extends ShapeNodeAttributes {
  /** Group transform properties */
  groupTransform?: Record<string, unknown>;
  /** Array of shapes in the group */
  shapes?: unknown[];
  /** Size of the shape group */
  size?: ShapeGroupSize | null;
  /** Padding around the shape group */
  padding?: ShapeGroupPadding | null;
  /** Margin offset for anchored shape groups */
  marginOffset?: ShapeGroupMarginOffset | null;
  /** @internal Drawing content data */
  drawingContent?: unknown;
  /** Text wrapping configuration */
  wrap?: { type: string };
  /** @internal Anchor positioning data */
  anchorData?: Record<string, unknown> | null;
  /** @internal Original attributes from import */
  originalAttributes?: Record<string, unknown>;
}

// ============================================
// SHAPE TEXTBOX
// ============================================

/** Shape textbox node attributes */
export interface ShapeTextboxAttrs extends BlockNodeAttributes {
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
  /** @internal Attributes storage */
  attributes?: Record<string, unknown>;
}

// ============================================
// VECTOR SHAPE
// ============================================

/** Vector shape text insets configuration */
export interface VectorShapeTextInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Vector shape line end (arrowhead) configuration */
export interface VectorShapeLineEnd {
  type?: string;
  width?: string;
  length?: string;
}

/** Vector shape line ends */
export interface VectorShapeLineEnds {
  head?: VectorShapeLineEnd | null;
  tail?: VectorShapeLineEnd | null;
}

/** Vector shape effect extent */
export interface VectorShapeEffectExtent {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

/** Vector shape node attributes */
export interface VectorShapeAttrs extends ShapeNodeAttributes {
  /** Shape kind (rect, ellipse, etc.) */
  kind?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Fill color (hex) */
  fillColor?: string;
  /** Stroke color (hex) */
  strokeColor?: string;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Line end marker configuration */
  lineEnds?: VectorShapeLineEnds | null;
  /** Extra bounds around the shape */
  effectExtent?: VectorShapeEffectExtent | null;
  /** Rotation in degrees */
  rotation?: number;
  /** Horizontal flip */
  flipH?: boolean;
  /** Vertical flip */
  flipV?: boolean;
  /** Text wrapping configuration */
  wrap?: { type: string };
  /** @internal Anchor positioning data */
  anchorData?: Record<string, unknown> | null;
  /** @internal Whether shape is anchored */
  isAnchor?: boolean;
  /** @internal Margin offset */
  marginOffset?: Record<string, unknown>;
  /** @internal Drawing content data */
  drawingContent?: unknown;
  /** @internal Original attributes from import */
  originalAttributes?: Record<string, unknown>;
  /** Text content inside the shape */
  textContent?: string | null;
  /** Text horizontal alignment */
  textAlign?: string;
  /** Text vertical alignment */
  textVerticalAlign?: string;
  /** Text insets/padding */
  textInsets?: VectorShapeTextInsets | null;
}

// ============================================
// MENTION
// ============================================

/** Mention node attributes */
export interface MentionAttrs extends InlineNodeAttributes {
  /** Display name of the mentioned person */
  name?: string | null;
  /** Email address of the mentioned person */
  email?: string | null;
}

// ============================================
// PAGE REFERENCE
// ============================================

/** Page reference node attributes */
export interface PageReferenceAttrs extends InlineNodeAttributes {
  /** @internal Marks stored as attributes */
  marksAsAttrs?: unknown[] | null;
  /** Field instruction */
  instruction?: string;
}

// ============================================
// PAGE NUMBER
// ============================================

/** Page number node attributes */
export interface PageNumberAttrs extends InlineNodeAttributes {
  /** @internal Marks stored as attributes */
  marksAsAttrs?: unknown[] | null;
}

/** Total page count node attributes */
export interface TotalPageCountAttrs extends InlineNodeAttributes {
  /** @internal Marks stored as attributes */
  marksAsAttrs?: unknown[] | null;
}

// ============================================
// FIELD ANNOTATION
// ============================================

/** Field annotation size configuration */
export interface FieldAnnotationSize {
  width?: number;
  height?: number;
}

/** Field annotation node attributes */
export interface FieldAnnotationAttrs extends InlineNodeAttributes {
  /** Annotation type (text, image, signature, checkbox, html, link) */
  type?: string;
  /** Default display label */
  defaultDisplayLabel?: string;
  /** Current display label */
  displayLabel?: string;
  /** Image source for image-type annotations */
  imageSrc?: string | null;
  /** Raw HTML content for html-type annotations */
  rawHtml?: unknown | null;
  /** Link URL for link-type annotations */
  linkUrl?: string | null;
  /** Field identifier */
  fieldId?: string | null;
  /** Field type (TEXTINPUT, etc.) */
  fieldType?: string | null;
  /** Field background color */
  fieldColor?: string;
  /** Whether the annotation is hidden */
  hidden?: boolean;
  /** Visibility state */
  visibility?: 'visible' | 'hidden';
  /** Whether the annotation is highlighted */
  highlighted?: boolean;
  /** Whether multiple images are allowed */
  multipleImage?: boolean;
  /** Size of the annotation */
  size?: FieldAnnotationSize | null;
  /** Extra custom data */
  extras?: Record<string, unknown>;
  /** Bold formatting */
  bold?: boolean;
  /** Italic formatting */
  italic?: boolean;
  /** Underline formatting */
  underline?: boolean;
  /** Font family */
  fontFamily?: string | null;
  /** Font size */
  fontSize?: string | null;
  /** Text highlight color */
  textHighlight?: string | null;
  /** Text color */
  textColor?: string | null;
  /** @internal Generator index */
  generatorIndex?: number | null;
  /** @internal Hash for tracking */
  hash?: string | null;
  /** @internal SDT identifier */
  sdtId?: string | null;
}

// ============================================
// CONTENT BLOCK
// ============================================

/** Content block size configuration */
export interface ContentBlockSize {
  top?: number;
  left?: number;
  width?: number | string;
  height?: number | string;
}

/** Content block margin offset configuration */
export interface ContentBlockMarginOffset {
  horizontal?: number;
  top?: number;
}

/** Content block node attributes */
export interface ContentBlockAttrs extends InlineNodeAttributes {
  /** Whether this block is a horizontal rule */
  horizontalRule?: boolean;
  /** Size and position configuration */
  size?: ContentBlockSize | null;
  /** Background color */
  background?: string | null;
  /** @internal Drawing content data */
  drawingContent?: unknown;
  /** @internal Attributes storage */
  attributes?: Record<string, unknown>;
  /** @internal Original attributes from import */
  originalAttributes?: Record<string, unknown>;
  /** @internal Margin offset for positioning */
  marginOffset?: ContentBlockMarginOffset | null;
}

// ============================================
// TABLE OF CONTENTS
// ============================================

/** Table of contents node attributes */
export interface TableOfContentsAttrs extends BlockNodeAttributes {
  /** Field instruction */
  instruction?: string | null;
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
}

// ============================================
// DOCUMENT INDEX
// ============================================

/** Index node attributes */
export interface DocumentIndexAttrs extends BlockNodeAttributes {
  /** Field instruction */
  instruction?: string | null;
  /** Field instruction tokens (preserve tabs, etc.) */
  instructionTokens?: unknown;
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
}

/** Index entry node attributes */
export interface IndexEntryAttrs extends InlineNodeAttributes {
  /** Field instruction */
  instruction?: string | null;
  /** Field instruction tokens (preserve tabs, etc.) */
  instructionTokens?: unknown;
  /** Marks captured as attrs for export */
  marksAsAttrs?: unknown;
}

// ============================================
// STRUCTURED CONTENT BLOCK
// ============================================

/** Structured content block node attributes */
export interface StructuredContentBlockAttrs extends BlockNodeAttributes {
  /** Unique identifier */
  id?: string | null;
  /** Content control tag */
  tag?: string | null;
  /** Display name/alias */
  alias?: string | null;
  /** @internal Structured document tag properties */
  sdtPr?: unknown;
}

// ============================================
// DOCUMENT PART OBJECT
// ============================================

/** Document part object node attributes */
export interface DocumentPartObjectAttrs extends BlockNodeAttributes {
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
  /** Document part identifier */
  id?: unknown;
  /** Document part gallery */
  docPartGallery?: unknown;
  /** Whether document part is unique */
  docPartUnique?: boolean;
}

// ============================================
// PASSTHROUGH
// ============================================

/** Passthrough block node attributes */
export interface PassthroughBlockAttrs extends BlockNodeAttributes {
  /** Original element name */
  originalName?: string | null;
  /** Original XML content */
  originalXml?: string | null;
}

/** Passthrough inline node attributes */
export interface PassthroughInlineAttrs extends InlineNodeAttributes {
  /** Original element name */
  originalName?: string | null;
  /** Original XML content */
  originalXml?: string | null;
}

// ============================================
// PERMISSIONS
// ============================================

/** Permission start node attributes */
export interface PermStartAttrs extends InlineNodeAttributes {
  /** Permission identifier */
  id?: string | null;
  /** Editor group */
  edGrp?: string | null;
  /** Editor */
  ed?: string | null;
  /** First column reference */
  colFirst?: number | null;
  /** Last column reference */
  colLast?: number | null;
}

/** Permission end node attributes */
export interface PermEndAttrs extends InlineNodeAttributes {
  /** Permission identifier */
  id?: string | null;
  /** Editor group */
  edGrp?: string | null;
  /** Indicates if displaced by custom XML */
  displacedByCustomXml?: string | null;
}

// ============================================
// COMMENT RANGE NODES
// ============================================

/** Comment range start node attributes */
export interface CommentRangeStartAttrs extends InlineNodeAttributes {
  /** OOXML comment ID */
  'w:id'?: string | null;
  /** @internal Whether this is an internal node */
  internal?: boolean;
}

/** Comment range end node attributes */
export interface CommentRangeEndAttrs extends InlineNodeAttributes {
  /** OOXML comment ID */
  'w:id'?: string | null;
}

/** Comment reference node attributes */
export interface CommentReferenceAttrs extends InlineNodeAttributes {
  /** @internal Attributes storage */
  attributes?: Record<string, unknown>;
}

/** Footnote reference node attributes */
export interface FootnoteReferenceAttrs extends InlineNodeAttributes {
  /** Footnote id from OOXML (w:id) */
  id?: string | null;
  /** True when a custom mark symbol follows the reference */
  customMarkFollows?: boolean | null;
}

// ============================================
// MODULE AUGMENTATION
// ============================================

declare module '../../core/types/NodeAttributesMap.js' {
  interface NodeAttributesMap {
    // Document structure
    doc: DocumentAttrs;
    documentSection: DocumentSectionAttrs;

    // Text containers
    paragraph: ParagraphAttrs;

    // Inline nodes
    text: TextAttrs;
    lineBreak: LineBreakAttrs;
    hardBreak: HardBreakAttrs;
    run: RunAttrs;
    tab: TabAttrs;
    mention: MentionAttrs;

    // Tables
    table: TableAttrs;
    tableRow: TableRowAttrs;
    tableCell: TableCellAttrs;
    tableHeader: TableHeaderAttrs;

    // Media and shapes
    image: ImageAttrs;
    shapeContainer: ShapeContainerAttrs;
    shapeGroup: ShapeGroupAttrs;
    shapeTextbox: ShapeTextboxAttrs;
    vectorShape: VectorShapeAttrs;

    // Bookmarks
    bookmarkStart: BookmarkStartAttrs;
    bookmarkEnd: BookmarkEndAttrs;

    // Comments (note: no 'comment' node - only commentRangeStart/End/Reference)
    commentRangeStart: CommentRangeStartAttrs;
    commentRangeEnd: CommentRangeEndAttrs;
    commentReference: CommentReferenceAttrs;
    footnoteReference: FootnoteReferenceAttrs;

    // Permissions
    permStart: PermStartAttrs;
    permEnd: PermEndAttrs;

    // Page elements
    pageReference: PageReferenceAttrs;
    'page-number': PageNumberAttrs;
    'total-page-number': TotalPageCountAttrs;

    // Field annotations
    fieldAnnotation: FieldAnnotationAttrs;

    // Content blocks
    contentBlock: ContentBlockAttrs;
    tableOfContents: TableOfContentsAttrs;
    index: DocumentIndexAttrs;
    indexEntry: IndexEntryAttrs;

    // Structured content
    structuredContent: StructuredContentAttrs;
    structuredContentBlock: StructuredContentBlockAttrs;
    documentPartObject: DocumentPartObjectAttrs;

    // Passthrough nodes
    passthroughBlock: PassthroughBlockAttrs;
    passthroughInline: PassthroughInlineAttrs;
  }
}
