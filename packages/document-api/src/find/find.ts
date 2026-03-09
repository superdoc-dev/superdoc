import type { NodeAddress, NodeSelector, Query, FindOutput, Selector, TextSelector } from '../types/index.js';
import type { SDFindInput, SDFindResult } from '../types/sd-envelope.js';

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
  /** Cardinality requirement for the result set. */
  require?: Query['require'];
  /** Whether to hydrate `result.nodes` for matched addresses. */
  includeNodes?: Query['includeNodes'];
  /** Whether to include unknown/unsupported nodes in diagnostics. */
  includeUnknown?: Query['includeUnknown'];
}

/**
 * Engine-specific adapter that the find API delegates to.
 *
 * Adapters return a standardized `SDFindResult` envelope.
 */
export interface FindAdapter {
  /**
   * Execute a find operation against the document.
   *
   * @param input - The SDFindInput to execute.
   * @returns The find result as an SDFindResult envelope.
   */
  find(input: SDFindInput): SDFindResult;

  /**
   * Legacy query-based find, used internally by info-adapter.
   * Returns the old FindOutput shape for backward compatibility.
   * @internal
   */
  findLegacy?(query: Query): FindOutput;
}

/** Normalizes a selector shorthand into its canonical discriminated-union form.
 *  Strips any non-selector properties so callers that pass an object with extra
 *  fields (e.g. SDK-shaped flat params) don't pollute the select object. */
function normalizeSelector(selector: Selector): NodeSelector | TextSelector {
  if ('type' in selector) {
    if (selector.type === 'text') {
      const text = selector as TextSelector;
      return {
        type: 'text',
        pattern: text.pattern,
        ...(text.mode != null && { mode: text.mode }),
        ...(text.caseSensitive != null && { caseSensitive: text.caseSensitive }),
      };
    }
    if (selector.type === 'node') {
      const node = selector as NodeSelector;
      return {
        type: 'node',
        ...(node.nodeType != null && { nodeType: node.nodeType }),
        ...(node.kind != null && { kind: node.kind }),
      };
    }
    return selector as NodeSelector | TextSelector;
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
    require: options?.require,
    includeNodes: options?.includeNodes,
    includeUnknown: options?.includeUnknown,
  };
}

/**
 * Normalizes an SDFindInput, handling:
 * - Flat selectors (no `select` wrapper): `{ type: 'node', nodeKind: 'table' }` → `{ select: { type: 'node', nodeKind: 'table' } }`
 * - `nodeType` alias for `nodeKind` in node selectors
 */
function normalizeSDFindInput(input: Record<string, unknown>): SDFindInput {
  // If no `select` wrapper, treat the input itself as a flat selector + pagination
  let select: Record<string, unknown>;
  let rest: Record<string, unknown>;

  if ('select' in input && input.select != null && typeof input.select === 'object') {
    select = input.select as Record<string, unknown>;
    rest = input;
  } else if ('type' in input) {
    // Flat selector — extract selector fields from the top-level input
    const { type, nodeKind, nodeType, kind, pattern, mode, caseSensitive, ...pagination } = input as Record<
      string,
      unknown
    >;
    select = { type };
    if (nodeKind != null) select.nodeKind = nodeKind;
    if (nodeType != null) select.nodeKind ??= nodeType;
    if (kind != null) select.kind = kind;
    if (pattern != null) select.pattern = pattern;
    if (mode != null) select.mode = mode;
    if (caseSensitive != null) select.caseSensitive = caseSensitive;
    rest = { ...pagination, select };
  } else {
    return input as SDFindInput;
  }

  // Accept `nodeType` as alias for `nodeKind` in node selectors
  if (select.type === 'node' && select.nodeType != null && select.nodeKind == null) {
    select.nodeKind = select.nodeType;
    delete select.nodeType;
  }

  if (rest.select !== select) {
    return { ...rest, select } as unknown as SDFindInput;
  }
  return rest as unknown as SDFindInput;
}

/**
 * Executes an SDM/1 find operation via the adapter.
 *
 * Normalizes the input to accept:
 * - Flat selectors without a `select` wrapper
 * - `nodeType` as an alias for `nodeKind`
 *
 * @param adapter - The engine-specific find adapter.
 * @param input - The SDFindInput to execute (or a flat selector).
 * @returns An SDFindResult envelope.
 */
export function executeFind(adapter: FindAdapter, input: SDFindInput): SDFindResult {
  return adapter.find(normalizeSDFindInput(input as unknown as Record<string, unknown>));
}

/**
 * Executes a legacy find using the old Query/Selector interface.
 * Used internally by info-adapter. Prefers `findLegacy` if available,
 * otherwise translates to SDFindInput.
 *
 * @internal
 */
export function executeLegacyFind(
  adapter: FindAdapter,
  selectorOrQuery: Selector | Query,
  options?: FindOptions,
): FindOutput {
  const query = normalizeFindQuery(selectorOrQuery, options);
  if (adapter.findLegacy) {
    return adapter.findLegacy(query);
  }
  // Fallback: shouldn't happen in practice since super-editor adapter provides findLegacy
  throw new Error('Legacy find is not supported by this adapter');
}
