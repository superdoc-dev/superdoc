/**
 * SDM/1 property models — run, paragraph, table, list, image, drawing props.
 *
 * These define the direct formatting ("authored") property bags carried by
 * style-bearing nodes. Resolved/provenance fields are separate concerns
 * populated at read time by the style-engine.
 */

// ---------------------------------------------------------------------------
// Color and font primitives
// ---------------------------------------------------------------------------

export type SDThemeFontRef =
  | 'majorAscii'
  | 'majorHAnsi'
  | 'majorEastAsia'
  | 'majorBidi'
  | 'minorAscii'
  | 'minorHAnsi'
  | 'minorEastAsia'
  | 'minorBidi';

export interface SDRunFonts {
  ascii?: string;
  hAnsi?: string;
  eastAsia?: string;
  cs?: string;
  asciiTheme?: SDThemeFontRef;
  hAnsiTheme?: SDThemeFontRef;
  eastAsiaTheme?: SDThemeFontRef;
  csTheme?: SDThemeFontRef;
  hint?: 'default' | 'eastAsia' | 'cs';
}

export interface SDRunLanguages {
  val?: string;
  eastAsia?: string;
  bidi?: string;
}

export type SDThemeColorName =
  | 'dk1'
  | 'dk2'
  | 'lt1'
  | 'lt2'
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'hyperlink'
  | 'followedHyperlink';

export type SDColorRef =
  | { model: 'rgb'; value: string }
  | { model: 'theme'; theme: SDThemeColorName; tint?: number; shade?: number }
  | { model: 'auto' };

// ---------------------------------------------------------------------------
// Inline formatting primitives
// ---------------------------------------------------------------------------

export type SDHighlightColor =
  | 'black'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'magenta'
  | 'red'
  | 'yellow'
  | 'white'
  | 'darkBlue'
  | 'darkCyan'
  | 'darkGreen'
  | 'darkMagenta'
  | 'darkRed'
  | 'darkYellow'
  | 'darkGray'
  | 'lightGray'
  | 'none';

export type SDUnderlineStyle =
  | 'none'
  | 'single'
  | 'words'
  | 'double'
  | 'thick'
  | 'dotted'
  | 'dottedHeavy'
  | 'dash'
  | 'dashedHeavy'
  | 'dashLong'
  | 'dashLongHeavy'
  | 'dotDash'
  | 'dashDotHeavy'
  | 'dotDotDash'
  | 'dashDotDotHeavy'
  | 'wave'
  | 'wavyHeavy'
  | 'wavyDouble';

export interface SDUnderline {
  style?: SDUnderlineStyle;
  color?: SDColorRef;
}

export interface SDShading {
  pattern?: string;
  fill?: SDColorRef;
  color?: SDColorRef;
}

export interface SDRunBorder {
  style?: string;
  width?: number;
  space?: number;
  color?: SDColorRef;
  frame?: boolean;
  shadow?: boolean;
}

// ---------------------------------------------------------------------------
// Tab stops
// ---------------------------------------------------------------------------

export type SDTabAlignment = 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear' | 'num';

export type SDTabLeader = 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot' | 'heavy' | 'line';

export interface SDTabStop {
  kind: 'set' | 'clear';
  /** Position in points. */
  position: number;
  alignment?: SDTabAlignment;
  leader?: SDTabLeader;
}

// ---------------------------------------------------------------------------
// Paragraph borders
// ---------------------------------------------------------------------------

export interface SDParagraphBorders {
  top?: SDRunBorder;
  left?: SDRunBorder;
  bottom?: SDRunBorder;
  right?: SDRunBorder;
  between?: SDRunBorder;
  bar?: SDRunBorder;
}

// ---------------------------------------------------------------------------
// Run properties
// ---------------------------------------------------------------------------

export interface SDRunProps {
  fonts?: SDRunFonts;
  /** Convenience alias when one family applies across scripts. */
  fontFamily?: string;
  lang?: SDRunLanguages;
  /** Font size in points. */
  fontSize?: number;
  /** Complex-script font size in points. */
  fontSizeCs?: number;
  color?: SDColorRef;
  highlight?: SDHighlightColor;
  shading?: SDShading;

  cs?: boolean;
  rtl?: boolean;
  bold?: boolean;
  boldCs?: boolean;
  italic?: boolean;
  italicCs?: boolean;
  underline?: SDUnderline;
  strikethrough?: boolean;
  doubleStrikethrough?: boolean;
  caps?: boolean;
  smallCaps?: boolean;
  outline?: boolean;
  shadow?: boolean;
  emboss?: boolean;
  imprint?: boolean;

  verticalAlign?: 'baseline' | 'superscript' | 'subscript';

  /** Character spacing in points. */
  characterSpacing?: number;
  /** Character scale as percentage. */
  characterScale?: number;
  /** Kerning threshold in points. */
  kern?: number;
  /** Baseline shift in points. */
  baselineShift?: number;
  /** Fit-text target width in points. */
  fitTextWidth?: number;

  vanish?: boolean;
  webHidden?: boolean;
  specVanish?: boolean;

  border?: SDRunBorder;
  textEffect?: string;
}

// ---------------------------------------------------------------------------
// Paragraph properties
// ---------------------------------------------------------------------------

export interface SDParagraphProps {
  alignment?:
    | 'left'
    | 'center'
    | 'right'
    | 'justify'
    | 'start'
    | 'end'
    | 'distributed'
    | 'numTab'
    | 'lowKashida'
    | 'mediumKashida'
    | 'highKashida'
    | 'thaiDistribute';
  indent?: {
    /** Start indent in points. */
    start?: number;
    /** End indent in points. */
    end?: number;
    /** Left indent in points. */
    left?: number;
    /** Right indent in points. */
    right?: number;
    /** First line indent in points. */
    firstLine?: number;
    /** Hanging indent in points. */
    hanging?: number;
  };
  spacing?: {
    /** Space before in points. */
    before?: number;
    /** Space after in points. */
    after?: number;
    beforeLines?: number;
    afterLines?: number;
    beforeAutoSpacing?: boolean;
    afterAutoSpacing?: boolean;
    /** Line spacing: multiplier when lineRule=auto, otherwise points. */
    line?: number;
    lineRule?: 'auto' | 'multiple' | 'exact' | 'atLeast';
  };
  keepWithNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;

  numbering?: {
    numId?: string;
    /** Numbering level 0..8. */
    level?: number;
  };

  tabs?: SDTabStop[];
  borders?: SDParagraphBorders;
  shading?: SDShading;

  bidi?: boolean;
  textDirection?: 'lrTb' | 'tbRl' | 'btLr' | 'lrTbV' | 'tbLrV';
  mirrorIndents?: boolean;
  adjustRightIndent?: boolean;
  textAlignment?: 'top' | 'center' | 'baseline' | 'bottom' | 'auto';

  eastAsianLineBreak?: {
    kinsoku?: boolean;
    wordWrap?: boolean;
    overflowPunctuation?: boolean;
    topLinePunctuation?: boolean;
    autoSpaceDE?: boolean;
    autoSpaceDN?: boolean;
    snapToGrid?: boolean;
  };

  markRunProps?: SDRunProps;
  outlineLevel?: number;
}

// ---------------------------------------------------------------------------
// List properties
// ---------------------------------------------------------------------------

export interface SDListProps {
  tight?: boolean;
}

// ---------------------------------------------------------------------------
// Table properties
// ---------------------------------------------------------------------------

export type SDTableWidth =
  | { kind: 'auto' }
  | { kind: 'points'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'none' };

export interface SDTableProps {
  width?: SDTableWidth;
  layout?: 'fixed' | 'autofit';
  alignment?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  borders?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    insideH?: string;
    insideV?: string;
  };
}

export interface SDRowProps {
  /** Minimum row height in points. */
  minHeight?: number;
  cantSplit?: boolean;
}

export interface SDCellProps {
  verticalAlign?: 'top' | 'center' | 'bottom';
  shading?: SDColorRef;
  /** Cell padding in points. */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  borders?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

// ---------------------------------------------------------------------------
// Image and drawing properties
// ---------------------------------------------------------------------------

export interface SDImageProps {
  alignment?: 'left' | 'center' | 'right';
  /** Opacity 0..1. */
  opacity?: number;
}

export interface SDDrawingProps {
  alignment?: 'left' | 'center' | 'right';
  /** Opacity 0..1. */
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Document metadata
// ---------------------------------------------------------------------------

export interface SDDocumentMeta {
  title?: string;
  subject?: string;
  author?: string;
  description?: string;
  keywords?: string[];
}
