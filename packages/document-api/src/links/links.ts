import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  LinkAddress,
  LinkGetInput,
  LinkInfo,
  LinkInsertInput,
  LinkUpdateInput,
  LinkRemoveInput,
  LinkMutationResult,
  LinkListInput,
  LinksListResult,
} from './links.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interface
// ---------------------------------------------------------------------------

export interface LinksApi {
  list(query?: LinkListInput): LinksListResult;
  get(input: LinkGetInput): LinkInfo;
  insert(input: LinkInsertInput, options?: MutationOptions): LinkMutationResult;
  update(input: LinkUpdateInput, options?: MutationOptions): LinkMutationResult;
  remove(input: LinkRemoveInput, options?: MutationOptions): LinkMutationResult;
}

export type LinksAdapter = LinksApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateLinkTarget(target: unknown, operationName: string): asserts target is LinkAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'hyperlink') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a LinkAddress with kind 'inline' and nodeType 'hyperlink'.`,
      { target },
    );
  }

  const anchor = t.anchor as Record<string, unknown> | undefined;
  if (!anchor || !anchor.start || !anchor.end) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target.anchor must have start and end positions.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeLinksList(adapter: LinksAdapter, query?: LinkListInput): LinksListResult {
  return adapter.list(query);
}

export function executeLinksGet(adapter: LinksAdapter, input: LinkGetInput): LinkInfo {
  validateLinkTarget(input.target, 'links.get');
  return adapter.get(input);
}

export function executeLinksInsert(
  adapter: LinksAdapter,
  input: LinkInsertInput,
  options?: MutationOptions,
): LinkMutationResult {
  const dest = input.destination as Record<string, unknown> | undefined;
  if (!dest || typeof dest.kind !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'links.insert requires a destination with a valid kind.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeLinksUpdate(
  adapter: LinksAdapter,
  input: LinkUpdateInput,
  options?: MutationOptions,
): LinkMutationResult {
  validateLinkTarget(input.target, 'links.update');
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeLinksRemove(
  adapter: LinksAdapter,
  input: LinkRemoveInput,
  options?: MutationOptions,
): LinkMutationResult {
  validateLinkTarget(input.target, 'links.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}
