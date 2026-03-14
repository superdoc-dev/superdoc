import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  FootnoteAddress,
  FootnoteGetInput,
  FootnoteInfo,
  FootnoteInsertInput,
  FootnoteUpdateInput,
  FootnoteRemoveInput,
  FootnoteConfigureInput,
  FootnoteMutationResult,
  FootnoteConfigResult,
  FootnoteListInput,
  FootnotesListResult,
} from './footnotes.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface FootnotesApi {
  list(query?: FootnoteListInput): FootnotesListResult;
  get(input: FootnoteGetInput): FootnoteInfo;
  insert(input: FootnoteInsertInput, options?: MutationOptions): FootnoteMutationResult;
  update(input: FootnoteUpdateInput, options?: MutationOptions): FootnoteMutationResult;
  remove(input: FootnoteRemoveInput, options?: MutationOptions): FootnoteMutationResult;
  configure(input: FootnoteConfigureInput, options?: MutationOptions): FootnoteConfigResult;
}

export type FootnotesAdapter = FootnotesApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateFootnoteTarget(target: unknown, operationName: string): asserts target is FootnoteAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'entity' || t.entityType !== 'footnote' || typeof t.noteId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a FootnoteAddress with kind 'entity', entityType 'footnote', and a string noteId.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeFootnotesList(adapter: FootnotesAdapter, query?: FootnoteListInput): FootnotesListResult {
  return adapter.list(query);
}

export function executeFootnotesGet(adapter: FootnotesAdapter, input: FootnoteGetInput): FootnoteInfo {
  validateFootnoteTarget(input.target, 'footnotes.get');
  return adapter.get(input);
}

export function executeFootnotesInsert(
  adapter: FootnotesAdapter,
  input: FootnoteInsertInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  if (!input.type || (input.type !== 'footnote' && input.type !== 'endnote')) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      "footnotes.insert requires a type of 'footnote' or 'endnote'.",
    );
  }
  if (typeof input.content !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'footnotes.insert requires a content string.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeFootnotesUpdate(
  adapter: FootnotesAdapter,
  input: FootnoteUpdateInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  validateFootnoteTarget(input.target, 'footnotes.update');
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeFootnotesRemove(
  adapter: FootnotesAdapter,
  input: FootnoteRemoveInput,
  options?: MutationOptions,
): FootnoteMutationResult {
  validateFootnoteTarget(input.target, 'footnotes.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

export function executeFootnotesConfigure(
  adapter: FootnotesAdapter,
  input: FootnoteConfigureInput,
  options?: MutationOptions,
): FootnoteConfigResult {
  if (!input.type || (input.type !== 'footnote' && input.type !== 'endnote')) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      "footnotes.configure requires a type of 'footnote' or 'endnote'.",
    );
  }
  return adapter.configure(input, normalizeMutationOptions(options));
}
