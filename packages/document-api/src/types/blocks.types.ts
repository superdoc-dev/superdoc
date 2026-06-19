import type { BlockNodeType, BlockNodeAddress, DeletableBlockNodeAddress } from './base.js';
import type {
  AffectedRef,
  AffectedRefRemapping,
  Receipt,
  ReceiptFailure,
  ReceiptInsert,
  TextRangeShift,
} from './receipt.js';
import type { StoryLocator } from './story.types.js';
import type { ParagraphNumbering } from './paragraph.types.js';
// ---------------------------------------------------------------------------
// blocks.list
// ---------------------------------------------------------------------------
export interface BlockListEntry {
  ordinal: number;
  nodeId: string;
  nodeType: BlockNodeType;
  textPreview: string | null;
  /** Full flattened block text when requested via BlocksListInput.includeText. */
  text?: string | null;
  isEmpty: boolean;
  /** Named paragraph style ID (e.g. 'Normal', 'Heading1'). */
  styleId?: string | null;
  /** Font family from the block's first text run. */
  fontFamily?: string;
  /** Font size from the block's first text run. */
  fontSize?: number;
  /** True if the block's text is bold. */
  bold?: boolean;
  /** True if the block's text is underlined. */
  underline?: boolean;
  /** Text color when explicitly set in the document. */
  color?: string;
  /** Paragraph alignment. */
  alignment?: string;
  /** Heading level (1-6). Only for headings. */
  headingLevel?: number;
  /**
   * Numbering reference (`numId` + `level`) for numbered blocks, sourced from the
   * block's direct numbering properties (`w:numPr`). Present for numbered
   * headings and numbered paragraphs alike, so a numbered-heading sequence can be
   * discovered here even though those blocks resolve as `heading`, not `listItem`.
   * Absent for non-numbered blocks. Distinct from the list-rendering
   * marker/ordinal exposed on list items.
   */
  paragraphNumbering?: ParagraphNumbering;
  /** Ref handle targeting the block's full text. Pass to superdoc_format or superdoc_edit. */
  ref?: string;
}
export interface BlocksListInput {
  offset?: number;
  limit?: number;
  nodeTypes?: BlockNodeType[];
  /** Include full flattened text for each block. Omit to return textPreview only. */
  includeText?: boolean;
  /** Restrict block listing to a specific story. Omit for body (backward compatible). */
  in?: StoryLocator;
}
export interface BlocksListResult {
  total: number;
  blocks: BlockListEntry[];
  revision: string;
}
// ---------------------------------------------------------------------------
// blocks.delete
// ---------------------------------------------------------------------------
export interface BlocksDeleteInput {
  target: DeletableBlockNodeAddress;
}
export interface BlocksDeleteResult {
  success: true;
  deleted: DeletableBlockNodeAddress;
  deletedBlock?: DeletedBlockSummary;
  trackedChangeRefs?: ReceiptInsert[];
  invalidatedRefs?: AffectedRef[];
  affectedStories?: StoryLocator[];
  textRangeShifts?: TextRangeShift[];
  txId?: string;
}
// ---------------------------------------------------------------------------
// blocks.deleteRange
// ---------------------------------------------------------------------------
export interface BlocksDeleteRangeInput {
  start: BlockNodeAddress;
  end: BlockNodeAddress;
}
export interface DeletedBlockSummary {
  ordinal: number;
  nodeId: string;
  nodeType: string;
  textPreview: string | null;
}
// ---------------------------------------------------------------------------
// Structural block / paragraph operations.
//
// `blocks.split`, `blocks.merge`, and `blocks.move` cover the structural
// editing surface that `create.paragraph` and `blocks.delete` cannot
// express. Each operation accepts a `BlockNodeAddress` (or a v2 stable ref
// where applicable) and returns a structured receipt that mirrors the
// kernel's semantic delta.
// ---------------------------------------------------------------------------
export interface BlocksSplitInput {
  /** Paragraph-shaped block to split. Only `paragraph` / `heading` / `listItem` are supported. */
  target: BlockNodeAddress;
  /** Char offset inside the target paragraph's visible text where the split occurs. */
  offset: number;
}
export interface BlocksSplitSuccessResult {
  success: true;
  /** Address of the new paragraph created by the split (the tail). */
  inserted: BlockNodeAddress;
  trackedChangeRefs?: ReceiptInsert[];
  remappedRefs?: AffectedRefRemapping[];
  affectedStories?: StoryLocator[];
  textRangeShifts?: TextRangeShift[];
  txId?: string;
}
export interface BlocksSplitFailureResult {
  success: false;
  failure: ReceiptFailure;
}
export type BlocksSplitResult = BlocksSplitSuccessResult | BlocksSplitFailureResult;
export interface BlocksMergeInput {
  /** First paragraph; receives the merged content. */
  first: BlockNodeAddress;
  /** Paragraph immediately after `first` in the same story. */
  second: BlockNodeAddress;
}
export interface BlocksMergeSuccessResult {
  success: true;
  /** Address of the paragraph that was removed (the second paragraph). */
  removed: BlockNodeAddress;
  trackedChangeRefs?: ReceiptInsert[];
  remappedRefs?: AffectedRefRemapping[];
  affectedStories?: StoryLocator[];
  textRangeShifts?: TextRangeShift[];
  txId?: string;
}
export interface BlocksMergeFailureResult {
  success: false;
  failure: ReceiptFailure;
}
export type BlocksMergeResult = BlocksMergeSuccessResult | BlocksMergeFailureResult;
export interface BlocksMoveInput {
  /** Paragraph to move. */
  source: BlockNodeAddress;
  /** Destination anchor paragraph in the same story. */
  destination: BlockNodeAddress;
  /** Whether to place `source` before or after `destination`. */
  placement: 'before' | 'after';
}
export interface BlocksMoveSuccessResult {
  success: true;
  /** Same `source` paragraph, now relocated. */
  moved: BlockNodeAddress;
  remappedRefs?: AffectedRefRemapping[];
  affectedStories?: StoryLocator[];
  /**
   * Tracked-mode authoring (changeMode: 'tracked') emits paired move review
   * entities. Each entry addresses the logical pair so callers can route the
   * resulting review through `trackChanges.list/get/decide`. Direct-mode
   * moves leave this field undefined.
   */
  trackedChangeRefs?: ReceiptInsert[];
  txId?: string;
}
export interface BlocksMoveFailureResult {
  success: false;
  failure: ReceiptFailure;
}
export type BlocksMoveResult = BlocksMoveSuccessResult | BlocksMoveFailureResult;
// Re-export Receipt so consumers can reference the union for failure-only
// shapes without depending on `../types/receipt.js` directly from this file.
export type { Receipt };
export interface BlocksDeleteRangeResult {
  success: true;
  deletedCount: number;
  deletedBlocks: DeletedBlockSummary[];
  revision: {
    before: string;
    after: string;
  };
  dryRun: boolean;
}
