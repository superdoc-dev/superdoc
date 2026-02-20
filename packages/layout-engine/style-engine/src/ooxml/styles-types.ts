import type {
  BorderProperties,
  ParagraphConditionalFormatting,
  ParagraphProperties,
  RunProperties,
  ShadingProperties,
} from './types';

/**
 * Encoded properties for the w:styles document.
 */
export interface StylesDocumentProperties {
  /** Default run and paragraph properties for the document. */
  docDefaults: DocDefaults;
  /** Latent style definitions and defaults. */
  latentStyles: LatentStyles;
  /** Styles keyed by styleId. */
  styles: Record<string, StyleDefinition>;
}

/**
 * Default run and paragraph properties stored under w:docDefaults.
 */
export interface DocDefaults {
  /** Default run properties. */
  runProperties?: RunProperties;
  /** Default paragraph properties. */
  paragraphProperties?: ParagraphProperties;
}

/**
 * Latent style defaults and per-style exceptions.
 */
export interface LatentStyles {
  /** Default locked state for latent styles. */
  defLockedState?: boolean;
  /** Default UI priority flag for latent styles. */
  defUIPriority?: boolean;
  /** Default semi-hidden flag for latent styles. */
  defSemiHidden?: boolean;
  /** Default unhide-when-used flag for latent styles. */
  defUnhideWhenUsed?: boolean;
  /** Default quick-format flag for latent styles. */
  defQFormat?: boolean;
  /** Latent style exceptions keyed by style name. */
  lsdExceptions?: Record<string, LsdException>;
}

/**
 * Latent style exception definition.
 */
export interface LsdException {
  /** Latent style name. */
  name?: string;
  /** Locked flag for the latent style. */
  locked?: boolean;
  /** Quick format flag for the latent style. */
  qFormat?: boolean;
  /** Semi-hidden flag for the latent style. */
  semiHidden?: boolean;
  /** Unhide-when-used flag for the latent style. */
  unhideWhenUsed?: boolean;
  /** UI priority value for the latent style. */
  uiPriority?: number;
}

/**
 * Encoded style definition from w:style.
 */
export interface StyleDefinition {
  /** Style type (paragraph, character, table, etc.). */
  type?: string;
  /** Style identifier. */
  styleId?: string;
  /** Default style flag. */
  default?: boolean;
  /** Custom style flag. */
  customStyle?: boolean;
  /** Human-readable style name. */
  name?: string;
  /** Comma-separated style aliases. */
  aliases?: string;
  /** Based-on style identifier. */
  basedOn?: string;
  /** Next style identifier. */
  next?: string;
  /** Linked style identifier. */
  link?: string;
  /** Auto-redefine flag. */
  autoRedefine?: boolean;
  /** Hidden style flag. */
  hidden?: boolean;
  /** Semi-hidden style flag. */
  semiHidden?: boolean;
  /** Unhide-when-used style flag. */
  unhideWhenUsed?: boolean;
  /** Quick-format style flag. */
  qFormat?: boolean;
  /** Locked style flag. */
  locked?: boolean;
  /** Personal style flag. */
  personal?: boolean;
  /** Personal compose flag. */
  personalCompose?: boolean;
  /** Personal reply flag. */
  personalReply?: boolean;
  /** UI priority value. */
  uiPriority?: number;
  /** Revision identifier. */
  rsid?: number;
  /** Paragraph properties applied by the style. */
  paragraphProperties?: ParagraphProperties;
  /** Run properties applied by the style. */
  runProperties?: RunProperties;
  /** Table properties applied by the style. */
  tableProperties?: TableProperties;
  /** Table row properties applied by the style. */
  tableRowProperties?: TableRowProperties;
  /** Table cell properties applied by the style. */
  tableCellProperties?: TableCellProperties;
  /** Table style properties applied by the style. */
  tableStyleProperties?: Record<TableStyleType, TableStyleProperties>;
}

/**
 * Generic measurement properties used by table layout elements.
 */
export interface MeasurementProperties {
  /** Measurement value, usually in twentieths of a point. */
  value?: number;
  /** Measurement type (auto, dxa, pct, etc.). */
  type?: string;
}

/**
 * Table properties encoded from w:tblPr.
 */
export interface TableProperties {
  /** Right-to-left visual order for table rendering. */
  rightToLeft?: boolean;
  /** Table justification value. */
  justification?: string;
  /** Table shading properties. */
  shading?: ShadingProperties;
  /** Table caption text. */
  caption?: string;
  /** Table cell spacing properties. */
  tableCellSpacing?: MeasurementProperties;
  /** Table description text. */
  description?: string;
  /** Table indent properties. */
  tableIndent?: MeasurementProperties;
  /** Table layout algorithm. */
  tableLayout?: string;
  /** Table look settings. */
  tblLook?: TableLookProperties;
  /** Table overlap behavior. */
  overlap?: string;
  /** Table style identifier. */
  tableStyleId?: string;
  /** Table style column band size. */
  tableStyleColBandSize?: number;
  /** Table style row band size. */
  tableStyleRowBandSize?: number;
  /** Table width properties. */
  tableWidth?: MeasurementProperties;
  /** Floating table properties. */
  floatingTableProperties?: TableFloatingProperties;
  /** Table border properties. */
  borders?: TableBorders;
  /** Table cell margin properties. */
  cellMargins?: TableCellMargins;
}

/**
 * Table look properties from w:tblLook.
 */
export interface TableLookProperties {
  /** Apply first column formatting. */
  firstColumn?: boolean;
  /** Apply first row formatting. */
  firstRow?: boolean;
  /** Apply last column formatting. */
  lastColumn?: boolean;
  /** Apply last row formatting. */
  lastRow?: boolean;
  /** Disable horizontal banding. */
  noHBand?: boolean;
  /** Disable vertical banding. */
  noVBand?: boolean;
  /** Raw table look value. */
  val?: string;
}

/**
 * Floating table positioning properties.
 */
export interface TableFloatingProperties {
  /** Distance from left text boundary. */
  leftFromText?: number;
  /** Distance from right text boundary. */
  rightFromText?: number;
  /** Distance from top text boundary. */
  topFromText?: number;
  /** Distance from bottom text boundary. */
  bottomFromText?: number;
  /** Horizontal position value. */
  tblpX?: number;
  /** Vertical position value. */
  tblpY?: number;
  /** Horizontal anchor reference. */
  horzAnchor?: string;
  /** Vertical anchor reference. */
  vertAnchor?: string;
  /** Horizontal position specifier. */
  tblpXSpec?: string;
  /** Vertical position specifier. */
  tblpYSpec?: string;
}

/**
 * Table border properties.
 */
export interface TableBorders {
  /** Bottom border definition. */
  bottom?: BorderProperties;
  /** End border definition. */
  end?: BorderProperties;
  /** Inside horizontal border definition. */
  insideH?: BorderProperties;
  /** Inside vertical border definition. */
  insideV?: BorderProperties;
  /** Left border definition. */
  left?: BorderProperties;
  /** Right border definition. */
  right?: BorderProperties;
  /** Start border definition. */
  start?: BorderProperties;
  /** Top border definition. */
  top?: BorderProperties;
}

/**
 * Table cell border properties, including diagonal borders.
 */
export interface TableCellBorders {
  /** Top border definition. */
  top?: BorderProperties;
  /** Start border definition. */
  start?: BorderProperties;
  /** Left border definition. */
  left?: BorderProperties;
  /** Bottom border definition. */
  bottom?: BorderProperties;
  /** End border definition. */
  end?: BorderProperties;
  /** Right border definition. */
  right?: BorderProperties;
  /** Inside horizontal border definition. */
  insideH?: BorderProperties;
  /** Inside vertical border definition. */
  insideV?: BorderProperties;
  /** Top-left to bottom-right diagonal border definition. */
  tl2br?: BorderProperties;
  /** Top-right to bottom-left diagonal border definition. */
  tr2bl?: BorderProperties;
}

/**
 * Table cell margin properties.
 */
export interface TableCellMargins {
  /** Bottom margin properties. */
  marginBottom?: MeasurementProperties;
  /** End margin properties. */
  marginEnd?: MeasurementProperties;
  /** Left margin properties. */
  marginLeft?: MeasurementProperties;
  /** Right margin properties. */
  marginRight?: MeasurementProperties;
  /** Start margin properties. */
  marginStart?: MeasurementProperties;
  /** Top margin properties. */
  marginTop?: MeasurementProperties;
}

/**
 * Table row properties encoded from w:trPr.
 */
export interface TableRowProperties {
  /** Prevent row from splitting across pages. */
  cantSplit: boolean;
  /** Conditional formatting properties. */
  cnfStyle?: ParagraphConditionalFormatting;
  /** Division identifier value. */
  divId?: string;
  /** Grid cells after the row. */
  gridAfter?: number;
  /** Grid cells before the row. */
  gridBefore?: number;
  /** Hide the row. */
  hidden: boolean;
  /** Row justification value. */
  justification?: string;
  /** Table cell spacing properties. */
  tableCellSpacing?: MeasurementProperties;
  /** Repeat header row flag. */
  repeatHeader: boolean;
  /** Row height properties. */
  rowHeight?: TableRowHeight;
  /** Width after the row. */
  wAfter?: MeasurementProperties;
  /** Width before the row. */
  wBefore?: MeasurementProperties;
}

/**
 * Table row height properties.
 */
export interface TableRowHeight {
  /** Row height value. */
  value?: number;
  /** Row height rule. */
  rule?: string;
}

/**
 * Table cell properties encoded from w:tcPr.
 */
export interface TableCellProperties {
  /** Conditional formatting properties. */
  cnfStyle?: ParagraphConditionalFormatting;
  /** Table cell width properties. */
  cellWidth?: MeasurementProperties;
  /** Horizontal grid span for the cell. */
  gridSpan?: number;
  /** Vertical merge behavior. */
  vMerge?: string;
  /** Table cell border properties. */
  borders?: TableCellBorders;
  /** Table cell shading properties. */
  shading?: ShadingProperties;
  /** Disable wrapping within the cell. */
  noWrap?: boolean;
  /** Table cell margin properties. */
  cellMargins?: TableCellMargins;
  /** Text direction within the cell. */
  textDirection?: string;
  /** Fit text within the cell. */
  tcFitText?: boolean;
  /** Vertical alignment within the cell. */
  vAlign?: string;
  /** Hide the cell mark. */
  hideMark?: boolean;
  /** Header references applied to the cell. */
  headers?: TableHeaderReference[];
}

/**
 * Header reference entry encoded from w:headers.
 */
export interface TableHeaderReference {
  /** Header value. */
  header: string;
}

export type TableStyleType =
  | 'wholeTable'
  | 'firstRow'
  | 'lastRow'
  | 'firstCol'
  | 'lastCol'
  | 'band1Vert'
  | 'band2Vert'
  | 'band1Horz'
  | 'band2Horz'
  | 'neCell'
  | 'nwCell'
  | 'seCell'
  | 'swCell';
/**
 * Table style properties encoded from w:tblStylePr.
 */
export interface TableStyleProperties {
  /** Table style property type. */
  type?: TableStyleType;
  /** Paragraph properties for the table style. */
  paragraphProperties?: ParagraphProperties;
  /** Run properties for the table style. */
  runProperties?: RunProperties;
  /** Table properties for the table style. */
  tableProperties?: TableProperties;
  /** Table row properties for the table style. */
  tableRowProperties?: TableRowProperties;
  /** Table cell properties for the table style. */
  tableCellProperties?: TableCellProperties;
}
