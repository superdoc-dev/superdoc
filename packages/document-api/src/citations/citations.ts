import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  CitationAddress,
  CitationSourceAddress,
  BibliographyAddress,
  CitationListInput,
  CitationGetInput,
  CitationInsertInput,
  CitationUpdateInput,
  CitationRemoveInput,
  CitationInfo,
  CitationMutationResult,
  CitationsListResult,
  CitationSourceListInput,
  CitationSourceGetInput,
  CitationSourceInsertInput,
  CitationSourceUpdateInput,
  CitationSourceRemoveInput,
  CitationSourceInfo,
  CitationSourceMutationResult,
  CitationSourcesListResult,
  BibliographyInsertInput,
  BibliographyRebuildInput,
  BibliographyConfigureInput,
  BibliographyRemoveInput,
  BibliographyGetInput,
  BibliographyInfo,
  BibliographyMutationResult,
} from './citations.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface CitationsApi {
  list(query?: CitationListInput): CitationsListResult;
  get(input: CitationGetInput): CitationInfo;
  insert(input: CitationInsertInput, options?: MutationOptions): CitationMutationResult;
  update(input: CitationUpdateInput, options?: MutationOptions): CitationMutationResult;
  remove(input: CitationRemoveInput, options?: MutationOptions): CitationMutationResult;

  sources: {
    list(query?: CitationSourceListInput): CitationSourcesListResult;
    get(input: CitationSourceGetInput): CitationSourceInfo;
    insert(input: CitationSourceInsertInput, options?: MutationOptions): CitationSourceMutationResult;
    update(input: CitationSourceUpdateInput, options?: MutationOptions): CitationSourceMutationResult;
    remove(input: CitationSourceRemoveInput, options?: MutationOptions): CitationSourceMutationResult;
  };

  bibliography: {
    get(input: BibliographyGetInput): BibliographyInfo;
    insert(input: BibliographyInsertInput, options?: MutationOptions): BibliographyMutationResult;
    rebuild(input: BibliographyRebuildInput, options?: MutationOptions): BibliographyMutationResult;
    configure(input: BibliographyConfigureInput, options?: MutationOptions): BibliographyMutationResult;
    remove(input: BibliographyRemoveInput, options?: MutationOptions): BibliographyMutationResult;
  };
}

export type CitationsAdapter = CitationsApi;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateCitationTarget(target: unknown, operationName: string): asserts target is CitationAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'citation') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a CitationAddress with kind 'inline' and nodeType 'citation'.`,
      { target },
    );
  }
}

function validateCitationSourceTarget(target: unknown, operationName: string): asserts target is CitationSourceAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'entity' || t.entityType !== 'citationSource' || typeof t.sourceId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a CitationSourceAddress with kind 'entity', entityType 'citationSource', and a string sourceId.`,
      { target },
    );
  }
}

function validateBibliographyTarget(target: unknown, operationName: string): asserts target is BibliographyAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'block' || t.nodeType !== 'bibliography' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a BibliographyAddress with kind 'block', nodeType 'bibliography', and a string nodeId.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — Citations (inline references)
// ---------------------------------------------------------------------------

export function executeCitationsList(adapter: CitationsAdapter, query?: CitationListInput): CitationsListResult {
  return adapter.list(query);
}

export function executeCitationsGet(adapter: CitationsAdapter, input: CitationGetInput): CitationInfo {
  validateCitationTarget(input.target, 'citations.get');
  return adapter.get(input);
}

export function executeCitationsInsert(
  adapter: CitationsAdapter,
  input: CitationInsertInput,
  options?: MutationOptions,
): CitationMutationResult {
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'citations.insert requires a non-empty sourceIds array.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeCitationsUpdate(
  adapter: CitationsAdapter,
  input: CitationUpdateInput,
  options?: MutationOptions,
): CitationMutationResult {
  validateCitationTarget(input.target, 'citations.update');
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeCitationsRemove(
  adapter: CitationsAdapter,
  input: CitationRemoveInput,
  options?: MutationOptions,
): CitationMutationResult {
  validateCitationTarget(input.target, 'citations.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — Citation Sources
// ---------------------------------------------------------------------------

export function executeCitationSourcesList(
  adapter: CitationsAdapter,
  query?: CitationSourceListInput,
): CitationSourcesListResult {
  return adapter.sources.list(query);
}

export function executeCitationSourcesGet(
  adapter: CitationsAdapter,
  input: CitationSourceGetInput,
): CitationSourceInfo {
  validateCitationSourceTarget(input.target, 'citations.sources.get');
  return adapter.sources.get(input);
}

export function executeCitationSourcesInsert(
  adapter: CitationsAdapter,
  input: CitationSourceInsertInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  if (!input.type) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'citations.sources.insert requires a type.');
  }
  return adapter.sources.insert(input, normalizeMutationOptions(options));
}

export function executeCitationSourcesUpdate(
  adapter: CitationsAdapter,
  input: CitationSourceUpdateInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  validateCitationSourceTarget(input.target, 'citations.sources.update');
  return adapter.sources.update(input, normalizeMutationOptions(options));
}

export function executeCitationSourcesRemove(
  adapter: CitationsAdapter,
  input: CitationSourceRemoveInput,
  options?: MutationOptions,
): CitationSourceMutationResult {
  validateCitationSourceTarget(input.target, 'citations.sources.remove');
  return adapter.sources.remove(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — Bibliography
// ---------------------------------------------------------------------------

export function executeBibliographyGet(adapter: CitationsAdapter, input: BibliographyGetInput): BibliographyInfo {
  validateBibliographyTarget(input.target, 'citations.bibliography.get');
  return adapter.bibliography.get(input);
}

export function executeBibliographyInsert(
  adapter: CitationsAdapter,
  input: BibliographyInsertInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  return adapter.bibliography.insert(input, normalizeMutationOptions(options));
}

export function executeBibliographyRebuild(
  adapter: CitationsAdapter,
  input: BibliographyRebuildInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  validateBibliographyTarget(input.target, 'citations.bibliography.rebuild');
  return adapter.bibliography.rebuild(input, normalizeMutationOptions(options));
}

export function executeBibliographyConfigure(
  adapter: CitationsAdapter,
  input: BibliographyConfigureInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  if (!input.style || typeof input.style !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'citations.bibliography.configure requires a non-empty style string.',
    );
  }
  return adapter.bibliography.configure(input, normalizeMutationOptions(options));
}

export function executeBibliographyRemove(
  adapter: CitationsAdapter,
  input: BibliographyRemoveInput,
  options?: MutationOptions,
): BibliographyMutationResult {
  validateBibliographyTarget(input.target, 'citations.bibliography.remove');
  return adapter.bibliography.remove(input, normalizeMutationOptions(options));
}
