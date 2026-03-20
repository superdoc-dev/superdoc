import type { TextAddress, TextMutationReceipt, SDMutationReceipt } from '../types/index.js';
import type { BlockRelativeLocator } from './locator.js';
import type { InsertInput } from '../insert/insert.js';
import type { ReplaceInput } from '../replace/replace.js';
import type { StoryLocator } from '../types/story.types.js';

export type ChangeMode = 'direct' | 'tracked';

/**
 * Subset of MutationOptions that provides only revision guarding.
 *
 * Used by operations that don't participate in the plan engine (comments,
 * clearContent, trackChanges.decide) where changeMode and dryRun are not
 * applicable.
 */
export interface RevisionGuardOptions {
  /** When provided, the engine rejects with REVISION_MISMATCH if the document has advanced past this revision. */
  expectedRevision?: string;
}

export interface MutationOptions extends RevisionGuardOptions {
  /**
   * Controls whether mutation applies directly or as a tracked change.
   * Defaults to `direct`.
   */
  changeMode?: ChangeMode;
  /**
   * When true, adapters validate and resolve the operation but must not mutate state.
   * Defaults to `false`.
   */
  dryRun?: boolean;
}

/**
 * Text insertion request — the only write-kind that still routes through
 * the WriteAdapter. Delete and replace now use SelectionMutationAdapter.
 */
export type InsertWriteRequest = {
  kind: 'insert';
  /**
   * Optional insertion target.
   * When omitted, inserts at the end of the document.
   */
  target?: TextAddress;
  text: string;
  /** Target a specific document story (body, header, footer, footnote, endnote). */
  in?: StoryLocator;
} & Partial<BlockRelativeLocator>;

/**
 * Alias for `InsertWriteRequest`. Retained because super-editor adapter-utils
 * and plan-wrappers still reference this name.
 */
export type WriteRequest = InsertWriteRequest;

/**
 * Adapter interface for write operations. After the selection-first delete
 * cutover, only `insert` routes through `write()`. Delete and replace use
 * `SelectionMutationAdapter` instead.
 */
export interface WriteAdapter {
  write(request: InsertWriteRequest, options?: MutationOptions): TextMutationReceipt;
  /** Structured insert for SDFragment or markdown/html content. Returns SDMutationReceipt. */
  insertStructured(input: InsertInput, options?: MutationOptions): SDMutationReceipt;
  /** Structured replace for SDFragment content. Returns SDMutationReceipt. */
  replaceStructured(input: ReplaceInput, options?: MutationOptions): SDMutationReceipt;
}

export function normalizeMutationOptions(options?: MutationOptions): MutationOptions {
  return {
    expectedRevision: options?.expectedRevision,
    changeMode: options?.changeMode ?? 'direct',
    dryRun: options?.dryRun ?? false,
  };
}

export function executeWrite(
  adapter: WriteAdapter,
  request: InsertWriteRequest,
  options?: MutationOptions,
): TextMutationReceipt {
  return adapter.write(request, normalizeMutationOptions(options));
}
