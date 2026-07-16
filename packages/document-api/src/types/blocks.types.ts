import type { BlockNodeType, BlockNodeAddress, DeletableBlockNodeAddress } from './base.js';
import type { AffectedRef, Receipt, ReceiptInsert, TextRangeShift } from './receipt.js';
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
  /**
   * Visible flattened block text when requested via BlocksListInput.includeText.
   * Uses the same text model the plan engine resolves offsets against: pending
   * tracked deletions are excluded, and inline leaf atoms (images, tabs)
   * contribute one character (their leaf text or U+FFFC), so `text.length`
   * always matches the encoded `ref` range. A block whose content is entirely
   * tracked-deleted reads as "" (and reports isEmpty: true with no ref).
   */
  text?: string | null;
  isEmpty: boolean;
  /** Named paragraph style ID (e.g. 'Normal', 'Heading1'). */
  styleId?: string | null;
  /** Font family from the block's first visible text run (tracked-deleted runs are skipped). */
  fontFamily?: string;
  /** Font size from the block's first visible text run (tracked-deleted runs are skipped). */
  fontSize?: number;
  /** True if the block's text is bold. */
  bold?: boolean;
  /** True if the block's text is underlined. */
  underline?: boolean;
  /** Text color when explicitly set in the document. */
  color?: string;
  /** Paragraph alignment. */
  alignment?: string;
  /** Direct paragraph indentation (twips), when set on the block. */
  indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  /** Heading level (1-6). Only for headings. */
  headingLevel?: number;
  /**
   * Computed numbering for blocks that participate in a numbering scheme.
   * Present for numbered list items AND numbered headings/paragraphs (legal
   * clause numbering like "2.3." usually lives on heading-styled paragraphs,
   * not list nodes). `marker` is the rendered label (e.g. "2.3."), `path` the
   * numeric path (e.g. [2, 3]), `kind` the numbering type (decimal, bullet…).
   */
  numbering?: {
    marker: string | null;
    path: number[] | null;
    kind: string | null;
  } | null;
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
