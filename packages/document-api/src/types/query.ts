import type { BlockNodeAddress, NodeAddress, NodeKind, NodeType } from './base.js';
import type { NodeInfo } from './node.js';
import type { Range, TextAddress, SelectionTarget } from './address.js';
import type { DiscoveryOutput } from './discovery.js';
import type { StoryLocator } from './story.types.js';

export interface TextSelector {
  type: 'text';
  /** Text to match. In regex mode, patterns are validated for syntax, length, and safety before execution. */
  pattern: string;
  /**
   * Controls text matching strategy.
   * - `contains`: literal substring matching (default). Use this for literal text.
   * - `regex`: regular expression matching. Patterns are validated for syntax, maximum length, and safety.
   */
  mode?: 'contains' | 'regex';
  /**
   * Controls case sensitivity for text matching.
   * Defaults to false (case-insensitive).
   */
  caseSensitive?: boolean;
  /**
   * When true, matches must start and end on a word boundary.
   * Defaults to false.
   */
  wholeWord?: boolean;
  /**
   * When true, includes text from pending tracked deletions in search results.
   * Defaults to false (Word-compatible behavior: deleted text is not searchable).
   *
   * Note: this flag controls match discovery only. The `node` payload in each
   * result item is still projected using the visible text model, so deleted runs
   * will not appear in `item.node` even when they caused the match.
   */
  includeDeletedText?: boolean;
}

export interface NodeSelector {
  type: 'node';
  nodeType?: NodeType;
  kind?: NodeKind;
}

/**
 * Selector shorthand for find queries.
 *
 * `{ nodeType: 'paragraph' }` is sugar for `{ type: 'node', nodeType: 'paragraph' }`.
 *
 * For dual-context node types (`sdt`, `image`), omitting `kind`
 * may return both block and inline matches.
 */
export type Selector = { nodeType: NodeType } | NodeSelector | TextSelector;

export interface Query {
  /** Selector that determines which nodes to match. */
  select: NodeSelector | TextSelector;
  within?: BlockNodeAddress;
  /** Restrict the query to a specific story. Omit for body (backward compatible). */
  in?: StoryLocator;
  limit?: number;
  offset?: number;
  /**
   * Cardinality requirement for the result set.
   * Used for future enforcement: currently passed through without behavioral change.
   */
  require?: 'any' | 'first' | 'exactlyOne' | 'all';
  /**
   * Whether to hydrate `result.nodes` for matched addresses.
   * This is independent from text-match context, which is intrinsic for text selectors.
   */
  includeNodes?: boolean;
  /**
   * Controls whether unknown nodes are returned in diagnostics.
   * Unknown nodes are never included in matches.
   */
  includeUnknown?: boolean;
}

export interface MatchContext {
  address: NodeAddress;
  snippet: string;
  highlightRange: Range;
  /**
   * Canonical mutation-ready selection target for this text match.
   *
   * Built from the first and last text ranges. Can be passed directly to
   * `doc.delete({ target })`, `doc.replace({ target, text })`, etc.
   */
  target?: SelectionTarget;
  /**
   * Text ranges matching the query, expressed as block-relative offsets.
   * For cross-paragraph matches, this will include one range per block.
   *
   * Block-relative ranges for display/discovery. Use `context.target` (SelectionTarget) for mutations.
   */
  textRanges?: TextAddress[];
}

export interface UnknownNodeDiagnostic {
  message: string;
  address?: NodeAddress;
  hint?: string;
}

export interface QueryResult {
  /**
   * Matched node addresses.
   *
   * For text selectors, these addresses identify containing block nodes.
   * Exact matched spans are exposed via `context[*].textRanges`.
   */
  matches: NodeAddress[];
  total: number;
  /** Optional hydrated node payloads aligned with `matches` when `includeNodes` is true. */
  nodes?: NodeInfo[];
  context?: MatchContext[];
  diagnostics?: UnknownNodeDiagnostic[];
}

/**
 * Domain fields for a find discovery item (C3c).
 *
 * Merges the parallel-array fields (`matches[i]`, `nodes[i]`, `context[i]`)
 * into a single per-item object.
 */
export interface FindItemDomain {
  address: NodeAddress;
  node?: NodeInfo;
  context?: MatchContext;
}

/**
 * Standardized discovery output for `find`.
 *
 * Extends `DiscoveryOutput<FindItemDomain>` with an optional
 * top-level `diagnostics` array for unknown-node reporting.
 */
export type FindOutput = DiscoveryOutput<FindItemDomain> & {
  diagnostics?: UnknownNodeDiagnostic[];
};
