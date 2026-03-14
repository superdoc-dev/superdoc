import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  AuthoritiesAddress,
  AuthorityEntryAddress,
  AuthoritiesListInput,
  AuthoritiesGetInput,
  AuthoritiesInsertInput,
  AuthoritiesConfigureInput,
  AuthoritiesRebuildInput,
  AuthoritiesRemoveInput,
  AuthoritiesInfo,
  AuthoritiesMutationResult,
  AuthoritiesListResult,
  AuthorityEntryListInput,
  AuthorityEntryGetInput,
  AuthorityEntryInsertInput,
  AuthorityEntryUpdateInput,
  AuthorityEntryRemoveInput,
  AuthorityEntryInfo,
  AuthorityEntryMutationResult,
  AuthorityEntryListResult,
} from './authorities.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface AuthoritiesApi {
  list(query?: AuthoritiesListInput): AuthoritiesListResult;
  get(input: AuthoritiesGetInput): AuthoritiesInfo;
  insert(input: AuthoritiesInsertInput, options?: MutationOptions): AuthoritiesMutationResult;
  configure(input: AuthoritiesConfigureInput, options?: MutationOptions): AuthoritiesMutationResult;
  rebuild(input: AuthoritiesRebuildInput, options?: MutationOptions): AuthoritiesMutationResult;
  remove(input: AuthoritiesRemoveInput, options?: MutationOptions): AuthoritiesMutationResult;

  entries: {
    list(query?: AuthorityEntryListInput): AuthorityEntryListResult;
    get(input: AuthorityEntryGetInput): AuthorityEntryInfo;
    insert(input: AuthorityEntryInsertInput, options?: MutationOptions): AuthorityEntryMutationResult;
    update(input: AuthorityEntryUpdateInput, options?: MutationOptions): AuthorityEntryMutationResult;
    remove(input: AuthorityEntryRemoveInput, options?: MutationOptions): AuthorityEntryMutationResult;
  };
}

export type AuthoritiesAdapter = AuthoritiesApi;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateAuthoritiesTarget(target: unknown, operationName: string): asserts target is AuthoritiesAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }
  const t = target as Record<string, unknown>;
  if (t.kind !== 'block' || t.nodeType !== 'tableOfAuthorities' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be an AuthoritiesAddress with kind 'block', nodeType 'tableOfAuthorities', and a string nodeId.`,
      { target },
    );
  }
}

function validateAuthorityEntryTarget(target: unknown, operationName: string): asserts target is AuthorityEntryAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }
  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'authorityEntry') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be an AuthorityEntryAddress with kind 'inline' and nodeType 'authorityEntry'.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — TOA lifecycle
// ---------------------------------------------------------------------------

export function executeAuthoritiesList(
  adapter: AuthoritiesAdapter,
  query?: AuthoritiesListInput,
): AuthoritiesListResult {
  return adapter.list(query);
}

export function executeAuthoritiesGet(adapter: AuthoritiesAdapter, input: AuthoritiesGetInput): AuthoritiesInfo {
  validateAuthoritiesTarget(input.target, 'authorities.get');
  return adapter.get(input);
}

export function executeAuthoritiesInsert(
  adapter: AuthoritiesAdapter,
  input: AuthoritiesInsertInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeAuthoritiesConfigure(
  adapter: AuthoritiesAdapter,
  input: AuthoritiesConfigureInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  validateAuthoritiesTarget(input.target, 'authorities.configure');
  return adapter.configure(input, normalizeMutationOptions(options));
}

export function executeAuthoritiesRebuild(
  adapter: AuthoritiesAdapter,
  input: AuthoritiesRebuildInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  validateAuthoritiesTarget(input.target, 'authorities.rebuild');
  return adapter.rebuild(input, normalizeMutationOptions(options));
}

export function executeAuthoritiesRemove(
  adapter: AuthoritiesAdapter,
  input: AuthoritiesRemoveInput,
  options?: MutationOptions,
): AuthoritiesMutationResult {
  validateAuthoritiesTarget(input.target, 'authorities.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — TA entries
// ---------------------------------------------------------------------------

export function executeAuthorityEntriesList(
  adapter: AuthoritiesAdapter,
  query?: AuthorityEntryListInput,
): AuthorityEntryListResult {
  return adapter.entries.list(query);
}

export function executeAuthorityEntriesGet(
  adapter: AuthoritiesAdapter,
  input: AuthorityEntryGetInput,
): AuthorityEntryInfo {
  validateAuthorityEntryTarget(input.target, 'authorities.entries.get');
  return adapter.entries.get(input);
}

export function executeAuthorityEntriesInsert(
  adapter: AuthoritiesAdapter,
  input: AuthorityEntryInsertInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  if (!input.entry || !input.entry.longCitation) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'authorities.entries.insert requires an entry with a non-empty longCitation.',
    );
  }
  return adapter.entries.insert(input, normalizeMutationOptions(options));
}

export function executeAuthorityEntriesUpdate(
  adapter: AuthoritiesAdapter,
  input: AuthorityEntryUpdateInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  validateAuthorityEntryTarget(input.target, 'authorities.entries.update');
  return adapter.entries.update(input, normalizeMutationOptions(options));
}

export function executeAuthorityEntriesRemove(
  adapter: AuthoritiesAdapter,
  input: AuthorityEntryRemoveInput,
  options?: MutationOptions,
): AuthorityEntryMutationResult {
  validateAuthorityEntryTarget(input.target, 'authorities.entries.remove');
  return adapter.entries.remove(input, normalizeMutationOptions(options));
}
