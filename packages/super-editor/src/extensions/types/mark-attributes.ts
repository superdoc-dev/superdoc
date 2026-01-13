/**
 * Mark attribute type definitions and augmentations.
 *
 * This file defines all mark attribute interfaces and augments the MarkAttributesMap.
 *
 * @module MarkAttributes
 */

// ============================================
// BOLD
// ============================================

/** Bold mark attributes */
export interface BoldAttrs {
  /** Bold toggle value (e.g., '0' for off, true for on) */
  value?: string | boolean | null;
}

// ============================================
// ITALIC
// ============================================

/** Italic mark attributes */
export interface ItalicAttrs {
  /** Italic toggle value (e.g., '0' for off, true for on) */
  value?: string | boolean | null;
}

// ============================================
// UNDERLINE
// ============================================

/** Underline style options (Word-compatible values, plus any custom string) */
export type UnderlineStyle =
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
  | 'wavyDouble'
  | 'none'
  | (string & {});

/** Underline mark attributes */
export interface UnderlineAttrs {
  /** Underline style (e.g., 'single', 'none') */
  underlineType?: UnderlineStyle | null;
  /** Underline color (hex, 'auto', etc.) */
  underlineColor?: string | null;
}

// ============================================
// STRIKE
// ============================================

/** Strike mark attributes */
export interface StrikeAttrs {
  /** Strikethrough toggle value (e.g., '0' for off, true for on) */
  value?: string | boolean | null;
}

// ============================================
// LINK
// ============================================

/** Target frame options for links */
export type TargetFrameOption = '_blank' | '_self' | '_parent' | '_top' | (string & {}) | null;

/** Link mark attributes */
export interface LinkAttrs {
  /** Link URL */
  href?: string | null;
  /** Target frame */
  target?: TargetFrameOption | null;
  /** Rel attribute */
  rel?: string | null;
  /** Display text for the link */
  text?: string | null;
  /** Anchor name for internal references */
  name?: string | null;
  /** Whether to add to viewed hyperlinks list */
  history?: boolean | null;
  /** Bookmark target name */
  anchor?: string | null;
  /** Location in target hyperlink */
  docLocation?: string | null;
  /** Tooltip text */
  tooltip?: string | null;
  /** @internal Relationship ID for Word export */
  rId?: string | null;
}

// ============================================
// HIGHLIGHT
// ============================================

/** Highlight color options (CSS color values) */
export type HighlightColor = string;

/** Highlight mark attributes */
export interface HighlightAttrs {
  /** Highlight color */
  color?: HighlightColor | null;
}

// ============================================
// TEXT STYLE
// ============================================

/** Text style mark attributes (combined run properties) */
export interface TextStyleAttrs {
  /** Style identifier for linked styles */
  styleId?: string | null;
  /** Font size (e.g., '12pt') */
  fontSize?: string | null;
  /**
   * Vertical alignment for subscript/superscript text (DOCX w:vertAlign).
   * Standard values: 'superscript', 'subscript', 'baseline'.
   * When both vertAlign and position are present, position takes precedence.
   * Renders as CSS vertical-align: super/sub with 65% font-size scaling.
   */
  vertAlign?: 'superscript' | 'subscript' | 'baseline' | null;
  /**
   * Custom vertical position offset in points (DOCX w:position).
   * Format: '{number}pt' where number is in points (e.g., '2pt', '-1.5pt').
   * Positive values raise text, negative values lower text.
   * Takes precedence over vertAlign when both are present.
   * Renders as CSS vertical-align with the exact offset value.
   */
  position?: string | null;
  /** Font family (CSS font-family string) */
  fontFamily?: string | null;
  /** East Asian font family override */
  eastAsiaFontFamily?: string | null;
  /** Text color (hex/CSS color) */
  color?: string | null;
  /** Background color (CSS color) */
  backgroundColor?: string | null;
  /** Text transform (uppercase, lowercase, etc.) */
  textTransform?: string | null;
  /** Text alignment (left, center, right, justify) */
  textAlign?: string | null;
  /** Text indent (e.g., '1in') */
  textIndent?: string | null;
  /** Line height (e.g., '1.5', '12pt') */
  lineHeight?: string | null;
  /** Letter spacing (e.g., '0.75pt') */
  letterSpacing?: string | null;
}

// ============================================
// TRACK CHANGES MARKS
// ============================================

/** Track insert mark attributes */
export interface TrackInsertAttrs {
  /** Insertion ID */
  id?: string;
  /** Author of the insertion */
  author?: string;
  /** Author email */
  authorEmail?: string;
  /** Author avatar/image */
  authorImage?: string;
  /** Date of the insertion */
  date?: string;
  /** @internal Imported author name */
  importedAuthor?: string;
}

/** Track delete mark attributes */
export interface TrackDeleteAttrs {
  /** Deletion ID */
  id?: string;
  /** Author of the deletion */
  author?: string;
  /** Author email */
  authorEmail?: string;
  /** Author avatar/image */
  authorImage?: string;
  /** Date of the deletion */
  date?: string;
  /** @internal Imported author name */
  importedAuthor?: string;
}

/** Track format change mark entry */
export type TrackFormatEntry = {
  type: string;
  attrs?: Record<string, unknown>;
};

/** Track format change mark attributes */
export interface TrackFormatAttrs {
  /** Format change ID */
  id?: string;
  /** Author of the format change */
  author?: string;
  /** Author email */
  authorEmail?: string;
  /** Author avatar/image */
  authorImage?: string;
  /** Date of the format change */
  date?: string;
  /** Formatting before change */
  before?: TrackFormatEntry[];
  /** Formatting after change */
  after?: TrackFormatEntry[];
  /** @internal Imported author name */
  importedAuthor?: string;
}

// ============================================
// COMMENT MARK
// ============================================

/** Comment mark attributes */
export interface CommentMarkAttrs {
  /** Comment ID this mark refers to */
  commentId: string;
  /** Imported comment ID (for DOCX) */
  importedId?: string;
  /** Whether this is an internal comment */
  internal?: boolean;
  /** Whether this comment is attached to a tracked change */
  trackedChange?: boolean;
}

// ============================================
// MODULE AUGMENTATION
// ============================================

declare module '../../core/types/MarkAttributesMap.js' {
  interface MarkAttributesMap {
    bold: BoldAttrs;
    italic: ItalicAttrs;
    underline: UnderlineAttrs;
    strike: StrikeAttrs;
    link: LinkAttrs;
    highlight: HighlightAttrs;
    textStyle: TextStyleAttrs;
    trackInsert: TrackInsertAttrs;
    trackDelete: TrackDeleteAttrs;
    trackFormat: TrackFormatAttrs;
    commentMark: CommentMarkAttrs;
  }
}
