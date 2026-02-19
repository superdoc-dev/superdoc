import type { NodeAddress, NodeKind, NodeType } from './base.js';
import type { NodeInfo } from './node.js';
import type { Range, TextAddress } from './address.js';

export interface TextSelector {
  type: 'text';
  pattern: string;
  /**
   * Controls text matching strategy.
   * - `contains`: literal substring matching (default)
   * - `regex`: regular expression matching
   */
  mode?: 'contains' | 'regex';
  /**
   * Controls case sensitivity for text matching.
   * Defaults to false (case-insensitive).
   */
  caseSensitive?: boolean;
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
  within?: NodeAddress;
  limit?: number;
  offset?: number;
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
   * Text ranges matching the query, expressed as block-relative offsets.
   * For cross-paragraph matches, this will include one range per block.
   *
   * These ranges can be passed as targets to mutation operations.
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
