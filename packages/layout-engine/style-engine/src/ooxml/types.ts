/**
 * Paragraph properties encoded from the w:pPr translator.
 */
export interface ParagraphProperties {
  /** Adjust right indent to avoid running into a right-aligned object. */
  adjustRightInd?: boolean;
  /** Automatically add spacing between East Asian and Latin text. */
  autoSpaceDE?: boolean;
  /** Automatically add spacing between East Asian and digits. */
  autoSpaceDN?: boolean;
  /** Conditional formatting settings for the paragraph. */
  cnfStyle?: ParagraphConditionalFormatting;
  /** Use contextual spacing rules for this paragraph. */
  contextualSpacing?: boolean;
  /** Division identifier value. */
  divId?: string;
  /** Frame properties for the paragraph. */
  framePr?: ParagraphFrameProperties;
  /** Indentation properties for the paragraph. */
  indent?: ParagraphIndentation;
  /** Paragraph justification value. */
  justification?: string;
  /** Keep all lines of this paragraph on the same page. */
  keepLines?: boolean;
  /** Keep this paragraph with the next paragraph. */
  keepNext?: boolean;
  /** Kinsoku (line breaking) behavior flag. */
  kinsoku?: boolean;
  /** Mirror indents for facing pages. */
  mirrorIndents?: boolean;
  /** Numbering properties for the paragraph. */
  numberingProperties?: ParagraphNumberingProperties;
  /** Outline level for the paragraph. */
  outlineLvl?: number;
  /** Allow punctuation to hang in the right margin. */
  overflowPunct?: boolean;
  /** Paragraph border definitions. */
  borders?: ParagraphBorders;
  /** Paragraph style identifier. */
  styleId?: string;
  /** Insert a page break before the paragraph. */
  pageBreakBefore?: boolean;
  /** Paragraph shading properties. */
  shading?: ShadingProperties;
  /** Snap paragraph line spacing to document grid. */
  snapToGrid?: boolean;
  /** Paragraph spacing properties. */
  spacing?: ParagraphSpacing;
  /** Suppress automatic hyphenation. */
  suppressAutoHyphens?: boolean;
  /** Suppress line numbering for the paragraph. */
  suppressLineNumbers?: boolean;
  /** Suppress overlapping of paragraph text with other objects. */
  suppressOverlap?: boolean;
  /** Tab stop definitions for the paragraph. */
  tabStops?: ParagraphTabStop[];
  /** Baseline text alignment within the line. */
  textAlignment?: 'top' | 'center' | 'baseline' | 'bottom' | 'auto';
  /** Text direction for the paragraph. */
  textDirection?: string;
  /** Textbox tight wrap setting for the paragraph. */
  textboxTightWrap?: string;
  /** Use top line punctuation for the paragraph. */
  topLinePunct?: boolean;
  /** Widow/orphan control flag. */
  widowControl?: boolean;
  /** Enable word wrapping for the paragraph. */
  wordWrap?: boolean;
  /** Run properties applied to the paragraph. */
  runProperties?: RunProperties;
  /** Right-to-left paragraph direction flag. */
  rightToLeft?: boolean;
}

/**
 * Conditional formatting properties for a paragraph.
 */
export interface ParagraphConditionalFormatting {
  /** Even horizontal band flag. */
  evenHBand?: boolean;
  /** Even vertical band flag. */
  evenVBand?: boolean;
  /** First column flag. */
  firstColumn?: boolean;
  /** First row flag. */
  firstRow?: boolean;
  /** First row first column flag. */
  firstRowFirstColumn?: boolean;
  /** First row last column flag. */
  firstRowLastColumn?: boolean;
  /** Last column flag. */
  lastColumn?: boolean;
  /** Last row flag. */
  lastRow?: boolean;
  /** Last row first column flag. */
  lastRowFirstColumn?: boolean;
  /** Last row last column flag. */
  lastRowLastColumn?: boolean;
  /** Odd horizontal band flag. */
  oddHBand?: boolean;
  /** Odd vertical band flag. */
  oddVBand?: boolean;
  /** Raw conditional formatting value attribute. */
  val?: string;
}

/**
 * Paragraph frame properties.
 */
export interface ParagraphFrameProperties {
  /** Lock the anchor for the frame. */
  anchorLock?: boolean;
  /** Drop cap style. */
  dropCap?: string;
  /** Frame height in twentieths of a point. */
  h?: number;
  /** Horizontal anchor type. */
  hAnchor?: string;
  /** Height rule for the frame. */
  hRule?: string;
  /** Horizontal space around the frame. */
  hSpace?: number;
  /** Number of text lines in the frame. */
  lines?: number;
  /** Vertical anchor type. */
  vAnchor?: string;
  /** Vertical space around the frame. */
  vSpace?: number;
  /** Frame width in twentieths of a point. */
  w?: number;
  /** Wrapping style for the frame. */
  wrap?: 'auto' | 'notBeside' | 'around' | 'tight' | 'through' | 'none';
  /** Horizontal position. */
  x?: number;
  /** Horizontal alignment. */
  xAlign?: string;
  /** Vertical position. */
  y?: number;
  /** Vertical alignment. */
  yAlign?: string;
}

/**
 * Paragraph indentation properties.
 */
export interface ParagraphIndentation {
  /** End indent in twentieths of a point. */
  end?: number;
  /** End indent in character units. */
  endChars?: number;
  /** First line indent in twentieths of a point. */
  firstLine?: number;
  /** First line indent in character units. */
  firstLineChars?: number;
  /** Hanging indent in twentieths of a point. */
  hanging?: number;
  /** Hanging indent in character units. */
  hangingChars?: number;
  /** Left indent in twentieths of a point. */
  left?: number;
  /** Left indent in character units. */
  leftChars?: number;
  /** Right indent in twentieths of a point. */
  right?: number;
  /** Right indent in character units. */
  rightChars?: number;
  /** Start indent in twentieths of a point. */
  start?: number;
  /** Start indent in character units. */
  startChars?: number;
}

/**
 * Paragraph spacing properties.
 */
export interface ParagraphSpacing {
  /** Space after the paragraph in twentieths of a point. */
  after?: number;
  /** Auto spacing after the paragraph. */
  afterAutospacing?: boolean;
  /** Space after the paragraph in line units. */
  afterLines?: number;
  /** Space before the paragraph in twentieths of a point. */
  before?: number;
  /** Auto spacing before the paragraph. */
  beforeAutospacing?: boolean;
  /** Space before the paragraph in line units. */
  beforeLines?: number;
  /** Line spacing value in twentieths of a point. */
  line?: number;
  /** Line spacing rule. */
  lineRule?: string;
}

/**
 * Paragraph numbering properties.
 */
export interface ParagraphNumberingProperties {
  /** Numbering level. */
  ilvl?: number;
  /** Numbering ID. */
  numId?: number;
}

/**
 * Paragraph border collection for each side.
 */
export interface ParagraphBorders {
  /** Bar border definition. */
  bar?: BorderProperties;
  /** Between border definition. */
  between?: BorderProperties;
  /** Bottom border definition. */
  bottom?: BorderProperties;
  /** Left border definition. */
  left?: BorderProperties;
  /** Right border definition. */
  right?: BorderProperties;
  /** Top border definition. */
  top?: BorderProperties;
}

/**
 * Generic border properties used by paragraph and run borders.
 */
export interface BorderProperties {
  /** Border style value. */
  val?: string;
  /** Border color, including "auto" or a hex color string. */
  color?: string;
  /** Theme color reference. */
  themeColor?: string;
  /** Theme tint value. */
  themeTint?: string;
  /** Theme shade value. */
  themeShade?: string;
  /** Border size in eighths of a point. */
  size?: number;
  /** Border spacing in points. */
  space?: number;
  /** Border shadow flag. */
  shadow?: boolean;
  /** Border frame flag. */
  frame?: boolean;
}

/**
 * Shading properties shared by paragraph and run shading.
 */
export interface ShadingProperties {
  /** Foreground color. */
  color?: string;
  /** Background fill color. */
  fill?: string;
  /** Theme foreground color. */
  themeColor?: string;
  /** Theme fill color. */
  themeFill?: string;
  /** Theme fill shade. */
  themeFillShade?: string;
  /** Theme fill tint. */
  themeFillTint?: string;
  /** Theme shade value. */
  themeShade?: string;
  /** Theme tint value. */
  themeTint?: string;
  /** Shading pattern value. */
  val?: string;
}

/**
 * A single tab stop entry in a paragraph.
 */
export interface ParagraphTabStop {
  /** Tab stop attributes keyed under the tab name. */
  tab: TabStopProperties;
}

/**
 * Tab stop properties.
 */
export interface TabStopProperties {
  /** Tab alignment type. */
  tabType?: string;
  /** Tab position in twentieths of a point. */
  pos?: number;
  /** Tab leader type. */
  leader?: string;
}

/**
 * Run properties.
 */
export interface RunProperties {
  /** Bold formatting flag for complex script. */
  boldCs?: boolean;
  /** Bold formatting flag. */
  bold?: boolean;
  /** Run border properties. */
  borders?: BorderProperties;
  /** Text transform value set by caps. */
  textTransform?: 'uppercase' | 'none';
  /** Run color properties. */
  color?: RunColorProperties;
  /** Complex script formatting flag. */
  cs?: boolean;
  /** Double strikethrough flag. */
  dstrike?: boolean;
  /** East Asian layout properties. */
  eastAsianLayout?: RunEastAsianLayoutProperties;
  /** Emphasis mark type. */
  effect?: string;
  /** Emphasis mark setting. */
  em?: string;
  /** Emboss effect flag. */
  emboss?: boolean;
  /** Fit text properties. */
  fitText?: RunFitTextProperties;
  /** Font family attributes. */
  fontFamily?: RunFontFamilyProperties;
  /** Complex script font size in half-points. */
  fontSizeCs?: number;
  /** Font size in half-points. */
  fontSize?: number;
  /** Highlight properties. */
  highlight?: HighlightProperties;
  /** Imprint effect flag. */
  imprint?: boolean;
  /** Italic formatting flag. */
  italic?: boolean;
  /** Italic formatting flag for complex script. */
  iCs?: boolean;
  /** Kerning value in half-points. */
  kern?: number;
  /** Language properties. */
  lang?: RunLangProperties;
  /** Letter spacing in twentieths of a point. */
  letterSpacing?: number;
  /** Disable proofing flag. */
  noProof?: boolean;
  /** Office math flag. */
  oMath?: boolean;
  /** Outline effect flag. */
  outline?: boolean;
  /** Baseline position adjustment. */
  position?: number;
  /** Right-to-left run flag. */
  rtl?: boolean;
  /** Run style identifier. */
  styleId?: string;
  /** Shadow effect flag. */
  shadow?: boolean;
  /** Run shading properties. */
  shading?: ShadingProperties;
  /** Small caps flag. */
  smallCaps?: boolean;
  /** Snap run spacing to document grid. */
  snapToGrid?: boolean;
  /** SpecVanish flag. */
  specVanish?: boolean;
  /** Strikethrough flag. */
  strike?: boolean;
  /** Underline properties. */
  underline?: UnderlineProperties;
  /** Hidden text flag. */
  vanish?: boolean;
  /** Vertical alignment setting. */
  vertAlign?: string;
  /** Web hidden flag. */
  webHidden?: boolean;
  /** Character width setting. */
  w?: string;
}

/**
 * Run color properties.
 */
export interface RunColorProperties {
  /** Direct color value. */
  val?: string;
  /** Theme color reference. */
  themeColor?: string;
  /** Theme tint value. */
  themeTint?: string;
  /** Theme shade value. */
  themeShade?: string;
}

/**
 * Run font family properties.
 */
export interface RunFontFamilyProperties {
  /** Font hint value. */
  hint?: string;
  /** ASCII font name. */
  ascii?: string;
  /** High ANSI font name. */
  hAnsi?: string;
  /** East Asian font name. */
  eastAsia?: string;
  /** Complex script font name. */
  cs?: string;
  /** Font name alias. */
  val?: string;
  /** ASCII theme font. */
  asciiTheme?: string;
  /** High ANSI theme font. */
  hAnsiTheme?: string;
  /** East Asian theme font. */
  eastAsiaTheme?: string;
  /** Complex script theme font. */
  cstheme?: string;
}

/**
 * East Asian layout properties for a run.
 */
export interface RunEastAsianLayoutProperties {
  /** East Asian layout ID. */
  id?: number;
  /** Combine characters flag. */
  combine?: boolean;
  /** Combine brackets rule. */
  combineBrackets?: string;
  /** Vertical text flag. */
  vert?: boolean;
  /** Vertical compression flag. */
  vertCompress?: boolean;
}

/**
 * Fit text properties for a run.
 */
export interface RunFitTextProperties {
  /** Fit text value. */
  val?: number;
  /** Fit text ID. */
  id?: number;
}

/**
 * Language properties for a run.
 */
export interface RunLangProperties {
  /** Default language value. */
  val?: string;
  /** East Asian language value. */
  eastAsia?: string;
  /** Bidi language value. */
  bidi?: string;
}

/**
 * Underline properties encoded as raw OOXML attributes.
 */
export interface UnderlineProperties {
  /** Underline type attribute. */
  'w:val'?: string | null;
  /** Underline color attribute. */
  'w:color'?: string;
  /** Underline theme color attribute. */
  'w:themeColor'?: string;
  /** Underline theme tint attribute. */
  'w:themeTint'?: string;
  /** Underline theme shade attribute. */
  'w:themeShade'?: string;
}

/**
 * Highlight properties encoded as raw OOXML attributes.
 */
export interface HighlightProperties {
  /** Highlight value attribute. */
  'w:val'?: string | null;
}
