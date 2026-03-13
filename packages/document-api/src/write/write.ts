import type { TextAddress, TextMutationReceipt, SDMutationReceipt } from '../types/index.js';
import type { BlockRelativeLocator, BlockRelativeRange } from './locator.js';
import type { InsertInput } from '../insert/insert.js';
import type { ReplaceInput } from '../replace/replace.js';

export type ChangeMode = 'direct' | 'tracked';

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

export type WriteKind = 'insert' | 'replace' | 'delete';

export type InsertWriteRequest = {
  kind: 'insert';
  /**
   * Optional insertion target.
   * When omitted, inserts at the end of the document.
   */
  target?: TextAddress;
  text: string;
} & Partial<BlockRelativeLocator>;

export type ReplaceWriteRequest = {
  kind: 'replace';
  target?: TextAddress;
  text: string;
} & Partial<BlockRelativeRange>;

export type DeleteWriteRequest = {
  kind: 'delete';
  target?: TextAddress;
  text?: '';
} & Partial<BlockRelativeRange>;

export type WriteRequest = InsertWriteRequest | ReplaceWriteRequest | DeleteWriteRequest;

export interface WriteAdapter {
  write(request: WriteRequest, options?: MutationOptions): TextMutationReceipt;
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
  request: WriteRequest,
  options?: MutationOptions,
): TextMutationReceipt {
  return adapter.write(request, normalizeMutationOptions(options));
}
