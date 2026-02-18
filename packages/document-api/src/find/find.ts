import type { NodeAddress, NodeSelector, Query, QueryResult, Selector, TextSelector } from '../types/index.js';

/**
 * Options for the `find` method when using a selector shorthand.
 */
export interface FindOptions {
  /** Maximum number of results to return. */
  limit?: number;
  /** Number of results to skip before returning matches. */
  offset?: number;
  /** Constrain the search to descendants of the specified node. */
  within?: NodeAddress;
  /** Whether to hydrate `result.nodes` for matched addresses. */
  includeNodes?: Query['includeNodes'];
  /** Whether to include unknown/unsupported nodes in diagnostics. */
  includeUnknown?: Query['includeUnknown'];
}

/**
 * Engine-specific adapter that the find API delegates to.
 */
export interface FindAdapter {
  /**
   * Execute a normalized query against the document.
   *
   * @param query - The normalized query to execute.
   * @returns The query result containing matches and metadata.
   */
  find(query: Query): QueryResult;
}

/** Normalizes a selector shorthand into its canonical discriminated-union form. */
function normalizeSelector(selector: Selector): NodeSelector | TextSelector {
  if ('type' in selector) {
    return selector;
  }
  return { type: 'node', nodeType: selector.nodeType };
}

/**
 * Normalizes a selector-or-query argument into a canonical {@link Query} object.
 *
 * @param selectorOrQuery - A selector shorthand or a full query object.
 * @param options - Options applied when `selectorOrQuery` is a selector.
 * @returns A normalized query.
 */
export function normalizeFindQuery(selectorOrQuery: Selector | Query, options?: FindOptions): Query {
  if ('select' in selectorOrQuery) {
    return { ...selectorOrQuery, select: normalizeSelector(selectorOrQuery.select) };
  }

  return {
    select: normalizeSelector(selectorOrQuery),
    limit: options?.limit,
    offset: options?.offset,
    within: options?.within,
    includeNodes: options?.includeNodes,
    includeUnknown: options?.includeUnknown,
  };
}

/**
 * Executes a find operation by normalizing the input and delegating to the adapter.
 *
 * @param adapter - The engine-specific find adapter.
 * @param selectorOrQuery - A selector shorthand or a full query object.
 * @param options - Options applied when `selectorOrQuery` is a selector.
 * @returns The query result from the adapter.
 */
export function executeFind(
  adapter: FindAdapter,
  selectorOrQuery: Selector | Query,
  options?: FindOptions,
): QueryResult {
  const query = normalizeFindQuery(selectorOrQuery, options);
  return adapter.find(query);
}
