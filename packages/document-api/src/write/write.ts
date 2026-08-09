import type { TextMutationReceipt, SDMutationReceipt } from '../types/index.js';
import type { InsertInput } from '../insert/insert.js';
import type { ReplaceInput } from '../replace/replace.js';
import type { StoryLocator } from '../types/story.types.js';
import { DocumentApiValidationError } from '../errors.js';

export type ChangeMode = 'direct' | 'tracked';

/** The canonical set of accepted `changeMode` values. */
const CHANGE_MODE_VALUES: ReadonlySet<string> = new Set<ChangeMode>(['direct', 'tracked']);

/**
 * Shared semantic validation for the `changeMode` mutation option.
 *
 * Error-code policy (v2-tracked-change-decision-error-contract plan, WS3):
 *   - A `changeMode` value of the wrong *type* is a malformed shape and is left
 *     to upstream structural/schema validation (which surfaces
 *     `VALIDATION_ERROR`). This validator does not touch non-string values.
 *   - A `changeMode` *string* outside the accepted enum is a semantic option
 *     error and fails closed with `INVALID_INPUT`, not the generic
 *     `VALIDATION_ERROR`. This keeps semantic option failures distinct from
 *     structural schema failures across every mutation API that accepts
 *     `changeMode`.
 */
export function validateChangeMode(value: unknown): void {
  if (value === undefined || typeof value !== 'string') return;
  if (CHANGE_MODE_VALUES.has(value)) return;
  throw new DocumentApiValidationError('INVALID_INPUT', `changeMode must be one of: direct, tracked. Got "${value}".`, {
    field: 'changeMode',
    value,
  });
}

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
 * Text insertion request: target-less insert at document end.
 *
 * Targeted inserts now route through `SelectionMutationAdapter`. This
 * request type only handles the no-target fallback (append to document end).
 */
export type InsertWriteRequest = {
  kind: 'insert';
  text: string;
  /** Target a specific document story (body, header, footer, footnote, endnote). */
  in?: StoryLocator;
};

/**
 * Alias for `InsertWriteRequest`. Retained because adapter utilities and
 * plan wrappers still reference this name.
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
  validateChangeMode(options?.changeMode);
  // `offsetSpace` is a PRIVATE V2 adapter extension (browser editable
  // selections count an inline object as one caret position). It is not part
  // of the public MutationOptions contract; normalization forwards it opaquely
  // so internal callers that cast it in do not lose it at the dispatch seam.
  const offsetSpace = (options as { offsetSpace?: unknown } | undefined)?.offsetSpace;
  return {
    expectedRevision: options?.expectedRevision,
    changeMode: options?.changeMode ?? 'direct',
    dryRun: options?.dryRun ?? false,
    ...(offsetSpace === 'selection' || offsetSpace === 'kernel' ? ({ offsetSpace } as object) : {}),
  };
}

export function executeWrite(
  adapter: WriteAdapter,
  request: InsertWriteRequest,
  options?: MutationOptions,
): TextMutationReceipt {
  return adapter.write(request, normalizeMutationOptions(options));
}
