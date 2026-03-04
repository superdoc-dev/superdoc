/**
 * Types for the `format.paragraph.*` / `styles.paragraph.*` operation namespaces.
 *
 * External API uses user-centric naming (alignment, indentation, spacing).
 * The adapter layer maps to OOXML-aligned internal keys (justification, indent, etc.).
 */

import type { BlockNodeAddress } from '../types/base.js';
import type { ReceiptFailure } from '../types/receipt.js';

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

export type ParagraphBlockType = 'paragraph' | 'heading' | 'listItem';

export type ParagraphTarget = BlockNodeAddress & { nodeType: ParagraphBlockType };

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface MutationResolution {
  target: ParagraphTarget;
}

export interface ParagraphMutationSuccess {
  success: true;
  target: ParagraphTarget;
  resolution: MutationResolution;
}

export interface ParagraphMutationFailure {
  success: false;
  failure: ReceiptFailure;
  resolution?: MutationResolution;
}

export type ParagraphMutationResult = ParagraphMutationSuccess | ParagraphMutationFailure;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PARAGRAPH_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type ParagraphAlignment = (typeof PARAGRAPH_ALIGNMENTS)[number];

export const TAB_STOP_ALIGNMENTS = ['left', 'center', 'right', 'decimal', 'bar'] as const;
export type TabStopAlignment = (typeof TAB_STOP_ALIGNMENTS)[number];

export const TAB_STOP_LEADERS = ['none', 'dot', 'hyphen', 'underscore', 'heavy', 'middleDot'] as const;
export type TabStopLeader = (typeof TAB_STOP_LEADERS)[number];

export const BORDER_SIDES = ['top', 'bottom', 'left', 'right', 'between', 'bar'] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

export const CLEAR_BORDER_SIDES = ['top', 'bottom', 'left', 'right', 'between', 'bar', 'all'] as const;
export type ClearBorderSide = (typeof CLEAR_BORDER_SIDES)[number];

export const LINE_RULES = ['auto', 'exact', 'atLeast'] as const;
export type LineRule = (typeof LINE_RULES)[number];

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** paragraphs.setStyle */
export interface ParagraphsSetStyleInput {
  target: ParagraphTarget;
  styleId: string;
}

/** paragraphs.clearStyle */
export interface ParagraphsClearStyleInput {
  target: ParagraphTarget;
}

/** paragraphs.resetDirectFormatting */
export interface ParagraphsResetDirectFormattingInput {
  target: ParagraphTarget;
}

/** paragraphs.setAlignment */
export interface ParagraphsSetAlignmentInput {
  target: ParagraphTarget;
  alignment: ParagraphAlignment;
}

/** paragraphs.clearAlignment */
export interface ParagraphsClearAlignmentInput {
  target: ParagraphTarget;
}

/** paragraphs.setIndentation */
export interface ParagraphsSetIndentationInput {
  target: ParagraphTarget;
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
}

/** paragraphs.clearIndentation */
export interface ParagraphsClearIndentationInput {
  target: ParagraphTarget;
}

/** paragraphs.setSpacing */
export interface ParagraphsSetSpacingInput {
  target: ParagraphTarget;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: LineRule;
}

/** paragraphs.clearSpacing */
export interface ParagraphsClearSpacingInput {
  target: ParagraphTarget;
}

/** paragraphs.setKeepOptions */
export interface ParagraphsSetKeepOptionsInput {
  target: ParagraphTarget;
  keepNext?: boolean;
  keepLines?: boolean;
  widowControl?: boolean;
}

/** paragraphs.setOutlineLevel */
export interface ParagraphsSetOutlineLevelInput {
  target: ParagraphTarget;
  outlineLevel: number | null;
}

/** paragraphs.setFlowOptions */
export interface ParagraphsSetFlowOptionsInput {
  target: ParagraphTarget;
  contextualSpacing?: boolean;
  pageBreakBefore?: boolean;
  suppressAutoHyphens?: boolean;
}

/** paragraphs.setTabStop */
export interface ParagraphsSetTabStopInput {
  target: ParagraphTarget;
  position: number;
  alignment: TabStopAlignment;
  leader?: TabStopLeader;
}

/** paragraphs.clearTabStop */
export interface ParagraphsClearTabStopInput {
  target: ParagraphTarget;
  position: number;
}

/** paragraphs.clearAllTabStops */
export interface ParagraphsClearAllTabStopsInput {
  target: ParagraphTarget;
}

/** paragraphs.setBorder */
export interface ParagraphsSetBorderInput {
  target: ParagraphTarget;
  side: BorderSide;
  style: string;
  color?: string;
  size?: number;
  space?: number;
}

/** paragraphs.clearBorder */
export interface ParagraphsClearBorderInput {
  target: ParagraphTarget;
  side: ClearBorderSide;
}

/** paragraphs.setShading */
export interface ParagraphsSetShadingInput {
  target: ParagraphTarget;
  fill?: string;
  color?: string;
  pattern?: string;
}

/** paragraphs.clearShading */
export interface ParagraphsClearShadingInput {
  target: ParagraphTarget;
}
